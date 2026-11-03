//! Comandos de leitura e atualização de configurações (`config_*`) e boas-vindas rotativas (F4.5-T1 — RN60–RN62).

use argon2::password_hash::rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::error::{Erro, Resultado};
use crate::state::AppState;

/// Chave na tabela `config` onde fica salvo o índice da última mensagem de boas-vindas exibida (RN62).
pub const CHAVE_CONFIG_BOAS_VINDAS_INDICE: &str = "boas_vindas_ultimo_indice";

/// Lista fixa de mensagens de boas-vindas do MVP (RN61).
/// Inclui obrigatoriamente "Eu te amo, mãe! ❤️".
pub const MENSAGENS_BOAS_VINDAS: [&str; 6] = [
    "Eu te amo, mãe! ❤️",
    "Bom te ver de novo, Louriedna!",
    "Que seu dia seja leve e cheio de bons encontros.",
    "Você faz a diferença na vida de muita gente.",
    "Respire fundo: hoje vai ser um bom dia.",
    "Obrigado por cuidar de tantas pessoas com tanto carinho.",
];

/// Sorteia o próximo índice da lista sem repetir o `ultimo_indice` (RN60, RN62).
pub fn sortear_proximo_indice_boas_vindas(
    ultimo_indice: Option<usize>,
    total: usize,
    aleatorio: u64,
) -> usize {
    if total <= 1 {
        return 0;
    }

    match ultimo_indice {
        Some(ultimo) if ultimo < total => {
            let deslocamento = (aleatorio as usize) % (total - 1);
            (ultimo + 1 + deslocamento) % total
        }
        _ => (aleatorio as usize) % total,
    }
}

pub fn ler_config_conn(conn: &Connection, chave: &str) -> Resultado<Option<String>> {
    let valor = conn
        .query_row(
            "SELECT valor FROM config WHERE chave = ?1;",
            [chave],
            |row| row.get(0),
        )
        .optional()?;
    Ok(valor)
}

pub fn definir_config_conn(conn: &Connection, chave: &str, valor: &str) -> Resultado<()> {
    conn.execute(
        "INSERT INTO config (chave, valor) VALUES (?1, ?2)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor;",
        params![chave, valor],
    )?;
    Ok(())
}

/// Sorteia uma nova mensagem de boas-vindas diferente da anterior, grava o índice em `config`
/// e retorna o texto da mensagem escolhida (RN60–RN62).
pub fn rotacionar_boas_vindas_conn(conn: &Connection) -> Resultado<String> {
    let aleatorio = OsRng.next_u64();
    rotacionar_boas_vindas_com_semente_conn(conn, aleatorio)
}

pub fn rotacionar_boas_vindas_com_semente_conn(
    conn: &Connection,
    aleatorio: u64,
) -> Resultado<String> {
    let ultimo_indice = ler_config_conn(conn, CHAVE_CONFIG_BOAS_VINDAS_INDICE)?
        .and_then(|v| v.trim().parse::<usize>().ok());

    let novo_indice =
        sortear_proximo_indice_boas_vindas(ultimo_indice, MENSAGENS_BOAS_VINDAS.len(), aleatorio);

    definir_config_conn(
        conn,
        CHAVE_CONFIG_BOAS_VINDAS_INDICE,
        &novo_indice.to_string(),
    )?;

    Ok(MENSAGENS_BOAS_VINDAS[novo_indice].to_string())
}

/// Obtém a mensagem de boas-vindas atual da sessão autenticada.
/// Caso ainda não haja índice salvo em `config`, sorteia e grava um imediatamente.
pub fn executar_boas_vindas_obter(state: &AppState) -> Resultado<String> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    if let Some(valor) = ler_config_conn(conn, CHAVE_CONFIG_BOAS_VINDAS_INDICE)? {
        if let Ok(idx) = valor.trim().parse::<usize>() {
            if idx < MENSAGENS_BOAS_VINDAS.len() {
                return Ok(MENSAGENS_BOAS_VINDAS[idx].to_string());
            }
        }
    }

    rotacionar_boas_vindas_conn(conn)
}

