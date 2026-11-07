import { invoke } from "@tauri-apps/api/core";
import type {
  Agendamento,
  Anamnese,
  Aniversariante,
  CategoriaDocumento,
  DadosAgendamentoInput,
  DadosAnamneseAnexarInput,
  DadosBackupInspecionarOuRestaurarInput,
  DadosDocumentoAtualizarInput,
  DadosDocumentoEnviarInput,
  DadosHorarioSemanalInput,
  DadosLancamentoFinanceiroInput,
  DadosPacienteInput,
  DadosSessaoAtualizarInput,
  DadosSessaoCriarInput,
  Documento,
  ErroApi,
  FiltroAgendamentos,
  FiltroDocumentos,
  FiltroFinanceiro,
  FiltroPacientes,
  HorarioSemanal,
  InspecaoBackup,
  LancamentoFinanceiro,
  Paciente,
  PacienteResumo,
  RespostaSetupAuth,
  ResumoFinanceiroMensal,
  ResultadoAplicarGradeSemana,
  ResultadoBackupCriado,
  ResultadoBackupRestaurado,
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

export function aniversariantesListar(
  dias: number = 7,
): Promise<Aniversariante[]> {
  return invocarComando<Aniversariante[]>("aniversariantes", { dias });
}

export function whatsappParabens(pacienteId: string): Promise<string> {
  return invocarComando<string>("whatsapp_parabens", {
    pacienteId,
    paciente_id: pacienteId,
  });
}

export function categoriasListar(): Promise<CategoriaDocumento[]> {
  return invocarComando<CategoriaDocumento[]>("categorias_listar");
}

export function categoriaCriar(nome: string): Promise<CategoriaDocumento> {
  return invocarComando<CategoriaDocumento>("categoria_criar", { nome });
}

export function categoriaRenomear(
  id: string,
  nome: string,
): Promise<CategoriaDocumento> {
  return invocarComando<CategoriaDocumento>("categoria_renomear", { id, nome });
}

export function categoriaExcluir(id: string): Promise<void> {
  return invocarComando<void>("categoria_excluir", { id });
}

export function documentosListar(
  filtro?: FiltroDocumentos,
): Promise<Documento[]> {
  return invocarComando<Documento[]>("documentos_listar", {
    busca: filtro?.busca,
    categoriaId: filtro?.categoria_id ?? null,
    categoria_id: filtro?.categoria_id ?? null,
  });
}

export function documentoEnviar(
  dados: DadosDocumentoEnviarInput,
): Promise<Documento> {
  return invocarComando<Documento>("documento_enviar", {
    caminhoOrigem: dados.caminho_origem,
    caminho_origem: dados.caminho_origem,
    categoriaId: dados.categoria_id ?? null,
    categoria_id: dados.categoria_id ?? null,
    descricao: dados.descricao ?? null,
    nomeOriginal: dados.nome_original ?? null,
    nome_original: dados.nome_original ?? null,
    conteudoBase64: dados.conteudo_base64 ?? null,
    conteudo_base64: dados.conteudo_base64 ?? null,
  });
}

export function documentoBaixar(
  id: string,
  caminhoDestino?: string | null,
): Promise<string> {
  return invocarComando<string>("documento_baixar", {
    id,
    caminhoDestino: caminhoDestino ?? null,
    caminho_destino: caminhoDestino ?? null,
  });
}

export function documentoAbrir(id: string): Promise<string> {
  return invocarComando<string>("documento_abrir", { id });
}

export function documentoAtualizar(
  id: string,
  dados: DadosDocumentoAtualizarInput,
): Promise<Documento> {
  return invocarComando<Documento>("documento_atualizar", {
    id,
    dados,
    nomeOriginal: dados.nome_original,
    nome_original: dados.nome_original,
    categoriaId: dados.categoria_id ?? null,
    categoria_id: dados.categoria_id ?? null,
    descricao: dados.descricao ?? null,
  });
}

export function documentoExcluir(id: string): Promise<void> {
  return invocarComando<void>("documento_excluir", { id });
}

export function anamnesesListar(pacienteId: string): Promise<Anamnese[]> {
  return invocarComando<Anamnese[]>("anamneses_listar", {
    pacienteId,
    paciente_id: pacienteId,
  });
}

export function anamneseAnexar(
  dados: DadosAnamneseAnexarInput,
): Promise<Anamnese> {
  return invocarComando<Anamnese>("anamnese_anexar", {
    pacienteId: dados.paciente_id,
    paciente_id: dados.paciente_id,
    caminhoOrigem: dados.caminho_origem,
    caminho_origem: dados.caminho_origem,
    nomeOriginal: dados.nome_original ?? null,
    nome_original: dados.nome_original ?? null,
    conteudoBase64: dados.conteudo_base64 ?? null,
    conteudo_base64: dados.conteudo_base64 ?? null,
  });
}

export function anamneseBaixar(
  id: string,
  caminhoDestino?: string | null,
): Promise<string> {
  return invocarComando<string>("anamnese_baixar", {
    id,
    caminhoDestino: caminhoDestino ?? null,
    caminho_destino: caminhoDestino ?? null,
  });
}

export function anamneseAbrir(id: string): Promise<string> {
  return invocarComando<string>("anamnese_abrir", { id });
}

export function anamneseExcluir(id: string): Promise<void> {
  return invocarComando<void>("anamnese_excluir", { id });
}

export function backupCriar(
  caminhoDestino?: string | null,
): Promise<ResultadoBackupCriado> {
  return invocarComando<ResultadoBackupCriado>("backup_criar", {
    caminhoDestino: caminhoDestino ?? null,
    caminho_destino: caminhoDestino ?? null,
  });
}

export function backupObterCaminhoPadrao(): Promise<string> {
  return invocarComando<string>("backup_obter_caminho_padrao");
}

export function backupSelecionarDestino(
  caminhoAtual?: string | null,
): Promise<string | null> {
  return invocarComando<string | null>("backup_selecionar_destino", {
    caminhoAtual: caminhoAtual ?? null,
    caminho_atual: caminhoAtual ?? null,
  });
}

export function backupInspecionar(
  dados: DadosBackupInspecionarOuRestaurarInput,
): Promise<InspecaoBackup> {
  return invocarComando<InspecaoBackup>("backup_inspecionar", {
    caminho: dados.caminho,
    senha: dados.senha,
    conteudoBase64: dados.conteudo_base64 ?? null,
    conteudo_base64: dados.conteudo_base64 ?? null,
  });
}

export function backupRestaurar(
  dados: DadosBackupInspecionarOuRestaurarInput,
): Promise<ResultadoBackupRestaurado> {
  return invocarComando<ResultadoBackupRestaurado>("backup_restaurar", {
    caminho: dados.caminho,
    senha: dados.senha,
    conteudoBase64: dados.conteudo_base64 ?? null,
    conteudo_base64: dados.conteudo_base64 ?? null,
  });
}

export function financeiroListar(
  filtro?: FiltroFinanceiro,
): Promise<LancamentoFinanceiro[]> {
  return invocarComando<LancamentoFinanceiro[]>("financeiro_listar", {
    anoMes: filtro?.ano_mes ?? null,
    ano_mes: filtro?.ano_mes ?? null,
    tipo: filtro?.tipo ?? null,
    busca: filtro?.busca ?? null,
    pacienteId: filtro?.paciente_id ?? null,
    paciente_id: filtro?.paciente_id ?? null,
  });
}

export function financeiroResumoMensal(
  anoMes: string,
): Promise<ResumoFinanceiroMensal> {
  return invocarComando<ResumoFinanceiroMensal>("financeiro_resumo_mensal", {
    anoMes,
    ano_mes: anoMes,
  });
}

export function financeiroCriar(
  dados: DadosLancamentoFinanceiroInput,
): Promise<LancamentoFinanceiro> {
  return invocarComando<LancamentoFinanceiro>("financeiro_criar", { dados });
}

export function financeiroAtualizar(
  id: string,
  dados: DadosLancamentoFinanceiroInput,
): Promise<LancamentoFinanceiro> {
  return invocarComando<LancamentoFinanceiro>("financeiro_atualizar", {
    id,
    dados,
  });
}

export function financeiroExcluir(id: string): Promise<void> {
  return invocarComando<void>("financeiro_excluir", { id });
}

export function horariosSemanaisListar(
  pacienteId?: string | null,
): Promise<HorarioSemanal[]> {
  return invocarComando<HorarioSemanal[]>("horarios_semanais_listar", {
    pacienteId: pacienteId ?? null,
    paciente_id: pacienteId ?? null,
  });
}

export function horarioSemanalCriar(
  dados: DadosHorarioSemanalInput,
): Promise<HorarioSemanal> {
  return invocarComando<HorarioSemanal>("horario_semanal_criar", { dados });
}

export function horarioSemanalAtualizar(
  id: string,
  dados: DadosHorarioSemanalInput,
): Promise<HorarioSemanal> {
  return invocarComando<HorarioSemanal>("horario_semanal_atualizar", {
    id,
    dados,
  });
}

export function horarioSemanalExcluir(id: string): Promise<void> {
  return invocarComando<void>("horario_semanal_excluir", { id });
}

export function horariosSemanaisAplicarSemana(
  dataReferencia: string,
): Promise<ResultadoAplicarGradeSemana> {
  return invocarComando<ResultadoAplicarGradeSemana>(
    "horarios_semanais_aplicar_semana",
    {
      dataReferencia,
      data_referencia: dataReferencia,
    },
  );
}





