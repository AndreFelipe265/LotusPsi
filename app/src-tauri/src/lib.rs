#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo Tauri");
}

#[cfg(test)]
mod tests {
    use argon2::Argon2;
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };
    use chrono::NaiveDate;
    use rusqlite::Connection;
    use serde::{Deserialize, Serialize};
    use thiserror::Error;
    use unicode_normalization::UnicodeNormalization;
    use uuid::Uuid;
    use zeroize::Zeroize;

    #[derive(Debug, Error)]
    enum TesteErro {
        #[error("erro de teste")]
        Falha,
    }

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct ItemTeste {
        id: String,
    }

    #[test]
    fn dependencias_f0_t3_funcionam() {
        // rusqlite + bundled-sqlcipher
        let conn = Connection::open_in_memory().expect("abrir banco em memória");
        conn.pragma_update(None, "key", "chave-teste-sqlcipher")
            .expect("configurar chave sqlcipher");
        let cipher_version: String = conn
            .pragma_query_value(None, "cipher_version", |row| row.get(0))
            .expect("consultar cipher_version");
        assert!(!cipher_version.is_empty());

        // argon2 + zeroize
        let mut kdf_out = [0u8; 32];
        Argon2::default()
            .hash_password_into(b"senha-teste", b"saltsaltsaltsalt", &mut kdf_out)
            .expect("derivar chave argon2");

        // chacha20poly1305
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

        // uuid + serde
        let id = Uuid::new_v4().to_string();
        let item = ItemTeste { id };
        let json = serde_json::to_string(&item).expect("serializar");
        let decodificado: ItemTeste = serde_json::from_str(&json).expect("desserializar");
        assert_eq!(item, decodificado);

        // unicode-normalization + chrono + thiserror
        let normalizado: String = "João".nfd().filter(|c| c.is_ascii()).collect();
        assert_eq!(normalizado.to_lowercase(), "joao");
        let data = NaiveDate::from_ymd_opt(2026, 11, 1).expect("data válida");
        assert_eq!(data.to_string(), "2026-11-01");
        assert_eq!(TesteErro::Falha.to_string(), "erro de teste");
    }
}
