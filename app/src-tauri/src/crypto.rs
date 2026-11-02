//! Módulo de criptografia: Argon2id, XChaCha20-Poly1305 e geração da chave de recuperação (F1-T1).

use argon2::{
    password_hash::rand_core::{OsRng, RngCore},
    Algorithm, Argon2, Params, Version,
};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::error::{Erro, Resultado};
use crate::state::{Key, KEY_LEN};

/// Tamanho do salt para Argon2id (16 bytes / 128 bits).
pub const SALT_LEN: usize = 16;

/// Tamanho do nonce do XChaCha20-Poly1305 (24 bytes / 192 bits).
pub const XNONCE_LEN: usize = 24;

/// Memória padrão do Argon2id conforme Seção 7 da Fonte da Verdade: 64 MiB (65.536 KiB).
pub const ARGON2_M_COST_PADRAO_KIB: u32 = 64 * 1024;

/// Iterações padrão do Argon2id conforme Seção 7 da Fonte da Verdade: t = 3.
pub const ARGON2_T_COST_PADRAO: u32 = 3;

/// Paralelismo padrão do Argon2id conforme Seção 7 da Fonte da Verdade: p = 1.
pub const ARGON2_P_COST_PADRAO: u32 = 1;

/// Quantidade de caracteres significativos da chave de recuperação (RN02: 24 caracteres em grupos de 4).
pub const TAMANHO_CHAVE_RECUPERACAO: usize = 24;

/// Tamanho de cada grupo da chave de recuperação (ex.: `ABCD-EFGH-...`).
pub const TAMANHO_GRUPO_RECUPERACAO: usize = 4;

/// Alfabeto de 32 caracteres sem ambiguidade visual (Crockford/Base32 maiúsculo sem I, L, O, U)
/// para facilitar leitura e digitação da chave impressa em papel.
const ALFABETO_RECUPERACAO: &[u8; 32] = b"ABCDEFGHJKMNPQRSTVWXYZ2345678901";

/// Parâmetros do Argon2id armazenáveis no `vault.json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParametrosArgon2 {
    pub m_cost_kib: u32,
    pub t_cost: u32,
    pub p_cost: u32,
}

impl Default for ParametrosArgon2 {
    fn default() -> Self {
        Self {
            m_cost_kib: ARGON2_M_COST_PADRAO_KIB,
            t_cost: ARGON2_T_COST_PADRAO,
            p_cost: ARGON2_P_COST_PADRAO,
        }
    }
}

/// Representa uma DEK embrulhada (cifrada) com XChaCha20-Poly1305.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DekEmbrulhada {
    pub salt_hex: String,
    pub nonce_hex: String,
    pub ciphertext_hex: String,
}

/// Gera uma nova DEK aleatória de 32 bytes usando o CSPRNG do sistema operacional.
pub fn gerar_dek() -> Key {
    let mut bytes = [0u8; KEY_LEN];
    OsRng.fill_bytes(&mut bytes);
    let key = Key::new(bytes);
    bytes.zeroize();
    key
}

/// Gera um salt aleatório de 16 bytes.
pub fn gerar_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Gera um nonce aleatório de 24 bytes para XChaCha20-Poly1305.
pub fn gerar_nonce() -> [u8; XNONCE_LEN] {
    let mut nonce = [0u8; XNONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    nonce
}

/// Deriva uma KEK de 32 bytes a partir de um segredo (senha ou chave de recuperação normalizada)
/// e de um salt usando Argon2id.
pub fn derivar_kek(segredo: &[u8], salt: &[u8], params: ParametrosArgon2) -> Resultado<Key> {
    let argon_params = Params::new(
        params.m_cost_kib,
        params.t_cost,
        params.p_cost,
        Some(KEY_LEN),
    )
    .map_err(|_| Erro::Criptografia)?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut saida = [0u8; KEY_LEN];
    argon2
        .hash_password_into(segredo, salt, &mut saida)
        .map_err(|_| Erro::Criptografia)?;

    let kek = Key::new(saida);
    saida.zeroize();
    Ok(kek)
}

/// Embrulha (cifra) a DEK com uma KEK derivada do segredo informado via Argon2id + XChaCha20-Poly1305.
pub fn embrulhar_dek_com_segredo(
    dek: &Key,
    segredo: &[u8],
    params: ParametrosArgon2,
) -> Resultado<DekEmbrulhada> {
    let salt = gerar_salt();
    let kek = derivar_kek(segredo, &salt, params)?;
    embrulhar_dek_com_kek(dek, &kek, &salt)
}

/// Embrulha (cifra) a DEK diretamente com uma KEK já derivada e o salt correspondente.
pub fn embrulhar_dek_com_kek(dek: &Key, kek: &Key, salt: &[u8]) -> Resultado<DekEmbrulhada> {
    let nonce_bytes = gerar_nonce();
    let cipher = XChaCha20Poly1305::new(kek.as_bytes().into());
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, dek.as_bytes().as_ref())
        .map_err(|_| Erro::Criptografia)?;

    Ok(DekEmbrulhada {
        salt_hex: codificar_hex(salt),
        nonce_hex: codificar_hex(&nonce_bytes),
        ciphertext_hex: codificar_hex(&ciphertext),
    })
}

