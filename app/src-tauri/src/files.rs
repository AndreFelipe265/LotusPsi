//! Módulo de arquivos: validação por extensão e magic bytes, cifragem em blocos e temporários (F1-T7 / F6-T1).

use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use zeroize::Zeroize;

use crate::crypto::{codificar_hex, gerar_nonce, XNONCE_LEN};
use crate::error::{Erro, Resultado};
use crate::state::Key;

/// Nome da subpasta dedicada aos arquivos temporários descriptografados de "Abrir documento" (Seção 7).
pub const NOME_PASTA_TEMPORARIOS: &str = "temp_abertos";

/// Nome da subpasta onde os documentos e anexos de anamnese ficam guardados cifrados (`docs/<id>.bin`).
pub const NOME_PASTA_DOCUMENTOS: &str = "docs";

/// Tamanho máximo permitido por arquivo: 25 MB (RN43).
pub const TAMANHO_MAXIMO_ARQUIVO_BYTES: u64 = 25 * 1024 * 1024;

/// Tamanho de cada bloco de texto claro na cifragem STREAM (64 KiB) para não estourar a memória (Seção 7).
pub const TAMANHO_BLOCO_STREAM: usize = 64 * 1024;

/// Tamanho da tag de autenticação do Poly1305 (16 bytes).
const POLY1305_TAG_LEN: usize = 16;

/// Metadados validados de um arquivo antes/após a cifragem (RN42, RN43, RN44).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArquivoValidadoInfo {
    pub nome_original: String,
    pub extensao: String,
    pub mime: String,
    pub tamanho_bytes: u64,
}

/// Resultado completo após validar e cifrar um arquivo para o cofre `docs/<id>.bin`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArquivoCifradoInfo {
    pub nome_original: String,
    pub extensao: String,
    pub mime: String,
    pub tamanho_bytes: u64,
    pub sha256: String,
}

/// Retorna o caminho da subpasta de arquivos temporários dentro de `data_dir`.
pub fn caminho_pasta_temporarios(data_dir: &Path) -> PathBuf {
    data_dir.join(NOME_PASTA_TEMPORARIOS)
}

/// Retorna o caminho da subpasta de documentos cifrados (`data_dir/docs`).
pub fn caminho_pasta_documentos(data_dir: &Path) -> PathBuf {
    data_dir.join(NOME_PASTA_DOCUMENTOS)
}

/// Retorna o caminho completo de um arquivo cifrado `docs/<id>.bin` dentro de `data_dir`.
pub fn caminho_arquivo_cifrado(data_dir: &Path, id: &str) -> PathBuf {
    caminho_pasta_documentos(data_dir).join(format!("{}.bin", id))
}

/// Valida a extensão do arquivo conforme RN42 e retorna `(extensao_minuscula, mime)`.
/// Formatos aceitos: PDF, DOC, DOCX, ODT, XLS, XLSX, ODS, TXT, JPG, JPEG, PNG.
pub fn validar_extensao_e_mime(nome_arquivo: &str) -> Resultado<(String, &'static str)> {
    let caminho = Path::new(nome_arquivo.trim());
    let ext = caminho
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.trim().to_ascii_lowercase())
        .unwrap_or_default();

    let mime = match ext.as_str() {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "odt" => "application/vnd.oasis.opendocument.text",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ods" => "application/vnd.oasis.opendocument.spreadsheet",
        "txt" => "text/plain",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        _ => {
            return Err(Erro::Validacao(
                "Formato de arquivo não permitido. Formatos aceitos: PDF, DOC, DOCX, ODT, XLS, XLSX, ODS, TXT, JPG, JPEG e PNG.".to_string(),
            ));
        }
    };

    Ok((ext, mime))
}

