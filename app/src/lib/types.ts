/**
 * Tipos de domínio compartilhados com o backend Rust (Tauri).
 */

export interface ErroApi {
  codigo: string;
  mensagem: string;
}

export type StatusPaciente = "ativo" | "inativo";
export type ModalidadeAtendimento = "particular" | "convenio";
