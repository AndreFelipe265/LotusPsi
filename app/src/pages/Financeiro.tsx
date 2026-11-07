import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Toast,
} from "../components";
import {
  extrairErroApi,
  financeiroAtualizar,
  financeiroCriar,
  financeiroExcluir,
  financeiroListar,
  financeiroResumoMensal,
  pacienteObter,
  pacientesListar,
} from "../lib/api";
import {
  aplicarMascaraDataBr,
  converterDataBrParaIso,
  converterValorReaisParaCentavos,
  deslocarMesesIso,
  formatarDataBr,
  formatarFormaPagamentoBr,
  formatarMesAnoBr,
  formatarMoedaBr,
  formatarValorInputReais,
  obterAnoMesIso,
  obterDataHojeIso,
} from "../lib/format";
import type {
  FormaPagamento,
  LancamentoFinanceiro,
  PacienteResumo,
  ResumoFinanceiroMensal,
  TipoLancamentoFinanceiro,
} from "../lib/types";

export const LIMITE_DESCRICAO_FINANCEIRO = 200;

const OPCOES_FORMA_PAGAMENTO: readonly {
  valor: FormaPagamento;
  rotulo: string;
}[] = [
  { valor: "pix", rotulo: "PIX" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "convenio", rotulo: "Convênio" },
];

function limitarCaracteres(texto: string, limite: number): string {
  const chars = Array.from(texto);
  if (chars.length <= limite) return texto;
  return chars.slice(0, limite).join("");
}

