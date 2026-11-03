//! Módulo de banco de dados: conexão SQLCipher, PRAGMAs (WAL, foreign_keys) e migrações (F1-T3).

use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use rusqlite::Connection;
use zeroize::Zeroize;

use crate::crypto::codificar_hex;
use crate::error::{Erro, Resultado};
use crate::state::Key;

/// SQL da migração inicial (Seção 6 da Fonte da Verdade).
pub const MIGRACAO_001_INICIAL: &str = include_str!("../migrations/001_inicial.sql");

/// SQL da migração 002: tabela `agendamentos` (F4.5-T2 — Seção 6 da Fonte da Verdade).
pub const MIGRACAO_002_AGENDAMENTOS: &str = include_str!("../migrations/002_agendamentos.sql");

/// Nome do arquivo do banco de dados SQLCipher na pasta de dados.
pub const NOME_ARQUIVO_BANCO: &str = "pacientes.db";

/// Retorna o caminho do arquivo do banco de dados dentro de `data_dir`.
pub fn caminho_banco(data_dir: &Path) -> PathBuf {
    data_dir.join(NOME_ARQUIVO_BANCO)
}

/// Abre o banco SQLCipher em `data_dir/pacientes.db` usando a DEK de 32 bytes,
/// ativa `WAL` e `foreign_keys = ON`, e executa as migrações pendentes.
pub fn abrir_banco(data_dir: &Path, dek: &Key) -> Resultado<Connection> {
    fs::create_dir_all(data_dir)?;
    let caminho = caminho_banco(data_dir);
    abrir_banco_em_caminho(&caminho, dek)
}

/// Abre o banco SQLCipher no caminho especificado usando a DEK, configura os PRAGMAs e aplica migrações.
pub fn abrir_banco_em_caminho(caminho: &Path, dek: &Key) -> Resultado<Connection> {
    let mut conn = Connection::open(caminho)?;

    // Formato de chave bruta de 256 bits do SQLCipher: x'<64 caracteres hex>'
    let mut hex_dek = codificar_hex(dek.as_bytes());
    let mut pragma_key = format!("x'{}'", hex_dek);
    hex_dek.zeroize();

    let res_key = conn.pragma_update(None, "key", &pragma_key);
    pragma_key.zeroize();
    res_key.map_err(|_| Erro::Criptografia)?;

    // Valida imediatamente que a chave decifra o cabeçalho do banco
    conn.query_row("SELECT count(*) FROM sqlite_master;", [], |_row| Ok(()))
        .map_err(|_| Erro::Criptografia)?;

    // Regras da Seção 6 e Seção 9: foreign_keys = ON e journal_mode = WAL
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let _: String = conn.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
    conn.query_row("PRAGMA journal_mode = WAL;", [], |_row| Ok(()))?;

    aplicar_migracoes(&mut conn)?;

    Ok(conn)
}

