//! Módulo de backup e restauração `.lcbackup` (F7-T1, F7-T2 — RN50–RN56, Seção 7).

use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use chrono::{DateTime, Local};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::commands::config::{definir_config_conn, ler_config_conn, CHAVE_CONFIG_ULTIMO_BACKUP};
use crate::crypto::{
    desembrulhar_dek_com_chave_recuperacao, desembrulhar_dek_com_segredo, gerar_nonce, XNONCE_LEN,
};
use crate::db::{abrir_banco, caminho_banco};
use crate::error::{Erro, Resultado};
use crate::files::{
    calcular_sha256_arquivo, calcular_sha256_bytes, caminho_pasta_documentos,
    sanitizar_nome_arquivo, TAMANHO_BLOCO_STREAM,
};
use crate::state::Key;
use crate::vault::{caminho_vault, carregar_vault, salvar_vault_atomico, vault_existe, Vault};

/// Magic bytes do cabeçalho externo do arquivo `.lotusbackup` (Seção 7).
pub const MAGIC_BACKUP: &[u8; 8] = b"LOTUSBKP";

/// Magic bytes legados para compatibilidade com versões anteriores (`.lcbackup`).
pub const MAGIC_BACKUP_LEGACY: &[u8; 8] = b"LCBACKUP";

/// Versão atual do formato binário `.lcbackup` (Seção 7).
pub const VERSAO_FORMATO_BACKUP: u32 = 1;

/// Magic bytes internos no início do payload cifrado.
const MAGIC_PACOTE_INTERNO: &[u8; 8] = b"LCPACK01";

/// Marcador final de integridade no fim do payload cifrado.
const MARCADOR_FIM_INTERNO: &[u8; 8] = b"LCEND001";

/// Tamanho máximo aceito para o cabeçalho JSON externo (1 MiB).
const TAMANHO_MAXIMO_CABECALHO_JSON: usize = 1024 * 1024;

/// Tamanho máximo aceito para os metadados internos JSON (4 MiB).
const TAMANHO_MAXIMO_METADADOS_JSON: usize = 4 * 1024 * 1024;

/// Tamanho da tag de autenticação do Poly1305 (16 bytes).
const POLY1305_TAG_LEN: usize = 16;

/// Cabeçalho público gravado em texto claro após os magic bytes e versão (Seção 7).
/// Contém a cópia do `vault.json` para permitir desembrulhar a DEK usando a mesma senha
/// ou a chave de recuperação (RN52).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CabecalhoBackup {
    pub versao: u32,
    pub criado_em: String,
    pub vault: Vault,
}

/// Metadados de um arquivo cifrado `docs/<id>.bin` incluído dentro do pacote de backup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntradaArquivoBackup {
    pub nome_arquivo: String,
    pub tamanho_bytes: u64,
    pub sha256: String,
}

/// Metadados internos cifrados dentro do payload do `.lcbackup`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MetadadosConteudoBackup {
    pub criado_em: String,
    pub n_pacientes: usize,
    pub n_sessoes: usize,
    pub n_agendamentos: usize,
    pub n_documentos: usize,
    pub n_anamneses: usize,
    pub tamanho_banco_bytes: u64,
    pub sha256_banco: String,
    pub arquivos_docs: Vec<EntradaArquivoBackup>,
}

/// Retorno da criação e verificação pós-gravação de um arquivo `.lcbackup` (RN51, RN55).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResultadoBackupCriado {
    pub caminho_arquivo: String,
    pub nome_arquivo: String,
    pub tamanho: u64,
    pub tamanho_bytes: u64,
    pub criado_em: String,
    pub verificado: bool,
    pub n_pacientes: usize,
    pub n_sessoes: usize,
    pub n_agendamentos: usize,
    pub n_documentos: usize,
    pub n_anamneses: usize,
}

/// Retorno da inspeção de um arquivo `.lcbackup` autenticado pela senha ou chave de recuperação (RN52, RN54).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InspecaoBackup {
    pub data: String,
    pub criado_em: String,
    pub n_pacientes: usize,
    pub n_documentos: usize,
    pub n_anamneses: usize,
    pub n_agendamentos: usize,
    pub n_sessoes: usize,
    pub tamanho_bytes: u64,
}

/// Retorno da restauração completa de um arquivo `.lcbackup` (RN54).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResultadoBackupRestaurado {
    pub data: String,
    pub criado_em: String,
    pub n_pacientes: usize,
    pub n_documentos: usize,
    pub n_anamneses: usize,
    pub n_agendamentos: usize,
    pub n_sessoes: usize,
    pub caminho_copia_seguranca: Option<String>,
}

/// Gera o nome sugerido para o arquivo de backup conforme RN51:
/// `backup-pacientes-AAAA-MM-DD-HHmm.lotusbackup`.
pub fn gerar_nome_backup_sugerido(instante: DateTime<Local>) -> String {
    format!(
        "backup-pacientes-{}.lotusbackup",
        instante.format("%Y-%m-%d-%H%M")
    )
}

/// Resolve o caminho final onde o arquivo `.lotusbackup` será gravado (RN51):
/// - Se `caminho_destino` estiver vazio, usa a pasta `Downloads` da usuária (ou `data_dir/backups`)
///   com o nome sugerido `backup-pacientes-AAAA-MM-DD-HHmm.lotusbackup`.
/// - Se `caminho_destino` for uma pasta existente, concatena o nome sugerido.
/// - Se `caminho_destino` for um caminho de arquivo sem extensão `.lotusbackup`, garante o sufixo `.lotusbackup`.
pub fn resolver_caminho_destino_backup(
    data_dir: &Path,
    caminho_destino: &str,
    instante: DateTime<Local>,
) -> PathBuf {
    let nome_sugerido = gerar_nome_backup_sugerido(instante);
    let limpo = caminho_destino.trim();

    if !limpo.is_empty() {
        let caminho = PathBuf::from(limpo);
        if caminho.is_dir() {
            return caminho.join(nome_sugerido);
        }
        let tem_ext_valida = caminho
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("lotusbackup") || e.eq_ignore_ascii_case("lcbackup"))
            .unwrap_or(false);

        if tem_ext_valida {
            return caminho;
        }

        let mut com_ext = caminho.into_os_string();
        com_ext.push(".lotusbackup");
        return PathBuf::from(com_ext);
    }

    #[cfg(target_os = "windows")]
    if let Ok(perfil) = std::env::var("USERPROFILE") {
        let downloads = PathBuf::from(perfil).join("Downloads");
        if downloads.is_dir() {
            return downloads.join(&nome_sugerido);
        }
    }

    #[cfg(not(target_os = "windows"))]
    if let Ok(home) = std::env::var("HOME") {
        let downloads = PathBuf::from(home).join("Downloads");
        if downloads.is_dir() {
            return downloads.join(&nome_sugerido);
        }
    }

    data_dir.join("backups").join(nome_sugerido)
}

