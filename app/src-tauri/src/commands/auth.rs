//! Comandos de autenticação e bloqueio de sessão (`auth_*`) (F1-T4).

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::crypto::ParametrosArgon2;
use crate::db::abrir_banco;
use crate::error::{Erro, Resultado};
use crate::state::{AppState, Key};
use crate::vault::{
    alterar_senha, autenticar_com_senha, carregar_vault, inicializar_vault, recuperar_com_chave,
    vault_existe,
};

/// Estado retornado por `auth_status`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StatusAuth {
    pub configurado: bool,
    pub desbloqueado: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bloqueado_ate: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bloqueado_segundos_restantes: Option<u64>,
}

/// Retorno de `auth_setup` com a chave de recuperação gerada (RN02).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RespostaSetupAuth {
    pub chave_recuperacao: String,
}

fn abrir_e_armazenar_sessao(state: &AppState, dek: Key) -> Resultado<()> {
    let conn = abrir_banco(&state.data_dir, &dek)?;
    let mut conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let mut dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
    *conn_guard = Some(conn);
    *dek_guard = Some(dek);
    Ok(())
}

/// Implementação interna de `auth_status`.
pub fn executar_auth_status(state: &AppState, agora_epoch_s: i64) -> Resultado<StatusAuth> {
    let configurado = vault_existe(&state.data_dir);
    let desbloqueado = state.verificar_desbloqueado().is_ok();

    if !configurado {
        return Ok(StatusAuth {
            configurado: false,
            desbloqueado: false,
            bloqueado_ate: None,
            bloqueado_segundos_restantes: None,
        });
    }

    let vault = carregar_vault(&state.data_dir)?;
    let bloqueado_segundos_restantes = vault.segundos_restantes_bloqueio(agora_epoch_s);
    let bloqueado_ate = if bloqueado_segundos_restantes.is_some() {
        vault.rate_limit.bloqueado_ate_epoch_s
    } else {
        None
    };

    Ok(StatusAuth {
        configurado: true,
        desbloqueado,
        bloqueado_ate,
        bloqueado_segundos_restantes,
    })
}

/// Implementação interna de `auth_setup` (RN01 e RN02).
pub fn executar_auth_setup_com_params(
    state: &AppState,
    senha: &str,
    params: ParametrosArgon2,
) -> Resultado<RespostaSetupAuth> {
    if vault_existe(&state.data_dir) {
        return Err(Erro::Validacao(
            "A senha mestra já foi configurada neste computador.".to_string(),
        ));
    }

    let setup = inicializar_vault(&state.data_dir, senha, params)?;
    abrir_e_armazenar_sessao(state, setup.dek)?;

    Ok(RespostaSetupAuth {
        chave_recuperacao: setup.chave_recuperacao,
    })
}

/// Implementação interna de `auth_login` (RN03, RN04, RN08).
pub fn executar_auth_login(state: &AppState, senha: &str, agora_epoch_s: i64) -> Resultado<()> {
    if !vault_existe(&state.data_dir) {
        return Err(Erro::Validacao(
            "O aplicativo ainda não foi configurado.".to_string(),
        ));
    }

    let dek = autenticar_com_senha(&state.data_dir, senha, agora_epoch_s)?;
    abrir_e_armazenar_sessao(state, dek)
}

/// Implementação interna de `auth_lock` (RN05 e RN06).
pub fn executar_auth_lock(state: &AppState) -> Resultado<()> {
    state.bloquear()
}

/// Implementação interna de `auth_change_password` (RN07).
pub fn executar_auth_change_password(state: &AppState, atual: &str, nova: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let _dek = alterar_senha(&state.data_dir, atual, nova)?;
    Ok(())
}

/// Implementação interna de `auth_recover` (RN07).
pub fn executar_auth_recover(state: &AppState, chave: &str, nova_senha: &str) -> Resultado<()> {
    if !vault_existe(&state.data_dir) {
        return Err(Erro::Validacao(
            "O aplicativo ainda não foi configurado.".to_string(),
        ));
    }

    let dek = recuperar_com_chave(&state.data_dir, chave, nova_senha)?;
    abrir_e_armazenar_sessao(state, dek)
}

#[tauri::command]
pub fn auth_status(state: State<'_, AppState>) -> Resultado<StatusAuth> {
    executar_auth_status(&state, Utc::now().timestamp())
}

