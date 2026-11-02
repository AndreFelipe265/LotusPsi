//! Comandos de gerenciamento de sessões (`sessoes_*`, `sessao_*`) (F4-T1).

use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{Erro, Resultado};
use crate::state::AppState;

/// Limite rígido de caracteres do resumo da sessão (RN21).
pub const LIMITE_CARACTERES_RESUMO: usize = 600;

/// Representação de uma sessão de atendimento (RN20–RN25).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Sessao {
    pub id: String,
    pub paciente_id: String,
    pub data: String,
    pub resumo: String,
    pub criado_em: String,
    pub atualizado_em: String,
}

/// Dados de entrada para criar uma sessão (RN20).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DadosSessaoCriarInput {
    pub paciente_id: String,
    pub data: String,
    pub resumo: String,
}

/// Dados de entrada para atualizar uma sessão (RN25).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DadosSessaoAtualizarInput {
    pub data: String,
    pub resumo: String,
}

fn validar_data_e_resumo(
    data_raw: &str,
    resumo_raw: &str,
    hoje: NaiveDate,
) -> Resultado<(String, String)> {
    let data_limpa = data_raw.trim();
    if data_limpa.is_empty() {
        return Err(Erro::Validacao(
            "A data da sessão é obrigatória.".to_string(),
        ));
    }

    let data = NaiveDate::parse_from_str(data_limpa, "%Y-%m-%d").map_err(|_| {
        Erro::Validacao("Data da sessão inválida. Use o formato dd/mm/aaaa.".to_string())
    })?;

    if data > hoje {
        return Err(Erro::Validacao(
            "A data da sessão não pode ser uma data futura.".to_string(),
        ));
    }

    let resumo_limpo = resumo_raw.trim();
    if resumo_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O resumo da sessão é obrigatório.".to_string(),
        ));
    }

    let total_caracteres = resumo_limpo.chars().count();
    if total_caracteres > LIMITE_CARACTERES_RESUMO {
        return Err(Erro::Validacao(format!(
            "O resumo da sessão deve ter no máximo {} caracteres.",
            LIMITE_CARACTERES_RESUMO
        )));
    }

    Ok((
        data.format("%Y-%m-%d").to_string(),
        resumo_limpo.to_string(),
    ))
}

fn obter_sessao_por_id_conn(conn: &Connection, id: &str) -> Resultado<Sessao> {
    let mut stmt = conn.prepare(
        "SELECT id, paciente_id, data, resumo, criado_em, atualizado_em
         FROM sessoes
         WHERE id = ?1;",
    )?;

    let sessao = stmt
        .query_row([id], |row| {
            Ok(Sessao {
                id: row.get(0)?,
                paciente_id: row.get(1)?,
                data: row.get(2)?,
                resumo: row.get(3)?,
                criado_em: row.get(4)?,
                atualizado_em: row.get(5)?,
            })
        })
        .optional()?;

    sessao.ok_or(Erro::NaoEncontrado)
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

/// Lista as sessões de um paciente em ordem cronológica decrescente (mais recente primeiro — RN24).
pub fn executar_sessoes_listar(state: &AppState, paciente_id: &str) -> Resultado<Vec<Sessao>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let paciente_id_limpo = paciente_id.trim();
    if paciente_id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do paciente é obrigatório.".to_string(),
        ));
    }

    let mut stmt = conn.prepare(
        "SELECT id, paciente_id, data, resumo, criado_em, atualizado_em
         FROM sessoes
         WHERE paciente_id = ?1
         ORDER BY data DESC, criado_em DESC, rowid DESC;",
    )?;

    let linhas = stmt.query_map([paciente_id_limpo], |row| {
        Ok(Sessao {
            id: row.get(0)?,
            paciente_id: row.get(1)?,
            data: row.get(2)?,
            resumo: row.get(3)?,
            criado_em: row.get(4)?,
            atualizado_em: row.get(5)?,
        })
    })?;

    let mut sessoes = Vec::new();
    for linha in linhas {
        sessoes.push(linha?);
    }

    Ok(sessoes)
}

/// Cria uma nova sessão validando data não futura e resumo ≤ 600 caracteres (RN20–RN23).
pub fn executar_sessao_criar(state: &AppState, dados: &DadosSessaoCriarInput) -> Resultado<Sessao> {
    let hoje = Local::now().date_naive();
    executar_sessao_criar_em_data(state, dados, hoje)
}