/// Deriva o nonce de 24 bytes e o AAD de 5 bytes para cada bloco do stream XChaCha20-Poly1305.
fn derivar_nonce_e_aad_stream(
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

/// Escritor de stream que acumula blocos de até 64 KiB e os cifra com XChaCha20-Poly1305.
struct EscritorStreamCifrado<W: Write> {
    inner: W,
    cipher: XChaCha20Poly1305,
    nonce_base: [u8; XNONCE_LEN],
    buffer: Vec<u8>,
    indice_bloco: u32,
}

impl<W: Write> EscritorStreamCifrado<W> {
    fn novo(mut inner: W, dek: &Key) -> Resultado<Self> {
        let nonce_base = gerar_nonce();
        inner.write_all(&nonce_base)?;
        let cipher = XChaCha20Poly1305::new(dek.as_bytes().into());
        Ok(Self {
            inner,
            cipher,
            nonce_base,
            buffer: Vec::with_capacity(TAMANHO_BLOCO_STREAM),
            indice_bloco: 0,
        })
    }

    fn emitir_bloco(&mut self, dados: &[u8], eh_ultimo: bool) -> Resultado<()> {
        let (nonce_bloco, aad) =
            derivar_nonce_e_aad_stream(&self.nonce_base, self.indice_bloco, eh_ultimo);
        let ciphertext = self
            .cipher
            .encrypt(
                XNonce::from_slice(&nonce_bloco),
                Payload {
                    msg: dados,
                    aad: &aad,
                },
            )
            .map_err(|_| Erro::Criptografia)?;

        let tam = u32::try_from(ciphertext.len()).map_err(|_| Erro::Criptografia)?;
        self.inner.write_all(&tam.to_be_bytes())?;
        self.inner.write_all(&ciphertext)?;

        if !eh_ultimo {
            self.indice_bloco = self.indice_bloco.checked_add(1).ok_or(Erro::Criptografia)?;
        }
        Ok(())
    }

    fn escrever_tudo(&mut self, mut dados: &[u8]) -> Resultado<()> {
        while !dados.is_empty() {
            if self.buffer.len() == TAMANHO_BLOCO_STREAM {
                let mut bloco = std::mem::take(&mut self.buffer);
                self.buffer.reserve(TAMANHO_BLOCO_STREAM);
                let res = self.emitir_bloco(&bloco, false);
                bloco.zeroize();
                res?;
            }

            let espaco = TAMANHO_BLOCO_STREAM - self.buffer.len();
            let copiar = espaco.min(dados.len());
            self.buffer.extend_from_slice(&dados[..copiar]);
            dados = &dados[copiar..];
        }
        Ok(())
    }

    fn finalizar(mut self) -> Resultado<W> {
        let mut ultimo_bloco = std::mem::take(&mut self.buffer);
        let res = self.emitir_bloco(&ultimo_bloco, true);
        ultimo_bloco.zeroize();
        res?;
        self.inner.flush()?;
        Ok(self.inner)
    }
}

/// Leitor de stream que decifra e autentica blocos de até 64 KiB com XChaCha20-Poly1305.
pub(crate) struct LeitorStreamDecifrado<R: Read> {
    inner: R,
    cipher: XChaCha20Poly1305,
    nonce_base: [u8; XNONCE_LEN],
    buffer: Vec<u8>,
    pos: usize,
    indice_bloco: u32,
    ultimo_lido: bool,
}

impl<R: Read> LeitorStreamDecifrado<R> {
    pub(crate) fn novo(mut inner: R, dek: &Key) -> Resultado<Self> {
        let mut nonce_base = [0u8; XNONCE_LEN];
        inner
            .read_exact(&mut nonce_base)
            .map_err(|_| Erro::Criptografia)?;
        let cipher = XChaCha20Poly1305::new(dek.as_bytes().into());
        Ok(Self {
            inner,
            cipher,
            nonce_base,
            buffer: Vec::new(),
            pos: 0,
            indice_bloco: 0,
            ultimo_lido: false,
        })
    }

    fn carregar_proximo_bloco(&mut self) -> Resultado<bool> {
        self.buffer.zeroize();
        self.buffer.clear();
        self.pos = 0;

        if self.ultimo_lido {
            return Ok(false);
        }

        let mut tam_bytes = [0u8; 4];
        self.inner
            .read_exact(&mut tam_bytes)
            .map_err(|_| Erro::Criptografia)?;
        let tam_cifrado = u32::from_be_bytes(tam_bytes) as usize;
        let max_tam_cifrado = TAMANHO_BLOCO_STREAM + POLY1305_TAG_LEN;
        if !(POLY1305_TAG_LEN..=max_tam_cifrado).contains(&tam_cifrado) {
            return Err(Erro::Criptografia);
        }

        let mut ciphertext = vec![0u8; tam_cifrado];
        self.inner
            .read_exact(&mut ciphertext)
            .map_err(|_| Erro::Criptografia)?;

        // Tenta decifrar primeiro como bloco intermediário (eh_ultimo = false);
        // se falhar na tag AEAD, tenta como último bloco (eh_ultimo = true).
        let (nonce_inter, aad_inter) =
            derivar_nonce_e_aad_stream(&self.nonce_base, self.indice_bloco, false);
        if let Ok(plaintext) = self.cipher.decrypt(
            XNonce::from_slice(&nonce_inter),
            Payload {
                msg: &ciphertext,
                aad: &aad_inter,
            },
        ) {
            self.buffer = plaintext;
            self.indice_bloco = self.indice_bloco.checked_add(1).ok_or(Erro::Criptografia)?;
            return Ok(true);
        }

        let (nonce_ult, aad_ult) =
            derivar_nonce_e_aad_stream(&self.nonce_base, self.indice_bloco, true);
        let plaintext = self
            .cipher
            .decrypt(
                XNonce::from_slice(&nonce_ult),
                Payload {
                    msg: &ciphertext,
                    aad: &aad_ult,
                },
            )
            .map_err(|_| Erro::Criptografia)?;

        // Se é o último bloco, não pode haver bytes extras no arquivo após ele
        let mut extra = [0u8; 1];
        if self
            .inner
            .read(&mut extra)
            .map_err(|_| Erro::Criptografia)?
            != 0
        {
            return Err(Erro::Criptografia);
        }

        self.buffer = plaintext;
        self.ultimo_lido = true;
        Ok(true)
    }

    pub(crate) fn ler_exato(&mut self, mut destino: &mut [u8]) -> Resultado<()> {
        while !destino.is_empty() {
            if self.pos >= self.buffer.len() {
                let carregou = self.carregar_proximo_bloco()?;
                if !carregou || self.buffer.is_empty() {
                    return Err(Erro::Criptografia);
                }
            }

            let disponivel = self.buffer.len() - self.pos;
            let copiar = disponivel.min(destino.len());
            destino[..copiar].copy_from_slice(&self.buffer[self.pos..self.pos + copiar]);
            self.pos += copiar;
            destino = &mut destino[copiar..];
        }
        Ok(())
    }

    pub(crate) fn confirmar_fim_de_stream(&mut self) -> Resultado<()> {
        if self.pos < self.buffer.len() {
            return Err(Erro::Criptografia);
        }
        if !self.ultimo_lido {
            let carregou = self.carregar_proximo_bloco()?;
            if carregou && !self.buffer.is_empty() {
                return Err(Erro::Criptografia);
            }
        }
        Ok(())
    }
}

impl<R: Read> Drop for LeitorStreamDecifrado<R> {
    fn drop(&mut self) {
        self.buffer.zeroize();
    }
}

/// Executa o checkpoint completo do WAL no SQLCipher antes de copiar o banco (Armadilha A1).
pub fn executar_checkpoint_wal(conn: &Connection) -> Resultado<()> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

/// Conta os registros nas tabelas principais do banco e coleta todos os IDs de arquivos esperados
/// (`documentos` + `anamneses` — RN51, RN56).
fn coletar_estatisticas_e_ids_arquivos(
    conn: &Connection,
) -> Resultado<(usize, usize, usize, usize, usize, Vec<String>)> {
    let n_pacientes: i64 = conn.query_row("SELECT COUNT(*) FROM pacientes;", [], |r| r.get(0))?;
    let n_sessoes: i64 = conn.query_row("SELECT COUNT(*) FROM sessoes;", [], |r| r.get(0))?;
    let n_agendamentos: i64 =
        conn.query_row("SELECT COUNT(*) FROM agendamentos;", [], |r| r.get(0))?;
    let n_documentos: i64 = conn.query_row("SELECT COUNT(*) FROM documentos;", [], |r| r.get(0))?;
    let n_anamneses: i64 = conn.query_row("SELECT COUNT(*) FROM anamneses;", [], |r| r.get(0))?;

    let mut ids = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT id FROM documentos ORDER BY id ASC;")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        for r in rows {
            ids.push(r?);
        }
    }
    {
        let mut stmt = conn.prepare("SELECT id FROM anamneses ORDER BY id ASC;")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        for r in rows {
            ids.push(r?);
        }
    }

    Ok((
        n_pacientes.max(0) as usize,
        n_sessoes.max(0) as usize,
        n_agendamentos.max(0) as usize,
        n_documentos.max(0) as usize,
        n_anamneses.max(0) as usize,
        ids,
    ))
}

