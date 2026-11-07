import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Button,
  ConfirmDialog,
  Input,
  Modal,
  SessaoModal,
  Toast,
} from "../components";
import {
  agendamentoAtualizar,
  agendamentoCriar,
  agendamentoExcluir,
  agendamentosListar,
  extrairErroApi,
  horarioSemanalAtualizar,
  horarioSemanalCriar,
  horarioSemanalExcluir,
  horariosSemanaisAplicarSemana,
  horariosSemanaisListar,
  pacientesListar,
} from "../lib/api";
import {
  aplicarMascaraDataBr,
  aplicarMascaraHoraBr,
  converterDataBrParaIso,
  deslocarDiasIso,
  deslocarMesesIso,
  DIAS_SEMANA_GRADE_ORDEM,
  formatarDataBr,
  formatarDiaSemanaCompletoBr,
  formatarMesAnoBr,
  intervalosHorariosConflitam,
  obterDataHojeIso,
  obterDiasDaSemana,
  obterDiasDoMes,
  validarHoraHhMm,
} from "../lib/format";
import type {
  Agendamento,
  HorarioSemanal,
  PacienteResumo,
} from "../lib/types";

export const DURACAO_PADRAO_MIN = 50;
export const LIMITE_OBSERVACAO_AGENDAMENTO = 200;

const NOMES_DIAS_SEMANA_CALENDARIO: readonly string[] = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
];

function limitarCaracteres(texto: string, limite: number): string {
  const chars = Array.from(texto);
  if (chars.length <= limite) return texto;
  return chars.slice(0, limite).join("");
}

function enriquecerConflitosLocais(lista: Agendamento[]): Agendamento[] {
  const copia = lista.map((item) => ({ ...item }));
  for (let i = 0; i < copia.length; i++) {
    const nomesConflitantes: string[] = [];
    for (let j = 0; j < copia.length; j++) {
      if (i === j) continue;
      if (
        copia[i].data === copia[j].data &&
        intervalosHorariosConflitam(
          copia[i].hora_inicio,
          copia[i].duracao_min,
          copia[j].hora_inicio,
          copia[j].duracao_min,
        )
      ) {
        nomesConflitantes.push(
          `${copia[j].paciente_nome} (${copia[j].hora_inicio})`,
        );
      }
    }
    if (nomesConflitantes.length > 0) {
      copia[i].conflito = true;
      copia[i].conflito_descricao =
        copia[i].conflito_descricao ??
        `Conflito de horário com ${nomesConflitantes.join(", ")}`;
    }
  }
  return copia.sort((a, b) => {
    const cmpData = a.data.localeCompare(b.data);
    if (cmpData !== 0) return cmpData;
    return a.hora_inicio.localeCompare(b.hora_inicio);
  });
}

function enriquecerConflitosGradeLocal(
  lista: HorarioSemanal[],
): HorarioSemanal[] {
  const copia = lista.map((item) => ({ ...item }));
  for (let i = 0; i < copia.length; i++) {
    const nomesConflitantes: string[] = [];
    for (let j = 0; j < copia.length; j++) {
      if (i === j) continue;
      if (
        copia[i].dia_semana === copia[j].dia_semana &&
        intervalosHorariosConflitam(
          copia[i].hora_inicio,
          copia[i].duracao_min,
          copia[j].hora_inicio,
          copia[j].duracao_min,
        )
      ) {
        nomesConflitantes.push(
          `${copia[j].paciente_nome} (${copia[j].hora_inicio})`,
        );
      }
    }
    if (nomesConflitantes.length > 0) {
      copia[i].conflito = true;
      copia[i].conflito_descricao =
        copia[i].conflito_descricao ??
        `Conflito na grade com ${nomesConflitantes.join(", ")}`;
    } else {
      copia[i].conflito = false;
      copia[i].conflito_descricao = null;
    }
  }
  return copia.sort((a, b) => {
    const ordA = a.dia_semana === 0 ? 7 : a.dia_semana;
    const ordB = b.dia_semana === 0 ? 7 : b.dia_semana;
    if (ordA !== ordB) return ordA - ordB;
    return a.hora_inicio.localeCompare(b.hora_inicio);
  });
}

export interface AgendaProps {
  dataHojeIso?: string;
}

