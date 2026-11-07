-- Migração 004: Tabela lancamentos_financeiros (F9-T2 — RN80–RN86, Seção 6 da Fonte da Verdade)

CREATE TABLE lancamentos_financeiros (
  id TEXT PRIMARY KEY,
  paciente_id TEXT REFERENCES pacientes(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','gasto')),
  data TEXT NOT NULL,                 -- ISO AAAA-MM-DD
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  descricao TEXT NOT NULL CHECK (length(descricao) <= 200),
  forma_pagamento TEXT CHECK (forma_pagamento IN ('pix','dinheiro','cartao','transferencia','convenio')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX idx_lancamentos_data ON lancamentos_financeiros(data DESC);
CREATE INDEX idx_lancamentos_paciente ON lancamentos_financeiros(paciente_id);