pub fn executar_sessao_criar_em_data(
    state: &AppState,
    dados: &DadosSessaoCriarInput,
    hoje: NaiveDate,
) -> Resultado<Sessao> {
    state.verificar_desbloqueado()?;

    let paciente_id_limpo = dados.paciente_id.trim();
    if paciente_id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do paciente é obrigatório.".to_string(),
        ));
    }

    let (data, resumo) = validar_data_e_resumo(&dados.data, &dados.resumo, hoje)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    if !paciente_existe_conn(conn, paciente_id_limpo)? {
        return Err(Erro::NaoEncontrado);
    }

    let id = Uuid::new_v4().to_string();
    let agora = Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO sessoes (id, paciente_id, data, resumo, criado_em, atualizado_em)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5);",
        params![id, paciente_id_limpo, data, resumo, agora],
    )?;

    obter_sessao_por_id_conn(conn, &id)
}

/// Atualiza uma sessão existente, gravando `atualizado_em` (RN25).
pub fn executar_sessao_atualizar(
    state: &AppState,
    id: &str,
    dados: &DadosSessaoAtualizarInput,
) -> Resultado<Sessao> {
    let hoje = Local::now().date_naive();
    executar_sessao_atualizar_em_data(state, id, dados, hoje)
}

pub fn executar_sessao_atualizar_em_data(
    state: &AppState,
    id: &str,
    dados: &DadosSessaoAtualizarInput,
    hoje: NaiveDate,
) -> Resultado<Sessao> {
    state.verificar_desbloqueado()?;

    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador da sessão é obrigatório.".to_string(),
        ));
    }

    let (data, resumo) = validar_data_e_resumo(&dados.data, &dados.resumo, hoje)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let sessao_existente = obter_sessao_por_id_conn(conn, id_limpo)?;

    let mut atualizado_em = Local::now().to_rfc3339();
    if atualizado_em == sessao_existente.criado_em {
        atualizado_em = (Local::now() + Duration::milliseconds(1)).to_rfc3339();
    }

    conn.execute(
        "UPDATE sessoes
         SET data = ?1,
             resumo = ?2,
             atualizado_em = ?3
         WHERE id = ?4;",
        params![data, resumo, atualizado_em, id_limpo],
    )?;

    obter_sessao_por_id_conn(conn, id_limpo)
}

/// Exclui uma sessão pelo ID (RN26).
pub fn executar_sessao_excluir(state: &AppState, id: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id_limpo = id.trim();
    let linhas_afetadas = conn.execute("DELETE FROM sessoes WHERE id = ?1;", [id_limpo])?;
    if linhas_afetadas == 0 {
        return Err(Erro::NaoEncontrado);
    }

    Ok(())
}

#[tauri::command]
pub fn sessoes_listar(state: State<'_, AppState>, paciente_id: String) -> Resultado<Vec<Sessao>> {
    executar_sessoes_listar(&state, &paciente_id)
}

#[tauri::command]
pub fn sessao_criar(state: State<'_, AppState>, dados: DadosSessaoCriarInput) -> Resultado<Sessao> {
    executar_sessao_criar(&state, &dados)
}

#[tauri::command]
pub fn sessao_atualizar(
    state: State<'_, AppState>,
    id: String,
    dados: DadosSessaoAtualizarInput,
) -> Resultado<Sessao> {
    executar_sessao_atualizar(&state, &id, &dados)
}