#[tauri::command]
pub fn auth_setup(state: State<'_, AppState>, senha: String) -> Resultado<RespostaSetupAuth> {
    executar_auth_setup_com_params(&state, &senha, ParametrosArgon2::default())
}

#[tauri::command]
pub fn auth_login(state: State<'_, AppState>, senha: String) -> Resultado<()> {
    executar_auth_login(&state, &senha, Utc::now().timestamp())
}

#[tauri::command]
pub fn auth_lock(state: State<'_, AppState>) -> Resultado<()> {
    executar_auth_lock(&state)
}

#[tauri::command]
pub fn auth_change_password(
    state: State<'_, AppState>,
    atual: String,
    nova: String,
) -> Resultado<()> {
    executar_auth_change_password(&state, &atual, &nova)
}

#[tauri::command]
pub fn auth_recover(
    state: State<'_, AppState>,
    chave: String,
    nova_senha: String,
) -> Resultado<()> {
    executar_auth_recover(&state, &chave, &nova_senha)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use uuid::Uuid;

    fn estado_temporario() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-pacientes-auth-cmd-{}", Uuid::new_v4()));
        AppState::new(dir)
    }

    fn params_teste_rapido() -> ParametrosArgon2 {
        ParametrosArgon2 {
            m_cost_kib: 4096,
            t_cost: 1,
            p_cost: 1,
        }
    }

    #[test]
    fn fluxo_completo_comandos_auth_setup_lock_login_change_e_recover() {
        let state = estado_temporario();
        let params = params_teste_rapido();
        let t0 = 1_700_000_000i64;

        // 1. Antes do setup: não configurado e bloqueado
        let status_inicial = executar_auth_status(&state, t0).expect("status inicial");
        assert!(!status_inicial.configurado);
        assert!(!status_inicial.desbloqueado);
        assert!(status_inicial.bloqueado_ate.is_none());

        // 2. Setup inicial cria vault + banco SQLCipher e já deixa sessão desbloqueada
        let setup = executar_auth_setup_com_params(&state, "MinhaSenha123", params)
            .expect("executar setup");
        assert_eq!(setup.chave_recuperacao.len(), 29);

        let status_pos_setup = executar_auth_status(&state, t0).expect("status pos setup");
        assert!(status_pos_setup.configurado);
        assert!(status_pos_setup.desbloqueado);

        // 3. Lock apaga DEK e fecha banco
        executar_auth_lock(&state).expect("lock");
        let status_bloqueado = executar_auth_status(&state, t0).expect("status bloqueado");
        assert!(status_bloqueado.configurado);
        assert!(!status_bloqueado.desbloqueado);
        assert_eq!(state.verificar_desbloqueado(), Err(Erro::Bloqueado));

        // 4. Trocar senha enquanto bloqueado deve falhar com Erro::Bloqueado
        assert_eq!(
            executar_auth_change_password(&state, "MinhaSenha123", "OutraSenha123"),
            Err(Erro::Bloqueado)
        );

        // 5. Login com senha errada e depois correta
        assert_eq!(
            executar_auth_login(&state, "SenhaErrada", t0 + 1),
            Err(Erro::SenhaIncorreta)
        );
        executar_auth_login(&state, "MinhaSenha123", t0 + 2).expect("login correto");
        assert_eq!(state.verificar_desbloqueado(), Ok(()));

        // 6. Trocar senha quando desbloqueado
        executar_auth_change_password(&state, "MinhaSenha123", "NovaSenha456")
            .expect("trocar senha");

        executar_auth_lock(&state).expect("lock apos troca");
        assert_eq!(
            executar_auth_login(&state, "MinhaSenha123", t0 + 3),
            Err(Erro::SenhaIncorreta)
        );
        executar_auth_login(&state, "NovaSenha456", t0 + 4).expect("login com nova senha");

        // 7. Recuperar acesso usando a chave de recuperação quando bloqueado
        executar_auth_lock(&state).expect("lock antes de recuperar");
        executar_auth_recover(&state, &setup.chave_recuperacao, "SenhaRecuperada789")
            .expect("recuperar com chave");
        assert_eq!(state.verificar_desbloqueado(), Ok(()));

        executar_auth_lock(&state).expect("lock apos recuperar");
        executar_auth_login(&state, "SenhaRecuperada789", t0 + 5)
            .expect("login com senha recuperada");

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