/// Lista e valida todos os arquivos cifrados em `data_dir/docs/*.bin`, garantindo que todos os
/// documentos gerais e fichas de anamnese registrados no banco estejam presentes em disco (RN56).
fn listar_arquivos_docs_para_backup(
    data_dir: &Path,
    ids_esperados_no_banco: &[String],
) -> Resultado<Vec<(PathBuf, EntradaArquivoBackup)>> {
    let pasta_docs = caminho_pasta_documentos(data_dir);

    for id in ids_esperados_no_banco {
        let esperado = pasta_docs.join(format!("{}.bin", id));
        if !esperado.is_file() {
            return Err(Erro::Arquivo);
        }
    }

    let mut caminhos_bin: Vec<(String, PathBuf)> = Vec::new();
    if pasta_docs.is_dir() {
        for entrada in fs::read_dir(&pasta_docs)? {
            let entrada = entrada?;
            let caminho = entrada.path();
            if !caminho.is_file() {
                continue;
            }
            let nome = match caminho.file_name().and_then(|n| n.to_str()) {
                Some(n) if n.ends_with(".bin") => n.to_string(),
                _ => continue,
            };
            caminhos_bin.push((nome, caminho));
        }
    }

    caminhos_bin.sort_by(|a, b| a.0.cmp(&b.0));

    let mut resultado = Vec::with_capacity(caminhos_bin.len());
    for (nome_arquivo, caminho) in caminhos_bin {
        let meta = fs::metadata(&caminho)?;
        let sha256 = calcular_sha256_arquivo(&caminho)?;
        resultado.push((
            caminho,
            EntradaArquivoBackup {
                nome_arquivo,
                tamanho_bytes: meta.len(),
                sha256,
            },
        ));
    }

    Ok(resultado)
}

/// Lê e valida apenas o cabeçalho externo de um arquivo `.lotusbackup` (ou legado `.lcbackup`), posicionando o leitor
/// exatamente no início do payload cifrado.
pub fn ler_cabecalho_backup_de_leitor<R: Read>(leitor: &mut R) -> Resultado<CabecalhoBackup> {
    let mut magic = [0u8; 8];
    leitor.read_exact(&mut magic).map_err(|_| {
        Erro::Validacao("O arquivo selecionado não é um backup válido (.lotusbackup).".to_string())
    })?;

    if &magic != MAGIC_BACKUP && &magic != MAGIC_BACKUP_LEGACY {
        return Err(Erro::Validacao(
            "O arquivo selecionado não é um backup válido (.lotusbackup).".to_string(),
        ));
    }

    let mut versao_bytes = [0u8; 4];
    leitor
        .read_exact(&mut versao_bytes)
        .map_err(|_| Erro::Criptografia)?;
    let versao = u32::from_be_bytes(versao_bytes);
    if versao != VERSAO_FORMATO_BACKUP {
        return Err(Erro::Validacao(format!(
            "Versão de backup incompatível ({}).",
            versao
        )));
    }

    let mut tam_cabecalho_bytes = [0u8; 4];
    leitor
        .read_exact(&mut tam_cabecalho_bytes)
        .map_err(|_| Erro::Criptografia)?;
    let tam_cabecalho = u32::from_be_bytes(tam_cabecalho_bytes) as usize;
    if tam_cabecalho == 0 || tam_cabecalho > TAMANHO_MAXIMO_CABECALHO_JSON {
        return Err(Erro::Criptografia);
    }

    let mut json_bytes = vec![0u8; tam_cabecalho];
    leitor
        .read_exact(&mut json_bytes)
        .map_err(|_| Erro::Criptografia)?;

    let cabecalho: CabecalhoBackup =
        serde_json::from_slice(&json_bytes).map_err(|_| Erro::Criptografia)?;
    if cabecalho.versao != VERSAO_FORMATO_BACKUP {
        return Err(Erro::Criptografia);
    }

    Ok(cabecalho)
}

/// Lê os metadados internos a partir de um `LeitorStreamDecifrado` já aberto no início do payload.
pub(crate) fn ler_metadados_internos_de_stream<R: Read>(
    stream: &mut LeitorStreamDecifrado<R>,
) -> Resultado<MetadadosConteudoBackup> {
    let mut magic_interno = [0u8; 8];
    stream.ler_exato(&mut magic_interno)?;
    if &magic_interno != MAGIC_PACOTE_INTERNO {
        return Err(Erro::Criptografia);
    }

    let mut tam_meta_bytes = [0u8; 4];
    stream.ler_exato(&mut tam_meta_bytes)?;
    let tam_meta = u32::from_be_bytes(tam_meta_bytes) as usize;
    if tam_meta == 0 || tam_meta > TAMANHO_MAXIMO_METADADOS_JSON {
        return Err(Erro::Criptografia);
    }

    let mut meta_bytes = vec![0u8; tam_meta];
    stream.ler_exato(&mut meta_bytes)?;
    serde_json::from_slice(&meta_bytes).map_err(|_| Erro::Criptografia)
}

