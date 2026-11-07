//! Comandos de gerenciamento da Grade Semanal de Horários Fixos (`horarios_semanais_*`, `horario_semanal_*`) (F9-T3 — RN90–RN95).

use chrono::{Datelike, Duration, Local, NaiveDate, Weekday};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::commands::agendamentos::{
    intervalos_conflitam, validar_e_converter_hora_inicio, DURACAO_PADRAO_AGENDAMENTO_MIN,
    LIMITE_CARACTERES_OBSERVACAO_AGENDAMENTO,
};
use crate::error::{Erro, Resultado};
use crate::state::AppState;

/// Representação completa de um horário semanal fixo retornado ao frontend (RN90–RN95).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HorarioSemanal {
    pub id: String,
    pub paciente_id: String,
    pub paciente_nome: String,
    pub paciente_status: String,
    /// `0` = Domingo, `1` = Segunda-feira, ..., `6` = Sábado (RN91).
    pub dia_semana: i64,
    pub hora_inicio: String,
    pub duracao_min: i64,
    pub observacao: Option<String>,
    pub criado_em: String,
    pub atualizado_em: String,
    /// Indica se há sobreposição de horário com outro horário fixo no mesmo `dia_semana` (RN93).
    pub conflito: bool,
    /// Descrição amigável dos horários fixos conflitantes (RN93).
    pub conflito_descricao: Option<String>,
}

/// Dados de entrada para criar ou atualizar um horário semanal fixo (RN91).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DadosHorarioSemanalInput {
    pub paciente_id: String,
    pub dia_semana: i64,
    pub hora_inicio: String,
    pub duracao_min: Option<i64>,
    pub observacao: Option<String>,
}

/// Resultado da aplicação da grade semanal fixa nos agendamentos de uma semana (RN94).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResultadoAplicarGradeSemana {
    pub data_inicio_semana: String,
    pub data_fim_semana: String,
    pub criados: usize,
    pub ignorados_existentes: usize,
}

struct DadosHorarioValidados {
    paciente_id: String,
    dia_semana: i64,
    hora_inicio: String,
    duracao_min: i64,
    observacao: Option<String>,
}