/// Verifica se os primeiros bytes (magic bytes / assinatura) correspondem à extensão informada (RN42).
/// Bloqueia arquivos executáveis (`.exe` / ELF) ou outros formatos renomeados.
pub fn validar_magic_bytes(extensao: &str, cabecalho: &[u8]) -> Resultado<()> {
    if cabecalho.is_empty() {
        return Err(Erro::Validacao(
            "O arquivo selecionado está vazio.".to_string(),
        ));
    }

    let ext = extensao.trim().to_ascii_lowercase();
    let valido = match ext.as_str() {
        "pdf" => cabecalho.starts_with(b"%PDF-"),
        "png" => cabecalho.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => cabecalho.starts_with(&[0xFF, 0xD8, 0xFF]),
        "doc" | "xls" => {
            cabecalho.starts_with(&[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
        }
        "docx" | "xlsx" | "odt" | "ods" => {
            cabecalho.starts_with(b"PK\x03\x04")
                || cabecalho.starts_with(b"PK\x05\x06")
                || cabecalho.starts_with(b"PK\x07\x08")
        }
        "txt" => validar_assinatura_texto(cabecalho),
        _ => false,
    };

    if !valido {
        return Err(Erro::Validacao(format!(
            "O conteúdo do arquivo não corresponde a um formato .{} válido.",
            ext
        )));
    }

    Ok(())
}

/// Verifica se o cabeçalho de um arquivo `.txt` é texto legítimo e não um binário/executável disfarçado.
fn validar_assinatura_texto(amostra: &[u8]) -> bool {
    // Rejeita assinaturas conhecidas de executáveis e containers binários
    if amostra.starts_with(b"MZ")
        || amostra.starts_with(b"\x7FELF")
        || amostra.starts_with(b"%PDF-")
        || amostra.starts_with(b"PK\x03\x04")
        || amostra.starts_with(b"\x89PNG")
        || amostra.starts_with(&[0xFF, 0xD8, 0xFF])
        || amostra.starts_with(&[0xD0, 0xCF, 0x11, 0xE0])
    {
        return false;
    }

    // Rejeita bytes nulos ou caracteres de controle binários (exceto tab, LF, CR, form-feed)
    for &b in amostra {
        if b == 0 || (b < 0x20 && b != b'\t' && b != b'\n' && b != b'\r' && b != 0x0C) {
            return false;
        }
    }

    true
}

/// Valida um arquivo em disco quanto à existência, tamanho (≤ 25 MB, RN43), extensão e magic bytes (RN42).
pub fn validar_arquivo_origem(
    caminho: &Path,
    nome_original_override: Option<&str>,
) -> Resultado<ArquivoValidadoInfo> {
    let meta = fs::metadata(caminho).map_err(|_| {
        Erro::Validacao("Não foi possível localizar o arquivo selecionado.".to_string())
    })?;

    if !meta.is_file() {
        return Err(Erro::Validacao(
            "O caminho informado não é um arquivo válido.".to_string(),
        ));
    }

    let tamanho_bytes = meta.len();
    if tamanho_bytes == 0 {
        return Err(Erro::Validacao(
            "O arquivo selecionado está vazio.".to_string(),
        ));
    }

    if tamanho_bytes > TAMANHO_MAXIMO_ARQUIVO_BYTES {
        return Err(Erro::Validacao(
            "O arquivo excede o tamanho máximo permitido de 25 MB.".to_string(),
        ));
    }

    let nome_original = nome_original_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .or_else(|| {
            caminho
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .ok_or_else(|| Erro::Validacao("Nome de arquivo inválido.".to_string()))?;

    let (extensao, mime) = validar_extensao_e_mime(&nome_original)?;

    let mut arq = File::open(caminho)?;
    let mut cabecalho = [0u8; 4096];
    let lidos = arq.read(&mut cabecalho)?;
    validar_magic_bytes(&extensao, &cabecalho[..lidos])?;

    Ok(ArquivoValidadoInfo {
        nome_original,
        extensao,
        mime: mime.to_string(),
        tamanho_bytes,
    })
}

/// Deriva o nonce de 24 bytes e o AAD de 5 bytes para um bloco específico na construção STREAM.
fn derivar_nonce_e_aad_bloco(
    nonce_base: &[u8; XNONCE_LEN],
    indice_bloco: u32,
    eh_ultimo: bool,
) -> ([u8; XNONCE_LEN], [u8; 5]) {
    let mut nonce_bloco = *nonce_base;
    let idx_bytes = indice_bloco.to_be_bytes();
    let flag_ultimo = if eh_ultimo { 1u8 } else { 0u8 };

    nonce_bloco[19] ^= idx_bytes[0];
    nonce_bloco[20] ^= idx_bytes[1];
    nonce_bloco[21] ^= idx_bytes[2];
    nonce_bloco[22] ^= idx_bytes[3];
    nonce_bloco[23] ^= flag_ultimo;

    let aad = [
        idx_bytes[0],
        idx_bytes[1],
        idx_bytes[2],
        idx_bytes[3],
        flag_ultimo,
    ];

    (nonce_bloco, aad)
}

/// Cifra um arquivo em blocos de até 64 KiB com XChaCha20-Poly1305 (Seção 7: `nonce (24B) + ciphertext`).
/// Retorna `(tamanho_original_bytes, sha256_hex)`.
pub fn cifrar_arquivo_em_blocos(
    caminho_origem: &Path,
    caminho_destino: &Path,
    dek: &Key,
) -> Resultado<(u64, String)> {
    if let Some(pai) = caminho_destino.parent() {
        fs::create_dir_all(pai)?;
    }

    let caminho_temp = caminho_destino.with_extension("bin.tmp");
    let resultado = cifrar_arquivo_em_blocos_interno(caminho_origem, &caminho_temp, dek);

    match resultado {
        Ok(info) => {
            fs::rename(&caminho_temp, caminho_destino)?;
            Ok(info)
        }
        Err(e) => {
            let _ = fs::remove_file(&caminho_temp);
            Err(e)
        }
    }
}

fn cifrar_arquivo_em_blocos_interno(
    caminho_origem: &Path,
    caminho_temp: &Path,
    dek: &Key,
) -> Resultado<(u64, String)> {
    let arq_entrada = File::open(caminho_origem)?;
    let mut leitor = BufReader::with_capacity(TAMANHO_BLOCO_STREAM, arq_entrada);

    let arq_saida = File::create(caminho_temp)?;
    let mut escritor = BufWriter::new(arq_saida);

    let nonce_base = gerar_nonce();
    escritor.write_all(&nonce_base)?;

    let cipher = XChaCha20Poly1305::new(dek.as_bytes().into());
    let mut hasher = HasherSha256::new();
    let mut buffer = vec![0u8; TAMANHO_BLOCO_STREAM];
    let mut total_bytes: u64 = 0;
    let mut indice_bloco: u32 = 0;

    loop {
        let mut preenchido = 0;
        while preenchido < TAMANHO_BLOCO_STREAM {
            let n = leitor.read(&mut buffer[preenchido..])?;
            if n == 0 {
                break;
            }
            preenchido += n;
        }

        let eh_ultimo = leitor.fill_buf()?.is_empty();
        let fatia = &buffer[..preenchido];

        hasher.atualizar(fatia);
        total_bytes += preenchido as u64;

        let (nonce_bloco, aad) = derivar_nonce_e_aad_bloco(&nonce_base, indice_bloco, eh_ultimo);
        let ciphertext = cipher
            .encrypt(
                XNonce::from_slice(&nonce_bloco),
                Payload {
                    msg: fatia,
                    aad: &aad,
                },
            )
            .map_err(|_| Erro::Criptografia)?;

        let tam_bloco_cifrado = u32::try_from(ciphertext.len()).map_err(|_| Erro::Criptografia)?;
        escritor.write_all(&tam_bloco_cifrado.to_be_bytes())?;
        escritor.write_all(&ciphertext)?;

        if eh_ultimo {
            break;
        }

        indice_bloco = indice_bloco.checked_add(1).ok_or(Erro::Criptografia)?;
    }

    buffer.zeroize();
    escritor.flush()?;
    if let Ok(arq) = escritor.into_inner() {
        let _ = arq.sync_all();
    }

    Ok((total_bytes, hasher.finalizar_hex()))
}

/// Decifra um arquivo `docs/<id>.bin` cifrado em blocos para `caminho_destino`,
/// retornando o hash SHA-256 em hexadecimal do conteúdo original reconstruído.
pub fn decifrar_arquivo_em_blocos(
    caminho_cifrado: &Path,
    caminho_destino: &Path,
    dek: &Key,
) -> Resultado<String> {
    if let Some(pai) = caminho_destino.parent() {
        fs::create_dir_all(pai)?;
    }

    let nome_temp = format!(
        ".{}.dec.tmp",
        caminho_destino
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("arquivo")
    );
    let caminho_temp = caminho_destino.with_file_name(nome_temp);

    match decifrar_arquivo_em_blocos_interno(caminho_cifrado, &caminho_temp, dek) {
        Ok(sha256) => {
            fs::rename(&caminho_temp, caminho_destino)?;
            Ok(sha256)
        }
        Err(e) => {
            sobrescrever_e_remover_arquivo(&caminho_temp);
            Err(e)
        }
    }
}

fn decifrar_arquivo_em_blocos_interno(
    caminho_cifrado: &Path,
    caminho_temp: &Path,
    dek: &Key,
) -> Resultado<String> {
    let arq_entrada = File::open(caminho_cifrado)?;
    let mut leitor = BufReader::new(arq_entrada);

    let mut nonce_base = [0u8; XNONCE_LEN];
    leitor
        .read_exact(&mut nonce_base)
        .map_err(|_| Erro::Criptografia)?;

    let arq_saida = File::create(caminho_temp)?;
    let mut escritor = BufWriter::new(arq_saida);

    let cipher = XChaCha20Poly1305::new(dek.as_bytes().into());
    let mut hasher = HasherSha256::new();
    let mut indice_bloco: u32 = 0;

    loop {
        let mut tam_bytes = [0u8; 4];
        match leitor.read_exact(&mut tam_bytes) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                return Err(Erro::Criptografia);
            }
            Err(e) => return Err(Erro::from(e)),
        }

        let tam_cifrado = u32::from_be_bytes(tam_bytes) as usize;
        let max_tam_cifrado = TAMANHO_BLOCO_STREAM + POLY1305_TAG_LEN;
        if !(POLY1305_TAG_LEN..=max_tam_cifrado).contains(&tam_cifrado) {
            return Err(Erro::Criptografia);
        }

        let mut ciphertext = vec![0u8; tam_cifrado];
        leitor
            .read_exact(&mut ciphertext)
            .map_err(|_| Erro::Criptografia)?;

        let eh_ultimo = leitor
            .fill_buf()
            .map_err(|_| Erro::Criptografia)?
            .is_empty();

        let (nonce_bloco, aad) = derivar_nonce_e_aad_bloco(&nonce_base, indice_bloco, eh_ultimo);
        let mut plaintext = cipher
            .decrypt(
                XNonce::from_slice(&nonce_bloco),
                Payload {
                    msg: &ciphertext,
                    aad: &aad,
                },
            )
            .map_err(|_| Erro::Criptografia)?;

        hasher.atualizar(&plaintext);
        escritor.write_all(&plaintext)?;
        plaintext.zeroize();

        if eh_ultimo {
            break;
        }

        indice_bloco = indice_bloco.checked_add(1).ok_or(Erro::Criptografia)?;
    }

    escritor.flush()?;
    if let Ok(arq) = escritor.into_inner() {
        let _ = arq.sync_all();
    }

    Ok(hasher.finalizar_hex())
}

/// Valida um arquivo de origem (extensão, magic bytes e limite de 25 MB) e o cifra em blocos
/// no destino informado, retornando todos os metadados e o SHA-256 do conteúdo original.
pub fn validar_e_cifrar_arquivo(
    caminho_origem: &Path,
    caminho_destino: &Path,
    dek: &Key,
    nome_original_override: Option<&str>,
) -> Resultado<ArquivoCifradoInfo> {
    let validado = validar_arquivo_origem(caminho_origem, nome_original_override)?;
    let (tamanho_cifrado_origem, sha256) =
        cifrar_arquivo_em_blocos(caminho_origem, caminho_destino, dek)?;

    Ok(ArquivoCifradoInfo {
        nome_original: sanitizar_nome_arquivo(&validado.nome_original),
        extensao: validado.extensao,
        mime: validado.mime,
        tamanho_bytes: tamanho_cifrado_origem,
        sha256,
    })
}

/// Sanitiza um nome de arquivo removendo diretórios (`/` ou `\`) e caracteres de controle
/// para evitar qualquer travessia de diretório (path traversal) ao extrair temporários.
pub fn sanitizar_nome_arquivo(nome: &str) -> String {
    let base = nome
        .trim()
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("documento")
        .trim();

    let limpo: String = base
        .chars()
        .filter(|&c| c != '\0' && !c.is_control())
        .collect();

    if limpo.is_empty() || limpo == "." || limpo == ".." {
        "documento".to_string()
    } else {
        limpo
    }
}

/// Decodifica uma string Base64 padrão (com ou sem prefixo `data:...;base64,`).
pub fn decodificar_base64(entrada: &str) -> Resultado<Vec<u8>> {
    let sem_prefixo = match entrada.find(";base64,") {
        Some(idx) => &entrada[idx + 8..],
        None => entrada,
    };

    let mut saida = Vec::with_capacity((sem_prefixo.len() * 3) / 4);
    let mut acumulador: u32 = 0;
    let mut bits: u8 = 0;

    for b in sem_prefixo.bytes() {
        if b.is_ascii_whitespace() {
            continue;
        }
        if b == b'=' {
            break;
        }
        let valor = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => {
                return Err(Erro::Validacao(
                    "Conteúdo do arquivo em formato inválido.".to_string(),
                ))
            }
        };
        acumulador = (acumulador << 6) | (valor as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            saida.push(((acumulador >> bits) & 0xFF) as u8);
        }
    }

    Ok(saida)
}

/// Valida e cifra um arquivo vindo de um caminho no disco (`caminho_origem`) ou,
/// quando enviado via arrastar-e-soltar / seletor web sem caminho nativo, a partir de `conteudo_base64`.
pub fn validar_e_cifrar_origem_flexivel(
    data_dir: &Path,
    caminho_origem: &str,
    nome_original_opcional: Option<&str>,
    conteudo_base64: Option<&str>,
    caminho_destino: &Path,
    dek: &Key,
) -> Resultado<ArquivoCifradoInfo> {
    let nome_preferido = nome_original_opcional
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let limpo = caminho_origem.trim();
            if limpo.is_empty() {
                None
            } else {
                Some(limpo)
            }
        })
        .map(sanitizar_nome_arquivo)
        .ok_or_else(|| Erro::Validacao("O nome do arquivo é obrigatório.".to_string()))?;

    if let Some(b64) = conteudo_base64.map(str::trim).filter(|s| !s.is_empty()) {
        let mut bytes = decodificar_base64(b64)?;
        if bytes.is_empty() {
            return Err(Erro::Validacao(
                "O arquivo selecionado está vazio.".to_string(),
            ));
        }
        if (bytes.len() as u64) > TAMANHO_MAXIMO_ARQUIVO_BYTES {
            bytes.zeroize();
            return Err(Erro::Validacao(
                "O arquivo excede o tamanho máximo permitido de 25 MB.".to_string(),
            ));
        }

        let pasta_temp = caminho_pasta_temporarios(data_dir).join("upload_staging");
        fs::create_dir_all(&pasta_temp)?;
        let caminho_staging = pasta_temp.join(&nome_preferido);
        let res_write = fs::write(&caminho_staging, &bytes);
        bytes.zeroize();
        res_write?;

        let resultado = validar_e_cifrar_arquivo(
            &caminho_staging,
            caminho_destino,
            dek,
            Some(&nome_preferido),
        );
        sobrescrever_e_remover_arquivo(&caminho_staging);
        return resultado;
    }

    let caminho = Path::new(caminho_origem.trim());
    validar_e_cifrar_arquivo(caminho, caminho_destino, dek, Some(&nome_preferido))
}