/// Verifica a integridade completa pós-gravação de um arquivo `.lcbackup` usando a DEK (RN55):
/// 1. Valida cabeçalho (`LCBACKUP`, versão e `vault.json`);
/// 2. Decifra e autentica todos os blocos XChaCha20-Poly1305 do payload;
/// 3. Confere o SHA-256 do banco SQLCipher empacotado e de todos os arquivos `docs/<id>.bin`;
/// 4. Confere o marcador final `LCEND001` e o fim exato do stream.
pub fn verificar_integridade_backup(
    caminho_backup: &Path,
    dek: &Key,
) -> Resultado<MetadadosConteudoBackup> {
    let arquivo = File::open(caminho_backup)?;
    let mut leitor = BufReader::new(arquivo);

    let _cabecalho = ler_cabecalho_backup_de_leitor(&mut leitor)?;
    let mut stream = LeitorStreamDecifrado::novo(&mut leitor, dek)?;
    let metadados = ler_metadados_internos_de_stream(&mut stream)?;

    // Verifica integridade do banco empacotado
    let mut bytes_banco = vec![0u8; metadados.tamanho_banco_bytes as usize];
    stream.ler_exato(&mut bytes_banco)?;
    let sha_banco_lido = calcular_sha256_bytes(&bytes_banco);
    bytes_banco.zeroize();
    if sha_banco_lido != metadados.sha256_banco {
        return Err(Erro::Criptografia);
    }

    // Verifica integridade de cada arquivo cifrado em docs/ (documentos + anamneses)
    for entrada in &metadados.arquivos_docs {
        let mut bytes_arq = vec![0u8; entrada.tamanho_bytes as usize];
        stream.ler_exato(&mut bytes_arq)?;
        let sha_arq_lido = calcular_sha256_bytes(&bytes_arq);
        if sha_arq_lido != entrada.sha256 {
            return Err(Erro::Criptografia);
        }
    }

    let mut marcador_fim = [0u8; 8];
    stream.ler_exato(&mut marcador_fim)?;
    if &marcador_fim != MARCADOR_FIM_INTERNO {
        return Err(Erro::Criptografia);
    }

    stream.confirmar_fim_de_stream()?;

    Ok(metadados)
}

fn copiar_arquivo_para_stream<W: Write>(
    caminho: &Path,
    tamanho_esperado: u64,
    stream: &mut EscritorStreamCifrado<W>,
) -> Resultado<()> {
    let mut arq = File::open(caminho)?;
    let mut buf = [0u8; 64 * 1024];
    let mut lidos_total: u64 = 0;

    loop {
        let n = arq.read(&mut buf)?;
        if n == 0 {
            break;
        }
        lidos_total += n as u64;
        stream.escrever_tudo(&buf[..n])?;
    }
    buf.zeroize();

    if lidos_total != tamanho_esperado {
        return Err(Erro::Arquivo);
    }
    Ok(())
}

/// Empacota o banco SQLCipher (após `PRAGMA wal_checkpoint(TRUNCATE);`), todos os documentos
/// gerais, todos os anexos de anamnese (RN56) e o `vault.json` em um único arquivo `.lcbackup`
/// cifrado com a DEK, executando verificação pós-gravação obrigatória (RN51, RN55, RN56).
pub fn criar_backup(
    data_dir: &Path,
    conn: &Connection,
    dek: &Key,
    caminho_destino: &Path,
) -> Resultado<ResultadoBackupCriado> {
    criar_backup_com_instante(data_dir, conn, dek, caminho_destino, Local::now())
}

/// Variante de `criar_backup` que recebe o instante de referência (útil para testes determinísticos).
pub fn criar_backup_com_instante(
    data_dir: &Path,
    conn: &Connection,
    dek: &Key,
    caminho_destino: &Path,
    instante: DateTime<Local>,
) -> Resultado<ResultadoBackupCriado> {
    if let Some(pai) = caminho_destino.parent() {
        if !pai.as_os_str().is_empty() {
            fs::create_dir_all(pai)?;
        }
    }

    let criado_em = instante.to_rfc3339();
    let ultimo_backup_anterior = ler_config_conn(conn, CHAVE_CONFIG_ULTIMO_BACKUP)?;

    // Registra a data do último backup no banco antes do checkpoint para que o próprio
    // banco empacotado já contenha o registro atualizado (RN53).
    definir_config_conn(conn, CHAVE_CONFIG_ULTIMO_BACKUP, &criado_em)?;

    let res = criar_backup_interno(data_dir, conn, dek, caminho_destino, &criado_em);
    if res.is_err() {
        // Reverte a chave `ultimo_backup` em caso de falha na gravação do arquivo
        if let Some(ant) = ultimo_backup_anterior {
            let _ = definir_config_conn(conn, CHAVE_CONFIG_ULTIMO_BACKUP, &ant);
        } else {
            let _ = conn.execute(
                "DELETE FROM config WHERE chave = ?1;",
                [CHAVE_CONFIG_ULTIMO_BACKUP],
            );
        }
    }
    res
}

fn criar_backup_interno(
    data_dir: &Path,
    conn: &Connection,
    dek: &Key,
    caminho_destino: &Path,
    criado_em: &str,
) -> Resultado<ResultadoBackupCriado> {
    // 1. Checkpoint completo do WAL para consolidar todas as transações no arquivo pacientes.db (Armadilha A1)
    executar_checkpoint_wal(conn)?;

    // 2. Coleta contagens e IDs de documentos e anamneses
    let (n_pacientes, n_sessoes, n_agendamentos, n_documentos, n_anamneses, ids_arquivos) =
        coletar_estatisticas_e_ids_arquivos(conn)?;

    // 3. Carrega e prepara cópia limpa do vault.json
    let mut vault_copia = carregar_vault(data_dir)?;
    vault_copia.zerar_rate_limit();

    let cabecalho = CabecalhoBackup {
        versao: VERSAO_FORMATO_BACKUP,
        criado_em: criado_em.to_string(),
        vault: vault_copia,
    };
    let cabecalho_json = serde_json::to_vec(&cabecalho).map_err(|_| Erro::Interno)?;
    let tam_cabecalho_u32 = u32::try_from(cabecalho_json.len()).map_err(|_| Erro::Interno)?;

    // 4. Inspeciona o arquivo pacientes.db e todos os arquivos cifrados em docs/
    let caminho_db = caminho_banco(data_dir);
    let meta_db = fs::metadata(&caminho_db)?;
    let tamanho_banco_bytes = meta_db.len();
    let sha256_banco = calcular_sha256_arquivo(&caminho_db)?;

    let arquivos_com_caminho = listar_arquivos_docs_para_backup(data_dir, &ids_arquivos)?;
    let entradas_docs: Vec<EntradaArquivoBackup> = arquivos_com_caminho
        .iter()
        .map(|(_, entrada)| entrada.clone())
        .collect();

    let metadados = MetadadosConteudoBackup {
        criado_em: criado_em.to_string(),
        n_pacientes,
        n_sessoes,
        n_agendamentos,
        n_documentos,
        n_anamneses,
        tamanho_banco_bytes,
        sha256_banco,
        arquivos_docs: entradas_docs,
    };
    let metadados_json = serde_json::to_vec(&metadados).map_err(|_| Erro::Interno)?;
    let tam_metadados_u32 = u32::try_from(metadados_json.len()).map_err(|_| Erro::Interno)?;

    // 5. Escreve o arquivo temporário `.lotusbackup.tmp`
    let nome_temp = format!(
        ".{}.tmp",
        caminho_destino
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("backup.lotusbackup")
    );
    let caminho_temp = caminho_destino.with_file_name(nome_temp);

    let res_escrita = (|| -> Resultado<()> {
        let arq_saida = File::create(&caminho_temp)?;
        let mut escritor_buf = BufWriter::new(arq_saida);

        // Cabeçalho externo: MAGIC + VERSAO + TAM_JSON + CABECALHO_JSON
        escritor_buf.write_all(MAGIC_BACKUP)?;
        escritor_buf.write_all(&VERSAO_FORMATO_BACKUP.to_be_bytes())?;
        escritor_buf.write_all(&tam_cabecalho_u32.to_be_bytes())?;
        escritor_buf.write_all(&cabecalho_json)?;

        // Payload cifrado em blocos XChaCha20-Poly1305 com a DEK
        let mut stream = EscritorStreamCifrado::novo(&mut escritor_buf, dek)?;
        stream.escrever_tudo(MAGIC_PACOTE_INTERNO)?;
        stream.escrever_tudo(&tam_metadados_u32.to_be_bytes())?;
        stream.escrever_tudo(&metadados_json)?;

        // Conteúdo do banco SQLCipher
        copiar_arquivo_para_stream(&caminho_db, tamanho_banco_bytes, &mut stream)?;

        // Conteúdo de cada documento geral / anexo de anamnese cifrado em docs/<id>.bin
        for (caminho_arq, info_arq) in &arquivos_com_caminho {
            copiar_arquivo_para_stream(caminho_arq, info_arq.tamanho_bytes, &mut stream)?;
        }

        // Marcador final de integridade
        stream.escrever_tudo(MARCADOR_FIM_INTERNO)?;
        stream.finalizar()?;

        escritor_buf.flush()?;
        if let Ok(arq) = escritor_buf.into_inner() {
            let _ = arq.sync_all();
        }
        Ok(())
    })();

    if let Err(e) = res_escrita {
        let _ = fs::remove_file(&caminho_temp);
        return Err(e);
    }

    // 6. Verificação pós-gravação obrigatória antes de confirmar (RN55)
    if let Err(e) = verificar_integridade_backup(&caminho_temp, dek) {
        let _ = fs::remove_file(&caminho_temp);
        return Err(e);
    }

    // 7. Move atomicamente para o destino final e valida novamente o arquivo final
    fs::rename(&caminho_temp, caminho_destino)?;
    verificar_integridade_backup(caminho_destino, dek)?;

    let tamanho_final = fs::metadata(caminho_destino)?.len();
    let nome_arquivo = caminho_destino
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("backup.lotusbackup")
        .to_string();

    Ok(ResultadoBackupCriado {
        caminho_arquivo: caminho_destino.to_string_lossy().to_string(),
        nome_arquivo,
        tamanho: tamanho_final,
        tamanho_bytes: tamanho_final,
        criado_em: criado_em.to_string(),
        verificado: true,
        n_pacientes,
        n_sessoes,
        n_agendamentos,
        n_documentos,
        n_anamneses,
    })
}