export function Agenda({ dataHojeIso }: AgendaProps = {}) {
  const selectPacienteId = useId();
  const erroPacienteId = useId();
  const obsId = useId();
  const erroObsId = useId();
  const selectPacienteGradeId = useId();
  const selectDiaSemanaGradeId = useId();
  const obsGradeId = useId();

  const hojeIso = dataHojeIso ?? obterDataHojeIso();

  const [visao, setVisao] = useState<"semana" | "mes" | "grade">("semana");
  const [dataReferenciaIso, setDataReferenciaIso] = useState<string>(hojeIso);
  const [diaSelecionadoIso, setDiaSelecionadoIso] = useState<string | null>(null);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [horariosFixos, setHorariosFixos] = useState<HorarioSemanal[]>([]);
  const [aplicandoGrade, setAplicandoGrade] = useState<boolean>(false);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);

  // Estado do modal de horário semanal fixo (RN90–RN93)
  const [modalGradeAberto, setModalGradeAberto] = useState<boolean>(false);
  const [horarioEmEdicao, setHorarioEmEdicao] =
    useState<HorarioSemanal | null>(null);
  const [pacienteIdGradeForm, setPacienteIdGradeForm] = useState<string>("");
  const [diaSemanaGradeForm, setDiaSemanaGradeForm] = useState<number>(1);
  const [horaInicioGradeForm, setHoraInicioGradeForm] =
    useState<string>("09:00");
  const [duracaoMinGradeForm, setDuracaoMinGradeForm] = useState<string>(
    String(DURACAO_PADRAO_MIN),
  );
  const [observacaoGradeForm, setObservacaoGradeForm] = useState<string>("");
  const [erroGradeForm, setErroGradeForm] = useState<string | null>(null);
  const [salvandoGrade, setSalvandoGrade] = useState<boolean>(false);
  const [horarioParaExcluir, setHorarioParaExcluir] =
    useState<HorarioSemanal | null>(null);
  const [excluindoHorario, setExcluindoHorario] = useState<boolean>(false);

  // Estado do modal de criar/editar/remarcar agendamento (RN70, RN72, RN74)
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  const [agendamentoEmEdicao, setAgendamentoEmEdicao] =
    useState<Agendamento | null>(null);
  const [pacienteIdForm, setPacienteIdForm] = useState<string>("");
  const [dataBrForm, setDataBrForm] = useState<string>(() =>
    formatarDataBr(hojeIso),
  );
  const [horaInicioForm, setHoraInicioForm] = useState<string>("09:00");
  const [duracaoMinForm, setDuracaoMinForm] = useState<string>(
    String(DURACAO_PADRAO_MIN),
  );
  const [observacaoForm, setObservacaoForm] = useState<string>("");

  const [erroPaciente, setErroPaciente] = useState<string | null>(null);
  const [erroData, setErroData] = useState<string | null>(null);
  const [erroHora, setErroHora] = useState<string | null>(null);
  const [erroDuracao, setErroDuracao] = useState<string | null>(null);
  const [erroObservacao, setErroObservacao] = useState<string | null>(null);
  const [erroFormGeral, setErroFormGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);

  // Exclusão de agendamento com confirmação (RN74)
  const [agendamentoParaExcluir, setAgendamentoParaExcluir] =
    useState<Agendamento | null>(null);
  const [excluindo, setExcluindo] = useState<boolean>(false);

  // Integração RN76: Registrar sessão a partir de agendamento passado/hoje
  const [agendamentoParaSessao, setAgendamentoParaSessao] =
    useState<Agendamento | null>(null);

  const diasSemana = useMemo(
    () => obterDiasDaSemana(dataReferenciaIso),
    [dataReferenciaIso],
  );
  const diasMes = useMemo(
    () => obterDiasDoMes(dataReferenciaIso),
    [dataReferenciaIso],
  );

  const primeiroDiaSemana = useMemo(() => {
    if (!diasMes[0]) return 0;
    const [ano, mes, dia] = diasMes[0].dataIso.split("-").map(Number);
    return new Date(ano, mes - 1, dia).getDay();
  }, [diasMes]);

  const intervaloAtual = useMemo(() => {
    if (visao === "semana") {
      return {
        inicio: diasSemana[0].dataIso,
        fim: diasSemana[diasSemana.length - 1].dataIso,
      };
    }
    return {
      inicio: diasMes[0].dataIso,
      fim: diasMes[diasMes.length - 1].dataIso,
    };
  }, [visao, diasSemana, diasMes]);

  const carregarDados = useCallback(() => {
    agendamentosListar({
      data_inicio: intervaloAtual.inicio,
      data_fim: intervaloAtual.fim,
    })
      .then((lista) => {
        if (Array.isArray(lista)) {
          setAgendamentos(enriquecerConflitosLocais(lista));
        }
      })
      .catch(() => {
        // Mantém lista atual se falhar em ambiente de teste sem mock
      });

    horariosSemanaisListar()
      .then((listaGrade) => {
        if (Array.isArray(listaGrade)) {
          setHorariosFixos(enriquecerConflitosGradeLocal(listaGrade));
        }
      })
      .catch(() => {
        // Mantém lista atual se falhar em ambiente de teste sem mock
      });
  }, [intervaloAtual.inicio, intervaloAtual.fim]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    let cancelado = false;
    pacientesListar({ status: "ativo" })
      .then((lista) => {
        if (!cancelado && Array.isArray(lista)) {
          setPacientes(lista);
        }
      })
      .catch(() => {
        // Ignora erro inicial
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const agendamentosPorData = useMemo(() => {
    const mapa = new Map<string, Agendamento[]>();
    for (const ag of agendamentos) {
      const listaDia = mapa.get(ag.data) ?? [];
      listaDia.push(ag);
      mapa.set(ag.data, listaDia);
    }
    return mapa;
  }, [agendamentos]);

  const agendamentosExibidosMes = useMemo(() => {
    if (diaSelecionadoIso) {
      return agendamentosPorData.get(diaSelecionadoIso) ?? [];
    }
    const setDatasMes = new Set(diasMes.map((d) => d.dataIso));
    return agendamentos
      .filter((a) => setDatasMes.has(a.data))
      .sort((a, b) => {
        const cmpData = a.data.localeCompare(b.data);
        if (cmpData !== 0) return cmpData;
        return a.hora_inicio.localeCompare(b.hora_inicio);
      });
  }, [diaSelecionadoIso, agendamentosPorData, diasMes, agendamentos]);

  const conflitosNoPeriodo = useMemo(
    () => agendamentos.filter((a) => a.conflito),
    [agendamentos],
  );

  // Detecção de conflito em tempo real no formulário do modal (RN73: avisa sem bloquear)
  const conflitosNoModal = useMemo(() => {
    const dataIso = converterDataBrParaIso(dataBrForm);
    const horaValida = validarHoraHhMm(horaInicioForm);
    const duracaoNum = Number(duracaoMinForm) || DURACAO_PADRAO_MIN;
    if (!dataIso || !horaValida) return [];

    return agendamentos.filter((ag) => {
      if (agendamentoEmEdicao && ag.id === agendamentoEmEdicao.id) {
        return false;
      }
      if (ag.data !== dataIso) return false;
      return intervalosHorariosConflitam(
        horaValida,
        duracaoNum,
        ag.hora_inicio,
        ag.duracao_min,
      );
    });
  }, [
    agendamentos,
    agendamentoEmEdicao,
    dataBrForm,
    horaInicioForm,
    duracaoMinForm,
  ]);

  function limparErrosModal() {
    setErroPaciente(null);
    setErroData(null);
    setErroHora(null);
    setErroDuracao(null);
    setErroObservacao(null);
    setErroFormGeral(null);
  }

  function abrirModalNovo(dataIsoPadrao?: string, horaPadrao?: string) {
    limparErrosModal();
    setAgendamentoEmEdicao(null);
    setPacienteIdForm(pacientes[0]?.id ?? "");
    setDataBrForm(formatarDataBr(dataIsoPadrao ?? dataReferenciaIso));
    setHoraInicioForm(horaPadrao ?? "09:00");
    setDuracaoMinForm(String(DURACAO_PADRAO_MIN));
    setObservacaoForm("");
    setModalAberto(true);
  }

  function abrirModalEditar(agendamento: Agendamento) {
    limparErrosModal();
    setAgendamentoEmEdicao(agendamento);
    setPacienteIdForm(agendamento.paciente_id);
    setDataBrForm(formatarDataBr(agendamento.data));
    setHoraInicioForm(agendamento.hora_inicio);
    setDuracaoMinForm(String(agendamento.duracao_min));
    setObservacaoForm(agendamento.observacao ?? "");
    setModalAberto(true);
  }

  function navegarAnterior() {
    if (visao === "semana") {
      setDataReferenciaIso((atual) => deslocarDiasIso(atual, -7));
    } else {
      setDataReferenciaIso((atual) => deslocarMesesIso(atual, -1));
    }
    setDiaSelecionadoIso(null);
  }

  function navegarProximo() {
    if (visao === "semana") {
      setDataReferenciaIso((atual) => deslocarDiasIso(atual, 7));
    } else {
      setDataReferenciaIso((atual) => deslocarMesesIso(atual, 1));
    }
    setDiaSelecionadoIso(null);
  }

  function navegarHoje() {
    setDataReferenciaIso(hojeIso);
    setDiaSelecionadoIso(null);
  }

  async function aoSubmeterAgendamento(e: React.FormEvent) {
    e.preventDefault();
    limparErrosModal();

    if (!pacienteIdForm.trim()) {
      setErroPaciente("Selecione o paciente para o agendamento.");
      return;
    }

    const dataIso = converterDataBrParaIso(dataBrForm);
    if (!dataIso) {
      setErroData("Data do agendamento inválida. Use o formato dd/mm/aaaa.");
      return;
    }

    const horaValida = validarHoraHhMm(horaInicioForm);
    if (!horaValida) {
      setErroHora(
        "Horário de início inválido. Use o formato HH:MM (ex.: 14:00).",
      );
      return;
    }

    const duracaoNum = duracaoMinForm.trim()
      ? Number(duracaoMinForm.trim())
      : DURACAO_PADRAO_MIN;
    if (!Number.isInteger(duracaoNum) || duracaoNum <= 0 || duracaoNum > 720) {
      setErroDuracao("A duração deve ser entre 1 e 720 minutos.");
      return;
    }

    const obsLimpa = observacaoForm.trim();
    if (Array.from(obsLimpa).length > LIMITE_OBSERVACAO_AGENDAMENTO) {
      setErroObservacao(
        `A observação deve ter no máximo ${LIMITE_OBSERVACAO_AGENDAMENTO} caracteres.`,
      );
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        paciente_id: pacienteIdForm.trim(),
        data: dataIso,
        hora_inicio: horaValida,
        duracao_min: duracaoNum,
        observacao: obsLimpa || null,
      };

      const salvo = agendamentoEmEdicao
        ? await agendamentoAtualizar(agendamentoEmEdicao.id, payload)
        : await agendamentoCriar(payload);

      setAgendamentos((atuais) => {
        const semAntigo = agendamentoEmEdicao
          ? atuais.filter((a) => a.id !== agendamentoEmEdicao.id)
          : atuais;
        return enriquecerConflitosLocais([...semAntigo, salvo]);
      });

      setModalAberto(false);
      setAgendamentoEmEdicao(null);
      setToastSucesso(
        agendamentoEmEdicao
          ? "Agendamento atualizado com sucesso."
          : "Agendamento salvo com sucesso.",
      );
      carregarDados();
    } catch (erro) {
      setErroFormGeral(extrairErroApi(erro).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    if (!agendamentoParaExcluir) return;
    setExcluindo(true);
    setErroMensagem(null);
    try {
      await agendamentoExcluir(agendamentoParaExcluir.id);
      setAgendamentos((atuais) =>
        enriquecerConflitosLocais(
          atuais.filter((a) => a.id !== agendamentoParaExcluir.id),
        ),
      );
      setAgendamentoParaExcluir(null);
      setToastSucesso("Agendamento excluído com sucesso.");
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setExcluindo(false);
    }
  }

  // Grade Semanal Fixa: agrupamento por dia da semana e detecção de conflito no modal (RN90–RN94)
  const horariosPorDiaSemana = useMemo(() => {
    const mapa = new Map<number, HorarioSemanal[]>();
    for (const h of horariosFixos) {
      const lista = mapa.get(h.dia_semana) ?? [];
      lista.push(h);
      mapa.set(h.dia_semana, lista);
    }
    return mapa;
  }, [horariosFixos]);

  const conflitosNoModalGrade = useMemo(() => {
    const horaValida = validarHoraHhMm(horaInicioGradeForm);
    const duracaoNum = Number(duracaoMinGradeForm) || DURACAO_PADRAO_MIN;
    if (!horaValida) return [];

    return horariosFixos.filter((h) => {
      if (horarioEmEdicao && h.id === horarioEmEdicao.id) return false;
      if (h.dia_semana !== diaSemanaGradeForm) return false;
      return intervalosHorariosConflitam(
        horaValida,
        duracaoNum,
        h.hora_inicio,
        h.duracao_min,
      );
    });
  }, [
    horariosFixos,
    horarioEmEdicao,
    diaSemanaGradeForm,
    horaInicioGradeForm,
    duracaoMinGradeForm,
  ]);

  function abrirModalNovoHorarioFixo(diaSemanaPadrao: number = 1) {
    setErroGradeForm(null);
    setHorarioEmEdicao(null);
    setPacienteIdGradeForm(pacientes[0]?.id ?? "");
    setDiaSemanaGradeForm(diaSemanaPadrao);
    setHoraInicioGradeForm("09:00");
    setDuracaoMinGradeForm(String(DURACAO_PADRAO_MIN));
    setObservacaoGradeForm("");
    setModalGradeAberto(true);
  }

  function abrirModalEditarHorarioFixo(horario: HorarioSemanal) {
    setErroGradeForm(null);
    setHorarioEmEdicao(horario);
    setPacienteIdGradeForm(horario.paciente_id);
    setDiaSemanaGradeForm(horario.dia_semana);
    setHoraInicioGradeForm(horario.hora_inicio);
    setDuracaoMinGradeForm(String(horario.duracao_min));
    setObservacaoGradeForm(horario.observacao ?? "");
    setModalGradeAberto(true);
  }

  async function aoSubmeterHorarioFixo(e: React.FormEvent) {
    e.preventDefault();
    setErroGradeForm(null);

    if (!pacienteIdGradeForm.trim()) {
      setErroGradeForm("Selecione o paciente para o horário semanal fixo.");
      return;
    }

    const horaValida = validarHoraHhMm(horaInicioGradeForm);
    if (!horaValida) {
      setErroGradeForm(
        "Horário de início inválido. Use o formato HH:MM (ex.: 14:00).",
      );
      return;
    }

    const duracaoNum = duracaoMinGradeForm.trim()
      ? Number(duracaoMinGradeForm.trim())
      : DURACAO_PADRAO_MIN;
    if (!Number.isInteger(duracaoNum) || duracaoNum <= 0 || duracaoNum > 720) {
      setErroGradeForm("A duração deve ser entre 1 e 720 minutos.");
      return;
    }

    const obsLimpa = observacaoGradeForm.trim();
    if (Array.from(obsLimpa).length > LIMITE_OBSERVACAO_AGENDAMENTO) {
      setErroGradeForm(
        `A observação deve ter no máximo ${LIMITE_OBSERVACAO_AGENDAMENTO} caracteres.`,
      );
      return;
    }

    setSalvandoGrade(true);
    try {
      const payload = {
        paciente_id: pacienteIdGradeForm.trim(),
        dia_semana: diaSemanaGradeForm,
        hora_inicio: horaValida,
        duracao_min: duracaoNum,
        observacao: obsLimpa || null,
      };

      const salvo = horarioEmEdicao
        ? await horarioSemanalAtualizar(horarioEmEdicao.id, payload)
        : await horarioSemanalCriar(payload);

      setHorariosFixos((atuais) => {
        const semAntigo = horarioEmEdicao
          ? atuais.filter((h) => h.id !== horarioEmEdicao.id)
          : atuais;
        return enriquecerConflitosGradeLocal([...semAntigo, salvo]);
      });

      setModalGradeAberto(false);
      setHorarioEmEdicao(null);
      setToastSucesso(
        horarioEmEdicao
          ? "Horário fixo atualizado com sucesso."
          : "Horário fixo cadastrado na grade semanal.",
      );
      carregarDados();
    } catch (erro) {
      setErroGradeForm(extrairErroApi(erro).mensagem);
    } finally {
      setSalvandoGrade(false);
    }
  }

  async function confirmarExclusaoHorarioFixo() {
    if (!horarioParaExcluir) return;
    setExcluindoHorario(true);
    setErroMensagem(null);
    try {
      await horarioSemanalExcluir(horarioParaExcluir.id);
      setHorariosFixos((atuais) =>
        enriquecerConflitosGradeLocal(
          atuais.filter((h) => h.id !== horarioParaExcluir.id),
        ),
      );
      setHorarioParaExcluir(null);
      setToastSucesso("Horário fixo removido da grade semanal.");
      carregarDados();
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setExcluindoHorario(false);
    }
  }

  async function acionarAplicarGradeNaSemana() {
    setAplicandoGrade(true);
    setErroMensagem(null);
    try {
      const resultado = await horariosSemanaisAplicarSemana(dataReferenciaIso);
      carregarDados();
      if (resultado.criados > 0) {
        setToastSucesso(
          `Grade semanal aplicada: ${resultado.criados} ${
            resultado.criados === 1
              ? "agendamento criado"
              : "agendamentos criados"
          } na semana.`,
        );
      } else {
        setToastSucesso(
          "Todos os horários fixos desta semana já estavam agendados.",
        );
      }
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setAplicandoGrade(false);
    }
  }

  const totalCaracteresObs = Array.from(observacaoForm).length;

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-fundo-claro border border-rosa-claro rounded-2xl p-6 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-malva">Agenda</h2>
          <p className="text-base text-texto">
            Organize os dias e horários das sessões agendadas e a grade semanal
            fixa.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variante="secundario"
            data-testid="botao-aplicar-grade-semana"
            disabled={aplicandoGrade}
            onClick={() => void acionarAplicarGradeNaSemana()}
          >
            {aplicandoGrade ? "Aplicando..." : "Aplicar grade na semana"}
          </Button>
          {visao === "grade" ? (
            <Button
              variante="primario"
              data-testid="botao-novo-horario-fixo"
              onClick={() => abrirModalNovoHorarioFixo(1)}
            >
              Novo horário fixo
            </Button>
          ) : (
            <Button variante="primario" onClick={() => abrirModalNovo()}>
              Novo agendamento
            </Button>
          )}
        </div>
      </header>

      {/* Barra de controles: Semana/Mês/Grade Fixa + Anterior/Hoje/Próximo (RN71, RN92) */}
      <section
        aria-label="Controles do calendário"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variante={visao === "semana" ? "primario" : "contorno"}
            aria-pressed={visao === "semana"}
            onClick={() => {
              setVisao("semana");
              setDiaSelecionadoIso(null);
            }}
          >
            Semana
          </Button>
          <Button
            variante={visao === "mes" ? "primario" : "contorno"}
            aria-pressed={visao === "mes"}
            onClick={() => {
              setVisao("mes");
              setDiaSelecionadoIso(null);
            }}
          >
            Mês
          </Button>
          <Button
            variante={visao === "grade" ? "primario" : "contorno"}
            aria-pressed={visao === "grade"}
            onClick={() => {
              setVisao("grade");
              setDiaSelecionadoIso(null);
            }}
          >
            Grade Fixa
          </Button>
        </div>

        <p
          data-testid="rotulo-periodo-agenda"
          className="text-lg font-bold text-malva text-center"
        >
          {visao === "grade"
            ? `Grade Semanal Fixa (${horariosFixos.length} ${
                horariosFixos.length === 1 ? "horário fixo" : "horários fixos"
              })`
            : visao === "semana"
            ? `Semana de ${formatarDataBr(diasSemana[0].dataIso)} a ${formatarDataBr(
                diasSemana[diasSemana.length - 1].dataIso,
              )}`
            : formatarMesAnoBr(dataReferenciaIso)}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variante="contorno" onClick={navegarAnterior}>
            Anterior
          </Button>
          <Button variante="secundario" onClick={navegarHoje}>
            Hoje
          </Button>
          <Button variante="contorno" onClick={navegarProximo}>
            Próximo
          </Button>
        </div>
      </section>

      {/* Aviso de conflito de horário no período exibido (RN73: avisa sem bloquear) */}
      {conflitosNoPeriodo.length > 0 && (
        <div
          role="alert"
          data-testid="aviso-conflito-agenda"
          className="p-4 rounded-2xl bg-rosa-claro/40 border border-malva text-base text-texto space-y-1"
        >
          <p className="font-bold text-malva">
            Atenção: Conflito de horário detectado na agenda
          </p>
          <p>
            Existem sessões agendadas no mesmo horário:{" "}
            <strong>
              {conflitosNoPeriodo
                .map(
                  (c) =>
                    `${c.paciente_nome} (${formatarDataBr(c.data)} às ${c.hora_inicio})`,
                )
                .join(" · ")}
            </strong>
            .
          </p>
        </div>
      )}

      {/* Visão Semana (padrão — RN71, RN72) */}
      {visao === "semana" ? (
        <div
          data-testid="visao-semana"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 items-start"
        >
          {diasSemana.map((dia) => {
            const listaDia = agendamentosPorData.get(dia.dataIso) ?? [];
            const ehHoje = dia.dataIso === hojeIso;

            return (
              <section
                key={dia.dataIso}
                data-testid={`coluna-dia-${dia.dataIso}`}
                aria-label={`${dia.nomeCurto} ${dia.diaMesBr}`}
                className={`bg-fundo-claro rounded-2xl p-4 space-y-3 border shadow-xs flex flex-col justify-between min-h-[320px] transition-shadow ${
                  ehHoje
                    ? "border-malva ring-2 ring-malva/25 bg-rosa-claro/10"
                    : "border-rosa-claro"
                }`}
              >
                <div className="space-y-3">
                  <div className="pb-2 border-b border-rosa-claro flex items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-malva capitalize">
                        {dia.nomeCurto}
                      </p>
                      <p className="text-base text-texto">{dia.diaMesBr}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {ehHoje && (
                        <span className="px-2.5 py-0.5 rounded-full bg-malva text-white text-base font-semibold">
                          Hoje
                        </span>
                      )}
                      {listaDia.length > 0 && (
                        <span
                          className="px-2 py-0.5 rounded-full bg-rosa-claro/50 border border-rosa-claro text-base font-semibold text-texto"
                          title={`${listaDia.length} ${listaDia.length === 1 ? "agendamento" : "agendamentos"}`}
                        >
                          {listaDia.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {listaDia.length === 0 ? (
                    <p className="text-base text-lilas-acinzentado py-2 italic">
                      Sem agendamentos.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {listaDia.map((ag) => {
                        const ehPassadoOuHoje = ag.data <= hojeIso;
                        return (
                          <li
                            key={ag.id}
                            data-testid={`card-agendamento-${ag.id}`}
                            className={`p-3.5 rounded-xl border space-y-2.5 transition-all shadow-2xs ${
                              ag.conflito
                                ? "bg-rosa-claro/40 border-malva ring-1 ring-malva"
                                : "bg-fundo border-rosa-claro hover:border-malva/40"
                            }`}
                          >
                            <div className="space-y-1">
                              <span className="inline-block px-2.5 py-0.5 rounded-lg bg-malva/15 text-malva font-bold text-base">
                                {ag.hora_inicio} ({ag.duracao_min} min)
                              </span>
                              <p className="text-base font-bold text-texto leading-snug break-words">
                                {ag.paciente_nome}
                              </p>
                              {ag.observacao && (
                                <p className="text-base text-lilas-acinzentado italic line-clamp-2 leading-snug">
                                  {ag.observacao}
                                </p>
                              )}
                              {ag.conflito && (
                                <p
                                  data-testid={`badge-conflito-${ag.id}`}
                                  className="text-base font-bold text-[#8B2635] bg-red-100/70 px-2.5 py-0.5 rounded-md"
                                >
                                  {ag.conflito_descricao ??
                                    "Conflito de horário"}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col gap-1.5 pt-2 border-t border-rosa-claro/60">
                              {ehPassadoOuHoje && (
                                <Button
                                  variante="primario"
                                  tamanho="compacto"
                                  larguraTotal
                                  data-testid={`registrar-sessao-agendamento-${ag.id}`}
                                  onClick={() => setAgendamentoParaSessao(ag)}
                                >
                                  Registrar sessão
                                </Button>
                              )}
                              <div className="grid grid-cols-2 gap-1.5 w-full">
                                <Button
                                  variante="contorno"
                                  tamanho="compacto"
                                  data-testid={`editar-agendamento-${ag.id}`}
                                  onClick={() => abrirModalEditar(ag)}
                                  title="Editar ou remarcar agendamento"
                                >
                                  Editar
                                </Button>
                                <Button
                                  variante="perigo"
                                  tamanho="compacto"
                                  data-testid={`excluir-agendamento-${ag.id}`}
                                  onClick={() => setAgendamentoParaExcluir(ag)}
                                  title="Excluir agendamento"
                                >
                                  Excluir
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Botão para agendar no dia (substitui os horários livres antigos) */}
                <div className="pt-2.5 border-t border-rosa-claro mt-auto">
                  <Button
                    variante="contorno"
                    tamanho="compacto"
                    larguraTotal
                    data-testid={`slot-vazio-${dia.dataIso}-09:00`}
                    onClick={() => abrirModalNovo(dia.dataIso, "09:00")}
                  >
                    Agendar neste dia
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      ) : visao === "mes" ? (
        /* Visão Mês (RN71, RN72) — Calendário com indicativo e painel de detalhes ao lado */
        <div
          data-testid="visao-mes"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {/* Calendário do mês inteiro */}
          <div className="lg:col-span-7 xl:col-span-7 bg-fundo-claro border border-rosa-claro rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-rosa-claro">
              <div>
                <h3 className="text-xl font-bold text-malva capitalize">
                  {formatarMesAnoBr(dataReferenciaIso)}
                </h3>
                <p className="text-base text-lilas-acinzentado">
                  Selecione um dia para ver os detalhes ao lado.
                </p>
              </div>
              {diaSelecionadoIso && (
                <Button
                  variante="contorno"
                  className="px-3.5 py-1.5 text-base shrink-0"
                  onClick={() => setDiaSelecionadoIso(null)}
                >
                  Ver mês todo
                </Button>
              )}
            </div>

            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 gap-2 text-center pb-2 border-b border-rosa-claro/60">
              {NOMES_DIAS_SEMANA_CALENDARIO.map((nomeDia) => (
                <span
                  key={nomeDia}
                  className="text-base font-bold text-lilas-acinzentado"
                >
                  {nomeDia}
                </span>
              ))}
            </div>

            {/* Grade dos dias do mês */}
            <div className="grid grid-cols-7 gap-2">
              {/* Células vazias de deslocamento para o 1º dia da semana */}
              {Array.from({ length: primeiroDiaSemana }).map((_, idx) => (
                <div
                  key={`vazio-inicio-${idx}`}
                  aria-hidden="true"
                  className="min-h-[72px] rounded-xl border border-transparent"
                />
              ))}

              {diasMes.map((dia) => {
                const listaDia = agendamentosPorData.get(dia.dataIso) ?? [];
                const temAgendamento = listaDia.length > 0;
                const ehHoje = dia.dataIso === hojeIso;
                const estaSelecionado = diaSelecionadoIso === dia.dataIso;

                return (
                  <button
                    type="button"
                    key={dia.dataIso}
                    data-testid={`celula-mes-${dia.dataIso}`}
                    onClick={() =>
                      setDiaSelecionadoIso((prev) =>
                        prev === dia.dataIso ? null : dia.dataIso,
                      )
                    }
                    className={`p-2 rounded-2xl border transition-all flex flex-col items-center justify-between min-h-[72px] cursor-pointer text-center relative focus:outline-none focus:ring-2 focus:ring-malva ${
                      estaSelecionado
                        ? "bg-malva text-white border-malva shadow-sm"
                        : ehHoje
                        ? "border-malva bg-rosa-claro/25 text-texto font-bold"
                        : "border-rosa-claro bg-fundo hover:bg-rosa-claro/30 text-texto"
                    }`}
                  >
                    <span
                      className={`text-base font-bold ${
                        estaSelecionado
                          ? "text-white"
                          : ehHoje
                          ? "text-malva"
                          : "text-texto"
                      }`}
                    >
                      {dia.dia}
                    </span>

                    {/* Pequeno indicativo que no dia tem agendamento */}
                    {temAgendamento ? (
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            estaSelecionado ? "bg-white" : "bg-malva"
                          }`}
                          title={`${listaDia.length} ${
                            listaDia.length === 1
                              ? "agendamento"
                              : "agendamentos"
                          }`}
                        />
                        {listaDia.length > 1 && (
                          <span
                            className={`text-base font-bold leading-none ${
                              estaSelecionado ? "text-white" : "text-malva"
                            }`}
                          >
                            {listaDia.length}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span
                        className="w-2.5 h-2.5 mt-1 opacity-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Painel lateral: mostra o que tem para aquele dia ou para o mês todo */}
          <aside
            aria-label="Agendamentos selecionados"
            className="lg:col-span-5 xl:col-span-5 bg-fundo-claro border border-rosa-claro rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between gap-3 border-b border-rosa-claro pb-3">
              <div>
                <h3 className="text-xl font-bold text-malva">
                  {diaSelecionadoIso
                    ? formatarDataBr(diaSelecionadoIso)
                    : `Mês de ${formatarMesAnoBr(dataReferenciaIso)}`}
                </h3>
                <p className="text-base text-texto">
                  {agendamentosExibidosMes.length}{" "}
                  {agendamentosExibidosMes.length === 1
                    ? "sessão encontrada"
                    : "sessões encontradas"}
                </p>
              </div>

              <Button
                variante="primario"
                className="px-3.5 py-1.5 text-base shrink-0"
                onClick={() =>
                  abrirModalNovo(
                    diaSelecionadoIso ?? diasMes[0]?.dataIso ?? hojeIso,
                    "09:00",
                  )
                }
              >
                {diaSelecionadoIso ? "Agendar neste dia" : "Novo agendamento"}
              </Button>
            </div>

            {agendamentosExibidosMes.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-base text-lilas-acinzentado italic">
                  {diaSelecionadoIso
                    ? `Nenhum agendamento para ${formatarDataBr(diaSelecionadoIso)}.`
                    : `Nenhum agendamento cadastrado em ${formatarMesAnoBr(dataReferenciaIso)}.`}
                </p>
                <Button
                  variante="contorno"
                  onClick={() =>
                    abrirModalNovo(
                      diaSelecionadoIso ?? diasMes[0]?.dataIso ?? hojeIso,
                      "09:00",
                    )
                  }
                >
                  Agendar agora
                </Button>
              </div>
            ) : (
              <ul className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                {agendamentosExibidosMes.map((ag) => {
                  const ehPassadoOuHoje = ag.data <= hojeIso;
                  return (
                    <li
                      key={ag.id}
                      data-testid={`card-agendamento-${ag.id}`}
                      className={`p-3.5 rounded-xl border space-y-2.5 transition-all shadow-2xs ${
                        ag.conflito
                          ? "bg-rosa-claro/40 border-malva ring-1 ring-malva"
                          : "bg-fundo border-rosa-claro hover:border-malva/40"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="inline-block px-2.5 py-0.5 rounded-lg bg-malva/15 text-malva font-bold text-base">
                            {formatarDataBr(ag.data)} às {ag.hora_inicio} ({ag.duracao_min} min)
                          </span>
                        </div>
                        <p className="text-base font-bold text-texto leading-snug break-words">
                          {ag.paciente_nome}
                        </p>
                        {ag.observacao && (
                          <p className="text-base text-lilas-acinzentado italic leading-snug">
                            {ag.observacao}
                          </p>
                        )}
                        {ag.conflito && (
                          <p
                            data-testid={`badge-conflito-${ag.id}`}
                            className="text-base font-bold text-[#8B2635] bg-red-100/70 px-2.5 py-0.5 rounded-md"
                          >
                            {ag.conflito_descricao ?? "Conflito de horário"}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5 pt-2 border-t border-rosa-claro/60">
                        {ehPassadoOuHoje && (
                          <Button
                            variante="primario"
                            tamanho="compacto"
                            larguraTotal
                            data-testid={`registrar-sessao-agendamento-${ag.id}`}
                            onClick={() => setAgendamentoParaSessao(ag)}
                          >
                            Registrar sessão
                          </Button>
                        )}
                        <div className="grid grid-cols-2 gap-1.5 w-full">
                          <Button
                            variante="contorno"
                            tamanho="compacto"
                            data-testid={`editar-agendamento-${ag.id}`}
                            onClick={() => abrirModalEditar(ag)}
                            title="Editar ou remarcar agendamento"
                          >
                            Editar
                          </Button>
                          <Button
                            variante="perigo"
                            tamanho="compacto"
                            data-testid={`excluir-agendamento-${ag.id}`}
                            onClick={() => setAgendamentoParaExcluir(ag)}
                            title="Excluir agendamento"
                          >
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      ) : (
        /* Visão Grade Semanal Fixa (RN90–RN94) */
        <div
          data-testid="visao-grade-semanal"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 items-start"
        >
          {DIAS_SEMANA_GRADE_ORDEM.map((diaInfo) => {
            const listaDia = horariosPorDiaSemana.get(diaInfo.diaSemana) ?? [];
            return (
              <section
                key={diaInfo.diaSemana}
                data-testid={`coluna-grade-${diaInfo.diaSemana}`}
                aria-label={diaInfo.nomeCompleto}
                className="bg-fundo-claro rounded-2xl p-4 space-y-3 border border-rosa-claro shadow-xs flex flex-col justify-between min-h-[320px]"
              >
                <div className="space-y-3">
                  <div className="pb-2 border-b border-rosa-claro flex items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-malva">
                        {diaInfo.nomeCurto}
                      </p>
                      <p className="text-base text-texto">
                        {diaInfo.nomeCompleto}
                      </p>
                    </div>
                    {listaDia.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rosa-claro/50 border border-rosa-claro text-base font-semibold text-texto">
                        {listaDia.length}
                      </span>
                    )}
                  </div>

                  {listaDia.length === 0 ? (
                    <p className="text-base text-lilas-acinzentado py-2 italic">
                      Sem horários fixos.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {listaDia.map((h) => (
                        <li
                          key={h.id}
                          data-testid={`card-horario-fixo-${h.id}`}
                          className={`p-3.5 rounded-xl border space-y-2.5 transition-all shadow-2xs ${
                            h.conflito
                              ? "bg-rosa-claro/40 border-malva ring-1 ring-malva"
                              : "bg-fundo border-rosa-claro hover:border-malva/40"
                          }`}
                        >
                          <div className="space-y-1">
                            <span className="inline-block px-2.5 py-0.5 rounded-lg bg-malva/15 text-malva font-bold text-base">
                              {h.hora_inicio} ({h.duracao_min} min)
                            </span>
                            <p className="text-base font-bold text-texto leading-snug break-words">
                              {h.paciente_nome}
                            </p>
                            {h.observacao && (
                              <p className="text-base text-lilas-acinzentado italic line-clamp-2 leading-snug">
                                {h.observacao}
                              </p>
                            )}
                            {h.conflito && (
                              <p
                                data-testid={`badge-conflito-grade-${h.id}`}
                                className="text-base font-bold text-[#8B2635] bg-red-100/70 px-2.5 py-0.5 rounded-md"
                              >
                                {h.conflito_descricao ??
                                  "Conflito na grade semanal"}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 w-full pt-2 border-t border-rosa-claro/60">
                            <Button
                              variante="contorno"
                              tamanho="compacto"
                              data-testid={`editar-horario-fixo-${h.id}`}
                              onClick={() => abrirModalEditarHorarioFixo(h)}
                            >
                              Editar
                            </Button>
                            <Button
                              variante="perigo"
                              tamanho="compacto"
                              data-testid={`excluir-horario-fixo-${h.id}`}
                              onClick={() => setHorarioParaExcluir(h)}
                            >
                              Excluir
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-2.5 border-t border-rosa-claro mt-auto">
                  <Button
                    variante="contorno"
                    tamanho="compacto"
                    larguraTotal
                    data-testid={`slot-grade-${diaInfo.diaSemana}`}
                    onClick={() =>
                      abrirModalNovoHorarioFixo(diaInfo.diaSemana)
                    }
                  >
                    Fixar neste dia
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal de criar / editar / remarcar agendamento (T11, RN70–RN74) */}
      <Modal
        aberto={modalAberto}
        titulo={agendamentoEmEdicao ? "Editar agendamento" : "Novo agendamento"}
        aoFechar={() => setModalAberto(false)}
        larguraMax="lg"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setModalAberto(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-agendamento-modal"
              variante="primario"
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Salvar agendamento"}
            </Button>
          </>
        }
      >
        <form
          id="form-agendamento-modal"
          onSubmit={(e) => void aoSubmeterAgendamento(e)}
          noValidate
          className="space-y-4"
        >
          {erroFormGeral && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rosa-claro/40 border border-malva text-base font-semibold text-texto"
            >
              {erroFormGeral}
            </div>
          )}

          {/* Aviso de conflito de horário no modal (RN73: avisa sem bloquear) */}
          {conflitosNoModal.length > 0 && (
            <div
              role="alert"
              data-testid="aviso-conflito-modal"
              className="p-3.5 rounded-xl bg-rosa-claro/40 border border-malva text-base text-texto space-y-1"
            >
              <p className="font-bold text-malva">
                Aviso de conflito de horário
              </p>
              <p>
                Já existe agendamento neste horário:{" "}
                <strong>
                  {conflitosNoModal
                    .map((c) => `${c.paciente_nome} (${c.hora_inicio})`)
                    .join(", ")}
                </strong>
                . Você ainda pode salvar se desejar.
              </p>
            </div>
          )}

          <div className="w-full space-y-1.5">
            <label
              htmlFor={selectPacienteId}
              className="block text-base font-semibold text-texto"
            >
              Paciente{" "}
              <span className="text-malva font-bold" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id={selectPacienteId}
              value={pacienteIdForm}
              onChange={(e) => {
                setPacienteIdForm(e.target.value);
                if (erroPaciente) setErroPaciente(null);
              }}
              aria-invalid={Boolean(erroPaciente)}
              aria-describedby={erroPaciente ? erroPacienteId : undefined}
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            >
              <option value="">Selecione um paciente...</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            {erroPaciente && (
              <p
                id={erroPacienteId}
                role="alert"
                className="text-base font-semibold text-[#8B2635]"
              >
                {erroPaciente}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              rotulo="Data do agendamento"
              required
              value={dataBrForm}
              onChange={(e) => {
                setDataBrForm(aplicarMascaraDataBr(e.target.value));
                if (erroData) setErroData(null);
              }}
              erro={erroData}
              placeholder="dd/mm/aaaa"
              inputMode="numeric"
            />

            <Input
              rotulo="Horário de início"
              required
              value={horaInicioForm}
              onChange={(e) => {
                setHoraInicioForm(aplicarMascaraHoraBr(e.target.value));
                if (erroHora) setErroHora(null);
              }}
              erro={erroHora}
              placeholder="HH:MM"
            />

            <Input
              rotulo="Duração (min)"
              type="number"
              value={duracaoMinForm}
              onChange={(e) => {
                setDuracaoMinForm(e.target.value);
                if (erroDuracao) setErroDuracao(null);
              }}
              erro={erroDuracao}
              placeholder="50"
            />
          </div>

          <div className="w-full space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={obsId}
                className="block text-base font-semibold text-texto"
              >
                Observação (opcional)
              </label>
              <span
                data-testid="contador-observacao-agendamento"
                className="text-base font-semibold text-lilas-acinzentado"
              >
                {totalCaracteresObs}/{LIMITE_OBSERVACAO_AGENDAMENTO}
              </span>
            </div>
            <textarea
              id={obsId}
              rows={2}
              maxLength={LIMITE_OBSERVACAO_AGENDAMENTO}
              value={observacaoForm}
              onChange={(e) => {
                setObservacaoForm(
                  limitarCaracteres(
                    e.target.value,
                    LIMITE_OBSERVACAO_AGENDAMENTO,
                  ),
                );
                if (erroObservacao) setErroObservacao(null);
              }}
              aria-invalid={Boolean(erroObservacao)}
              aria-describedby={erroObservacao ? erroObsId : undefined}
              placeholder="Observação curta sobre este horário (até 200 caracteres)..."
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto placeholder:text-lilas-acinzentado focus:outline-none focus:ring-2 focus:ring-malva"
            />
            {erroObservacao && (
              <p
                id={erroObsId}
                role="alert"
                className="text-base font-semibold text-[#8B2635]"
              >
                {erroObservacao}
              </p>
            )}
          </div>
        </form>
      </Modal>

      {/* Diálogo de confirmação para excluir agendamento (RN74) */}
      <ConfirmDialog
        aberto={Boolean(agendamentoParaExcluir)}
        titulo="Excluir agendamento"
        mensagem="Tem certeza de que deseja excluir este agendamento da agenda?"
        detalheDestaque={
          agendamentoParaExcluir
            ? `${agendamentoParaExcluir.paciente_nome} — ${formatarDataBr(
                agendamentoParaExcluir.data,
              )} às ${agendamentoParaExcluir.hora_inicio}`
            : undefined
        }
        rotuloConfirmar="Sim, excluir agendamento"
        destrutivo={true}
        carregando={excluindo}
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => setAgendamentoParaExcluir(null)}
      />

      {/* Modal de criar / editar horário semanal fixo (RN90–RN93) */}
      <Modal
        aberto={modalGradeAberto}
        titulo={
          horarioEmEdicao ? "Editar horário fixo" : "Novo horário fixo semanal"
        }
        aoFechar={() => setModalGradeAberto(false)}
        larguraMax="lg"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setModalGradeAberto(false)}
              disabled={salvandoGrade}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-grade-semanal-modal"
              variante="primario"
              disabled={salvandoGrade}
            >
              {salvandoGrade ? "Salvando..." : "Salvar horário fixo"}
            </Button>
          </>
        }
      >
        <form
          id="form-grade-semanal-modal"
          onSubmit={(e) => void aoSubmeterHorarioFixo(e)}
          noValidate
          className="space-y-4"
        >
          {erroGradeForm && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rosa-claro/40 border border-malva text-base font-semibold text-texto"
            >
              {erroGradeForm}
            </div>
          )}

          {conflitosNoModalGrade.length > 0 && (
            <div
              role="alert"
              data-testid="aviso-conflito-grade-modal"
              className="p-3.5 rounded-xl bg-rosa-claro/40 border border-malva text-base text-texto space-y-1"
            >
              <p className="font-bold text-malva">
                Aviso de conflito na grade semanal
              </p>
              <p>
                Já existe horário fixo neste dia e horário:{" "}
                <strong>
                  {conflitosNoModalGrade
                    .map((c) => `${c.paciente_nome} (${c.hora_inicio})`)
                    .join(", ")}
                </strong>
                . Você ainda pode salvar se desejar.
              </p>
            </div>
          )}

          <div className="w-full space-y-1.5">
            <label
              htmlFor={selectPacienteGradeId}
              className="block text-base font-semibold text-texto"
            >
              Paciente{" "}
              <span className="text-malva font-bold" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id={selectPacienteGradeId}
              value={pacienteIdGradeForm}
              onChange={(e) => setPacienteIdGradeForm(e.target.value)}
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            >
              <option value="">Selecione um paciente...</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor={selectDiaSemanaGradeId}
                className="block text-base font-semibold text-texto"
              >
                Dia da semana *
              </label>
              <select
                id={selectDiaSemanaGradeId}
                value={diaSemanaGradeForm}
                onChange={(e) => setDiaSemanaGradeForm(Number(e.target.value))}
                className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
              >
                {DIAS_SEMANA_GRADE_ORDEM.map((d) => (
                  <option key={d.diaSemana} value={d.diaSemana}>
                    {d.nomeCompleto}
                  </option>
                ))}
              </select>
            </div>

            <Input
              rotulo="Horário de início"
              required
              value={horaInicioGradeForm}
              onChange={(e) =>
                setHoraInicioGradeForm(aplicarMascaraHoraBr(e.target.value))
              }
              placeholder="HH:MM"
            />

            <Input
              rotulo="Duração (min)"
              type="number"
              value={duracaoMinGradeForm}
              onChange={(e) => setDuracaoMinGradeForm(e.target.value)}
              placeholder="50"
            />
          </div>

          <div className="w-full space-y-1.5">
            <label
              htmlFor={obsGradeId}
              className="block text-base font-semibold text-texto"
            >
              Observação (opcional)
            </label>
            <textarea
              id={obsGradeId}
              rows={2}
              maxLength={LIMITE_OBSERVACAO_AGENDAMENTO}
              value={observacaoGradeForm}
              onChange={(e) =>
                setObservacaoGradeForm(
                  limitarCaracteres(
                    e.target.value,
                    LIMITE_OBSERVACAO_AGENDAMENTO,
                  ),
                )
              }
              placeholder="Observação curta sobre este horário fixo..."
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto placeholder:text-lilas-acinzentado focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>
        </form>
      </Modal>

      {/* Diálogo de confirmação para excluir horário semanal fixo (RN92) */}
      <ConfirmDialog
        aberto={Boolean(horarioParaExcluir)}
        titulo="Excluir horário fixo"
        mensagem="Tem certeza de que deseja remover este horário fixo da grade semanal? Os agendamentos já criados nas semanas não serão apagados."
        detalheDestaque={
          horarioParaExcluir
            ? `${horarioParaExcluir.paciente_nome} — ${formatarDiaSemanaCompletoBr(
                horarioParaExcluir.dia_semana,
              )} às ${horarioParaExcluir.hora_inicio}`
            : undefined
        }
        rotuloConfirmar="Sim, remover horário fixo"
        destrutivo={true}
        carregando={excluindoHorario}
        aoConfirmar={() => void confirmarExclusaoHorarioFixo()}
        aoCancelar={() => setHorarioParaExcluir(null)}
      />

      {/* Modal T08 — Registrar sessão a partir de agendamento (RN76) */}
      {agendamentoParaSessao && (
        <SessaoModal
          aberto={Boolean(agendamentoParaSessao)}
          pacienteId={agendamentoParaSessao.paciente_id}
          pacienteNome={agendamentoParaSessao.paciente_nome}
          dataInicialIso={agendamentoParaSessao.data}
          dataHojeIso={hojeIso}
          aoFechar={() => setAgendamentoParaSessao(null)}
          aoSalva={() => {
            setAgendamentoParaSessao(null);
            setToastSucesso("Sessão registrada com sucesso.");
          }}
        />
      )}

      <Toast
        mensagem={erroMensagem ?? toastSucesso}
        tipo={erroMensagem ? "erro" : "sucesso"}
        aoFechar={() => {
          setErroMensagem(null);
          setToastSucesso(null);
        }}
      />
    </div>
  );
}