fn validar_dados_horario(dados: &DadosHorarioSemanalInput) -> Resultado<DadosHorarioValidados> {
    let paciente_id = dados.paciente_id.trim().to_string();
    if paciente_id.is_empty() {
        return Err(Erro::Validacao(
            "Selecione o paciente para o horário semanal fixo.".to_string(),
        ));
    }

    if !(0..=6).contains(&dados.dia_semana) {
        return Err(Erro::Validacao(
            "Dia da semana inválido. Escolha entre Domingo (0) e Sábado (6).".to_string(),
        ));
    }

    let (hora_inicio, _) = validar_e_converter_hora_inicio(&dados.hora_inicio)?;

    let duracao_min = dados.duracao_min.unwrap_or(DURACAO_PADRAO_AGENDAMENTO_MIN);
    if duracao_min <= 0 || duracao_min > 720 {
        return Err(Erro::Validacao(
            "A duração do horário fixo deve ser entre 1 e 720 minutos.".to_string(),
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
                "A observação do horário fixo deve ter no máximo {} caracteres.",
                LIMITE_CARACTERES_OBSERVACAO_AGENDAMENTO
            )));
        }
    }

    Ok(DadosHorarioValidados {
        paciente_id,
        dia_semana: dados.dia_semana,
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

fn preencher_conflitos_grade(horarios: &mut [HorarioSemanal]) {
    let n = horarios.len();
    let minutos_inicio: Vec<i64> = horarios
        .iter()
        .map(|h| {
            validar_e_converter_hora_inicio(&h.hora_inicio)
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
            if horarios[i].dia_semana == horarios[j].dia_semana
                && intervalos_conflitam(
                    minutos_inicio[i],
                    horarios[i].duracao_min,
                    minutos_inicio[j],
                    horarios[j].duracao_min,
                )
            {
                nomes_conflitantes.push(format!(
                    "{} ({})",
                    horarios[j].paciente_nome, horarios[j].hora_inicio
                ));
            }
        }

        if !nomes_conflitantes.is_empty() {
            horarios[i].conflito = true;
            horarios[i].conflito_descricao = Some(format!(
                "Conflito na grade com {}",
                nomes_conflitantes.join(", ")
            ));
        } else {
            horarios[i].conflito = false;
            horarios[i].conflito_descricao = None;
        }
    }
}

fn listar_todos_horarios_semanais_conn(conn: &Connection) -> Resultado<Vec<HorarioSemanal>> {
    let mut stmt = conn.prepare(
        "SELECT
            h.id,
            h.paciente_id,
            p.nome,
            p.status,
            h.dia_semana,
            h.hora_inicio,
            h.duracao_min,
            h.observacao,
            h.criado_em,
            h.atualizado_em
         FROM horarios_semanais h
         INNER JOIN pacientes p ON p.id = h.paciente_id
         ORDER BY
            CASE WHEN h.dia_semana = 0 THEN 7 ELSE h.dia_semana END ASC,
            h.hora_inicio ASC,
            h.criado_em ASC;",
    )?;

    let linhas = stmt.query_map([], |row| {
        Ok(HorarioSemanal {
            id: row.get(0)?,
            paciente_id: row.get(1)?,
            paciente_nome: row.get(2)?,
            paciente_status: row.get(3)?,
            dia_semana: row.get(4)?,
            hora_inicio: row.get(5)?,
            duracao_min: row.get(6)?,
            observacao: row.get(7)?,
            criado_em: row.get(8)?,
            atualizado_em: row.get(9)?,
            conflito: false,
            conflito_descricao: None,
        })
    })?;

    let mut lista = Vec::new();
    for linha in linhas {
        lista.push(linha?);
    }

    preencher_conflitos_grade(&mut lista);
    Ok(lista)
}

fn obter_horario_por_id_conn(conn: &Connection, id: &str) -> Resultado<HorarioSemanal> {
    let todos = listar_todos_horarios_semanais_conn(conn)?;
    todos
        .into_iter()
        .find(|h| h.id == id)
        .ok_or(Erro::NaoEncontrado)
}

/// Lista todos os horários semanais fixos (ou filtrados por `paciente_id`), já enriquecidos
/// com detecção de conflitos no mesmo dia da semana (RN90–RN93, RN95).
pub fn executar_horarios_semanais_listar(
    state: &AppState,
    paciente_id: Option<&str>,
) -> Resultado<Vec<HorarioSemanal>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let mut todos = listar_todos_horarios_semanais_conn(conn)?;
    if let Some(pid) = paciente_id.map(str::trim).filter(|s| !s.is_empty()) {
        todos.retain(|h| h.paciente_id == pid);
    }

    Ok(todos)
}

/// Cria um novo horário semanal fixo (RN90, RN91, RN93).
pub fn executar_horario_semanal_criar(
    state: &AppState,
    dados: &DadosHorarioSemanalInput,
) -> Resultado<HorarioSemanal> {
    state.verificar_desbloqueado()?;
    let val = validar_dados_horario(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    if !paciente_existe_conn(conn, &val.paciente_id)? {
        return Err(Erro::NaoEncontrado);
    }

    let id = Uuid::new_v4().to_string();
    let agora = Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO horarios_semanais (
            id,
            paciente_id,
            dia_semana,
            hora_inicio,
            duracao_min,
            observacao,
            criado_em,
            atualizado_em
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7);",
        params![
            id,
            val.paciente_id,
            val.dia_semana,
            val.hora_inicio,
            val.duracao_min,
            val.observacao,
            agora,
        ],
    )?;

    obter_horario_por_id_conn(conn, &id)
}

/// Atualiza um horário semanal fixo existente (RN92).
pub fn executar_horario_semanal_atualizar(
    state: &AppState,
    id: &str,
    dados: &DadosHorarioSemanalInput,
) -> Resultado<HorarioSemanal> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do horário semanal é obrigatório.".to_string(),
        ));
    }

    let val = validar_dados_horario(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let existente = obter_horario_por_id_conn(conn, id_limpo)?;
    if !paciente_existe_conn(conn, &val.paciente_id)? {
        return Err(Erro::NaoEncontrado);
    }

    let mut atualizado_em = Local::now().to_rfc3339();
    if atualizado_em == existente.criado_em {
        atualizado_em = (Local::now() + Duration::milliseconds(1)).to_rfc3339();
    }

    conn.execute(
        "UPDATE horarios_semanais
         SET paciente_id = ?1,
             dia_semana = ?2,
             hora_inicio = ?3,
             duracao_min = ?4,
             observacao = ?5,
             atualizado_em = ?6
         WHERE id = ?7;",
        params![
            val.paciente_id,
            val.dia_semana,
            val.hora_inicio,
            val.duracao_min,
            val.observacao,
            atualizado_em,
            id_limpo,
        ],
    )?;

    obter_horario_por_id_conn(conn, id_limpo)
}

