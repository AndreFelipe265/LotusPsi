//! Comandos de gerenciamento da Agenda (`agendamentos_*`, `agendamento_*`) (F4.5-T2 — RN70–RN77).

use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{Erro, Resultado};
use crate::state::AppState;

/// Duração padrão de uma sessão agendada em minutos (RN70).
pub const DURACAO_PADRAO_AGENDAMENTO_MIN: i64 = 50;

/// Limite rígido de caracteres da observação do agendamento (RN70).
pub const LIMITE_CARACTERES_OBSERVACAO_AGENDAMENTO: usize = 200;

/// Representação completa de um agendamento retornado ao frontend (RN70–RN77).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Agendamento {
    pub id: String,
    pub paciente_id: String,
    pub paciente_nome: String,
    pub data: String,
    pub hora_inicio: String,
    pub duracao_min: i64,
    pub observacao: Option<String>,
    pub criado_em: String,
    pub atualizado_em: String,
    /// Indica se há sobreposição de horário com outro agendamento na mesma data (RN73).
    pub conflito: bool,
    /// Descrição amigável dos agendamentos conflitantes (RN73).
    pub conflito_descricao: Option<String>,
}

/// Dados de entrada para criar ou atualizar (remarcar/editar) um agendamento (RN70, RN74).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DadosAgendamentoInput {
    pub paciente_id: String,
    pub data: String,
    pub hora_inicio: String,
    pub duracao_min: Option<i64>,
    pub observacao: Option<String>,
}

struct DadosAgendamentoValidados {
    paciente_id: String,
    data: String,
    hora_inicio: String,
    duracao_min: i64,
    observacao: Option<String>,
}

/// Converte um horário `HH:MM` válido em minutos desde `00:00` e retorna a string normalizada `HH:MM`.
pub fn validar_e_converter_hora_inicio(hora_raw: &str) -> Resultado<(String, i64)> {
    let limpo = hora_raw.trim();
    if limpo.is_empty() {
        return Err(Erro::Validacao(
            "O horário de início do agendamento é obrigatório.".to_string(),
        ));
    }

    let partes: Vec<&str> = limpo.split(':').collect();
    if partes.len() != 2 || partes[0].len() != 2 || partes[1].len() != 2 {
        return Err(Erro::Validacao(
            "Horário de início inválido. Use o formato HH:MM (ex.: 14:00).".to_string(),
        ));
    }

    let horas: i64 = partes[0].parse().map_err(|_| {
        Erro::Validacao("Horário de início inválido. Use o formato HH:MM (ex.: 14:00).".to_string())
    })?;
    let minutos: i64 = partes[1].parse().map_err(|_| {
        Erro::Validacao("Horário de início inválido. Use o formato HH:MM (ex.: 14:00).".to_string())
    })?;

    if !(0..=23).contains(&horas) || !(0..=59).contains(&minutos) {
        return Err(Erro::Validacao(
            "Horário de início inválido. Informe uma hora entre 00:00 e 23:59.".to_string(),
        ));
    }

    let normalizado = format!("{:02}:{:02}", horas, minutos);
    let total_minutos = horas * 60 + minutos;
    Ok((normalizado, total_minutos))
}

/// Verifica se dois intervalos `[inicio_a, inicio_a + duracao_a)` e `[inicio_b, inicio_b + duracao_b)`
/// possuem sobreposição de horário (RN73).
pub fn intervalos_conflitam(inicio_a: i64, duracao_a: i64, inicio_b: i64, duracao_b: i64) -> bool {
    let fim_a = inicio_a + duracao_a.max(1);
    let fim_b = inicio_b + duracao_b.max(1);
    inicio_a < fim_b && inicio_b < fim_a
}

