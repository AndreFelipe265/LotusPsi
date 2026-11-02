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

export interface FiltroPacientes {
  busca?: string;
  status?: StatusPaciente | "todos";
}
