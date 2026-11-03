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
  pacientesListar,
} from "../lib/api";
import {
  aplicarMascaraDataBr,
  aplicarMascaraHoraBr,
  converterDataBrParaIso,
  deslocarDiasIso,
  deslocarMesesIso,
  formatarDataBr,
  formatarMesAnoBr,
  intervalosHorariosConflitam,
  obterDataHojeIso,
  obterDiasDaSemana,
  obterDiasDoMes,
  validarHoraHhMm,
} from "../lib/format";
import type { Agendamento, PacienteResumo } from "../lib/types";

export const DURACAO_PADRAO_MIN = 50;
export const LIMITE_OBSERVACAO_AGENDAMENTO = 200;

const HORARIOS_RAPIDOS_DIA: readonly string[] = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
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

export interface AgendaProps {
  dataHojeIso?: string;
}

export function Agenda({ dataHojeIso }: AgendaProps = {}) {
  const selectPacienteId = useId();
  const erroPacienteId = useId();
  const obsId = useId();
  const erroObsId = useId();

  const hojeIso = dataHojeIso ?? obterDataHojeIso();

  const [visao, setVisao] = useState<"semana" | "mes">("semana");
  const [dataReferenciaIso, setDataReferenciaIso] = useState<string>(hojeIso);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);

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
  }

  function navegarProximo() {
    if (visao === "semana") {
      setDataReferenciaIso((atual) => deslocarDiasIso(atual, 7));
    } else {
      setDataReferenciaIso((atual) => deslocarMesesIso(atual, 1));
    }
  }

  function navegarHoje() {
    setDataReferenciaIso(hojeIso);
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

  const totalCaracteresObs = Array.from(observacaoForm).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-fundo-claro border border-rosa-claro rounded-2xl p-6 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-malva">Agenda</h2>
          <p className="text-base text-texto">
            Organize os dias e horários das sessões agendadas.
          </p>
        </div>

        <Button variante="primario" onClick={() => abrirModalNovo()}>
          Novo agendamento
        </Button>
      </header>

      {/* Barra de controles: Semana/Mês + Anterior/Hoje/Próximo (RN71) */}
      <section
        aria-label="Controles do calendário"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variante={visao === "semana" ? "primario" : "contorno"}
            aria-pressed={visao === "semana"}
            onClick={() => setVisao("semana")}
          >
            Semana
          </Button>
          <Button
            variante={visao === "mes" ? "primario" : "contorno"}
            aria-pressed={visao === "mes"}
            onClick={() => setVisao("mes")}
          >
            Mês
          </Button>
        </div>

        <p
          data-testid="rotulo-periodo-agenda"
          className="text-lg font-bold text-malva text-center"
        >
          {visao === "semana"
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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4"
        >
          {diasSemana.map((dia) => {
            const listaDia = agendamentosPorData.get(dia.dataIso) ?? [];
            const ehHoje = dia.dataIso === hojeIso;
            const horariosOcupados = new Set(
              listaDia.map((a) => a.hora_inicio),
            );
            const horariosVaziosSugeridos = HORARIOS_RAPIDOS_DIA.filter(
              (h) => !horariosOcupados.has(h),
            ).slice(0, 3);

            return (
              <section
                key={dia.dataIso}
                data-testid={`coluna-dia-${dia.dataIso}`}
                aria-label={`${dia.nomeCurto} ${dia.diaMesBr}`}
                className={`bg-fundo-claro rounded-2xl p-4 space-y-3 border shadow-xs flex flex-col justify-between ${
                  ehHoje
                    ? "border-malva ring-1 ring-malva"
                    : "border-rosa-claro"
                }`}
              >
                <div className="space-y-3">
                  <div className="pb-2 border-b border-rosa-claro flex items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-malva">
                        {dia.nomeCurto}
                      </p>
                      <p className="text-base text-texto">{dia.diaMesBr}</p>
                    </div>
                    {ehHoje && (
                      <span className="px-2.5 py-0.5 rounded-full bg-malva text-white text-base font-semibold">
                        Hoje
                      </span>
                    )}
                  </div>

                  {listaDia.length === 0 ? (
                    <p className="text-base text-lilas-acinzentado">
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
                            className={`p-3 rounded-xl border space-y-2 ${
                              ag.conflito
                                ? "bg-rosa-claro/40 border-malva"
                                : "bg-fundo border-rosa-claro"
                            }`}
                          >
                            <div className="space-y-0.5">
                              <p className="text-base font-bold text-malva">
                                {ag.hora_inicio} ({ag.duracao_min} min)
                              </p>
                              <p className="text-base font-semibold text-texto">
                                {ag.paciente_nome}
                              </p>
                              {ag.observacao && (
                                <p className="text-base text-lilas-acinzentado">
                                  {ag.observacao}
                                </p>
                              )}
                              {ag.conflito && (
                                <p
                                  data-testid={`badge-conflito-${ag.id}`}
                                  className="text-base font-bold text-[#8B2635]"
                                >
                                  {ag.conflito_descricao ??
                                    "Conflito de horário"}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col gap-1.5 pt-1">
                              {ehPassadoOuHoje && (
                                <Button
                                  variante="primario"
                                  className="px-3 py-1.5"
                                  data-testid={`registrar-sessao-agendamento-${ag.id}`}
                                  onClick={() => setAgendamentoParaSessao(ag)}
                                >
                                  Registrar sessão
                                </Button>
                              )}
                              <Button
                                variante="contorno"
                                className="px-3 py-1.5"
                                data-testid={`editar-agendamento-${ag.id}`}
                                onClick={() => abrirModalEditar(ag)}
                              >
                                Editar / Remarcar
                              </Button>
                              <Button
                                variante="perigo"
                                className="px-3 py-1.5"
                                data-testid={`excluir-agendamento-${ag.id}`}
                                onClick={() => setAgendamentoParaExcluir(ag)}
                              >
                                Excluir
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Horários vazios clicáveis para criar agendamento rapidamente (RN72) */}
                <div className="pt-2 border-t border-rosa-claro space-y-1.5">
                  <p className="text-base font-semibold text-lilas-acinzentado">
                    Horários livres:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {horariosVaziosSugeridos.map((hora) => (
                      <Button
                        key={hora}
                        variante="contorno"
                        className="px-2.5 py-1"
                        data-testid={`slot-vazio-${dia.dataIso}-${hora}`}
                        onClick={() => abrirModalNovo(dia.dataIso, hora)}
                      >
                        + {hora}
                      </Button>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* Visão Mês (RN71, RN72) */
        <div
          data-testid="visao-mes"
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3"
        >
          {diasMes.map((dia) => {
            const listaDia = agendamentosPorData.get(dia.dataIso) ?? [];
            const ehHoje = dia.dataIso === hojeIso;

            return (
              <section
                key={dia.dataIso}
                data-testid={`celula-mes-${dia.dataIso}`}
                className={`bg-fundo-claro rounded-xl p-3 border space-y-2 flex flex-col justify-between ${
                  ehHoje ? "border-malva" : "border-rosa-claro"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-rosa-claro pb-1">
                    <span className="text-base font-bold text-malva">
                      {String(dia.dia).padStart(2, "0")} ({dia.nomeCurto})
                    </span>
                    {listaDia.length > 0 && (
                      <span className="text-base font-semibold text-texto">
                        {listaDia.length}
                      </span>
                    )}
                  </div>

                  {listaDia.length > 0 && (
                    <ul className="space-y-1.5">
                      {listaDia.map((ag) => (
                        <li
                          key={ag.id}
                          className="text-base text-texto bg-fundo p-2 rounded-lg border border-rosa-claro space-y-1"
                        >
                          <p className="font-semibold text-malva">
                            {ag.hora_inicio} — {ag.paciente_nome}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {ag.data <= hojeIso && (
                              <Button
                                variante="primario"
                                className="px-2.5 py-1"
                                onClick={() => setAgendamentoParaSessao(ag)}
                              >
                                Registrar sessão
                              </Button>
                            )}
                            <Button
                              variante="contorno"
                              className="px-2.5 py-1"
                              onClick={() => abrirModalEditar(ag)}
                            >
                              Editar
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Button
                  variante="contorno"
                  className="px-2.5 py-1"
                  data-testid={`agendar-dia-mes-${dia.dataIso}`}
                  onClick={() => abrirModalNovo(dia.dataIso, "09:00")}
                >
                  Agendar neste dia
                </Button>
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