/// Resolve o caminho final onde um arquivo baixado será salvo (`documento_baixar` / `anamnese_baixar`).
/// Se `caminho_destino` for um diretório existente, junta `nome_original`.
/// Se `caminho_destino` estiver vazio, usa a pasta `Downloads` da usuária (ou `data_dir/downloads`).
pub fn resolver_caminho_destino_download(
    data_dir: &Path,
    caminho_destino: &str,
    nome_original: &str,
) -> PathBuf {
    let nome_seguro = sanitizar_nome_arquivo(nome_original);
    let destino_limpo = caminho_destino.trim();

    if !destino_limpo.is_empty() {
        let p = PathBuf::from(destino_limpo);
        if p.is_dir() {
            return p.join(nome_seguro);
        }
        return p;
    }

    #[cfg(target_os = "windows")]
    if let Ok(perfil) = std::env::var("USERPROFILE") {
        let downloads = PathBuf::from(perfil).join("Downloads");
        if downloads.is_dir() {
            return downloads.join(&nome_seguro);
        }
    }

    #[cfg(not(target_os = "windows"))]
    if let Ok(home) = std::env::var("HOME") {
        let downloads = PathBuf::from(home).join("Downloads");
        if downloads.is_dir() {
            return downloads.join(&nome_seguro);
        }
    }

    data_dir.join("downloads").join(nome_seguro)
}

