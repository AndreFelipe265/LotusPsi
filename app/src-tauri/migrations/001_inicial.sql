-- Migração 001: Esquema inicial (Seção 6 da Fonte da Verdade)

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pacientes (
  id TEXT PRIMARY KEY,                -- UUID v4
  nome TEXT NOT NULL,
  nome_busca TEXT NOT NULL,           -- nome normalizado (minúsculo, sem acento)
  data_nascimento TEXT,               -- ISO AAAA-MM-DD
  telefone TEXT,                      -- só dígitos, com DDD
  whatsapp TEXT,                      -- só dígitos; se vazio usa telefone
  email TEXT,
  endereco TEXT,
  nome_mae TEXT,
  nome_pai TEXT,
  responsavel_nome TEXT,
  responsavel_parentesco TEXT,
  responsavel_telefone TEXT,
  contato_emergencia_nome TEXT,
  contato_emergencia_telefone TEXT,
  documento TEXT,                     -- CPF ou RG (texto livre)
  ocupacao TEXT,                      -- profissão ou escola/série
  motivo_procura TEXT,
  modalidade TEXT CHECK (modalidade IN ('particular','convenio')),
  convenio_nome TEXT,
  valor_sessao_centavos INTEGER,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  inativado_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pacientes_busca ON pacientes(nome_busca);
CREATE INDEX IF NOT EXISTS idx_pacientes_status ON pacientes(status);

CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                 -- ISO AAAA-MM-DD
  resumo TEXT NOT NULL CHECK (length(resumo) <= 600),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_paciente_data ON sessoes(paciente_id, data DESC);

CREATE TABLE IF NOT EXISTS categorias_documento (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documentos (
  id TEXT PRIMARY KEY,                -- também é o nome do arquivo cifrado em disco
  categoria_id TEXT REFERENCES categorias_documento(id),
  nome_original TEXT NOT NULL,
  descricao TEXT,
  mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,               -- do conteúdo original, para integridade
  enviado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  versao INTEGER PRIMARY KEY,
  aplicado_em TEXT NOT NULL
);