/// Desembrulha a DEK do cofre contido no `.lcbackup` usando a **mesma senha** ou a
/// **chave de recuperação** (RN52).
pub fn desembrulhar_dek_do_vault_backup(vault: &Vault, segredo_ou_chave: &str) -> Resultado<Key> {
    let limpo = segredo_ou_chave.trim();
    if limpo.is_empty() {
        return Err(Erro::Validacao(
            "Digite a senha ou a chave de recuperação do backup.".to_string(),
        ));
    }

    if let Ok(dek) = desembrulhar_dek_com_segredo(
        &vault.dek_por_senha,
        limpo.as_bytes(),
        vault.parametros_argon2,
    ) {
        return Ok(dek);
    }

    if let Ok(dek) = desembrulhar_dek_com_chave_recuperacao(
        &vault.dek_por_recuperacao,
        limpo,
        vault.parametros_argon2,
    ) {
        return Ok(dek);
    }

    Err(Erro::SenhaIncorreta)
}

/// Inspeciona um arquivo `.lcbackup` validando a senha ou a chave de recuperação (RN52, RN54)
/// e a integridade completa do arquivo, retornando a data do backup e as contagens de registros.
pub fn inspecionar_backup(
    caminho_backup: &Path,
    segredo_ou_chave: &str,
) -> Resultado<InspecaoBackup> {
    if !caminho_backup.exists() || !caminho_backup.is_file() {
        return Err(Erro::Validacao(
            "O arquivo de backup selecionado não foi encontrado.".to_string(),
        ));
    }

    let tamanho_bytes = fs::metadata(caminho_backup)?.len();
    let cabecalho = {
        let arq = File::open(caminho_backup)?;
        let mut leitor = BufReader::new(arq);
        ler_cabecalho_backup_de_leitor(&mut leitor)?
    };

    let dek = desembrulhar_dek_do_vault_backup(&cabecalho.vault, segredo_ou_chave)?;
    let metadados = verificar_integridade_backup(caminho_backup, &dek)?;

    Ok(InspecaoBackup {
        data: metadados.criado_em.clone(),
        criado_em: metadados.criado_em,
        n_pacientes: metadados.n_pacientes,
        n_documentos: metadados.n_documentos,
        n_anamneses: metadados.n_anamneses,
        n_agendamentos: metadados.n_agendamentos,
        n_sessoes: metadados.n_sessoes,
        tamanho_bytes,
    })
}

fn escrever_bytes_do_stream_em_arquivo<R: Read>(
    stream: &mut LeitorStreamDecifrado<R>,
    caminho_destino: &Path,
    tamanho_esperado: u64,
    sha256_esperado: &str,
) -> Resultado<()> {
    if let Some(pai) = caminho_destino.parent() {
        fs::create_dir_all(pai)?;
    }

    let mut arq = File::create(caminho_destino)?;
    let mut restante = tamanho_esperado as usize;
    let mut buffer = [0u8; 64 * 1024];

    while restante > 0 {
        let n = restante.min(buffer.len());
        stream.ler_exato(&mut buffer[..n])?;
        arq.write_all(&buffer[..n])?;
        restante -= n;
    }
    buffer.zeroize();
    arq.flush()?;
    let _ = arq.sync_all();

    let sha256_calculado = calcular_sha256_arquivo(caminho_destino)?;
    if sha256_calculado != sha256_esperado {
        return Err(Erro::Criptografia);
    }

    Ok(())
}