/// Exclui um horário semanal fixo pelo ID (RN92).
pub fn executar_horario_semanal_excluir(state: &AppState, id: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id_limpo = id.trim();
    let linhas_afetadas = conn.execute("DELETE FROM horarios_semanais WHERE id = ?1;", [id_limpo])?;
    if linhas_afetadas == 0 {
        return Err(Erro::NaoEncontrado);
    }

    Ok(())
}

/// Calcula a segunda-feira da semana (Segunda a Domingo) que contém `data_ref`.
fn obter_segunda_feira_da_semana(data_ref: NaiveDate) -> NaiveDate {
    let deslocamento = match data_ref.weekday() {
        Weekday::Mon => 0,
        Weekday::Tue => -1,
        Weekday::Wed => -2,
        Weekday::Thu => -3,
        Weekday::Fri => -4,
        Weekday::Sat => -5,
        Weekday::Sun => -6,
    };
    data_ref + Duration::days(deslocamento)
}

/// Gera os agendamentos pontuais (`agendamentos`) na semana de `data_referencia` (`AAAA-MM-DD`)
/// a partir dos horários semanais fixos de pacientes ativos, ignorando sem duplicar aqueles que já
/// possuam agendamento para o mesmo paciente, data e horário de início (RN94).
pub fn executar_horarios_semanais_aplicar_semana(
    state: &AppState,
    data_referencia: &str,
) -> Resultado<ResultadoAplicarGradeSemana> {
    state.verificar_desbloqueado()?;
    let data_ref = NaiveDate::parse_from_str(data_referencia.trim(), "%Y-%m-%d").map_err(|_| {
        Erro::Validacao("Data de referência inválida. Use o formato AAAA-MM-DD.".to_string())
    })?;

    let segunda = obter_segunda_feira_da_semana(data_ref);
    let domingo = segunda + Duration::days(6);

    let mut conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_mut().ok_or(Erro::Bloqueado)?;

    let horarios = listar_todos_horarios_semanais_conn(conn)?;
    let tx = conn.transaction()?;

    let mut criados: usize = 0;
    let mut ignorados_existentes: usize = 0;
    let agora = Local::now().to_rfc3339();

    for h in horarios {
        if h.paciente_status != "ativo" {
            continue;
        }

        let offset_dias = if h.dia_semana == 0 {
            6
        } else {
            h.dia_semana - 1
        };
        let data_alvo = (segunda + Duration::days(offset_dias))
            .format("%Y-%m-%d")
            .to_string();

        let ja_existe: Option<i64> = tx
            .query_row(
                "SELECT 1 FROM agendamentos
                 WHERE paciente_id = ?1 AND data = ?2 AND hora_inicio = ?3
                 LIMIT 1;",
                params![h.paciente_id, data_alvo, h.hora_inicio],
                |row| row.get(0),
            )
            .optional()?;

        if ja_existe.is_some() {
            ignorados_existentes += 1;
            continue;
        }

        let novo_id = Uuid::new_v4().to_string();
        tx.execute(
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
                novo_id,
                h.paciente_id,
                data_alvo,
                h.hora_inicio,
                h.duracao_min,
                h.observacao,
                agora,
            ],
        )?;
        criados += 1;
    }

    tx.commit()?;

    Ok(ResultadoAplicarGradeSemana {
        data_inicio_semana: segunda.format("%Y-%m-%d").to_string(),
        data_fim_semana: domingo.format("%Y-%m-%d").to_string(),
        criados,
        ignorados_existentes,
    })
}