fn validar_dados_agendamento(
    dados: &DadosAgendamentoInput,
) -> Resultado<DadosAgendamentoValidados> {
    let paciente_id = dados.paciente_id.trim().to_string();
    if paciente_id.is_empty() {
        return Err(Erro::Validacao(
            "Selecione o paciente para o agendamento.".to_string(),
        ));
    }

    let data_limpa = dados.data.trim();
    if data_limpa.is_empty() {
        return Err(Erro::Validacao(
            "A data do agendamento é obrigatória.".to_string(),
        ));
    }

    // RN72: datas futuras e passadas são permitidas
    let data = NaiveDate::parse_from_str(data_limpa, "%Y-%m-%d").map_err(|_| {
        Erro::Validacao("Data do agendamento inválida. Use o formato dd/mm/aaaa.".to_string())
    })?;

    let (hora_inicio, _) = validar_e_converter_hora_inicio(&dados.hora_inicio)?;

    let duracao_min = dados.duracao_min.unwrap_or(DURACAO_PADRAO_AGENDAMENTO_MIN);
    if duracao_min <= 0 || duracao_min > 720 {
        return Err(Erro::Validacao(
            "A duração do agendamento deve ser entre 1 e 720 minutos.".to_string(),
        ));
    }

    let observacao = dados
        .observacao
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(ref obs) = observacao {
        if obs.chars().count() > LIMITE_CARACTERES_OBSERVACAO_AGENDAMENTO {
            return Err(Erro::Validacao(format!(
                "A observação do agendamento deve ter no máximo {} caracteres.",
                LIMITE_CARACTERES_OBSERVACAO_AGENDAMENTO
            )));
        }
    }

    Ok(DadosAgendamentoValidados {
        paciente_id,
        data: data.format("%Y-%m-%d").to_string(),
        hora_inicio,
        duracao_min,
        observacao,
    })
}

fn paciente_existe_conn(conn: &Connection, paciente_id: &str) -> Resultado<bool> {
    let existe: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM pacientes WHERE id = ?1;",
            [paciente_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(existe.is_some())
}

fn listar_agendamentos_do_dia_conn(conn: &Connection, data: &str) -> Resultado<Vec<Agendamento>> {
    let mut stmt = conn.prepare(
        "SELECT
            a.id,
            a.paciente_id,
            p.nome,
            a.data,
            a.hora_inicio,
            a.duracao_min,
            a.observacao,
            a.criado_em,
            a.atualizado_em
         FROM agendamentos a
         INNER JOIN pacientes p ON p.id = a.paciente_id
         WHERE a.data = ?1
         ORDER BY a.hora_inicio ASC, a.criado_em ASC;",
    )?;

    let linhas = stmt.query_map([data], |row| {
        Ok(Agendamento {
            id: row.get(0)?,
            paciente_id: row.get(1)?,
            paciente_nome: row.get(2)?,
            data: row.get(3)?,
            hora_inicio: row.get(4)?,
            duracao_min: row.get(5)?,
            observacao: row.get(6)?,
            criado_em: row.get(7)?,
            atualizado_em: row.get(8)?,
            conflito: false,
            conflito_descricao: None,
        })
    })?;

    let mut lista = Vec::new();
    for linha in linhas {
        lista.push(linha?);
    }

    preencher_conflitos(&mut lista);
    Ok(lista)
}

fn preencher_conflitos(agendamentos: &mut [Agendamento]) {
    let n = agendamentos.len();
    let minutos_inicio: Vec<i64> = agendamentos
        .iter()
        .map(|a| {
            validar_e_converter_hora_inicio(&a.hora_inicio)
                .map(|(_, m)| m)
                .unwrap_or(0)
        })
        .collect();

    for i in 0..n {
        let mut nomes_conflitantes = Vec::new();
        for j in 0..n {
            if i == j {
                continue;
            }
            if agendamentos[i].data == agendamentos[j].data
                && intervalos_conflitam(
                    minutos_inicio[i],
                    agendamentos[i].duracao_min,
                    minutos_inicio[j],
                    agendamentos[j].duracao_min,
                )
            {
                nomes_conflitantes.push(format!(
                    "{} ({})",
                    agendamentos[j].paciente_nome, agendamentos[j].hora_inicio
                ));
            }
        }

        if !nomes_conflitantes.is_empty() {
            agendamentos[i].conflito = true;
            agendamentos[i].conflito_descricao = Some(format!(
                "Conflito de horário com {}",
                nomes_conflitantes.join(", ")
            ));
        } else {
            agendamentos[i].conflito = false;
            agendamentos[i].conflito_descricao = None;
        }
    }
}

fn obter_agendamento_por_id_conn(conn: &Connection, id: &str) -> Resultado<Agendamento> {
    let data: Option<String> = conn
        .query_row(
            "SELECT data FROM agendamentos WHERE id = ?1;",
            [id],
            |row| row.get(0),
        )
        .optional()?;

    let data_agendamento = data.ok_or(Erro::NaoEncontrado)?;
    let do_dia = listar_agendamentos_do_dia_conn(conn, &data_agendamento)?;
    do_dia
        .into_iter()
        .find(|a| a.id == id)
        .ok_or(Erro::NaoEncontrado)
}

/// Lista agendamentos em um intervalo de datas `[data_inicio, data_fim]` (inclusive) e opcionalmente
/// filtrados por `paciente_id`, já enriquecidos com detecção de conflitos no mesmo dia (RN70–RN73).
pub fn executar_agendamentos_listar(
    state: &AppState,
    data_inicio: Option<&str>,
    data_fim: Option<&str>,
    paciente_id: Option<&str>,
) -> Resultado<Vec<Agendamento>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let inicio = data_inicio
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("0001-01-01");
    let fim = data_fim
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("9999-12-31");
    let filtro_paciente = paciente_id.map(str::trim).filter(|s| !s.is_empty());

    // Buscamos todos os agendamentos nas datas do intervalo para calcular conflitos com precisão,
    // mesmo quando filtrado por paciente_id.
    let mut stmt = conn.prepare(
        "SELECT
            a.id,
            a.paciente_id,
            p.nome,
            a.data,
            a.hora_inicio,
            a.duracao_min,
            a.observacao,
            a.criado_em,
            a.atualizado_em
         FROM agendamentos a
         INNER JOIN pacientes p ON p.id = a.paciente_id
         WHERE a.data >= ?1 AND a.data <= ?2
         ORDER BY a.data ASC, a.hora_inicio ASC, a.criado_em ASC;",
    )?;

    let linhas = stmt.query_map(params![inicio, fim], |row| {
        Ok(Agendamento {
            id: row.get(0)?,
            paciente_id: row.get(1)?,
            paciente_nome: row.get(2)?,
            data: row.get(3)?,
            hora_inicio: row.get(4)?,
            duracao_min: row.get(5)?,
            observacao: row.get(6)?,
            criado_em: row.get(7)?,
            atualizado_em: row.get(8)?,
            conflito: false,
            conflito_descricao: None,
        })
    })?;

    let mut todos = Vec::new();
    for linha in linhas {
        todos.push(linha?);
    }

    preencher_conflitos(&mut todos);

    if let Some(pid) = filtro_paciente {
        todos.retain(|a| a.paciente_id == pid);
    }

    Ok(todos)
}