#[tauri::command]
pub fn sessao_excluir(state: State<'_, AppState>, id: String) -> Resultado<()> {
    executar_sessao_excluir(&state, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::pacientes::{
        executar_paciente_criar, executar_paciente_obter, DadosPacienteInput,
    };
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use std::fs;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-sessoes-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_sessoes_rejeitam_quando_bloqueado() {
        let dir = std::env::temp_dir().join(format!("lc-sessoes-lock-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(executar_sessoes_listar(&state, "p-1"), Err(Erro::Bloqueado));
        assert_eq!(
            executar_sessao_criar(
                &state,
                &DadosSessaoCriarInput {
                    paciente_id: "p-1".to_string(),
                    data: "2026-11-01".to_string(),
                    resumo: "Resumo".to_string(),
                }
            ),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_sessao_atualizar(
                &state,
                "s-1",
                &DadosSessaoAtualizarInput {
                    data: "2026-11-01".to_string(),
                    resumo: "Resumo".to_string(),
                }
            ),
            Err(Erro::Bloqueado)
        );
        assert_eq!(executar_sessao_excluir(&state, "s-1"), Err(Erro::Bloqueado));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn validacao_rejeita_data_futura_e_resumo_acima_de_600_caracteres() {
        let state = criar_estado_desbloqueado();
        let hoje = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();

        let paciente = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Maria Silva".to_string(),
                ..Default::default()
            },
        )
        .expect("criar paciente");

        // 1. Data futura é proibida (RN22)
        let erro_futura = executar_sessao_criar_em_data(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-03".to_string(),
                resumo: "Sessão no futuro".to_string(),
            },
            hoje,
        );
        assert!(matches!(erro_futura, Err(Erro::Validacao(msg)) if msg.contains("futura")));

        // 2. Resumo vazio é proibido (RN20)
        let erro_vazio = executar_sessao_criar_em_data(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                resumo: "    ".to_string(),
            },
            hoje,
        );
        assert!(matches!(erro_vazio, Err(Erro::Validacao(msg)) if msg.contains("obrigatório")));

        // 3. Resumo com exatamente 600 caracteres (incluindo acentos) é aceito (RN21)
        let resumo_600 = "á".repeat(600);
        let sessao_600 = executar_sessao_criar_em_data(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                resumo: resumo_600.clone(),
            },
            hoje,
        )
        .expect("aceitar exatamente 600 caracteres");
        assert_eq!(sessao_600.resumo.chars().count(), 600);

        // 4. Resumo com 601 caracteres é rejeitado (RN21)
        let resumo_601 = "a".repeat(601);
        let erro_601 = executar_sessao_criar_em_data(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                resumo: resumo_601.clone(),
            },
            hoje,
        );
        assert!(matches!(erro_601, Err(Erro::Validacao(msg)) if msg.contains("600")));

        // 5. Atualização também rejeita data futura e > 600 caracteres
        let erro_upd_futura = executar_sessao_atualizar_em_data(
            &state,
            &sessao_600.id,
            &DadosSessaoAtualizarInput {
                data: "2026-12-01".to_string(),
                resumo: "Texto válido".to_string(),
            },
            hoje,
        );
        assert!(matches!(erro_upd_futura, Err(Erro::Validacao(_))));

        let erro_upd_601 = executar_sessao_atualizar_em_data(
            &state,
            &sessao_600.id,
            &DadosSessaoAtualizarInput {
                data: "2026-11-02".to_string(),
                resumo: resumo_601,
            },
            hoje,
        );
        assert!(matches!(erro_upd_601, Err(Erro::Validacao(_))));

        let _ = fs::remove_dir_all(&state.data_dir);
    }

    #[test]
    fn crud_sessoes_multiplas_mesma_data_ordem_decrescente_edicao_e_exclusao() {
        let state = criar_estado_desbloqueado();
        let hoje = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();

        let paciente = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Carlos Oliveira".to_string(),
                ..Default::default()
            },
        )
        .expect("criar paciente");

        // 1. Criar 3 sessões (incluindo duas na mesma data — RN22, RN23)
        let s1 = executar_sessao_criar_em_data(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-10-15".to_string(),
                resumo: "Primeira sessão de acolhimento.".to_string(),
            },
            hoje,
        )
        .expect("criar s1");
        assert_eq!(s1.criado_em, s1.atualizado_em);

        let s2 = executar_sessao_criar_em_data(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                resumo: "Sessão da manhã.".to_string(),
            },
            hoje,
        )
        .expect("criar s2");

        let s3 = executar_sessao_criar_em_data(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                resumo: "Sessão extra no mesmo dia.".to_string(),
            },
            hoje,
        )
        .expect("criar s3");

        // 2. Listar em ordem cronológica decrescente (RN24)
        let lista = executar_sessoes_listar(&state, &paciente.id).expect("listar sessões");
        assert_eq!(lista.len(), 3);
        assert_eq!(lista[0].id, s3.id);
        assert_eq!(lista[1].id, s2.id);
        assert_eq!(lista[2].id, s1.id);

        // 3. Verificar reflexo no perfil do paciente (RN27: total_sessoes e ultima_sessao)
        let perfil = executar_paciente_obter(&state, &paciente.id).expect("obter paciente");
        assert_eq!(perfil.total_sessoes, 3);
        assert_eq!(perfil.ultima_sessao.as_deref(), Some("2026-11-02"));

        // 4. Editar uma sessão atualiza `atualizado_em` (RN25)
        let s2_editada = executar_sessao_atualizar_em_data(
            &state,
            &s2.id,
            &DadosSessaoAtualizarInput {
                data: "2026-10-25".to_string(),
                resumo: "Sessão remanejada e editada.".to_string(),
            },
            hoje,
        )
        .expect("editar s2");
        assert_eq!(s2_editada.data, "2026-10-25");
        assert_eq!(s2_editada.resumo, "Sessão remanejada e editada.");
        assert_ne!(s2_editada.atualizado_em, s2_editada.criado_em);

        // 5. Excluir uma sessão (RN26)
        executar_sessao_excluir(&state, &s3.id).expect("excluir s3");
        let lista_pos_exclusao =
            executar_sessoes_listar(&state, &paciente.id).expect("listar após exclusão");
        assert_eq!(lista_pos_exclusao.len(), 2);
        assert_eq!(lista_pos_exclusao[0].id, s2.id);
        assert_eq!(lista_pos_exclusao[1].id, s1.id);

        let perfil_pos = executar_paciente_obter(&state, &paciente.id).expect("obter paciente");
        assert_eq!(perfil_pos.total_sessoes, 2);
        assert_eq!(perfil_pos.ultima_sessao.as_deref(), Some("2026-10-25"));

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