pub fn executar_config_obter(state: &AppState, chave: &str) -> Resultado<Option<String>> {
    state.verificar_desbloqueado()?;
    let chave_limpa = chave.trim();
    if chave_limpa.is_empty() {
        return Err(Erro::Validacao(
            "A chave de configuração é obrigatória.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
    ler_config_conn(conn, chave_limpa)
}

pub fn executar_config_definir(state: &AppState, chave: &str, valor: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let chave_limpa = chave.trim();
    if chave_limpa.is_empty() {
        return Err(Erro::Validacao(
            "A chave de configuração é obrigatória.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
    definir_config_conn(conn, chave_limpa, valor)
}

#[tauri::command]
pub fn boas_vindas_obter(state: State<'_, AppState>) -> Resultado<String> {
    executar_boas_vindas_obter(&state)
}

#[tauri::command]
pub fn config_obter(state: State<'_, AppState>, chave: String) -> Resultado<Option<String>> {
    executar_config_obter(&state, &chave)
}

#[tauri::command]
pub fn config_definir(state: State<'_, AppState>, chave: String, valor: String) -> Resultado<()> {
    executar_config_definir(&state, &chave, &valor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::auth::{
        executar_auth_lock, executar_auth_login, executar_auth_setup_com_params,
    };
    use crate::crypto::ParametrosArgon2;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn lista_boas_vindas_inclui_eu_te_amo_mae_e_demais_mensagens_rn61() {
        assert_eq!(MENSAGENS_BOAS_VINDAS.len(), 6);
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Eu te amo, mãe! ❤️"));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Bom te ver de novo, Louriedna!"));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Que seu dia seja leve e cheio de bons encontros."));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Você faz a diferença na vida de muita gente."));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Respire fundo: hoje vai ser um bom dia."));
        assert!(MENSAGENS_BOAS_VINDAS
            .contains(&"Obrigado por cuidar de tantas pessoas com tanto carinho."));
    }

    #[test]
    fn sorteio_nunca_repete_indice_anterior_rn60_rn62() {
        let total = MENSAGENS_BOAS_VINDAS.len();
        for anterior in 0..total {
            for semente in 0..100u64 {
                let proximo = sortear_proximo_indice_boas_vindas(Some(anterior), total, semente);
                assert!(proximo < total);
                assert_ne!(
                    proximo, anterior,
                    "O sorteio nunca deve repetir o índice imediatamente anterior"
                );
            }
        }
    }

    #[test]
    fn logins_consecutivos_rotacionam_mensagem_sem_repetir_anterior_e_persistem_em_config() {
        let dir = std::env::temp_dir().join(format!("lc-boas-vindas-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());
        let params = ParametrosArgon2 {
            m_cost_kib: 4096,
            t_cost: 1,
            p_cost: 1,
        };
        let t0 = 1_700_000_000i64;

        // Quando bloqueado, rejeita com Erro::Bloqueado
        assert_eq!(executar_boas_vindas_obter(&state), Err(Erro::Bloqueado));

        // Setup inicial já sorteia a 1ª mensagem
        executar_auth_setup_com_params(&state, "MinhaSenha123", params).expect("setup");
        let mut msg_anterior = executar_boas_vindas_obter(&state).expect("mensagem inicial");
        assert!(MENSAGENS_BOAS_VINDAS.contains(&msg_anterior.as_str()));

        // Fazer vários logins consecutivos (incluindo os 3 exigidos no aceite) e verificar que nunca repete a anterior
        for passo in 1..=10 {
            executar_auth_lock(&state).expect("lock");
            executar_auth_login(&state, "MinhaSenha123", t0 + passo).expect("login");

            let nova_msg = executar_boas_vindas_obter(&state).expect("obter boas-vindas");
            assert!(MENSAGENS_BOAS_VINDAS.contains(&nova_msg.as_str()));
            assert_ne!(
                nova_msg, msg_anterior,
                "Login {} não pode repetir a mensagem do login anterior",
                passo
            );

            // Chamadas repetidas na mesma sessão retornam a mesma mensagem até o próximo login
            let mesma_sessao =
                executar_boas_vindas_obter(&state).expect("obter boas-vindas mesma sessão");
            assert_eq!(nova_msg, mesma_sessao);

            // Verifica que o índice está gravado em `config`
            let idx_salvo = executar_config_obter(&state, CHAVE_CONFIG_BOAS_VINDAS_INDICE)
                .expect("ler config")
                .expect("índice existe");
            let idx_num: usize = idx_salvo.parse().expect("índice numérico");
            assert_eq!(MENSAGENS_BOAS_VINDAS[idx_num], nova_msg);

            msg_anterior = nova_msg;
        }

        let _ = fs::remove_dir_all(&dir);
    }
}
