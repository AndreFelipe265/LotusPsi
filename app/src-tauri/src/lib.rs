pub mod backup;
pub mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod files;
pub mod state;
pub mod text;
pub mod vault;

use std::path::PathBuf;
use tauri::Manager;

use crate::state::AppState;

/// Resolve o diretório de dados do aplicativo conforme a seção 7 da Fonte da Verdade:
/// - Windows: `%APPDATA%\LC Pacientes\`
/// - Linux: `~/.local/share/lc-pacientes/`
pub fn resolver_pasta_dados() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata).join("LC Pacientes");
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
            if !xdg_data.trim().is_empty() {
                return PathBuf::from(xdg_data).join("lc-pacientes");
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("lc-pacientes");
        }
    }

    PathBuf::from("lc-pacientes-dados")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = resolver_pasta_dados();
            let _ = crate::files::limpar_temporarios(&data_dir);
            app.manage(AppState::new(data_dir));
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
            ) {
                let state = window.state::<AppState>();
                let _ = state.bloquear();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_status,
            commands::auth::auth_setup,
            commands::auth::auth_login,
            commands::auth::auth_lock,
            commands::auth::auth_change_password,
            commands::auth::auth_recover,
            commands::pacientes::pacientes_listar,
            commands::pacientes::paciente_obter,
            commands::pacientes::paciente_criar,
            commands::pacientes::paciente_atualizar,
            commands::pacientes::paciente_definir_status,
            commands::pacientes::paciente_excluir,
            commands::sessoes::sessoes_listar,
            commands::sessoes::sessao_criar,
            commands::sessoes::sessao_atualizar,
            commands::sessoes::sessao_excluir,
            commands::config::boas_vindas_obter,
            commands::config::config_obter,
            commands::config::config_definir,
            commands::agendamentos::agendamentos_listar,
            commands::agendamentos::agendamentos_verificar_conflito,
            commands::agendamentos::agendamento_criar,
            commands::agendamentos::agendamento_atualizar,
            commands::agendamentos::agendamento_excluir,
            commands::agendamentos::agendamento_proximo_paciente,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo Tauri");
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use argon2::Argon2;
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };
    use chrono::NaiveDate;
    use rusqlite::Connection;
    use serde::{Deserialize, Serialize};
    use unicode_normalization::UnicodeNormalization;
    use uuid::Uuid;
    use zeroize::Zeroize;

    use crate::db::MIGRACAO_001_INICIAL;
    use crate::error::Erro;
    use crate::state::{AppState, Key};

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct ItemTeste {
        id: String,
    }

    #[test]
    fn dependencias_f0_t3_funcionam() {
        let conn = Connection::open_in_memory().expect("abrir banco em memória");
        conn.pragma_update(None, "key", "chave-teste-sqlcipher")
            .expect("configurar chave sqlcipher");
        let cipher_version: String = conn
            .pragma_query_value(None, "cipher_version", |row| row.get(0))
            .expect("consultar cipher_version");
        assert!(!cipher_version.is_empty());

        let mut kdf_out = [0u8; 32];
        Argon2::default()
            .hash_password_into(b"senha-teste", b"saltsaltsaltsalt", &mut kdf_out)
            .expect("derivar chave argon2");

        let cipher = XChaCha20Poly1305::new((&kdf_out).into());
        let nonce = XNonce::from_slice(&[1u8; 24]);
        let ciphertext = cipher
            .encrypt(nonce, b"dados".as_ref())
            .expect("cifrar dados");
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .expect("decifrar dados");
        assert_eq!(plaintext, b"dados");

        kdf_out.zeroize();
        assert_eq!(kdf_out, [0u8; 32]);

        let id = Uuid::new_v4().to_string();
        let item = ItemTeste { id };
        let json = serde_json::to_string(&item).expect("serializar");
        let decodificado: ItemTeste = serde_json::from_str(&json).expect("desserializar");
        assert_eq!(item, decodificado);

        let normalizado: String = "João".nfd().filter(|c| c.is_ascii()).collect();
        assert_eq!(normalizado.to_lowercase(), "joao");
        let data = NaiveDate::from_ymd_opt(2026, 11, 1).expect("data válida");
        assert_eq!(data.to_string(), "2026-11-01");
    }

    #[test]
    fn estado_e_erros_f0_t4_funcionam() {
        let state = AppState::new(PathBuf::from("/tmp/lc-pacientes-test"));
        assert_eq!(state.verificar_desbloqueado(), Err(Erro::Bloqueado));

        let key = Key::new([7u8; 32]);
        // Debug nunca deve vazar os bytes da chave
        assert_eq!(format!("{:?}", key), "Key([REDACTED])");
        assert_eq!(key.as_bytes(), &[7u8; 32]);

        let conn = Connection::open_in_memory().expect("abrir banco em memória");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("habilitar foreign_keys");
        conn.execute_batch(MIGRACAO_001_INICIAL)
            .expect("aplicar migração 001_inicial.sql");

        *state.dek.lock().unwrap() = Some(key);
        *state.conn.lock().unwrap() = Some(conn);

        assert_eq!(state.verificar_desbloqueado(), Ok(()));

        // Ao bloquear, DEK e conexão são removidas
        state.bloquear().expect("bloquear estado");
        assert_eq!(state.verificar_desbloqueado(), Err(Erro::Bloqueado));
        assert!(state.dek.lock().unwrap().is_none());
        assert!(state.conn.lock().unwrap().is_none());

        // Serialização de erro para o frontend é genérica e em português
        let json_erro = serde_json::to_string(&Erro::SenhaIncorreta).expect("serializar erro");
        assert!(json_erro.contains("\"codigo\":\"SENHA_INCORRETA\""));
        assert!(json_erro.contains("\"mensagem\":\"Senha incorreta\""));
    }
}
