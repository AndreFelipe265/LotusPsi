-- Migração 002: Tabela de agendamentos da Agenda (F4.5-T2 — Seção 6 da Fonte da Verdade, RN70–RN77)

CREATE TABLE IF NOT EXISTS agendamentos (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                 -- ISO AAAA-MM-DD
  hora_inicio TEXT NOT NULL,          -- HH:MM
  duracao_min INTEGER NOT NULL DEFAULT 50,
  observacao TEXT CHECK (length(observacao) <= 200),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data, hora_inicio);
