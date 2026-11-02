//! Módulo de arquivos: validação por extensão e magic bytes, cifragem em blocos e temporários (F1-T7 / F6-T1).

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::error::Resultado;

/// Nome da subpasta dedicada aos arquivos temporários descriptografados de "Abrir documento" (Seção 7).
pub const NOME_PASTA_TEMPORARIOS: &str = "temp_abertos";

/// Retorna o caminho da subpasta de arquivos temporários dentro de `data_dir`.
pub fn caminho_pasta_temporarios(data_dir: &Path) -> PathBuf {
    data_dir.join(NOME_PASTA_TEMPORARIOS)
}

/// Sobrescreve o conteúdo de um arquivo com zeros antes de removê-lo do disco.
fn sobrescrever_e_remover_arquivo(caminho: &Path) {
    if let Ok(meta) = fs::metadata(caminho) {
        if meta.is_file() {
            let tamanho = meta.len() as usize;
            if tamanho > 0 {
                if let Ok(mut arq) = OpenOptions::new().write(true).open(caminho) {
                    let bloco = [0u8; 4096];
                    let mut restante = tamanho;
                    while restante > 0 {
                        let n = restante.min(bloco.len());
                        if arq.write_all(&bloco[..n]).is_err() {
                            break;
                        }
                        restante -= n;
                    }
                    let _ = arq.sync_all();
                }
            }
        }
    }
    let _ = fs::remove_file(caminho);
}

fn limpar_diretorio_recursivo(dir: &Path) {
    if let Ok(entradas) = fs::read_dir(dir) {
        for entrada in entradas.flatten() {
            let caminho = entrada.path();
            if caminho.is_dir() {
                limpar_diretorio_recursivo(&caminho);
                let _ = fs::remove_dir(&caminho);
            } else {
                sobrescrever_e_remover_arquivo(&caminho);
            }
        }
    }
}

/// Limpa todos os arquivos da subpasta de temporários (`temp_abertos`).
/// Chamado ao iniciar o app, ao bloquear a sessão e ao fechar a janela (Seção 7 da Fonte da Verdade).
pub fn limpar_temporarios(data_dir: &Path) -> Resultado<()> {
    let pasta_temp = caminho_pasta_temporarios(data_dir);
    if !pasta_temp.exists() {
        return Ok(());
    }

    limpar_diretorio_recursivo(&pasta_temp);
    let _ = fs::remove_dir_all(&pasta_temp);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AppState, Key};
    use uuid::Uuid;

    #[test]
    fn limpar_temporarios_apaga_arquivos_da_subpasta_temp_abertos() {
        let data_dir =
            std::env::temp_dir().join(format!("lc-pacientes-temp-test-{}", Uuid::new_v4()));
        let pasta_temp = caminho_pasta_temporarios(&data_dir);
        fs::create_dir_all(&pasta_temp).expect("criar pasta_temp");

        let arq1 = pasta_temp.join("doc1.pdf");
        let arq2 = pasta_temp.join("sub").join("doc2.docx");
        fs::create_dir_all(arq2.parent().unwrap()).expect("criar subpasta");
        fs::write(&arq1, b"conteudo temporario sensivel 1").expect("gravar arq1");
        fs::write(&arq2, b"conteudo temporario sensivel 2").expect("gravar arq2");

        // Um arquivo fora de temp_abertos (ex.: vault.json) não deve ser apagado
        let arquivo_vault = data_dir.join("vault.json");
        fs::write(&arquivo_vault, b"{}").expect("gravar vault");

        limpar_temporarios(&data_dir).expect("limpar temporarios");

        assert!(!arq1.exists());
        assert!(!arq2.exists());
        assert!(!pasta_temp.exists());
        assert!(arquivo_vault.exists());

        let _ = fs::remove_dir_all(&data_dir);
    }

    #[test]
    fn bloquear_e_fechar_appstate_limpam_temporarios_e_zeram_dek() {
        let data_dir =
            std::env::temp_dir().join(format!("lc-pacientes-lock-temp-{}", Uuid::new_v4()));
        let pasta_temp = caminho_pasta_temporarios(&data_dir);

        // 1. Ao bloquear (lock), limpa temporários e zera DEK
        let state = AppState::new(data_dir.clone());
        *state.dek.lock().unwrap() = Some(Key::new([9u8; 32]));
        fs::create_dir_all(&pasta_temp).expect("criar pasta_temp");
        let arq_lock = pasta_temp.join("aberto_no_lock.pdf");
        fs::write(&arq_lock, b"dados temporarios").expect("gravar arq_lock");

        state.bloquear().expect("bloquear");
        assert!(state.dek.lock().unwrap().is_none());
        assert!(!arq_lock.exists());

        // 2. Ao destruir AppState (fechar janela/processo), também limpa temporários
        *state.dek.lock().unwrap() = Some(Key::new([5u8; 32]));
        fs::create_dir_all(&pasta_temp).expect("recriar pasta_temp");
        let arq_close = pasta_temp.join("aberto_no_fechamento.pdf");
        fs::write(&arq_close, b"dados no fechamento").expect("gravar arq_close");

        drop(state);
        assert!(!arq_close.exists());

        let _ = fs::remove_dir_all(&data_dir);
    }
}