/// Desembrulha (decifra) a DEK a partir do segredo (senha ou chave de recuperação) e dos metadados.
/// Se a autenticação AEAD falhar, retorna `Erro::Criptografia`.
pub fn desembrulhar_dek_com_segredo(
    embrulhada: &DekEmbrulhada,
    segredo: &[u8],
    params: ParametrosArgon2,
) -> Resultado<Key> {
    let salt = decodificar_hex(&embrulhada.salt_hex)?;
    if salt.len() != SALT_LEN {
        return Err(Erro::Criptografia);
    }
    let kek = derivar_kek(segredo, &salt, params)?;
    desembrulhar_dek_com_kek(embrulhada, &kek)
}

/// Desembrulha (decifra) a DEK usando uma KEK já derivada.
pub fn desembrulhar_dek_com_kek(embrulhada: &DekEmbrulhada, kek: &Key) -> Resultado<Key> {
    let nonce_bytes = decodificar_hex(&embrulhada.nonce_hex)?;
    if nonce_bytes.len() != XNONCE_LEN {
        return Err(Erro::Criptografia);
    }
    let ciphertext = decodificar_hex(&embrulhada.ciphertext_hex)?;

    let cipher = XChaCha20Poly1305::new(kek.as_bytes().into());
    let nonce = XNonce::from_slice(&nonce_bytes);

    let mut plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| Erro::Criptografia)?;

    if plaintext.len() != KEY_LEN {
        plaintext.zeroize();
        return Err(Erro::Criptografia);
    }

    let mut array = [0u8; KEY_LEN];
    array.copy_from_slice(&plaintext);
    plaintext.zeroize();

    let dek = Key::new(array);
    array.zeroize();
    Ok(dek)
}

/// Gera uma chave de recuperação de 24 caracteres dividida em 6 grupos de 4 (ex.: `ABCD-EFGH-...`)
/// conforme RN02.
pub fn gerar_chave_recuperacao() -> String {
    let mut bytes_aleatorios = [0u8; TAMANHO_CHAVE_RECUPERACAO];
    OsRng.fill_bytes(&mut bytes_aleatorios);

    let mut resultado = String::with_capacity(TAMANHO_CHAVE_RECUPERACAO + 5);
    for (i, &b) in bytes_aleatorios.iter().enumerate() {
        if i > 0 && i % TAMANHO_GRUPO_RECUPERACAO == 0 {
            resultado.push('-');
        }
        let idx = (b as usize) & 0x1F; // 0..31 uniforme pois 256 é múltiplo exato de 32
        resultado.push(ALFABETO_RECUPERACAO[idx] as char);
    }
    bytes_aleatorios.zeroize();
    resultado
}

/// Normaliza uma chave de recuperação digitada pela usuária (remove hífens/espaços e converte para maiúsculas).
/// Retorna `Erro::ChaveRecuperacaoInvalida` se não tiver exatamente 24 caracteres alfanuméricos.
pub fn normalizar_chave_recuperacao(chave: &str) -> Resultado<String> {
    let limpa: String = chave
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();

    if limpa.len() != TAMANHO_CHAVE_RECUPERACAO || !limpa.chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err(Erro::ChaveRecuperacaoInvalida);
    }

    Ok(limpa)
}

/// Embrulha a DEK usando uma chave de recuperação (normalizando-a antes da derivação Argon2id).
pub fn embrulhar_dek_com_chave_recuperacao(
    dek: &Key,
    chave_recuperacao: &str,
    params: ParametrosArgon2,
) -> Resultado<DekEmbrulhada> {
    let mut normalizada = normalizar_chave_recuperacao(chave_recuperacao)?;
    let resultado = embrulhar_dek_com_segredo(dek, normalizada.as_bytes(), params);
    normalizada.zeroize();
    resultado
}

