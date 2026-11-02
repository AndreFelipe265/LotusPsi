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
