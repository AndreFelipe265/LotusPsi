import { invoke } from "@tauri-apps/api/core";
import type {
  Agendamento,
  DadosAgendamentoInput,
  DadosPacienteInput,
  DadosSessaoAtualizarInput,
  DadosSessaoCriarInput,
  ErroApi,
  FiltroAgendamentos,
  FiltroPacientes,
  Paciente,
  PacienteResumo,
  RespostaSetupAuth,
  Sessao,
  StatusAuth,
  StatusPaciente,
} from "./types";

export const EVENTO_SESSAO_BLOQUEADA = "lc:sessao-bloqueada";
export const EVENTO_SESSAO_DESBLOQUEADA = "lc:sessao-desbloqueada";

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

export function sessoesListar(pacienteId: string): Promise<Sessao[]> {
  return invocarComando<Sessao[]>("sessoes_listar", {
    pacienteId,
    paciente_id: pacienteId,
  });
}

export function sessaoCriar(dados: DadosSessaoCriarInput): Promise<Sessao> {
  return invocarComando<Sessao>("sessao_criar", { dados });
}

export function sessaoAtualizar(
  id: string,
  dados: DadosSessaoAtualizarInput,
): Promise<Sessao> {
  return invocarComando<Sessao>("sessao_atualizar", { id, dados });
}

export function sessaoExcluir(id: string): Promise<void> {
  return invocarComando<void>("sessao_excluir", { id });
}

export function boasVindasObter(): Promise<string> {
  return invocarComando<string>("boas_vindas_obter");
}

export function configObter(chave: string): Promise<string | null> {
  return invocarComando<string | null>("config_obter", { chave });
}

export function configDefinir(chave: string, valor: string): Promise<void> {
  return invocarComando<void>("config_definir", { chave, valor });
}

export function agendamentosListar(
  filtro?: FiltroAgendamentos,
): Promise<Agendamento[]> {
  return invocarComando<Agendamento[]>("agendamentos_listar", {
    dataInicio: filtro?.data_inicio,
    data_inicio: filtro?.data_inicio,
    dataFim: filtro?.data_fim,
    data_fim: filtro?.data_fim,
    pacienteId: filtro?.paciente_id,
    paciente_id: filtro?.paciente_id,
  });
}

export function agendamentosVerificarConflito(params: {
  data: string;
  hora_inicio: string;
  duracao_min?: number | null;
  ignorar_id?: string | null;
}): Promise<Agendamento[]> {
  return invocarComando<Agendamento[]>("agendamentos_verificar_conflito", {
    data: params.data,
    horaInicio: params.hora_inicio,
    hora_inicio: params.hora_inicio,
    duracaoMin: params.duracao_min ?? 50,
    duracao_min: params.duracao_min ?? 50,
    ignorarId: params.ignorar_id ?? null,
    ignorar_id: params.ignorar_id ?? null,
  });
}

export function agendamentoCriar(
  dados: DadosAgendamentoInput,
): Promise<Agendamento> {
  return invocarComando<Agendamento>("agendamento_criar", { dados });
}

export function agendamentoAtualizar(
  id: string,
  dados: DadosAgendamentoInput,
): Promise<Agendamento> {
  return invocarComando<Agendamento>("agendamento_atualizar", { id, dados });
}

export function agendamentoExcluir(id: string): Promise<void> {
  return invocarComando<void>("agendamento_excluir", { id });
}

export function agendamentoProximoPaciente(
  pacienteId: string,
): Promise<Agendamento | null> {
  return invocarComando<Agendamento | null>("agendamento_proximo_paciente", {
    pacienteId,
    paciente_id: pacienteId,
  });
}