/// Abre um arquivo local descriptografado no programa padrão do sistema operacional (RN46, RN68).
pub fn abrir_arquivo_no_sistema(caminho: &Path) -> Resultado<()> {
    if !caminho.exists() || !caminho.is_file() {
        return Err(Erro::Arquivo);
    }

    #[cfg(not(test))]
    {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("rundll32")
                .arg("url.dll,FileProtocolHandler")
                .arg(caminho)
                .spawn()
                .map_err(|_| Erro::Arquivo)?;
        }

        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(caminho)
                .spawn()
                .map_err(|_| Erro::Arquivo)?;
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            std::process::Command::new("xdg-open")
                .arg(caminho)
                .spawn()
                .map_err(|_| Erro::Arquivo)?;
        }
    }

    Ok(())
}

/// Calcula o hash SHA-256 (hexadecimal minúsculo) de um arquivo em disco lendo em blocos.
pub fn calcular_sha256_arquivo(caminho: &Path) -> Resultado<String> {
    let mut arq = File::open(caminho)?;
    let mut hasher = HasherSha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = arq.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.atualizar(&buf[..n]);
    }
    Ok(hasher.finalizar_hex())
}

/// Calcula o hash SHA-256 (hexadecimal minúsculo) de uma fatia de bytes em memória.
pub fn calcular_sha256_bytes(dados: &[u8]) -> String {
    let mut hasher = HasherSha256::new();
    hasher.atualizar(dados);
    hasher.finalizar_hex()
}

