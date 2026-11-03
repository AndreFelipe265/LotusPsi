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