/// Desembrulha a DEK usando uma chave de recuperação digitada pela usuária.
pub fn desembrulhar_dek_com_chave_recuperacao(
    embrulhada: &DekEmbrulhada,
    chave_recuperacao: &str,
    params: ParametrosArgon2,
) -> Resultado<Key> {
    let mut normalizada = normalizar_chave_recuperacao(chave_recuperacao)?;
    let resultado = desembrulhar_dek_com_segredo(embrulhada, normalizada.as_bytes(), params)
        .map_err(|_| Erro::ChaveRecuperacaoInvalida);
    normalizada.zeroize();
    resultado
}

/// Codifica bytes em string hexadecimal minúscula.
pub fn codificar_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        use std::fmt::Write;
        let _ = write!(&mut s, "{:02x}", b);
    }
    s
}

/// Decodifica string hexadecimal em bytes.
pub fn decodificar_hex(hex: &str) -> Resultado<Vec<u8>> {
    if !hex.len().is_multiple_of(2) {
        return Err(Erro::Criptografia);
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    for i in (0..hex.len()).step_by(2) {
        let byte = u8::from_str_radix(&hex[i..i + 2], 16).map_err(|_| Erro::Criptografia)?;
        bytes.push(byte);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params_teste_rapido() -> ParametrosArgon2 {
        ParametrosArgon2 {
            m_cost_kib: 4096,
            t_cost: 1,
            p_cost: 1,
        }
    }

    #[test]
    fn wrap_e_unwrap_ida_e_volta_com_senha() {
        let dek = gerar_dek();
        let params = params_teste_rapido();

        let embrulhada =
            embrulhar_dek_com_segredo(&dek, b"SenhaForte!2026", params).expect("embrulhar DEK");
        let recuperada = desembrulhar_dek_com_segredo(&embrulhada, b"SenhaForte!2026", params)
            .expect("desembrulhar DEK");

        assert_eq!(dek, recuperada);
    }

    #[test]
    fn senha_errada_falha_ao_desembrulhar() {
        let dek = gerar_dek();
        let params = params_teste_rapido();

        let embrulhada =
            embrulhar_dek_com_segredo(&dek, b"SenhaCorreta123", params).expect("embrulhar DEK");
        let erro = desembrulhar_dek_com_segredo(&embrulhada, b"SenhaErrada999", params);

        assert_eq!(erro, Err(Erro::Criptografia));
    }

    #[test]
    fn chave_de_recuperacao_formato_e_funcionamento() {
        let chave = gerar_chave_recuperacao();
        // 6 grupos de 4 caracteres separados por 5 hífens = 29 caracteres no total
        assert_eq!(chave.len(), 29);
        let grupos: Vec<&str> = chave.split('-').collect();
        assert_eq!(grupos.len(), 6);
        for grupo in grupos {
            assert_eq!(grupo.len(), 4);
            assert!(grupo
                .chars()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
        }

        let dek = gerar_dek();
        let params = params_teste_rapido();

        let embrulhada = embrulhar_dek_com_chave_recuperacao(&dek, &chave, params)
            .expect("embrulhar com chave de recuperação");

        // Deve funcionar com hífens, sem hífens e em minúsculas
        let chave_sem_hifen_minuscula = chave.replace('-', " ").to_lowercase();
        let recuperada =
            desembrulhar_dek_com_chave_recuperacao(&embrulhada, &chave_sem_hifen_minuscula, params)
                .expect("desembrulhar com chave de recuperação normalizada");

        assert_eq!(dek, recuperada);

        // Chave de recuperação errada deve falhar com ChaveRecuperacaoInvalida
        let mut chave_alterada = chave.clone();
        chave_alterada.pop();
        chave_alterada.push(if chave.ends_with('A') { 'B' } else { 'A' });
        let erro = desembrulhar_dek_com_chave_recuperacao(&embrulhada, &chave_alterada, params);
        assert_eq!(erro, Err(Erro::ChaveRecuperacaoInvalida));
    }

    #[test]
    fn parametros_padrao_argon2id_seguem_secao_7() {
        let padrao = ParametrosArgon2::default();
        assert_eq!(padrao.m_cost_kib, 64 * 1024);
        assert_eq!(padrao.t_cost, 3);
        assert_eq!(padrao.p_cost, 1);

        let dek = gerar_dek();
        let embrulhada =
            embrulhar_dek_com_segredo(&dek, b"senha-padrao-64mib", padrao).expect("embrulhar");
        let recuperada = desembrulhar_dek_com_segredo(&embrulhada, b"senha-padrao-64mib", padrao)
            .expect("desembrulhar");
        assert_eq!(dek, recuperada);
    }
}