/// Implementação padrão FIPS 180-4 (SHA-256) em blocos de 64 bytes sem dependências externas.
struct HasherSha256 {
    estado: [u32; 8],
    bloco: [u8; 64],
    bloco_len: usize,
    total_bytes: u64,
}

const K_SHA256: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
];

impl HasherSha256 {
    fn new() -> Self {
        Self {
            estado: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
                0x1f83d9ab, 0x5be0cd19,
            ],
            bloco: [0u8; 64],
            bloco_len: 0,
            total_bytes: 0,
        }
    }

    fn atualizar(&mut self, mut dados: &[u8]) {
        self.total_bytes = self.total_bytes.wrapping_add(dados.len() as u64);

        if self.bloco_len > 0 {
            let faltam = 64 - self.bloco_len;
            if dados.len() < faltam {
                self.bloco[self.bloco_len..self.bloco_len + dados.len()].copy_from_slice(dados);
                self.bloco_len += dados.len();
                return;
            }
            self.bloco[self.bloco_len..64].copy_from_slice(&dados[..faltam]);
            let bloco_copia = self.bloco;
            Self::comprimir(&mut self.estado, &bloco_copia);
            self.bloco_len = 0;
            dados = &dados[faltam..];
        }

        while dados.len() >= 64 {
            let (bloco_atual, resto) = dados.split_at(64);
            let mut arr = [0u8; 64];
            arr.copy_from_slice(bloco_atual);
            Self::comprimir(&mut self.estado, &arr);
            dados = resto;
        }

        if !dados.is_empty() {
            self.bloco[..dados.len()].copy_from_slice(dados);
            self.bloco_len = dados.len();
        }
    }

    fn finalizar_hex(mut self) -> String {
        let total_bits = self.total_bytes.wrapping_mul(8);
        self.bloco[self.bloco_len] = 0x80;
        self.bloco_len += 1;

        if self.bloco_len > 56 {
            for b in &mut self.bloco[self.bloco_len..64] {
                *b = 0;
            }
            let bloco_copia = self.bloco;
            Self::comprimir(&mut self.estado, &bloco_copia);
            self.bloco_len = 0;
        }

        for b in &mut self.bloco[self.bloco_len..56] {
            *b = 0;
        }
        self.bloco[56..64].copy_from_slice(&total_bits.to_be_bytes());
        let bloco_final = self.bloco;
        Self::comprimir(&mut self.estado, &bloco_final);

        let mut saida = [0u8; 32];
        for (i, palavra) in self.estado.iter().enumerate() {
            saida[i * 4..(i + 1) * 4].copy_from_slice(&palavra.to_be_bytes());
        }
        codificar_hex(&saida)
    }

    fn comprimir(estado: &mut [u32; 8], bloco: &[u8; 64]) {
        let mut w = [0u32; 64];
        for (i, &chunk) in bloco.as_chunks::<4>().0.iter().enumerate() {
            w[i] = u32::from_be_bytes(chunk);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = estado[0];
        let mut b = estado[1];
        let mut c = estado[2];
        let mut d = estado[3];
        let mut e = estado[4];
        let mut f = estado[5];
        let mut g = estado[6];
        let mut h = estado[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K_SHA256[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        estado[0] = estado[0].wrapping_add(a);
        estado[1] = estado[1].wrapping_add(b);
        estado[2] = estado[2].wrapping_add(c);
        estado[3] = estado[3].wrapping_add(d);
        estado[4] = estado[4].wrapping_add(e);
        estado[5] = estado[5].wrapping_add(f);
        estado[6] = estado[6].wrapping_add(g);
        estado[7] = estado[7].wrapping_add(h);
    }
}

/// Sobrescreve o conteúdo de um arquivo com zeros antes de removê-lo do disco.
pub fn sobrescrever_e_remover_arquivo(caminho: &Path) {
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
    use crate::crypto::gerar_dek;
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

    #[test]
    fn sha256_vetores_oficiais_nist() {
        assert_eq!(
            calcular_sha256_bytes(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            calcular_sha256_bytes(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            calcular_sha256_bytes(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn valida_formatos_permitidos_e_rejeita_exe_renomeado_para_pdf_rn42() {
        let dir = std::env::temp_dir().join(format!("lc-files-val-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("criar dir");

        // 1. Formatos válidos com magic bytes correspondentes (RN42)
        let casos_validos: &[(&str, &[u8])] = &[
            ("ficha.pdf", b"%PDF-1.7\nconteudo do pdf"),
            ("modelo.docx", b"PK\x03\x04\x14\x00\x00\x00word/document.xml"),
            ("planilha.xlsx", b"PK\x03\x04\x14\x00\x00\x00xl/workbook.xml"),
            ("texto.odt", b"PK\x03\x04\x14\x00\x00\x00content.xml"),
            ("calculo.ods", b"PK\x03\x04\x14\x00\x00\x00content.xml"),
            (
                "antigo.doc",
                &[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 1, 2, 3],
            ),
            (
                "antigo.xls",
                &[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 4, 5, 6],
            ),
            ("anotacao.txt", "Texto clínico simples com acentuação!\n".as_bytes()),
            ("foto.jpg", &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F']),
            ("foto2.JPEG", &[0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10]),
            ("imagem.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"),
        ];

        for (nome, conteudo) in casos_validos {
            let caminho = dir.join(nome);
            fs::write(&caminho, conteudo).expect("gravar arquivo valido");
            let info = validar_arquivo_origem(&caminho, None)
                .unwrap_or_else(|e| panic!("Deveria aceitar {}: {:?}", nome, e));
            assert_eq!(info.nome_original, *nome);
            assert_eq!(info.tamanho_bytes, conteudo.len() as u64);
        }

        // 2. Rejeitar extensão inválida (.exe, .bat, .sh, .zip)
        let arq_exe = dir.join("programa.exe");
        fs::write(&arq_exe, b"MZ\x90\x00\x03\x00\x00\x00").expect("gravar exe");
        assert!(matches!(
            validar_arquivo_origem(&arq_exe, None),
            Err(Erro::Validacao(_))
        ));

        // 3. Critério de aceite F6: rejeitar `.exe` renomeado para `.pdf` (e para `.txt` ou `.docx`)
        let exe_como_pdf = dir.join("falso_documento.pdf");
        fs::write(&exe_como_pdf, b"MZ\x90\x00\x03\x00\x00\x00PE\x00\x00").expect("gravar exe->pdf");
        let erro_pdf = validar_arquivo_origem(&exe_como_pdf, None);
        assert!(matches!(erro_pdf, Err(Erro::Validacao(_))));

        let exe_como_txt = dir.join("falso_texto.txt");
        fs::write(&exe_como_txt, b"MZ\x90\x00\x03\x00\x00\x00").expect("gravar exe->txt");
        assert!(matches!(
            validar_arquivo_origem(&exe_como_txt, None),
            Err(Erro::Validacao(_))
        ));

        let pdf_como_docx = dir.join("trocado.docx");
        fs::write(&pdf_como_docx, b"%PDF-1.5\n").expect("gravar pdf->docx");
        assert!(matches!(
            validar_arquivo_origem(&pdf_como_docx, None),
            Err(Erro::Validacao(_))
        ));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cifra_e_decifra_arquivo_de_25mb_em_blocos_e_rejeita_acima_de_25mb_rn43_rn45() {
        let dir = std::env::temp_dir().join(format!("lc-files-25mb-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("criar dir");
        let dek = gerar_dek();

        // 1. Arquivo exatamente no limite de 25 MB (26.214.400 bytes)
        let caminho_25mb = dir.join("exame_25mb.pdf");
        {
            let arq = File::create(&caminho_25mb).expect("criar 25mb");
            let mut writer = BufWriter::new(arq);
            let cabecalho = b"%PDF-1.7\n";
            writer.write_all(cabecalho).expect("gravar cabecalho");

            let restante = (TAMANHO_MAXIMO_ARQUIVO_BYTES as usize) - cabecalho.len();
            let padrao = [0x5Au8; 64 * 1024];
            let mut escritos = 0;
            while escritos < restante {
                let n = (restante - escritos).min(padrao.len());
                writer.write_all(&padrao[..n]).expect("gravar bloco");
                escritos += n;
            }
            writer.flush().expect("flush 25mb");
        }

        let caminho_cifrado = dir.join("docs").join("uuid-25mb.bin");
        let info = validar_e_cifrar_arquivo(&caminho_25mb, &caminho_cifrado, &dek, None)
            .expect("validar e cifrar arquivo de 25 MB");
        assert_eq!(info.tamanho_bytes, TAMANHO_MAXIMO_ARQUIVO_BYTES);
        assert_eq!(info.mime, "application/pdf");

        // Verifica que o arquivo cifrado em disco NÃO começa com "%PDF-" (é ilegível sem a chave)
        let mut primeiros_bytes = [0u8; 32];
        {
            let mut arq_cif = File::open(&caminho_cifrado).expect("abrir cifrado");
            arq_cif
                .read_exact(&mut primeiros_bytes)
                .expect("ler primeiros bytes");
        }
        assert_ne!(&primeiros_bytes[..5], b"%PDF-");

        // Decifra para novo caminho e confirma que o SHA-256 é idêntico
        let caminho_decifrado = dir.join("exame_25mb_restaurado.pdf");
        let sha_decifrado = decifrar_arquivo_em_blocos(&caminho_cifrado, &caminho_decifrado, &dek)
            .expect("decifrar arquivo de 25 MB");
        assert_eq!(sha_decifrado, info.sha256);
        assert_eq!(
            fs::metadata(&caminho_decifrado).unwrap().len(),
            TAMANHO_MAXIMO_ARQUIVO_BYTES
        );

        // 2. Chave errada deve falhar com Erro::Criptografia
        let dek_errada = gerar_dek();
        let caminho_falha = dir.join("falha.pdf");
        assert_eq!(
            decifrar_arquivo_em_blocos(&caminho_cifrado, &caminho_falha, &dek_errada),
            Err(Erro::Criptografia)
        );
        assert!(!caminho_falha.exists());

        // 3. Arquivo com 25 MB + 1 byte deve ser rejeitado na validação (RN43)
        let caminho_maior = dir.join("excede_25mb.pdf");
        {
            let mut arq = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&caminho_maior)
                .expect("criar arquivo maior");
            arq.write_all(b"%PDF-1.7\n").expect("gravar inicio");
            arq.set_len(TAMANHO_MAXIMO_ARQUIVO_BYTES + 1)
                .expect("definir tamanho > 25MB");
        }
        let erro_tamanho = validar_arquivo_origem(&caminho_maior, None);
        assert!(matches!(erro_tamanho, Err(Erro::Validacao(_))));

        let _ = fs::remove_dir_all(&dir);
    }
}
