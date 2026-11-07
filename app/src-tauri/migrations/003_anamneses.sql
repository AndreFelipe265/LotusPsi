-- Migração 003: Tabela de anexos de anamnese por paciente (RN65–RN68 — Seção 6 da Fonte da Verdade)

CREATE TABLE IF NOT EXISTS anamneses (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  nome_original TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  enviado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anamneses_paciente ON anamneses(paciente_id);