#[tauri::command]
pub fn horarios_semanais_listar(
    state: State<'_, AppState>,
    paciente_id: Option<String>,
) -> Resultado<Vec<HorarioSemanal>> {
    executar_horarios_semanais_listar(&state, paciente_id.as_deref())
}

#[tauri::command]
pub fn horario_semanal_criar(
    state: State<'_, AppState>,
    dados: DadosHorarioSemanalInput,
) -> Resultado<HorarioSemanal> {
    executar_horario_semanal_criar(&state, &dados)
}

#[tauri::command]
pub fn horario_semanal_atualizar(
    state: State<'_, AppState>,
    id: String,
    dados: DadosHorarioSemanalInput,
) -> Resultado<HorarioSemanal> {
    executar_horario_semanal_atualizar(&state, &id, &dados)
}

#[tauri::command]
pub fn horario_semanal_excluir(state: State<'_, AppState>, id: String) -> Resultado<()> {
    executar_horario_semanal_excluir(&state, &id)
}

#[tauri::command]
pub fn horarios_semanais_aplicar_semana(
    state: State<'_, AppState>,
    data_referencia: String,
) -> Resultado<ResultadoAplicarGradeSemana> {
    executar_horarios_semanais_aplicar_semana(&state, &data_referencia)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::agendamentos::executar_agendamentos_listar;
    use crate::commands::pacientes::{
        executar_paciente_criar, executar_paciente_definir_status, executar_paciente_excluir,
        DadosPacienteInput,
    };
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use std::fs;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-grade-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_grade_rejeitam_quando_bloqueado() {
        let dir = std::env::temp_dir().join(format!("lc-grade-lock-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(
            executar_horarios_semanais_listar(&state, None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_horario_semanal_criar(
                &state,
                &DadosHorarioSemanalInput {
                    paciente_id: "p-1".to_string(),
                    dia_semana: 1,
                    hora_inicio: "14:00".to_string(),
                    duracao_min: None,
                    observacao: None,
                }
            ),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_horarios_semanais_aplicar_semana(&state, "2026-11-02"),
            Err(Erro::Bloqueado)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn crud_grade_semanal_conflito_mesmo_dia_e_aplicacao_na_semana_sem_duplicar() {
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

        // 1. Criar horário fixo para João: Segunda-feira (1) às 14:00 (duração padrão 50 min)
        let h1 = executar_horario_semanal_criar(
            &state,
            &DadosHorarioSemanalInput {
                paciente_id: joao.id.clone(),
                dia_semana: 1,
                hora_inicio: "14:00".to_string(),
                duracao_min: None,
                observacao: Some("Horário fixo semanal".to_string()),
            },
        )
        .expect("criar h1");
        assert_eq!(h1.duracao_min, 50);
        assert!(!h1.conflito);

        // 2. Criar horário fixo para Ana: Segunda-feira (1) às 14:30 -> conflita com João (14:00..14:50) mas não bloqueia (RN93)
        let h2 = executar_horario_semanal_criar(
            &state,
            &DadosHorarioSemanalInput {
                paciente_id: ana.id.clone(),
                dia_semana: 1,
                hora_inicio: "14:30".to_string(),
                duracao_min: Some(50),
                observacao: None,
            },
        )
        .expect("criar h2 em conflito");
        assert!(h2.conflito);
        assert!(h2
            .conflito_descricao
            .as_deref()
            .unwrap()
            .contains("João da Conceição (14:00)"));

        // 3. Remarcar horário fixo de Ana para Quarta-feira (3) às 10:00 -> resolve conflito (RN92)
        let h2_atualizado = executar_horario_semanal_atualizar(
            &state,
            &h2.id,
            &DadosHorarioSemanalInput {
                paciente_id: ana.id.clone(),
                dia_semana: 3,
                hora_inicio: "10:00".to_string(),
                duracao_min: Some(50),
                observacao: Some("Quarta de manhã".to_string()),
            },
        )
        .expect("atualizar h2");
        assert!(!h2_atualizado.conflito);

        // 4. Listar horários fixos do paciente João (RN95)
        let do_joao = executar_horarios_semanais_listar(&state, Some(&joao.id))
            .expect("listar horários de João");
        assert_eq!(do_joao.len(), 1);
        assert_eq!(do_joao[0].id, h1.id);

        // 5. Aplicar grade semanal na semana de 2026-11-02 (Seg 02/11 a Dom 08/11) (RN94)
        let res_aplicar = executar_horarios_semanais_aplicar_semana(&state, "2026-11-04")
            .expect("aplicar grade na semana");
        assert_eq!(res_aplicar.data_inicio_semana, "2026-11-02");
        assert_eq!(res_aplicar.data_fim_semana, "2026-11-08");
        assert_eq!(res_aplicar.criados, 2);
        assert_eq!(res_aplicar.ignorados_existentes, 0);

        let ags_semana =
            executar_agendamentos_listar(&state, Some("2026-11-02"), Some("2026-11-08"), None)
                .expect("listar agendamentos gerados");
        assert_eq!(ags_semana.len(), 2);
        assert_eq!(ags_semana[0].data, "2026-11-02"); // Segunda
        assert_eq!(ags_semana[0].hora_inicio, "14:00");
        assert_eq!(ags_semana[1].data, "2026-11-04"); // Quarta
        assert_eq!(ags_semana[1].hora_inicio, "10:00");

        // 6. Aplicar novamente na mesma semana não duplica os agendamentos já existentes (RN94)
        let res_reaplicar = executar_horarios_semanais_aplicar_semana(&state, "2026-11-04")
            .expect("reaplicar grade na mesma semana");
        assert_eq!(res_reaplicar.criados, 0);
        assert_eq!(res_reaplicar.ignorados_existentes, 2);

        // 7. Paciente inativo não gera novos agendamentos ao aplicar em outra semana (RN94)
        executar_paciente_definir_status(&state, &ana.id, "inativo").expect("inativar Ana");
        let res_prox_semana = executar_horarios_semanais_aplicar_semana(&state, "2026-11-09")
            .expect("aplicar na semana seguinte");
        assert_eq!(res_prox_semana.criados, 1); // apenas João (ativo)

        // 8. Excluir paciente remove seus horários fixos via ON DELETE CASCADE (RN91)
        executar_paciente_excluir(&state, &joao.id, "João da Conceição").expect("excluir João");
        let restantes = executar_horarios_semanais_listar(&state, None).expect("listar restantes");
        assert_eq!(restantes.len(), 1);
        assert_eq!(restantes[0].id, h2.id);

        // 9. Excluir horário fixo pelo ID (RN92)
        executar_horario_semanal_excluir(&state, &h2.id).expect("excluir h2");
        let vazio = executar_horarios_semanais_listar(&state, None).expect("listar vazio");
        assert!(vazio.is_empty());

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