/// Cria uma cópia automática de segurança dos dados atuais antes de sobrescrevê-los na restauração (RN54).
/// - Se houver `conn` e `dek` ativos dos dados atuais, gera um arquivo `.lcbackup` completo em
///   `data_dir/backups_automaticos/pre-restauracao-AAAA-MM-DD-HHmmss.lcbackup`.
/// - Caso contrário, se existirem arquivos `vault.json` e `pacientes.db` em `data_dir`, tenta abrir
///   com a `dek` disponível ou copia a estrutura atual para `data_dir/backups_automaticos/`.
pub fn criar_copia_seguranca_automatica_previa(
    data_dir: &Path,
    conn_atual: Option<&Connection>,
    dek_atual: Option<&Key>,
) -> Resultado<Option<PathBuf>> {
    let tem_vault = vault_existe(data_dir);
    let tem_banco = caminho_banco(data_dir).is_file();
    if !tem_vault || !tem_banco {
        return Ok(None);
    }

    let pasta_auto = data_dir.join("backups_automaticos");
    fs::create_dir_all(&pasta_auto)?;

    let agora = Local::now();
    let sufixo_unico = &uuid::Uuid::new_v4().to_string()[..8];
    let nome_backup = format!(
        "pre-restauracao-{}-{}.lotusbackup",
        agora.format("%Y-%m-%d-%H%M%S"),
        sufixo_unico
    );
    let destino_backup = pasta_auto.join(nome_backup);

    if let (Some(conn), Some(dek)) = (conn_atual, dek_atual) {
        criar_backup_com_instante(data_dir, conn, dek, &destino_backup, agora)?;
        return Ok(Some(destino_backup));
    }

    if let Some(dek) = dek_atual {
        if let Ok(conn_aberta) = abrir_banco(data_dir, dek) {
            criar_backup_com_instante(data_dir, &conn_aberta, dek, &destino_backup, agora)?;
            return Ok(Some(destino_backup));
        }
    }

    // Fallback seguro caso os dados atuais usem outra chave e não estejam abertos em memória:
    // copia atomicamente vault.json, pacientes.db e docs/ para uma subpasta de segurança.
    let pasta_snapshot = pasta_auto.join(format!(
        "snapshot-pre-restauracao-{}-{}",
        agora.format("%Y-%m-%d-%H%M%S"),
        sufixo_unico
    ));
    fs::create_dir_all(&pasta_snapshot)?;
    fs::copy(caminho_vault(data_dir), pasta_snapshot.join("vault.json"))?;
    fs::copy(caminho_banco(data_dir), pasta_snapshot.join("pacientes.db"))?;

    let docs_origem = caminho_pasta_documentos(data_dir);
    if docs_origem.is_dir() {
        let docs_destino = pasta_snapshot.join("docs");
        fs::create_dir_all(&docs_destino)?;
        for entrada in fs::read_dir(&docs_origem)? {
            let entrada = entrada?;
            let p = entrada.path();
            if p.is_file() {
                if let Some(nome) = p.file_name() {
                    fs::copy(&p, docs_destino.join(nome))?;
                }
            }
        }
    }

    Ok(Some(pasta_snapshot))
}