/// Aplica as migrações versionadas de forma transacional e idempotente.
pub fn aplicar_migracoes(conn: &mut Connection) -> Resultado<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            versao INTEGER PRIMARY KEY,
            aplicado_em TEXT NOT NULL
        );",
    )?;

    let versao_1_aplicada: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE versao = 1);",
        [],
        |row| row.get(0),
    )?;

    if !versao_1_aplicada {
        let tx = conn.transaction()?;
        tx.execute_batch(MIGRACAO_001_INICIAL)?;
        let agora = Local::now().to_rfc3339();
        tx.execute(
            "INSERT INTO schema_migrations (versao, aplicado_em) VALUES (1, ?1);",
            [&agora],
        )?;
        tx.commit()?;
    }

    let versao_2_aplicada: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE versao = 2);",
        [],
        |row| row.get(0),
    )?;

    if !versao_2_aplicada {
        let tx = conn.transaction()?;
        tx.execute_batch(MIGRACAO_002_AGENDAMENTOS)?;
        let agora = Local::now().to_rfc3339();
        tx.execute(
            "INSERT INTO schema_migrations (versao, aplicado_em) VALUES (2, ?1);",
            [&agora],
        )?;
        tx.commit()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::gerar_dek;
    use uuid::Uuid;

    fn pasta_temporaria_teste() -> PathBuf {
        std::env::temp_dir().join(format!("lc-pacientes-db-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn abre_sqlcipher_configura_wal_foreign_keys_e_aplica_migracao_001() {
        let dir = pasta_temporaria_teste();
        let dek = gerar_dek();

        let conn = abrir_banco(&dir, &dek).expect("abrir banco com DEK");

        // Verifica PRAGMA foreign_keys = ON (1)
        let fk: i64 = conn
            .pragma_query_value(None, "foreign_keys", |r| r.get(0))
            .expect("consultar foreign_keys");
        assert_eq!(fk, 1);

        // Verifica PRAGMA journal_mode = wal
        let journal: String = conn
            .pragma_query_value(None, "journal_mode", |r| r.get(0))
            .expect("consultar journal_mode");
        assert_eq!(journal.to_lowercase(), "wal");

        // Verifica que a migração 1 foi registrada e as tabelas existem
        let qtd_migracoes: i64 = conn
            .query_row(
                "SELECT count(*) FROM schema_migrations WHERE versao = 1;",
                [],
                |r| r.get(0),
            )
            .expect("consultar schema_migrations");
        assert_eq!(qtd_migracoes, 1);

        for tabela in [
            "config",
            "pacientes",
            "sessoes",
            "categorias_documento",
            "documentos",
            "agendamentos",
            "schema_migrations",
        ] {
            let existe: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1);",
                    [tabela],
                    |r| r.get(0),
                )
                .expect("verificar tabela");
            assert!(existe, "Tabela {} deveria existir", tabela);
        }

        let qtd_inicial: i64 = conn
            .query_row("SELECT count(*) FROM schema_migrations;", [], |r| r.get(0))
            .expect("consultar total de migrações");
        assert!(qtd_inicial >= 2);

        drop(conn);

        // Reabrir com a mesma DEK deve funcionar e manter a mesma quantidade de migrações
        let conn2 = abrir_banco(&dir, &dek).expect("reabrir banco com mesma DEK");
        let qtd_migracoes_2: i64 = conn2
            .query_row("SELECT count(*) FROM schema_migrations;", [], |r| r.get(0))
            .expect("consultar schema_migrations");
        assert_eq!(qtd_migracoes_2, qtd_inicial);
        drop(conn2);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn banco_em_disco_nao_abre_sem_chave_ou_com_chave_errada() {
        let dir = pasta_temporaria_teste();
        let dek = gerar_dek();

        let conn = abrir_banco(&dir, &dek).expect("criar banco cifrado");
        conn.execute(
            "INSERT INTO config (chave, valor) VALUES ('teste', 'segredo');",
            [],
        )
        .expect("inserir config");
        drop(conn);

        let caminho = caminho_banco(&dir);

        // 1. Tentar abrir sem chave (como sqlite3 comum) deve falhar ao ler sqlite_master
        let conn_sem_chave = Connection::open(&caminho).expect("abrir arquivo bruto");
        let res_sem_chave: rusqlite::Result<i64> =
            conn_sem_chave.query_row("SELECT count(*) FROM sqlite_master;", [], |r| r.get(0));
        assert!(
            res_sem_chave.is_err(),
            "Banco SQLCipher não deve abrir sem chave"
        );
        drop(conn_sem_chave);

        // 2. Tentar abrir com outra DEK deve retornar Erro::Criptografia
        let dek_errada = gerar_dek();
        let res_dek_errada = abrir_banco(&dir, &dek_errada);
        assert!(res_dek_errada.is_err());
        assert_eq!(res_dek_errada.unwrap_err(), Erro::Criptografia);

        // 3. Os primeiros 16 bytes do arquivo em disco NÃO podem ser "SQLite format 3\0"
        let bytes = fs::read(&caminho).expect("ler bytes do arquivo");
        assert!(bytes.len() >= 16);
        assert_ne!(&bytes[..16], b"SQLite format 3\0");

        // 4. Critério de aceite F1: testar com o binário `sqlite3` que o arquivo não abre sem a chave
        if let Ok(output) = std::process::Command::new("sqlite3")
            .arg(&caminho)
            .arg("SELECT count(*) FROM sqlite_master;")
            .output()
        {
            assert!(
                !output.status.success(),
                "O binário sqlite3 não deve conseguir ler o banco cifrado sem a chave"
            );
        }

        let _ = fs::remove_dir_all(&dir);
    }
}
