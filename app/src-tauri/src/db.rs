//! Módulo de banco de dados: conexão SQLCipher, PRAGMAs (WAL, foreign_keys) e migrações (F1-T3).

pub const MIGRACAO_001_INICIAL: &str = include_str!("../migrations/001_inicial.sql");