function normalizarTextoBuscaLocal(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface FinanceiroProps {
  dataHojeIso?: string;
}

export function Financeiro({ dataHojeIso }: FinanceiroProps = {}) {
  const selectPacienteId = useId();
  const selectFormaPagamentoId = useId();
  const inputBuscaId = useId();

  const hojeIso = dataHojeIso ?? obterDataHojeIso();
  const [dataReferenciaIso, setDataReferenciaIso] = useState<string>(hojeIso);
  const anoMesAtual = useMemo(
    () => obterAnoMesIso(dataReferenciaIso),
    [dataReferenciaIso],
  );

  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([]);
  const [resumoServidor, setResumoServidor] =
    useState<ResumoFinanceiroMensal | null>(null);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<
    "todos" | TipoLancamentoFinanceiro
  >("todos");
  const [busca, setBusca] = useState<string>("");

  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);

  // Estado do modal de criar/editar lançamento (RN81, RN82, RN85)
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  const [lancamentoEmEdicao, setLancamentoEmEdicao] =
    useState<LancamentoFinanceiro | null>(null);
  const [tipoForm, setTipoForm] = useState<TipoLancamentoFinanceiro>("entrada");
  const [dataBrForm, setDataBrForm] = useState<string>(() =>
    formatarDataBr(hojeIso),
  );
  const [pacienteIdForm, setPacienteIdForm] = useState<string>("");
  const [valorReaisForm, setValorReaisForm] = useState<string>("");
  const [descricaoForm, setDescricaoForm] = useState<string>("");
  const [formaPagamentoForm, setFormaPagamentoForm] = useState<string>("");

  const [erroData, setErroData] = useState<string | null>(null);
  const [erroValor, setErroValor] = useState<string | null>(null);
  const [erroDescricao, setErroDescricao] = useState<string | null>(null);
  const [erroFormGeral, setErroFormGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);

  // Exclusão com confirmação (RN85)
  const [lancamentoParaExcluir, setLancamentoParaExcluir] =
    useState<LancamentoFinanceiro | null>(null);
  const [excluindo, setExcluindo] = useState<boolean>(false);

  const carregarDados = useCallback(() => {
    Promise.all([
      financeiroListar({ ano_mes: anoMesAtual }).catch(
        () => null as LancamentoFinanceiro[] | null,
      ),
      financeiroResumoMensal(anoMesAtual).catch(
        () => null as ResumoFinanceiroMensal | null,
      ),
    ]).then(([lista, resumo]) => {
      if (Array.isArray(lista)) {
        setLancamentos(lista);
      }
      if (resumo && typeof resumo === "object" && "saldo_centavos" in resumo) {
        setResumoServidor(resumo);
      }
    });
  }, [anoMesAtual]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    let cancelado = false;
    pacientesListar({ status: "todos" })
      .then((lista) => {
        if (!cancelado && Array.isArray(lista)) {
          setPacientes(lista);
        }
      })
      .catch(() => {
        // Ignora erro inicial em ambiente sem mock
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const lancamentosMes = useMemo(
    () =>
      lancamentos
        .filter((item) => item.data.startsWith(anoMesAtual))
        .sort((a, b) => {
          const cmpData = b.data.localeCompare(a.data);
          if (cmpData !== 0) return cmpData;
          return b.criado_em.localeCompare(a.criado_em);
        }),
    [lancamentos, anoMesAtual],
  );

  // Resumo consolidado do mês selecionado (RN83)
  const resumoExibido = useMemo<ResumoFinanceiroMensal>(() => {
    let totalEntradas = 0;
    let totalGastos = 0;
    let qtdEntradas = 0;
    let qtdGastos = 0;

    for (const item of lancamentosMes) {
      if (item.tipo === "entrada") {
        totalEntradas += item.valor_centavos;
        qtdEntradas += 1;
      } else {
        totalGastos += item.valor_centavos;
        qtdGastos += 1;
      }
    }

    if (
      lancamentosMes.length === 0 &&
      resumoServidor &&
      resumoServidor.ano_mes === anoMesAtual
    ) {
      return resumoServidor;
    }

    return {
      ano_mes: anoMesAtual,
      total_entradas_centavos: totalEntradas,
      total_gastos_centavos: totalGastos,
      saldo_centavos: totalEntradas - totalGastos,
      quantidade_entradas: qtdEntradas,
      quantidade_gastos: qtdGastos,
      quantidade_lancamentos: qtdEntradas + qtdGastos,
    };
  }, [lancamentosMes, resumoServidor, anoMesAtual]);

  // Filtro por tipo e busca sem acento na descrição ou no nome do paciente (RN84)
  const lancamentosFiltrados = useMemo(() => {
    const termo = normalizarTextoBuscaLocal(busca);
    return lancamentosMes.filter((item) => {
      if (filtroTipo !== "todos" && item.tipo !== filtroTipo) {
        return false;
      }
      if (!termo) return true;
      const descNorm = normalizarTextoBuscaLocal(item.descricao);
      const pacNorm = normalizarTextoBuscaLocal(item.paciente_nome ?? "");
      return descNorm.includes(termo) || pacNorm.includes(termo);
    });
  }, [lancamentosMes, filtroTipo, busca]);

  function limparErrosModal() {
    setErroData(null);
    setErroValor(null);
    setErroDescricao(null);
    setErroFormGeral(null);
  }

  function abrirModalNovo(tipoPadrao: TipoLancamentoFinanceiro) {
    limparErrosModal();
    setLancamentoEmEdicao(null);
    setTipoForm(tipoPadrao);
    const dataPadrao = dataReferenciaIso.startsWith(obterAnoMesIso(hojeIso))
      ? hojeIso
      : `${anoMesAtual}-01`;
    setDataBrForm(formatarDataBr(dataPadrao));
    setPacienteIdForm("");
    setValorReaisForm("");
    setDescricaoForm(tipoPadrao === "entrada" ? "Sessão de psicoterapia" : "");
    setFormaPagamentoForm("pix");
    setModalAberto(true);
  }

  function abrirModalEditar(item: LancamentoFinanceiro) {
    limparErrosModal();
    setLancamentoEmEdicao(item);
    setTipoForm(item.tipo);
    setDataBrForm(formatarDataBr(item.data));
    setPacienteIdForm(item.paciente_id ?? "");
    setValorReaisForm(formatarValorInputReais(item.valor_centavos));
    setDescricaoForm(item.descricao);
    setFormaPagamentoForm(item.forma_pagamento ?? "");
    setModalAberto(true);
  }

  function aoSelecionarPacienteNoForm(novoPacienteId: string) {
    setPacienteIdForm(novoPacienteId);
    // RN82: se selecionar paciente em uma entrada e o valor ainda estiver vazio, sugere valor_sessao_centavos
    if (novoPacienteId && tipoForm === "entrada" && !valorReaisForm.trim()) {
      pacienteObter(novoPacienteId)
        .then((dadosPaciente) => {
          if (
            dadosPaciente &&
            typeof dadosPaciente.valor_sessao_centavos === "number" &&
            dadosPaciente.valor_sessao_centavos > 0
          ) {
            setValorReaisForm((valorAtual) =>
              valorAtual.trim()
                ? valorAtual
                : formatarValorInputReais(dadosPaciente.valor_sessao_centavos),
            );
          }
        })
        .catch(() => {
          // Mantém campo manual caso não consiga consultar o cadastro completo
        });
    }
  }

  async function aoSubmeterLancamento(e: React.FormEvent) {
    e.preventDefault();
    limparErrosModal();

    const dataIso = converterDataBrParaIso(dataBrForm);
    if (!dataIso) {
      setErroData("Data do lançamento inválida. Use o formato dd/mm/aaaa.");
      return;
    }

    const valorCentavos = converterValorReaisParaCentavos(valorReaisForm);
    if (!valorCentavos || valorCentavos <= 0) {
      setErroValor(
        "Informe um valor válido maior que zero (ex.: 180,00).",
      );
      return;
    }

    const descLimpa = descricaoForm.trim();
    if (!descLimpa) {
      setErroDescricao("A descrição do lançamento é obrigatória.");
      return;
    }
    if (Array.from(descLimpa).length > LIMITE_DESCRICAO_FINANCEIRO) {
      setErroDescricao(
        `A descrição deve ter no máximo ${LIMITE_DESCRICAO_FINANCEIRO} caracteres.`,
      );
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        paciente_id:
          tipoForm === "entrada" && pacienteIdForm.trim()
            ? pacienteIdForm.trim()
            : null,
        tipo: tipoForm,
        data: dataIso,
        valor_centavos: valorCentavos,
        descricao: descLimpa,
        forma_pagamento: (formaPagamentoForm.trim() ||
          null) as FormaPagamento | null,
      };

      const salvo = lancamentoEmEdicao
        ? await financeiroAtualizar(lancamentoEmEdicao.id, payload)
        : await financeiroCriar(payload);

      setLancamentos((atuais) => {
        const semAntigo = lancamentoEmEdicao
          ? atuais.filter((l) => l.id !== lancamentoEmEdicao.id)
          : atuais;
        return [salvo, ...semAntigo];
      });

      setModalAberto(false);
      setLancamentoEmEdicao(null);
      setToastSucesso(
        lancamentoEmEdicao
          ? "Lançamento atualizado com sucesso."
          : "Lançamento registrado com sucesso.",
      );
      carregarDados();
    } catch (erro) {
      setErroFormGeral(extrairErroApi(erro).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    if (!lancamentoParaExcluir) return;
    setExcluindo(true);
    setErroMensagem(null);
    try {
      await financeiroExcluir(lancamentoParaExcluir.id);
      setLancamentos((atuais) =>
        atuais.filter((l) => l.id !== lancamentoParaExcluir.id),
      );
      setLancamentoParaExcluir(null);
      setToastSucesso("Lançamento excluído com sucesso.");
      carregarDados();
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setExcluindo(false);
    }
  }

  const totalCaracteresDescricao = Array.from(descricaoForm).length;

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-fundo-claro border border-rosa-claro rounded-2xl p-6 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-malva">Financeiro</h2>
          <p className="text-base text-texto">
            Controle de entradas (sessões) e gastos do consultório com resumo
            mensal.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variante="primario"
            onClick={() => abrirModalNovo("entrada")}
          >
            Nova entrada
          </Button>
          <Button
            variante="secundario"
            onClick={() => abrirModalNovo("gasto")}
          >
            Novo gasto
          </Button>
        </div>
      </header>

      {/* Seletor de mês/ano (RN83) */}
      <section
        aria-label="Seleção de mês do financeiro"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
      >
        <p
          data-testid="rotulo-mes-financeiro"
          className="text-xl font-bold text-malva capitalize"
        >
          {formatarMesAnoBr(dataReferenciaIso)}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variante="contorno"
            onClick={() =>
              setDataReferenciaIso((atual) => deslocarMesesIso(atual, -1))
            }
          >
            Mês anterior
          </Button>
          <Button
            variante="secundario"
            onClick={() => setDataReferenciaIso(hojeIso)}
          >
            Mês atual
          </Button>
          <Button
            variante="contorno"
            onClick={() =>
              setDataReferenciaIso((atual) => deslocarMesesIso(atual, 1))
            }
          >
            Próximo mês
          </Button>
        </div>
      </section>

      {/* Cards de resumo mensal (RN83) */}
      <section
        aria-label="Resumo financeiro do mês"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div
          data-testid="card-resumo-entradas"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-5 space-y-1 shadow-xs"
        >
          <p className="text-base font-semibold text-lilas-acinzentado">
            Entradas no mês
          </p>
          <p className="text-2xl font-bold text-malva">
            {formatarMoedaBr(resumoExibido.total_entradas_centavos)}
          </p>
          <p className="text-base text-texto">
            {resumoExibido.quantidade_entradas}{" "}
            {resumoExibido.quantidade_entradas === 1
              ? "recebimento registrado"
              : "recebimentos registrados"}
          </p>
        </div>

        <div
          data-testid="card-resumo-gastos"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-5 space-y-1 shadow-xs"
        >
          <p className="text-base font-semibold text-lilas-acinzentado">
            Gastos no mês
          </p>
          <p className="text-2xl font-bold text-[#8B3A52]">
            {formatarMoedaBr(resumoExibido.total_gastos_centavos)}
          </p>
          <p className="text-base text-texto">
            {resumoExibido.quantidade_gastos}{" "}
            {resumoExibido.quantidade_gastos === 1
              ? "despesa registrada"
              : "despesas registradas"}
          </p>
        </div>

        <div
          data-testid="card-resumo-saldo"
          className="bg-fundo-claro border border-malva rounded-2xl p-5 space-y-1 shadow-xs"
        >
          <p className="text-base font-semibold text-lilas-acinzentado">
            Saldo do mês
          </p>
          <p
            className={`text-2xl font-bold ${
              resumoExibido.saldo_centavos < 0
                ? "text-[#8B3A52]"
                : "text-malva"
            }`}
          >
            {formatarMoedaBr(resumoExibido.saldo_centavos)}
          </p>
          <p className="text-base text-texto">
            Total de {resumoExibido.quantidade_lancamentos}{" "}
            {resumoExibido.quantidade_lancamentos === 1
              ? "lançamento"
              : "lançamentos"}
          </p>
        </div>
      </section>

      {erroMensagem && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-300 text-base text-red-900"
        >
          {erroMensagem}
        </div>
      )}

      {/* Filtros e listagem de lançamentos (RN84, RN85) */}
      <section
        aria-label="Lançamentos do mês"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-5 shadow-xs"
      >
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-rosa-claro pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variante={filtroTipo === "todos" ? "primario" : "contorno"}
              aria-pressed={filtroTipo === "todos"}
              onClick={() => setFiltroTipo("todos")}
            >
              Todos
            </Button>
            <Button
              variante={filtroTipo === "entrada" ? "primario" : "contorno"}
              aria-pressed={filtroTipo === "entrada"}
              onClick={() => setFiltroTipo("entrada")}
            >
              Entradas
            </Button>
            <Button
              variante={filtroTipo === "gasto" ? "primario" : "contorno"}
              aria-pressed={filtroTipo === "gasto"}
              onClick={() => setFiltroTipo("gasto")}
            >
              Gastos
            </Button>
          </div>

          <div className="w-full lg:w-96">
            <label
              htmlFor={inputBuscaId}
              className="block text-base font-semibold text-texto mb-1"
            >
              Buscar no mês
            </label>
            <input
              id={inputBuscaId}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição ou paciente..."
              className="w-full px-4 py-2.5 rounded-xl bg-fundo border border-rosa-claro text-base text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>
        </div>

        {lancamentosFiltrados.length === 0 ? (
          <EmptyState
            titulo="Nenhum lançamento encontrado neste mês"
            descricao="Registre uma entrada de sessão ou um gasto do consultório usando os botões no topo da página."
            rotuloAcao="Nova entrada"
            aoClicarAcao={() => abrirModalNovo("entrada")}
          />
        ) : (
          <ul
            data-testid="lista-lancamentos-financeiros"
            className="space-y-3"
          >
            {lancamentosFiltrados.map((item) => {
              const ehEntrada = item.tipo === "entrada";
              return (
                <li
                  key={item.id}
                  data-testid={`item-lancamento-${item.id}`}
                  className="p-4 rounded-xl bg-fundo border border-rosa-claro flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className={`inline-block px-3 py-0.5 rounded-full text-base font-bold ${
                          ehEntrada
                            ? "bg-malva text-white"
                            : "bg-rosa-claro/70 text-texto border border-lilas-acinzentado"
                        }`}
                      >
                        {ehEntrada ? "Entrada" : "Gasto"}
                      </span>
                      <span className="text-base font-bold text-malva">
                        {formatarDataBr(item.data)}
                      </span>
                      <span className="text-base font-bold text-texto break-words">
                        {item.descricao}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-base text-lilas-acinzentado">
                      {item.paciente_nome && (
                        <span>
                          Paciente:{" "}
                          <strong className="text-texto">
                            {item.paciente_nome}
                          </strong>
                        </span>
                      )}
                      {item.forma_pagamento && (
                        <span>
                          Forma de pagamento:{" "}
                          <strong className="text-texto">
                            {formatarFormaPagamentoBr(item.forma_pagamento)}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                    <span
                      data-testid={`valor-lancamento-${item.id}`}
                      className={`text-lg font-bold ${
                        ehEntrada ? "text-malva" : "text-[#8B3A52]"
                      }`}
                    >
                      {ehEntrada ? "+ " : "- "}
                      {formatarMoedaBr(item.valor_centavos)}
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        variante="contorno"
                        tamanho="compacto"
                        data-testid={`editar-lancamento-${item.id}`}
                        onClick={() => abrirModalEditar(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        variante="perigo"
                        tamanho="compacto"
                        data-testid={`excluir-lancamento-${item.id}`}
                        onClick={() => setLancamentoParaExcluir(item)}
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
      </section>

      {/* Modal de criar/editar lançamento financeiro (RN81, RN82, RN85) */}
      <Modal
        aberto={modalAberto}
        titulo={
          lancamentoEmEdicao
            ? "Editar lançamento financeiro"
            : tipoForm === "entrada"
            ? "Nova entrada financeira"
            : "Novo gasto do consultório"
        }
        aoFechar={() => {
          if (!salvando) {
            setModalAberto(false);
            setLancamentoEmEdicao(null);
          }
        }}
      >
        <form onSubmit={aoSubmeterLancamento} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <span className="block text-base font-semibold text-texto">
              Tipo de lançamento *
            </span>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variante={tipoForm === "entrada" ? "primario" : "contorno"}
                aria-pressed={tipoForm === "entrada"}
                onClick={() => setTipoForm("entrada")}
              >
                Entrada (Recebimento)
              </Button>
              <Button
                type="button"
                variante={tipoForm === "gasto" ? "primario" : "contorno"}
                aria-pressed={tipoForm === "gasto"}
                onClick={() => setTipoForm("gasto")}
              >
                Gasto (Despesa)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              rotulo="Data (dd/mm/aaaa)"
              required
              value={dataBrForm}
              onChange={(e) => {
                setDataBrForm(aplicarMascaraDataBr(e.target.value));
                setErroData(null);
              }}
              placeholder="dd/mm/aaaa"
              erro={erroData ?? undefined}
            />

            <Input
              rotulo="Valor (R$)"
              required
              value={valorReaisForm}
              onChange={(e) => {
                setValorReaisForm(e.target.value);
                setErroValor(null);
              }}
              placeholder="Ex.: 180,00"
              erro={erroValor ?? undefined}
            />
          </div>

          {tipoForm === "entrada" && (
            <div className="space-y-1.5">
              <label
                htmlFor={selectPacienteId}
                className="block text-base font-semibold text-texto"
              >
                Paciente (opcional)
              </label>
              <select
                id={selectPacienteId}
                value={pacienteIdForm}
                onChange={(e) => aoSelecionarPacienteNoForm(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-fundo border border-rosa-claro text-base text-texto focus:outline-none focus:ring-2 focus:ring-malva"
              >
                <option value="">Sem vínculo com paciente</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Input
              rotulo="Descrição"
              required
              value={descricaoForm}
              onChange={(e) => {
                setDescricaoForm(
                  limitarCaracteres(
                    e.target.value,
                    LIMITE_DESCRICAO_FINANCEIRO,
                  ),
                );
                setErroDescricao(null);
              }}
              placeholder={
                tipoForm === "entrada"
                  ? "Ex.: Sessão de psicoterapia"
                  : "Ex.: Aluguel da sala / Material"
              }
              erro={erroDescricao ?? undefined}
            />
            <p className="text-base text-lilas-acinzentado text-right">
              {totalCaracteresDescricao}/{LIMITE_DESCRICAO_FINANCEIRO}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={selectFormaPagamentoId}
              className="block text-base font-semibold text-texto"
            >
              Forma de pagamento (opcional)
            </label>
            <select
              id={selectFormaPagamentoId}
              value={formaPagamentoForm}
              onChange={(e) => setFormaPagamentoForm(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-fundo border border-rosa-claro text-base text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            >
              <option value="">Não informada</option>
              {OPCOES_FORMA_PAGAMENTO.map((op) => (
                <option key={op.valor} value={op.valor}>
                  {op.rotulo}
                </option>
              ))}
            </select>
          </div>

          {erroFormGeral && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-base text-red-900"
            >
              {erroFormGeral}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-rosa-claro">
            <Button
              type="button"
              variante="contorno"
              disabled={salvando}
              onClick={() => {
                setModalAberto(false);
                setLancamentoEmEdicao(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" variante="primario" disabled={salvando}>
              {salvando
                ? "Salvando..."
                : lancamentoEmEdicao
                ? "Salvar alterações"
                : "Registrar lançamento"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmação de exclusão (RN85) */}
      <ConfirmDialog
        aberto={Boolean(lancamentoParaExcluir)}
        titulo="Excluir lançamento financeiro"
        mensagem="Tem certeza de que deseja excluir este lançamento? Esta ação atualizará o saldo do mês."
        detalheDestaque={
          lancamentoParaExcluir
            ? `${
                lancamentoParaExcluir.tipo === "entrada" ? "Entrada" : "Gasto"
              } de ${formatarMoedaBr(
                lancamentoParaExcluir.valor_centavos,
              )} em ${formatarDataBr(lancamentoParaExcluir.data)} — ${
                lancamentoParaExcluir.descricao
              }`
            : undefined
        }
        rotuloConfirmar={excluindo ? "Excluindo..." : "Sim, excluir"}
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => {
          if (!excluindo) setLancamentoParaExcluir(null);
        }}
      />

      {toastSucesso && (
        <Toast
          mensagem={toastSucesso}
          tipo="sucesso"
          aoFechar={() => setToastSucesso(null)}
        />
      )}
    </div>
  );
}
