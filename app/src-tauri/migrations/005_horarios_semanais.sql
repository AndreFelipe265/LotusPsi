-- Migração 005: Tabela horarios_semanais (F9-T3 — RN90–RN95, Seção 6 da Fonte da Verdade)

CREATE TABLE horarios_semanais (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  hora_inicio TEXT NOT NULL,          -- HH:MM
  duracao_min INTEGER NOT NULL DEFAULT 50,
  observacao TEXT CHECK (length(observacao) <= 200),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX idx_horarios_semanais_dia ON horarios_semanais(dia_semana, hora_inicio);
CREATE INDEX idx_horarios_semanais_paciente ON horarios_semanais(paciente_id);
