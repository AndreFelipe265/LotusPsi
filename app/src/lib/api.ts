import { invoke } from "@tauri-apps/api/core";
import type { ErroApi, RespostaSetupAuth, StatusAuth } from "./types";

/**
 * Wrapper tipado para chamadas `invoke` ao backend Rust.
 * O frontend nunca acessa disco, banco ou chaves diretamente (Seção 3 da Fonte da Verdade).
 */
export async function invocarComando<T>(
  comando: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(comando, args);
}

/**
 * Normaliza qualquer erro retornado pelo Tauri para o formato `ErroApi`.
 */
export function extrairErroApi(erro: unknown): ErroApi {
  if (
    typeof erro === "object" &&
    erro !== null &&
    "codigo" in erro &&
    "mensagem" in erro
  ) {
    const obj = erro as { codigo: unknown; mensagem: unknown };
    if (typeof obj.codigo === "string" && typeof obj.mensagem === "string") {
      return { codigo: obj.codigo, mensagem: obj.mensagem };
    }
  }
  if (typeof erro === "string") {
    try {
      const parsed = JSON.parse(erro) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "codigo" in parsed &&
        "mensagem" in parsed
      ) {
        return parsed as ErroApi;
      }
    } catch {
      return { codigo: "INTERNO", mensagem: erro };
    }
  }
  return {
    codigo: "INTERNO",
    mensagem: "Ocorreu um erro inesperado. Tente novamente.",
  };
}

export function authStatus(): Promise<StatusAuth> {
  return invocarComando<StatusAuth>("auth_status");
}

export function authSetup(senha: string): Promise<RespostaSetupAuth> {
  return invocarComando<RespostaSetupAuth>("auth_setup", { senha });
}

export function authLogin(senha: string): Promise<void> {
  return invocarComando<void>("auth_login", { senha });
}

export function authLock(): Promise<void> {
  return invocarComando<void>("auth_lock");
}

export function authChangePassword(atual: string, nova: string): Promise<void> {
  return invocarComando<void>("auth_change_password", { atual, nova });
}

export function authRecover(chave: string, novaSenha: string): Promise<void> {
  return invocarComando<void>("auth_recover", {
    chave,
    novaSenha,
    nova_senha: novaSenha,
  });
}