/// Restaura um arquivo `.lcbackup` validando a senha ou a chave de recuperação (RN52, RN54):
/// 1. Verifica a integridade completa do arquivo `.lcbackup` antes de tocar nos dados atuais;
/// 2. Se já existirem dados em `data_dir`, cria antes uma cópia de segurança automática (RN54);
/// 3. Extrai `pacientes.db`, todos os arquivos cifrados `docs/<id>.bin` (documentos + anamneses)
///    e o `vault.json` em pasta temporária de staging e substitui os dados atuais;
/// 4. Retorna a DEK desembrulhada e o resumo da restauração.
pub fn restaurar_backup(
    data_dir: &Path,
    caminho_backup: &Path,
    segredo_ou_chave: &str,
    conn_atual: Option<&Connection>,
    dek_atual: Option<&Key>,
) -> Resultado<(Key, ResultadoBackupRestaurado)> {
    if !caminho_backup.exists() || !caminho_backup.is_file() {
        return Err(Erro::Validacao(
            "O arquivo de backup selecionado não foi encontrado.".to_string(),
        ));
    }

    // 1. Lê cabeçalho e desembrulha a DEK usando senha ou chave de recuperação (RN52)
    let cabecalho = {
        let arq = File::open(caminho_backup)?;
        let mut leitor = BufReader::new(arq);
        ler_cabecalho_backup_de_leitor(&mut leitor)?
    };
    let dek_backup = desembrulhar_dek_do_vault_backup(&cabecalho.vault, segredo_ou_chave)?;

    // 2. Valida integridade completa do backup ANTES de modificar qualquer dado atual
    verificar_integridade_backup(caminho_backup, &dek_backup)?;

    // 3. Cria cópia automática prévia dos dados atuais, se existirem (RN54)
    let copia_seguranca = criar_copia_seguranca_automatica_previa(data_dir, conn_atual, dek_atual)?;

    // 4. Extrai tudo em uma pasta de staging isolada dentro de `data_dir`
    fs::create_dir_all(data_dir)?;
    let pasta_staging = data_dir.join(format!(
        ".restauracao_staging_{}",
        &uuid::Uuid::new_v4().to_string()[..8]
    ));
    if pasta_staging.exists() {
        let _ = fs::remove_dir_all(&pasta_staging);
    }
    fs::create_dir_all(&pasta_staging)?;

    let res_extracao = (|| -> Resultado<MetadadosConteudoBackup> {
        let arq = File::open(caminho_backup)?;
        let mut leitor = BufReader::new(arq);
        let _ = ler_cabecalho_backup_de_leitor(&mut leitor)?;
        let mut stream = LeitorStreamDecifrado::novo(&mut leitor, &dek_backup)?;
        let metadados = ler_metadados_internos_de_stream(&mut stream)?;

        let db_staging = pasta_staging.join("pacientes.db");
        escrever_bytes_do_stream_em_arquivo(
            &mut stream,
            &db_staging,
            metadados.tamanho_banco_bytes,
            &metadados.sha256_banco,
        )?;

        let docs_staging = pasta_staging.join("docs");
        fs::create_dir_all(&docs_staging)?;
        for entrada in &metadados.arquivos_docs {
            let nome_seguro = sanitizar_nome_arquivo(&entrada.nome_arquivo);
            if !nome_seguro.ends_with(".bin") {
                return Err(Erro::Criptografia);
            }
            let destino_arq = docs_staging.join(nome_seguro);
            escrever_bytes_do_stream_em_arquivo(
                &mut stream,
                &destino_arq,
                entrada.tamanho_bytes,
                &entrada.sha256,
            )?;
        }

        let mut marcador_fim = [0u8; 8];
        stream.ler_exato(&mut marcador_fim)?;
        if &marcador_fim != MARCADOR_FIM_INTERNO {
            return Err(Erro::Criptografia);
        }
        stream.confirmar_fim_de_stream()?;

        // Valida que o banco extraído abre perfeitamente no SQLCipher com a DEK do backup
        let conn_teste = abrir_banco(&pasta_staging, &dek_backup)?;
        executar_checkpoint_wal(&conn_teste)?;
        drop(conn_teste);

        Ok(metadados)
    })();

    let metadados = match res_extracao {
        Ok(m) => m,
        Err(e) => {
            let _ = fs::remove_dir_all(&pasta_staging);
            return Err(e);
        }
    };

    // 5. Substitui os arquivos de `data_dir` pelos arquivos restaurados da staging
    let db_final = caminho_banco(data_dir);
    let _ = fs::remove_file(data_dir.join("pacientes.db-wal"));
    let _ = fs::remove_file(data_dir.join("pacientes.db-shm"));
    fs::rename(pasta_staging.join("pacientes.db"), &db_final)?;

    let docs_final = caminho_pasta_documentos(data_dir);
    if docs_final.exists() {
        fs::remove_dir_all(&docs_final)?;
    }
    fs::rename(pasta_staging.join("docs"), &docs_final)?;

    let mut vault_restaurado = cabecalho.vault;
    vault_restaurado.zerar_rate_limit();
    salvar_vault_atomico(data_dir, &vault_restaurado)?;

    let _ = fs::remove_dir_all(&pasta_staging);

    Ok((
        dek_backup,
        ResultadoBackupRestaurado {
            data: metadados.criado_em.clone(),
            criado_em: metadados.criado_em,
            n_pacientes: metadados.n_pacientes,
            n_documentos: metadados.n_documentos,
            n_anamneses: metadados.n_anamneses,
            n_agendamentos: metadados.n_agendamentos,
            n_sessoes: metadados.n_sessoes,
            caminho_copia_seguranca: copia_seguranca.map(|p| p.to_string_lossy().to_string()),
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::agendamentos::{
        executar_agendamento_criar, executar_agendamentos_listar, DadosAgendamentoInput,
    };
    use crate::commands::anamneses::executar_anamnese_anexar;
    use crate::commands::auth::executar_auth_setup_com_params;
    use crate::commands::categorias::executar_categorias_listar;
    use crate::commands::documentos::executar_documento_enviar;
    use crate::commands::financeiro::{
        executar_financeiro_criar, executar_financeiro_resumo_mensal,
        DadosLancamentoFinanceiroInput,
    };
    use crate::commands::horarios_semanais::{
        executar_horario_semanal_criar, executar_horarios_semanais_aplicar_semana,
        executar_horarios_semanais_listar, DadosHorarioSemanalInput,
    };
    use crate::commands::pacientes::{executar_paciente_criar, DadosPacienteInput};
    use crate::commands::sessoes::{executar_sessao_criar, DadosSessaoCriarInput};
    use crate::crypto::{gerar_dek, ParametrosArgon2};
    use crate::state::AppState;
    use chrono::TimeZone;
    use uuid::Uuid;

    fn pasta_teste() -> PathBuf {
        std::env::temp_dir().join(format!("lc-backup-test-{}", Uuid::new_v4()))
    }

    fn params_argon_rapido() -> ParametrosArgon2 {
        ParametrosArgon2 {
            m_cost_kib: 4096,
            t_cost: 1,
            p_cost: 1,
        }
    }

    #[test]
    fn gera_nome_sugerido_no_padrao_rn51() {
        let dt = Local
            .with_ymd_and_hms(2026, 11, 6, 20, 15, 0)
            .single()
            .expect("data válida");
        assert_eq!(
            gerar_nome_backup_sugerido(dt),
            "backup-pacientes-2026-11-06-2015.lotusbackup"
        );
    }

    #[test]
    fn empacota_banco_com_checkpoint_wal_agendamentos_documentos_anamneses_e_vault_e_verifica_pos_gravacao(
    ) {
        let dir = pasta_teste();
        let state = AppState::new(dir.clone());

        // 1. Setup do cofre e banco
        executar_auth_setup_com_params(&state, "SenhaForteBackup123", params_argon_rapido())
            .expect("setup cofre");

        // 2. Cria paciente, sessão e agendamento (RN56)
        let paciente = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Maria Clara Oliveira".to_string(),
                data_nascimento: Some("1992-08-20".to_string()),
                telefone: Some("(71) 99123-4567".to_string()),
                whatsapp: None,
                email: None,
                endereco: None,
                nome_mae: None,
                nome_pai: None,
                responsavel_nome: None,
                responsavel_parentesco: None,
                responsavel_telefone: None,
                contato_emergencia_nome: None,
                contato_emergencia_telefone: None,
                documento: None,
                ocupacao: None,
                motivo_procura: None,
                modalidade: None,
                convenio_nome: None,
                valor_sessao_centavos: None,
                observacoes: None,
            },
        )
        .expect("criar paciente");

        executar_sessao_criar(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-01".to_string(),
                resumo: "Primeira sessão registrada para validação do backup.".to_string(),
            },
        )
        .expect("criar sessão");

        executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-10".to_string(),
                hora_inicio: "15:00".to_string(),
                duracao_min: Some(50),
                observacao: Some("Retorno agendado".to_string()),
            },
        )
        .expect("criar agendamento");

        // 3. Envia um documento geral (PDF) e um anexo de anamnese (PDF — RN56)
        let pasta_origens = dir.join("origens_teste");
        fs::create_dir_all(&pasta_origens).expect("criar pasta origens");

        let caminho_doc_pdf = pasta_origens.join("modelo_contrato.pdf");
        fs::write(
            &caminho_doc_pdf,
            b"%PDF-1.7\nContrato modelo de teste\n%%EOF",
        )
        .expect("escrever pdf doc");

        let caminho_anamnese_pdf = pasta_origens.join("ficha_anamnese_maria.pdf");
        fs::write(
            &caminho_anamnese_pdf,
            b"%PDF-1.7\nFicha de anamnese confidencial da Maria\n%%EOF",
        )
        .expect("escrever pdf anamnese");

        let categorias = executar_categorias_listar(&state).expect("listar categorias");
        executar_documento_enviar(
            &state,
            &caminho_doc_pdf.to_string_lossy(),
            Some(&categorias[0].id),
            Some("Modelo de contrato"),
            None,
            None,
        )
        .expect("enviar documento");

        executar_anamnese_anexar(
            &state,
            &paciente.id,
            &caminho_anamnese_pdf.to_string_lossy(),
            None,
            None,
        )
        .expect("anexar anamnese");

        // 4. Gera o arquivo .lotusbackup
        let caminho_backup = dir.join("saida").join("meu-backup.lotusbackup");
        let resultado = {
            let dek_guard = state.dek.lock().unwrap();
            let conn_guard = state.conn.lock().unwrap();
            let dek = dek_guard.as_ref().unwrap();
            let conn = conn_guard.as_ref().unwrap();
            criar_backup(&dir, conn, dek, &caminho_backup).expect("criar backup .lotusbackup")
        };

        assert!(resultado.verificado);
        assert!(caminho_backup.is_file());
        assert!(resultado.tamanho > 100);
        assert_eq!(resultado.n_pacientes, 1);
        assert_eq!(resultado.n_sessoes, 1);
        assert_eq!(resultado.n_agendamentos, 1);
        assert_eq!(resultado.n_documentos, 1);
        assert_eq!(resultado.n_anamneses, 1);

        // 5. Verifica que o WAL foi truncado após o checkpoint (Armadilha A1)
        let caminho_wal = dir.join("pacientes.db-wal");
        if caminho_wal.exists() {
            assert_eq!(
                fs::metadata(&caminho_wal).unwrap().len(),
                0,
                "O arquivo WAL deve estar truncado (0 bytes) após o checkpoint do backup"
            );
        }

        // 6. Verifica que o arquivo .lcbackup não expõe dados sensíveis em texto claro
        let bytes_backup = fs::read(&caminho_backup).expect("ler bytes do backup");
        assert_eq!(&bytes_backup[..8], MAGIC_BACKUP);
        let texto_bruto = String::from_utf8_lossy(&bytes_backup);
        assert!(!texto_bruto.contains("Maria Clara Oliveira"));
        assert!(!texto_bruto.contains("ficha_anamnese_maria.pdf"));
        assert!(!texto_bruto.contains("modelo_contrato.pdf"));

        // 7. Verificação com DEK errada deve falhar com Erro::Criptografia
        let dek_errada = gerar_dek();
        assert_eq!(
            verificar_integridade_backup(&caminho_backup, &dek_errada),
            Err(Erro::Criptografia)
        );

        // 8. Corromper 1 byte no final do arquivo .lcbackup deve ser detectado pela verificação AEAD
        let mut bytes_corrompidos = bytes_backup;
        let idx_ultimo = bytes_corrompidos.len() - 1;
        bytes_corrompidos[idx_ultimo] ^= 0xFF;
        let caminho_corrompido = dir.join("saida").join("corrompido.lotusbackup");
        fs::write(&caminho_corrompido, &bytes_corrompidos).expect("gravar corrompido");

        let dek_correta = state.dek.lock().unwrap().clone().unwrap();
        assert_eq!(
            verificar_integridade_backup(&caminho_corrompido, &dek_correta),
            Err(Erro::Criptografia)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn fluxo_completo_entrega_final_f9_t5_setup_chave_fase2_e_primeiro_backup() {
        let dir_origem = pasta_teste();
        let dir_restaurado = pasta_teste();
        let state = AppState::new(dir_origem.clone());

        // 1. Primeiro acesso assistido (T01): criação de senha mestra + chave de recuperação (6 grupos de 4 chars)
        let setup =
            executar_auth_setup_com_params(&state, "ConsultorioSeguro2026", params_argon_rapido())
                .expect("setup inicial com senha e chave de recuperação");
        assert_eq!(setup.chave_recuperacao.split('-').count(), 6);

        // 2. Cadastro de paciente + Grade Semanal Fixa (F9-T3) + aplicação na semana
        let paciente = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Beatriz Almeida Santos".to_string(),
                data_nascimento: Some("1988-05-14".to_string()),
                telefone: Some("(71) 98877-6655".to_string()),
                whatsapp: None,
                email: None,
                endereco: None,
                nome_mae: None,
                nome_pai: None,
                responsavel_nome: None,
                responsavel_parentesco: None,
                responsavel_telefone: None,
                contato_emergencia_nome: None,
                contato_emergencia_telefone: None,
                documento: None,
                ocupacao: None,
                motivo_procura: None,
                modalidade: Some("particular".to_string()),
                convenio_nome: None,
                valor_sessao_centavos: Some(18_000),
                observacoes: None,
            },
        )
        .expect("criar paciente");

        executar_horario_semanal_criar(
            &state,
            &DadosHorarioSemanalInput {
                paciente_id: paciente.id.clone(),
                dia_semana: 2, // Terça-feira
                hora_inicio: "14:00".to_string(),
                duracao_min: Some(50),
                observacao: Some("Horário fixo semanal".to_string()),
            },
        )
        .expect("criar horário semanal fixo");

        let aplicacao = executar_horarios_semanais_aplicar_semana(&state, "2026-11-02")
            .expect("aplicar grade fixa na semana");
        assert_eq!(aplicacao.criados, 1);

        // 3. Registro de sessão clínica e lançamentos financeiros (F9-T2)
        executar_sessao_criar(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-03".to_string(),
                resumo: "Sessão realizada conforme horário fixo de terça-feira.".to_string(),
            },
        )
        .expect("criar sessão");

        executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                tipo: "entrada".to_string(),
                data: "2026-11-03".to_string(),
                valor_centavos: 18_000,
                descricao: "Sessão Beatriz Almeida".to_string(),
                forma_pagamento: Some("pix".to_string()),
                paciente_id: Some(paciente.id.clone()),
            },
        )
        .expect("criar entrada financeira");

        executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                tipo: "gasto".to_string(),
                data: "2026-11-05".to_string(),
                valor_centavos: 4_500,
                descricao: "Material de papelaria do consultório".to_string(),
                forma_pagamento: Some("cartao".to_string()),
                paciente_id: None,
            },
        )
        .expect("criar gasto financeiro");

        // 4. Primeiro backup completo (.lotusbackup) e inspeção tanto com senha quanto com a chave impressa
        let caminho_backup = dir_origem
            .join("backups")
            .join("primeiro-backup-entrega.lotusbackup");
        let criado = {
            let dek_guard = state.dek.lock().unwrap();
            let conn_guard = state.conn.lock().unwrap();
            criar_backup(
                &dir_origem,
                conn_guard.as_ref().unwrap(),
                dek_guard.as_ref().unwrap(),
                &caminho_backup,
            )
            .expect("gerar primeiro backup")
        };
        assert!(criado.verificado);
        assert_eq!(criado.n_pacientes, 1);
        assert_eq!(criado.n_sessoes, 1);
        assert_eq!(criado.n_agendamentos, 1);

        let inspecao_chave = inspecionar_backup(&caminho_backup, &setup.chave_recuperacao)
            .expect("inspecionar backup usando a chave de recuperação impressa");
        assert_eq!(inspecao_chave.n_pacientes, 1);

        // 5. Restauração completa usando a chave de recuperação impressa e verificação dos dados da Fase 2
        let (dek_restaurada, resumo_rest) = restaurar_backup(
            &dir_restaurado,
            &caminho_backup,
            &setup.chave_recuperacao,
            None,
            None,
        )
        .expect("restaurar backup com chave de recuperação");
        assert_eq!(resumo_rest.n_pacientes, 1);

        let state_restaurado = AppState::new(dir_restaurado.clone());
        let conn_rest =
            abrir_banco(&dir_restaurado, &dek_restaurada).expect("abrir banco restaurado");
        *state_restaurado.dek.lock().unwrap() = Some(dek_restaurada);
        *state_restaurado.conn.lock().unwrap() = Some(conn_rest);

        let resumo_fin = executar_financeiro_resumo_mensal(&state_restaurado, "2026-11")
            .expect("resumo financeiro pós-restauração");
        assert_eq!(resumo_fin.total_entradas_centavos, 18_000);
        assert_eq!(resumo_fin.total_gastos_centavos, 4_500);
        assert_eq!(resumo_fin.saldo_centavos, 13_500);

        let grade_restaurada = executar_horarios_semanais_listar(&state_restaurado, None)
            .expect("listar grade semanal pós-restauração");
        assert_eq!(grade_restaurada.len(), 1);
        assert_eq!(grade_restaurada[0].hora_inicio, "14:00");

        let ags_semana = executar_agendamentos_listar(
            &state_restaurado,
            Some("2026-11-02"),
            Some("2026-11-08"),
            None,
        )
        .expect("listar agendamentos da semana pós-restauração");
        assert_eq!(ags_semana.len(), 1);
        assert_eq!(ags_semana[0].data, "2026-11-03");

        let _ = fs::remove_dir_all(&dir_origem);
        let _ = fs::remove_dir_all(&dir_restaurado);
    }

    #[test]
    fn aceita_cabecalho_com_magic_legado_lcbackup() {
        let dir = pasta_teste();
        let state = AppState::new(dir.clone());
        executar_auth_setup_com_params(&state, "SenhaMestraSegura2026", params_argon_rapido())
            .expect("setup");
        let vault = carregar_vault(&dir).expect("carregar vault");

        let cabecalho = CabecalhoBackup {
            versao: VERSAO_FORMATO_BACKUP,
            criado_em: "2026-11-06T20:00:00Z".to_string(),
            vault,
        };
        let cabecalho_json = serde_json::to_vec(&cabecalho).expect("serializar cabecalho");
        let tam_u32 = cabecalho_json.len() as u32;

        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC_BACKUP_LEGACY);
        bytes.extend_from_slice(&VERSAO_FORMATO_BACKUP.to_be_bytes());
        bytes.extend_from_slice(&tam_u32.to_be_bytes());
        bytes.extend_from_slice(&cabecalho_json);

        let mut cursor = std::io::Cursor::new(bytes);
        let cabecalho_lido =
            ler_cabecalho_backup_de_leitor(&mut cursor).expect("deve aceitar cabeçalho legado");
        assert_eq!(cabecalho_lido.versao, 1);
        let _ = fs::remove_dir_all(&dir);
    }
}
