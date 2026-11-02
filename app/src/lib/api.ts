import { invoke } from "@tauri-apps/api/core";

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
