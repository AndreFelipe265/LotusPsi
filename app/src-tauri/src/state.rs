use std::fmt;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::error::{Erro, Resultado};
use crate::files::limpar_temporarios;

/// Tamanho da chave simétrica DEK/KEK em bytes (256 bits).
pub const KEY_LEN: usize = 32;

/// Chave criptográfica de 32 bytes protegida com `zeroize` ao sair de escopo.
#[derive(Clone, Zeroize, ZeroizeOnDrop, PartialEq, Eq)]
pub struct Key([u8; KEY_LEN]);

impl Key {
    pub fn new(bytes: [u8; KEY_LEN]) -> Self {
        Self(bytes)
    }

    pub fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.0
    }
}

impl fmt::Debug for Key {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Key([REDACTED])")
    }
}

/// Estado global em memória do aplicativo.
/// Ao bloquear (RN05/RN06) ou fechar a janela (F1-T7), a conexão SQLCipher é fechada,
/// a DEK é zerada da memória e os arquivos temporários são apagados.
pub struct AppState {
    pub dek: Mutex<Option<Key>>,
    pub conn: Mutex<Option<Connection>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let _ = limpar_temporarios(&data_dir);
        Self {
            dek: Mutex::new(None),
            conn: Mutex::new(None),
            data_dir,
        }
    }

    /// Verifica se o aplicativo está desbloqueado (DEK e conexão presentes).
    pub fn verificar_desbloqueado(&self) -> Resultado<()> {
        let dek_guard = self.dek.lock().map_err(|_| Erro::Interno)?;
        let conn_guard = self.conn.lock().map_err(|_| Erro::Interno)?;
        if dek_guard.is_some() && conn_guard.is_some() {
            Ok(())
        } else {
            Err(Erro::Bloqueado)
        }
    }

    /// Bloqueia o aplicativo: fecha a conexão com o banco, apaga a DEK da memória com zeroize
    /// e remove todos os arquivos temporários abertos (F1-T7).
    pub fn bloquear(&self) -> Resultado<()> {
        let mut conn_guard = self.conn.lock().map_err(|_| Erro::Interno)?;
        let mut dek_guard = self.dek.lock().map_err(|_| Erro::Interno)?;

        // Fecha a conexão SQLCipher antes de limpar a DEK
        *conn_guard = None;

        if let Some(mut chave) = dek_guard.take() {
            chave.zeroize();
        }

        drop(conn_guard);
        drop(dek_guard);

        limpar_temporarios(&self.data_dir)?;

        Ok(())
    }
}

impl Drop for AppState {
    fn drop(&mut self) {
        if let Ok(mut conn_guard) = self.conn.lock() {
            *conn_guard = None;
        }
        if let Ok(mut dek_guard) = self.dek.lock() {
            if let Some(mut chave) = dek_guard.take() {
                chave.zeroize();
            }
        }
        let _ = limpar_temporarios(&self.data_dir);
    }
}
