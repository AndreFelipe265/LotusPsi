import { invoke } from "@tauri-apps/api/core";
import type {
  DadosPacienteInput,
  ErroApi,
  FiltroPacientes,
  Paciente,
  PacienteResumo,
  RespostaSetupAuth,
  StatusAuth,
  StatusPaciente,
} from "./types";

export const EVENTO_SESSAO_BLOQUEADA = "lc:sessao-bloqueada";

/**
 * Wrapper tipado para chamadas `invoke` ao backend Rust.
 * O frontend nunca acessa disco, banco ou chaves diretamente (Seção 3 da Fonte da Verdade).
 * Todo comando de dados que retornar `Erro::Bloqueado` dispara o evento de bloqueio de sessão.
 */
export async function invocarComando<T>(
  comando: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(comando, args);
  } catch (erro) {
    const erroApi = extrairErroApi(erro);
    if (erroApi.codigo === "BLOQUEADO" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_BLOQUEADA));
    }
    throw erro;
  }
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

export function pacientesListar(
  filtro?: FiltroPacientes,
): Promise<PacienteResumo[]> {
  return invocarComando<PacienteResumo[]>("pacientes_listar", {
    busca: filtro?.busca,
    status: filtro?.status,
  });
}

export function pacienteObter(id: string): Promise<Paciente> {
  return invocarComando<Paciente>("paciente_obter", { id });
}

export function pacienteCriar(dados: DadosPacienteInput): Promise<Paciente> {
  return invocarComando<Paciente>("paciente_criar", { dados });
}

export function pacienteAtualizar(
  id: string,
  dados: DadosPacienteInput,
): Promise<Paciente> {
  return invocarComando<Paciente>("paciente_atualizar", { id, dados });
}

export function pacienteDefinirStatus(
  id: string,
  status: StatusPaciente,
): Promise<Paciente> {
  return invocarComando<Paciente>("paciente_definir_status", { id, status });
}

export function pacienteExcluir(
  id: string,
  confirmacaoNome: string,
): Promise<void> {
  return invocarComando<void>("paciente_excluir", {
    id,
    confirmacaoNome,
    confirmacao_nome: confirmacaoNome,
  });
}