/// Verifica se um horário proposto (`data`, `hora_inicio`, `duracao_min`) conflita com outros
/// agendamentos já salvos na mesma data, opcionalmente ignorando `ignorar_id` (para edição — RN73).
pub fn executar_agendamentos_verificar_conflito(
    state: &AppState,
    data: &str,
    hora_inicio: &str,
    duracao_min: Option<i64>,
    ignorar_id: Option<&str>,
) -> Resultado<Vec<Agendamento>> {
    state.verificar_desbloqueado()?;
    let data_limpa = data.trim();
    NaiveDate::parse_from_str(data_limpa, "%Y-%m-%d").map_err(|_| {
        Erro::Validacao("Data do agendamento inválida. Use o formato dd/mm/aaaa.".to_string())
    })?;

    let (_, inicio_proposto) = validar_e_converter_hora_inicio(hora_inicio)?;
    let duracao_proposta = duracao_min.unwrap_or(DURACAO_PADRAO_AGENDAMENTO_MIN);
    if duracao_proposta <= 0 || duracao_proposta > 720 {
        return Err(Erro::Validacao(
            "A duração do agendamento deve ser entre 1 e 720 minutos.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let do_dia = listar_agendamentos_do_dia_conn(conn, data_limpa)?;
    let id_ignorado = ignorar_id.map(str::trim).filter(|s| !s.is_empty());

    let conflitantes = do_dia
        .into_iter()
        .filter(|a| {
            if let Some(ign) = id_ignorado {
                if a.id == ign {
                    return false;
                }
            }
            if let Ok((_, inicio_existente)) = validar_e_converter_hora_inicio(&a.hora_inicio) {
                intervalos_conflitam(
                    inicio_proposto,
                    duracao_proposta,
                    inicio_existente,
                    a.duracao_min,
                )
            } else {
                false
            }
        })
        .collect();

    Ok(conflitantes)
}

/// Cria um novo agendamento permitindo datas passadas/futuras e avisando (sem bloquear) conflitos (RN70, RN72, RN73).
pub fn executar_agendamento_criar(
    state: &AppState,
    dados: &DadosAgendamentoInput,
) -> Resultado<Agendamento> {
    state.verificar_desbloqueado()?;
    let val = validar_dados_agendamento(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    if !paciente_existe_conn(conn, &val.paciente_id)? {
        return Err(Erro::NaoEncontrado);
    }

    let id = Uuid::new_v4().to_string();
    let agora = Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO agendamentos (
            id,
            paciente_id,
            data,
            hora_inicio,
            duracao_min,
            observacao,
            criado_em,
            atualizado_em
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7);",
        params![
            id,
            val.paciente_id,
            val.data,
            val.hora_inicio,
            val.duracao_min,
            val.observacao,
            agora,
        ],
    )?;

    obter_agendamento_por_id_conn(conn, &id)
}

/// Edita ou remarca um agendamento existente (RN74).
pub fn executar_agendamento_atualizar(
    state: &AppState,
    id: &str,
    dados: &DadosAgendamentoInput,
) -> Resultado<Agendamento> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do agendamento é obrigatório.".to_string(),
        ));
    }

    let val = validar_dados_agendamento(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let existente = obter_agendamento_por_id_conn(conn, id_limpo)?;
    if !paciente_existe_conn(conn, &val.paciente_id)? {
        return Err(Erro::NaoEncontrado);
    }

    let mut atualizado_em = Local::now().to_rfc3339();
    if atualizado_em == existente.criado_em {
        atualizado_em = (Local::now() + Duration::milliseconds(1)).to_rfc3339();
    }

    conn.execute(
        "UPDATE agendamentos
         SET paciente_id = ?1,
             data = ?2,
             hora_inicio = ?3,
             duracao_min = ?4,
             observacao = ?5,
             atualizado_em = ?6
         WHERE id = ?7;",
        params![
            val.paciente_id,
            val.data,
            val.hora_inicio,
            val.duracao_min,
            val.observacao,
            atualizado_em,
            id_limpo,
        ],
    )?;

    obter_agendamento_por_id_conn(conn, id_limpo)
}

