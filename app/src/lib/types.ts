/**
 * Tipos de domínio compartilhados com o backend Rust (Tauri).
 */

export interface ErroApi {
  codigo: string;
  mensagem: string;
}

export interface StatusAuth {
  configurado: boolean;
  desbloqueado: boolean;
  bloqueado_ate?: number;
  bloqueado_segundos_restantes?: number;
}

export interface RespostaSetupAuth {
  chave_recuperacao: string;
}

export type StatusPaciente = "ativo" | "inativo";
export type ModalidadeAtendimento = "particular" | "convenio";

export interface PacienteResumo {
  id: string;
  nome: string;
  data_nascimento?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  status: StatusPaciente;
  ultima_sessao?: string | null;
}

export interface Paciente {
  id: string;
  nome: string;
  data_nascimento?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  endereco?: string | null;
  nome_mae?: string | null;
  nome_pai?: string | null;
  responsavel_nome?: string | null;
  responsavel_parentesco?: string | null;
  responsavel_telefone?: string | null;
  contato_emergencia_nome?: string | null;
  contato_emergencia_telefone?: string | null;
  documento?: string | null;
  ocupacao?: string | null;
  motivo_procura?: string | null;
  modalidade?: ModalidadeAtendimento | null;
  convenio_nome?: string | null;
  valor_sessao_centavos?: number | null;
  observacoes?: string | null;
  status: StatusPaciente;
  inativado_em?: string | null;
  criado_em: string;
  atualizado_em: string;
  total_sessoes: number;
  ultima_sessao?: string | null;
}

export interface DadosPacienteInput {
  nome: string;
  data_nascimento?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  endereco?: string | null;
  nome_mae?: string | null;
  nome_pai?: string | null;
  responsavel_nome?: string | null;
  responsavel_parentesco?: string | null;
  responsavel_telefone?: string | null;
  contato_emergencia_nome?: string | null;
  contato_emergencia_telefone?: string | null;
  documento?: string | null;
  ocupacao?: string | null;
  motivo_procura?: string | null;
  modalidade?: ModalidadeAtendimento | null;
  convenio_nome?: string | null;
  valor_sessao_centavos?: number | null;
  observacoes?: string | null;
}

export interface FiltroPacientes {
  busca?: string;
  status?: StatusPaciente | "todos";
}

export interface Sessao {
  id: string;
  paciente_id: string;
  data: string;
  resumo: string;
  criado_em: string;
  atualizado_em: string;
}

export interface DadosSessaoCriarInput {
  paciente_id: string;
  data: string;
  resumo: string;
}

export interface DadosSessaoAtualizarInput {
  data: string;
  resumo: string;
}

export interface Agendamento {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  data: string;
  hora_inicio: string;
  duracao_min: number;
  observacao?: string | null;
  criado_em: string;
  atualizado_em: string;
  conflito: boolean;
  conflito_descricao?: string | null;
}

export interface DadosAgendamentoInput {
  paciente_id: string;
  data: string;
  hora_inicio: string;
  duracao_min?: number | null;
  observacao?: string | null;
}

export interface FiltroAgendamentos {
  data_inicio?: string;
  data_fim?: string;
  paciente_id?: string;
}

export interface Aniversariante {
  id: string;
  nome: string;
  data_nascimento: string;
  data_comemoracao: string;
  idade_completando: number;
  dias_ate_aniversario: number;
  status: StatusPaciente;
  telefone?: string | null;
  whatsapp?: string | null;
}

export interface CategoriaDocumento {
  id: string;
  nome: string;
  ordem: number;
  total_documentos: number;
}

export interface Documento {
  id: string;
  categoria_id?: string | null;
  categoria_nome?: string | null;
  nome_original: string;
  descricao?: string | null;
  mime: string;
  tamanho_bytes: number;
  sha256: string;
  enviado_em: string;
  atualizado_em: string;
}

export interface FiltroDocumentos {
  busca?: string;
  categoria_id?: string | null;
}

export interface DadosDocumentoEnviarInput {
  caminho_origem: string;
  categoria_id?: string | null;
  descricao?: string | null;
  nome_original?: string | null;
  conteudo_base64?: string | null;
}

export interface DadosDocumentoAtualizarInput {
  nome_original: string;
  categoria_id?: string | null;
  descricao?: string | null;
}

export interface Anamnese {
  id: string;
  paciente_id: string;
  nome_original: string;
  mime: string;
  tamanho_bytes: number;
  sha256: string;
  enviado_em: string;
}

export interface DadosAnamneseAnexarInput {
  paciente_id: string;
  caminho_origem: string;
  nome_original?: string | null;
  conteudo_base64?: string | null;
}

export interface ResultadoBackupCriado {
  caminho_arquivo: string;
  nome_arquivo: string;
  tamanho: number;
  tamanho_bytes: number;
  criado_em: string;
  verificado: boolean;
  n_pacientes: number;
  n_sessoes: number;
  n_agendamentos: number;
  n_documentos: number;
  n_anamneses: number;
}

export interface InspecaoBackup {
  data: string;
  criado_em: string;
  n_pacientes: number;
  n_documentos: number;
  n_anamneses: number;
  n_agendamentos: number;
  n_sessoes: number;
  tamanho_bytes: number;
}

export interface ResultadoBackupRestaurado {
  data: string;
  criado_em: string;
  n_pacientes: number;
  n_documentos: number;
  n_anamneses: number;
  n_agendamentos: number;
  n_sessoes: number;
  caminho_copia_seguranca?: string | null;
}

export interface DadosBackupInspecionarOuRestaurarInput {
  caminho: string;
  senha: string;
  conteudo_base64?: string | null;
}

export type TipoLancamentoFinanceiro = "entrada" | "gasto";
export type FormaPagamento =
  | "pix"
  | "dinheiro"
  | "cartao"
  | "transferencia"
  | "convenio";

export interface LancamentoFinanceiro {
  id: string;
  paciente_id?: string | null;
  paciente_nome?: string | null;
  tipo: TipoLancamentoFinanceiro;
  data: string;
  valor_centavos: number;
  descricao: string;
  forma_pagamento?: FormaPagamento | null;
  criado_em: string;
  atualizado_em: string;
}

export interface DadosLancamentoFinanceiroInput {
  paciente_id?: string | null;
  tipo: TipoLancamentoFinanceiro;
  data: string;
  valor_centavos: number;
  descricao: string;
  forma_pagamento?: FormaPagamento | null;
}

export interface FiltroFinanceiro {
  ano_mes?: string;
  tipo?: TipoLancamentoFinanceiro | "todos";
  busca?: string;
  paciente_id?: string;
}

export interface ResumoFinanceiroMensal {
  ano_mes: string;
  total_entradas_centavos: number;
  total_gastos_centavos: number;
  saldo_centavos: number;
  quantidade_entradas: number;
  quantidade_gastos: number;
  quantidade_lancamentos: number;
}

export interface HorarioSemanal {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  paciente_status: StatusPaciente;
  dia_semana: number;
  hora_inicio: string;
  duracao_min: number;
  observacao?: string | null;
  criado_em: string;
  atualizado_em: string;
  conflito: boolean;
  conflito_descricao?: string | null;
}

export interface DadosHorarioSemanalInput {
  paciente_id: string;
  dia_semana: number;
  hora_inicio: string;
  duracao_min?: number | null;
  observacao?: string | null;
}

export interface ResultadoAplicarGradeSemana {
  data_inicio_semana: string;
  data_fim_semana: string;
  criados: number;
  ignorados_existentes: number;
}





