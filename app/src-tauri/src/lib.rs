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

/// Garante que no Linux (especialmente sob Wayland / KDE Plasma / GNOME) o ícone e o arquivo `.desktop`
/// estejam registrados no sistema do usuário para que o logotipo LC apareça corretamente na barra de tarefas.
#[cfg(target_os = "linux")]
pub fn garantir_integracao_desktop_linux() -> std::io::Result<()> {
    if let Ok(home) = std::env::var("HOME") {
        let base_home = PathBuf::from(home);

        let icon_512 = include_bytes!("../icons/icon.png");
        let icon_128 = include_bytes!("../icons/128x128.png");
        let icon_32 = include_bytes!("../icons/32x32.png");
        let icon_svg = include_bytes!("../../src/assets/logo-lc.svg");

        let tamanhos = [
            ("512x512", icon_512 as &[u8]),
            ("128x128", icon_128 as &[u8]),
            ("32x32", icon_32 as &[u8]),
        ];

        for (tam, bytes) in tamanhos {
            let pasta = base_home
                .join(".local")
                .join("share")
                .join("icons")
                .join("hicolor")
                .join(tam)
                .join("apps");
            let _ = std::fs::create_dir_all(&pasta);
            let _ = std::fs::write(pasta.join("lc-pacientes.png"), bytes);
            let _ = std::fs::write(pasta.join("br.com.louriednacosta.pacientes.png"), bytes);
        }

        let pasta_svg = base_home
            .join(".local")
            .join("share")
            .join("icons")
            .join("hicolor")
            .join("scalable")
            .join("apps");
        let _ = std::fs::create_dir_all(&pasta_svg);
        let _ = std::fs::write(pasta_svg.join("lc-pacientes.svg"), icon_svg);
        let _ = std::fs::write(pasta_svg.join("br.com.louriednacosta.pacientes.svg"), icon_svg);

        let apps_dir = base_home.join(".local").join("share").join("applications");
        let _ = std::fs::create_dir_all(&apps_dir);

        let exec_caminho = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "lc-pacientes".to_string());

        let desktop_lc = format!(
            "[Desktop Entry]\n\
             Version=1.0\n\
             Type=Application\n\
             Name=LC Pacientes\n\
             GenericName=Sistema de Pacientes e Documentos\n\
             Comment=Sistema de Gestão Clínica — Louriedna Costa Pereira\n\
             Exec=\"{}\"\n\
             Icon=lc-pacientes\n\
             Terminal=false\n\
             Categories=Office;MedicalSoftware;\n\
             StartupWMClass=lc-pacientes\n\
             StartupNotify=true\n",
            exec_caminho
        );
        let _ = std::fs::write(apps_dir.join("lc-pacientes.desktop"), desktop_lc);

        let desktop_id = format!(
            "[Desktop Entry]\n\
             Version=1.0\n\
             Type=Application\n\
             Name=LC Pacientes\n\
             GenericName=Sistema de Pacientes e Documentos\n\
             Comment=Sistema de Gestão Clínica — Louriedna Costa Pereira\n\
             Exec=\"{}\"\n\
             Icon=lc-pacientes\n\
             Terminal=false\n\
             Categories=Office;MedicalSoftware;\n\
             StartupWMClass=br.com.louriednacosta.pacientes\n\
             StartupNotify=true\n",
            exec_caminho
        );
        let _ = std::fs::write(apps_dir.join("br.com.louriednacosta.pacientes.desktop"), desktop_id);

        let _ = std::process::Command::new("kbuildsycoca6").output();
        let _ = std::process::Command::new("update-desktop-database").arg(&apps_dir).output();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = resolver_pasta_dados();
            let _ = crate::files::limpar_temporarios(&data_dir);
            app.manage(AppState::new(data_dir));

            #[cfg(target_os = "linux")]
            {
                let _ = garantir_integracao_desktop_linux();
            }

            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/icon.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = window.set_icon(icon);
                }
            }

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
            commands::aniversarios::aniversariantes,
            commands::aniversarios::whatsapp_parabens,
            commands::categorias::categorias_listar,
            commands::categorias::categoria_criar,
            commands::categorias::categoria_renomear,
            commands::categorias::categoria_excluir,
            commands::documentos::documentos_listar,
            commands::documentos::documento_enviar,
            commands::documentos::documento_baixar,
            commands::documentos::documento_abrir,
            commands::documentos::documento_atualizar,
            commands::documentos::documento_excluir,
            commands::anamneses::anamneses_listar,
            commands::anamneses::anamnese_anexar,
            commands::anamneses::anamnese_baixar,
            commands::anamneses::anamnese_abrir,
            commands::anamneses::anamnese_excluir,
            commands::backup::backup_criar,
            commands::backup::backup_obter_caminho_padrao,
            commands::backup::backup_selecionar_destino,
            commands::backup::backup_inspecionar,
            commands::backup::backup_restaurar,
            commands::financeiro::financeiro_listar,
            commands::financeiro::financeiro_resumo_mensal,
            commands::financeiro::financeiro_criar,
            commands::financeiro::financeiro_atualizar,
            commands::financeiro::financeiro_excluir,
            commands::horarios_semanais::horarios_semanais_listar,
            commands::horarios_semanais::horario_semanal_criar,
            commands::horarios_semanais::horario_semanal_atualizar,
            commands::horarios_semanais::horario_semanal_excluir,
            commands::horarios_semanais::horarios_semanais_aplicar_semana,
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