/// Exclui um agendamento pelo ID (RN74).
pub fn executar_agendamento_excluir(state: &AppState, id: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id_limpo = id.trim();
    let linhas_afetadas = conn.execute("DELETE FROM agendamentos WHERE id = ?1;", [id_limpo])?;
    if linhas_afetadas == 0 {
        return Err(Erro::NaoEncontrado);
    }

    Ok(())
}

/// Obtém o próximo agendamento de um paciente a partir de hoje (RN77).
pub fn executar_agendamento_proximo_paciente(
    state: &AppState,
    paciente_id: &str,
) -> Resultado<Option<Agendamento>> {
    let hoje = Local::now().date_naive();
    executar_agendamento_proximo_paciente_em_data(state, paciente_id, hoje)
}

pub fn executar_agendamento_proximo_paciente_em_data(
    state: &AppState,
    paciente_id: &str,
    hoje: NaiveDate,
) -> Resultado<Option<Agendamento>> {
    state.verificar_desbloqueado()?;
    let pid = paciente_id.trim();
    if pid.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do paciente é obrigatório.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let hoje_str = hoje.format("%Y-%m-%d").to_string();
    let proximo_id: Option<String> = conn
        .query_row(
            "SELECT id
             FROM agendamentos
             WHERE paciente_id = ?1 AND data >= ?2
             ORDER BY data ASC, hora_inicio ASC, criado_em ASC
             LIMIT 1;",
            params![pid, hoje_str],
            |row| row.get(0),
        )
        .optional()?;

    match proximo_id {
        Some(id) => Ok(Some(obter_agendamento_por_id_conn(conn, &id)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn agendamentos_listar(
    state: State<'_, AppState>,
    data_inicio: Option<String>,
    data_fim: Option<String>,
    paciente_id: Option<String>,
) -> Resultado<Vec<Agendamento>> {
    executar_agendamentos_listar(
        &state,
        data_inicio.as_deref(),
        data_fim.as_deref(),
        paciente_id.as_deref(),
    )
}

#[tauri::command]
pub fn agendamentos_verificar_conflito(
    state: State<'_, AppState>,
    data: String,
    hora_inicio: String,
    duracao_min: Option<i64>,
    ignorar_id: Option<String>,
) -> Resultado<Vec<Agendamento>> {
    executar_agendamentos_verificar_conflito(
        &state,
        &data,
        &hora_inicio,
        duracao_min,
        ignorar_id.as_deref(),
    )
}

#[tauri::command]
pub fn agendamento_criar(
    state: State<'_, AppState>,
    dados: DadosAgendamentoInput,
) -> Resultado<Agendamento> {
    executar_agendamento_criar(&state, &dados)
}

#[tauri::command]
pub fn agendamento_atualizar(
    state: State<'_, AppState>,
    id: String,
    dados: DadosAgendamentoInput,
) -> Resultado<Agendamento> {
    executar_agendamento_atualizar(&state, &id, &dados)
}

#[tauri::command]
pub fn agendamento_excluir(state: State<'_, AppState>, id: String) -> Resultado<()> {
    executar_agendamento_excluir(&state, &id)
}

#[tauri::command]
pub fn agendamento_proximo_paciente(
    state: State<'_, AppState>,
    paciente_id: String,
) -> Resultado<Option<Agendamento>> {
    executar_agendamento_proximo_paciente(&state, &paciente_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::pacientes::{
        executar_paciente_criar, executar_paciente_excluir, DadosPacienteInput,
    };
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use std::fs;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-agendamentos-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_agenda_rejeitam_quando_bloqueado() {
        let dir =
            std::env::temp_dir().join(format!("lc-agendamentos-lock-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(
            executar_agendamentos_listar(&state, None, None, None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_agendamento_criar(
                &state,
                &DadosAgendamentoInput {
                    paciente_id: "p-1".to_string(),
                    data: "2026-11-02".to_string(),
                    hora_inicio: "14:00".to_string(),
                    duracao_min: None,
                    observacao: None,
                }
            ),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_agendamento_excluir(&state, "ag-1"),
            Err(Erro::Bloqueado)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn validacoes_agendamento_datas_passadas_e_futuras_duracao_padrao_e_observacao_200_chars() {
        let state = criar_estado_desbloqueado();
        let paciente = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Mariana Costa".to_string(),
                ..Default::default()
            },
        )
        .expect("criar paciente");

        // 1. Datas passadas e futuras são permitidas, duração padrão = 50 min (RN70, RN72)
        let passado = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: paciente.id.clone(),
                data: "2025-05-10".to_string(),
                hora_inicio: "09:30".to_string(),
                duracao_min: None,
                observacao: Some("Sessão retroativa".to_string()),
            },
        )
        .expect("criar agendamento no passado");
        assert_eq!(passado.duracao_min, 50);
        assert_eq!(passado.paciente_nome, "Mariana Costa");
        assert!(!passado.conflito);

        let futuro = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: paciente.id.clone(),
                data: "2027-03-20".to_string(),
                hora_inicio: "16:00".to_string(),
                duracao_min: Some(60),
                observacao: Some("á".repeat(200)),
            },
        )
        .expect("criar agendamento no futuro com 200 caracteres");
        assert_eq!(futuro.duracao_min, 60);
        assert_eq!(futuro.observacao.as_ref().unwrap().chars().count(), 200);

        // 2. Observação acima de 200 caracteres é rejeitada (RN70)
        let erro_obs = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                hora_inicio: "10:00".to_string(),
                duracao_min: None,
                observacao: Some("a".repeat(201)),
            },
        );
        assert!(matches!(erro_obs, Err(Erro::Validacao(msg)) if msg.contains("200")));

        // 3. Horário inválido é rejeitado
        let erro_hora = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                hora_inicio: "25:00".to_string(),
                duracao_min: None,
                observacao: None,
            },
        );
        assert!(matches!(erro_hora, Err(Erro::Validacao(_))));

        let _ = fs::remove_dir_all(&state.data_dir);
    }

    #[test]
    fn deteccao_de_conflito_avisa_sem_bloquear_consulta_por_intervalo_remarcacao_e_exclusao() {
        let state = criar_estado_desbloqueado();

        let joao = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "João da Conceição".to_string(),
                ..Default::default()
            },
        )
        .expect("criar João");

        let ana = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Ana Beatriz".to_string(),
                ..Default::default()
            },
        )
        .expect("criar Ana");

        // 1. Criar 1º agendamento às 14:00 (50 min -> 14:00..14:50)
        let ag1 = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: joao.id.clone(),
                data: "2026-11-02".to_string(),
                hora_inicio: "14:00".to_string(),
                duracao_min: None,
                observacao: Some("Sessão regular".to_string()),
            },
        )
        .expect("criar ag1");
        assert!(!ag1.conflito);
        assert!(ag1.conflito_descricao.is_none());

        // 2. Verificar conflito antes de criar 2º agendamento às 14:00 ou 14:30 (RN73)
        let conflitos_previos =
            executar_agendamentos_verificar_conflito(&state, "2026-11-02", "14:00", Some(50), None)
                .expect("verificar conflito");
        assert_eq!(conflitos_previos.len(), 1);
        assert_eq!(conflitos_previos[0].id, ag1.id);

        // 3. Criar 2º agendamento no mesmo horário (14:00) NÃO bloqueia, mas sinaliza conflito (RN73)
        let ag2 = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: ana.id.clone(),
                data: "2026-11-02".to_string(),
                hora_inicio: "14:00".to_string(),
                duracao_min: Some(50),
                observacao: Some("Encaixe".to_string()),
            },
        )
        .expect("criar ag2 em conflito sem bloquear");
        assert!(ag2.conflito);
        assert!(ag2
            .conflito_descricao
            .as_deref()
            .unwrap()
            .contains("João da Conceição (14:00)"));

        // 4. Criar 3º agendamento em outro dia da semana (2026-11-05 às 10:00) e outro fora do intervalo (2026-11-20)
        let ag3 = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: joao.id.clone(),
                data: "2026-11-05".to_string(),
                hora_inicio: "10:00".to_string(),
                duracao_min: Some(50),
                observacao: None,
            },
        )
        .expect("criar ag3");

        let _ag_fora = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: ana.id.clone(),
                data: "2026-11-20".to_string(),
                hora_inicio: "11:00".to_string(),
                duracao_min: Some(50),
                observacao: None,
            },
        )
        .expect("criar ag_fora");

        // 5. Consulta por intervalo da semana (2026-11-01 a 2026-11-07) retorna os 3 agendamentos da semana
        let semana =
            executar_agendamentos_listar(&state, Some("2026-11-01"), Some("2026-11-07"), None)
                .expect("listar semana");
        assert_eq!(semana.len(), 3);
        assert!(semana[0].conflito);
        assert!(semana[1].conflito);
        assert!(!semana[2].conflito);

        // 6. Remarcar ag2 para 15:00 (sem sobreposição com 14:00..14:50) elimina o conflito (RN74)
        let ag2_remarcado = executar_agendamento_atualizar(
            &state,
            &ag2.id,
            &DadosAgendamentoInput {
                paciente_id: ana.id.clone(),
                data: "2026-11-02".to_string(),
                hora_inicio: "15:00".to_string(),
                duracao_min: Some(50),
                observacao: Some("Remarcado para 15h".to_string()),
            },
        )
        .expect("remarcar ag2");
        assert!(!ag2_remarcado.conflito);
        assert_eq!(ag2_remarcado.hora_inicio, "15:00");

        let do_dia_pos_remarcar =
            executar_agendamentos_listar(&state, Some("2026-11-02"), Some("2026-11-02"), None)
                .expect("listar dia após remarcar");
        assert_eq!(do_dia_pos_remarcar.len(), 2);
        assert!(!do_dia_pos_remarcar[0].conflito);
        assert!(!do_dia_pos_remarcar[1].conflito);

        // 7. Próximo agendamento do paciente (RN77)
        let hoje = NaiveDate::from_ymd_opt(2026, 11, 3).unwrap();
        let proximo_joao = executar_agendamento_proximo_paciente_em_data(&state, &joao.id, hoje)
            .expect("próximo de João")
            .expect("deve existir");
        assert_eq!(proximo_joao.id, ag3.id);
        assert_eq!(proximo_joao.data, "2026-11-05");

        // 8. Excluir agendamento (RN74)
        executar_agendamento_excluir(&state, &ag3.id).expect("excluir ag3");
        let proximo_apos_excluir =
            executar_agendamento_proximo_paciente_em_data(&state, &joao.id, hoje)
                .expect("próximo após excluir");
        assert!(proximo_apos_excluir.is_none());

        // 9. Excluir paciente remove agendamentos em cascata (ON DELETE CASCADE)
        executar_paciente_excluir(&state, &ana.id, "Ana Beatriz").expect("excluir Ana");
        let restantes_ana =
            executar_agendamentos_listar(&state, None, None, Some(&ana.id)).expect("listar Ana");
        assert!(restantes_ana.is_empty());

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
