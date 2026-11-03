import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  ConfirmDialog,
  Input,
  Modal,
  SessaoModal,
  Toast,
} from "../components";
import {
  agendamentoProximoPaciente,
  extrairErroApi,
  pacienteDefinirStatus,
  pacienteExcluir,
  pacienteObter,
  sessaoExcluir,
  sessoesListar,
} from "../lib/api";
import {
  formatarDataBr,
  formatarIdadeComNascimento,
  formatarMoedaBr,
  formatarTelefoneBr,
} from "../lib/format";
import type { Agendamento, Paciente, Sessao } from "../lib/types";

function ordenarSessoesDecrescente(lista: Sessao[]): Sessao[] {
  return [...lista].sort((a, b) => {
    const cmpData = b.data.localeCompare(a.data);
    if (cmpData !== 0) return cmpData;
    return b.criado_em.localeCompare(a.criado_em);
  });
}

export function PacientePerfil() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [proximoAgendamento, setProximoAgendamento] =
    useState<Agendamento | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);

  const [maisOpcoesAberto, setMaisOpcoesAberto] = useState<boolean>(false);
  const [confirmandoInativar, setConfirmandoInativar] =
    useState<boolean>(false);
  const [modalExcluirAberto, setModalExcluirAberto] = useState<boolean>(false);
  const [confirmacaoNome, setConfirmacaoNome] = useState<string>("");
  const [erroConfirmacaoNome, setErroConfirmacaoNome] = useState<string | null>(
    null,
  );
  const [processandoAcao, setProcessandoAcao] = useState<boolean>(false);

  // Estado de sessões (T08, RN20–RN27)
  const [modalSessaoAberto, setModalSessaoAberto] = useState<boolean>(false);
  const [sessaoEmEdicao, setSessaoEmEdicao] = useState<Sessao | null>(null);
  const [sessaoParaExcluir, setSessaoParaExcluir] = useState<Sessao | null>(
    null,
  );
  const [excluindoSessao, setExcluindoSessao] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    setCarregando(true);

    Promise.all([
      pacienteObter(id),
      sessoesListar(id).catch(() => [] as Sessao[]),
      agendamentoProximoPaciente(id).catch(() => null),
    ])
      .then(([dadosPaciente, listaSessoes, proxAg]) => {
        if (!cancelado) {
          const sessoesValidas = Array.isArray(listaSessoes)
            ? ordenarSessoesDecrescente(listaSessoes)
            : [];
          setSessoes(sessoesValidas);
          setProximoAgendamento(
            proxAg && typeof proxAg === "object" && "data" in proxAg
              ? proxAg
              : null,
          );
          if (sessoesValidas.length > 0) {
            setPaciente({
              ...dadosPaciente,
              total_sessoes: sessoesValidas.length,
              ultima_sessao: sessoesValidas[0].data,
            });
          } else {
            setPaciente(dadosPaciente);
          }
          setErroMensagem(null);
        }
      })
      .catch((erro) => {
        if (!cancelado) {
          setErroMensagem(extrairErroApi(erro).mensagem);
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregando(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [id]);

  function sincronizarResumoSessoesNoPaciente(novasSessoes: Sessao[]) {
    const ordenadas = ordenarSessoesDecrescente(novasSessoes);
    setSessoes(ordenadas);
    setPaciente((atual) =>
      atual
        ? {
            ...atual,
            total_sessoes: ordenadas.length,
            ultima_sessao: ordenadas[0]?.data ?? null,
          }
        : null,
    );
  }

  function abrirNovaSessao() {
    setSessaoEmEdicao(null);
    setModalSessaoAberto(true);
  }

  function abrirEditarSessao(sessao: Sessao) {
    setSessaoEmEdicao(sessao);
    setModalSessaoAberto(true);
  }

  function aoSalvarSessao(sessaoSalva: Sessao) {
    const jaExistia = sessoes.some((s) => s.id === sessaoSalva.id);
    const novasSessoes = jaExistia
      ? sessoes.map((s) => (s.id === sessaoSalva.id ? sessaoSalva : s))
      : [sessaoSalva, ...sessoes];

    sincronizarResumoSessoesNoPaciente(novasSessoes);
    setModalSessaoAberto(false);
    setSessaoEmEdicao(null);
    setToastSucesso(
      jaExistia
        ? "Sessão atualizada com sucesso."
        : "Sessão registrada com sucesso.",
    );
  }

  async function confirmarExclusaoSessao() {
    if (!sessaoParaExcluir) return;
    setExcluindoSessao(true);
    setErroMensagem(null);
    try {
      await sessaoExcluir(sessaoParaExcluir.id);
      const restantes = sessoes.filter((s) => s.id !== sessaoParaExcluir.id);
      sincronizarResumoSessoesNoPaciente(restantes);
      setSessaoParaExcluir(null);
      setToastSucesso("Sessão excluída com sucesso.");
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setExcluindoSessao(false);
    }
  }

  async function alterarStatus(novoStatus: "ativo" | "inativo") {
    if (!paciente) return;
    setProcessandoAcao(true);
    setErroMensagem(null);
    try {
      const atualizado = await pacienteDefinirStatus(paciente.id, novoStatus);
      setPaciente(atualizado);
      setConfirmandoInativar(false);
      setMaisOpcoesAberto(false);
      setToastSucesso(
        novoStatus === "inativo"
          ? "Paciente marcado como inativo."
          : "Paciente reativado com sucesso.",
      );
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setProcessandoAcao(false);
    }
  }

  async function confirmarExclusaoDefinitiva() {
    if (!paciente) return;
    setErroConfirmacaoNome(null);

    if (
      confirmacaoNome.trim().toLowerCase() !==
      paciente.nome.trim().toLowerCase()
    ) {
      setErroConfirmacaoNome(
        "Digite o nome completo exatamente como consta no cadastro para confirmar.",
      );
      return;
    }

    setProcessandoAcao(true);
    try {
      await pacienteExcluir(paciente.id, confirmacaoNome.trim());
      navigate("/pacientes");
    } catch (erro) {
      setErroConfirmacaoNome(extrairErroApi(erro).mensagem);
    } finally {
      setProcessandoAcao(false);
    }
  }

  if (carregando) {
    return (
      <div className="max-w-5xl mx-auto p-6 bg-fundo-claro border border-rosa-claro rounded-2xl text-base text-texto">
        Carregando perfil do paciente...
      </div>
    );
  }

  if (!paciente) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-malva">Perfil do Paciente</h2>
          <Button variante="contorno" onClick={() => navigate("/pacientes")}>
            Voltar para pacientes
          </Button>
        </div>
        <div className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 text-base text-texto">
          {erroMensagem ?? "Paciente não encontrado."}
        </div>
      </div>
    );
  }

  const telefonePrincipal = formatarTelefoneBr(
    paciente.telefone || paciente.whatsapp,
  );
  const idadeFormatada = formatarIdadeComNascimento(paciente.data_nascimento);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button variante="contorno" onClick={() => navigate("/pacientes")}>
          Voltar para pacientes
        </Button>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variante="contorno"
            onClick={() => navigate(`/pacientes/${paciente.id}/editar`)}
          >
            Editar dados cadastrais
          </Button>
          <Button
            variante="contorno"
            aria-expanded={maisOpcoesAberto}
            onClick={() => setMaisOpcoesAberto((prev) => !prev)}
          >
            Mais opções
          </Button>
        </div>
      </div>

      {/* Cabeçalho do perfil (T07) */}
      <header
        aria-label="Cabeçalho do paciente"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-malva">{paciente.nome}</h2>
            <span
              data-testid="badge-status-paciente"
              className={`inline-block px-3 py-1 rounded-full text-base font-semibold border ${
                paciente.status === "ativo"
                  ? "bg-malva text-white border-malva"
                  : "bg-rosa-claro/50 text-texto border-lilas-acinzentado"
              }`}
            >
              {paciente.status === "ativo" ? "Ativo" : "Inativo"}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-base text-texto">
            <span>
              <strong>Idade / Nascimento:</strong> {idadeFormatada}
            </span>
            <span>
              <strong>Telefone:</strong> {telefonePrincipal}
            </span>
            {paciente.email && (
              <span>
                <strong>E-mail:</strong> {paciente.email}
              </span>
            )}
            <span data-testid="proximo-agendamento-paciente">
              <strong>Próximo agendamento:</strong>{" "}
              {proximoAgendamento
                ? `${formatarDataBr(proximoAgendamento.data)} às ${proximoAgendamento.hora_inicio}`
                : "Nenhum agendado"}
            </span>
          </div>

          {paciente.status === "inativo" && paciente.inativado_em && (
            <p className="text-base text-lilas-acinzentado">
              Inativado em {formatarDataBr(paciente.inativado_em)}.
            </p>
          )}
        </div>

        <div className="shrink-0">
          <Button variante="primario" onClick={abrirNovaSessao}>
            Nova sessão
          </Button>
        </div>
      </header>

      {/* Painel recolhível de Mais opções (RN14, RN18) */}
      {maisOpcoesAberto && (
        <section
          aria-label="Mais opções do paciente"
          data-testid="secao-mais-opcoes"
          className="bg-fundo-claro border border-malva rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <h3 className="text-lg font-bold text-malva">
            Mais opções do cadastro
          </h3>
          <p className="text-base text-texto">
            Você pode alterar o status do paciente para inativo (mantendo todo o
            histórico) ou excluir definitivamente o registro.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            {paciente.status === "ativo" ? (
              <Button
                variante="secundario"
                onClick={() => setConfirmandoInativar(true)}
                disabled={processandoAcao}
              >
                Inativar paciente
              </Button>
            ) : (
              <Button
                variante="primario"
                onClick={() => void alterarStatus("ativo")}
                disabled={processandoAcao}
              >
                Reativar paciente
              </Button>
            )}

            <Button
              variante="perigo"
              onClick={() => {
                setConfirmacaoNome("");
                setErroConfirmacaoNome(null);
                setModalExcluirAberto(true);
              }}
              disabled={processandoAcao}
            >
              Excluir definitivamente
            </Button>
          </div>
        </section>
      )}

      {/* Histórico compacto de Sessões (RN19, RN24–RN27) */}
      <section
        aria-label="Histórico de sessões"
        data-testid="secao-historico-sessoes"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rosa-claro pb-4">
          <div>
            <h3 className="text-xl font-bold text-malva">
              Histórico de sessões
            </h3>
            <p className="text-base text-texto">
              Total de sessões: <strong>{paciente.total_sessoes}</strong> ·
              Última sessão:{" "}
              <strong>
                {paciente.ultima_sessao
                  ? formatarDataBr(paciente.ultima_sessao)
                  : "Nenhuma"}
              </strong>
            </p>
          </div>
          <Button variante="primario" onClick={abrirNovaSessao}>
            Nova sessão
          </Button>
        </div>

        {sessoes.length === 0 ? (
          <div className="p-5 rounded-xl bg-fundo border border-rosa-claro text-base text-texto">
            Nenhuma sessão registrada até o momento. Use o botão{" "}
            <strong>Nova sessão</strong> acima para registrar um atendimento.
          </div>
        ) : (
          <ul
            data-testid="lista-historico-sessoes"
            className="space-y-3"
            aria-label="Lista de sessões registradas"
          >
            {sessoes.map((sessao) => {
              const foiEditada =
                Boolean(sessao.atualizado_em) &&
                sessao.atualizado_em !== sessao.criado_em;

              return (
                <li
                  key={sessao.id}
                  data-testid={`item-sessao-${sessao.id}`}
                  className="p-4 rounded-xl bg-fundo border border-rosa-claro space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        data-testid={`data-sessao-${sessao.id}`}
                        className="text-base font-bold text-malva"
                      >
                        {formatarDataBr(sessao.data)}
                      </span>
                      {foiEditada && (
                        <span
                          data-testid={`selo-editado-${sessao.id}`}
                          className="text-base font-semibold text-lilas-acinzentado"
                        >
                          (editado)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variante="contorno"
                        className="px-3 py-1.5"
                        onClick={() => abrirEditarSessao(sessao)}
                        aria-label={`Editar sessão de ${formatarDataBr(sessao.data)}`}
                      >
                        Editar
                      </Button>
                      <Button
                        variante="perigo"
                        className="px-3 py-1.5"
                        onClick={() => setSessaoParaExcluir(sessao)}
                        aria-label={`Excluir sessão de ${formatarDataBr(sessao.data)}`}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>

                  <p className="text-base text-texto whitespace-pre-line">
                    {sessao.resumo}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Dados cadastrais (RN19) */}
      <section
        aria-label="Dados cadastrais"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-6 shadow-xs"
      >
        <div className="flex items-center justify-between gap-4 border-b border-rosa-claro pb-4">
          <h3 className="text-xl font-bold text-malva">Dados cadastrais</h3>
          <Button
            variante="contorno"
            onClick={() => navigate(`/pacientes/${paciente.id}/editar`)}
          >
            Editar dados
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-base text-texto">
          <div className="space-y-2">
            <h4 className="font-bold text-malva">Dados pessoais</h4>
            <p>
              <strong>Nome completo:</strong> {paciente.nome}
            </p>
            <p>
              <strong>Data de nascimento:</strong> {idadeFormatada}
            </p>
            <p>
              <strong>Documento:</strong> {paciente.documento || "—"}
            </p>
            <p>
              <strong>Ocupação / Escola:</strong> {paciente.ocupacao || "—"}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-malva">Contato</h4>
            <p>
              <strong>Telefone:</strong> {formatarTelefoneBr(paciente.telefone)}
            </p>
            <p>
              <strong>WhatsApp:</strong>{" "}
              {formatarTelefoneBr(paciente.whatsapp || paciente.telefone)}
            </p>
            <p>
              <strong>E-mail:</strong> {paciente.email || "—"}
            </p>
            <p>
              <strong>Endereço:</strong> {paciente.endereco || "—"}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-malva">Família e Responsável</h4>
            <p>
              <strong>Mãe:</strong> {paciente.nome_mae || "—"}
            </p>
            <p>
              <strong>Pai:</strong> {paciente.nome_pai || "—"}
            </p>
            <p>
              <strong>Responsável legal:</strong>{" "}
              {paciente.responsavel_nome
                ? `${paciente.responsavel_nome}${
                    paciente.responsavel_parentesco
                      ? ` (${paciente.responsavel_parentesco})`
                      : ""
                  }`
                : "—"}
            </p>
            <p>
              <strong>Telefone do responsável:</strong>{" "}
              {formatarTelefoneBr(paciente.responsavel_telefone)}
            </p>
            <p>
              <strong>Contato de emergência:</strong>{" "}
              {paciente.contato_emergencia_nome
                ? `${paciente.contato_emergencia_nome} — ${formatarTelefoneBr(
                    paciente.contato_emergencia_telefone,
                  )}`
                : "—"}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-malva">Atendimento e Observações</h4>
            <p>
              <strong>Motivo da procura:</strong>{" "}
              {paciente.motivo_procura || "—"}
            </p>
            <p>
              <strong>Modalidade:</strong>{" "}
              {paciente.modalidade === "particular"
                ? "Particular"
                : paciente.modalidade === "convenio"
                  ? "Convênio"
                  : "—"}
            </p>
            <p>
              <strong>Convênio:</strong> {paciente.convenio_nome || "—"}
            </p>
            <p>
              <strong>Valor da sessão:</strong>{" "}
              {formatarMoedaBr(paciente.valor_sessao_centavos)}
            </p>
            <p>
              <strong>Observações:</strong> {paciente.observacoes || "—"}
            </p>
          </div>
        </div>
      </section>

      {/* Modal T08 — Criar ou Editar Sessão */}
      <SessaoModal
        aberto={modalSessaoAberto}
        pacienteId={paciente.id}
        pacienteNome={paciente.nome}
        sessaoParaEditar={sessaoEmEdicao}
        aoFechar={() => {
          setModalSessaoAberto(false);
          setSessaoEmEdicao(null);
        }}
        aoSalva={aoSalvarSessao}
      />

      {/* Diálogo de confirmação para excluir sessão (RN26) */}
      <ConfirmDialog
        aberto={Boolean(sessaoParaExcluir)}
        titulo="Excluir sessão"
        mensagem="Tem certeza de que deseja excluir esta sessão? Esta ação não poderá ser desfeita."
        detalheDestaque={
          sessaoParaExcluir
            ? `${formatarDataBr(sessaoParaExcluir.data)} — ${sessaoParaExcluir.resumo}`
            : undefined
        }
        rotuloConfirmar="Sim, excluir sessão"
        destrutivo={true}
        carregando={excluindoSessao}
        aoConfirmar={() => void confirmarExclusaoSessao()}
        aoCancelar={() => setSessaoParaExcluir(null)}
      />

      {/* Diálogo de confirmação para inativar paciente (RN14) */}
      <ConfirmDialog
        aberto={confirmandoInativar}
        titulo="Inativar paciente"
        mensagem="Deseja marcar este paciente como inativo? Todo o histórico de sessões e dados cadastrais será mantido e você poderá reativá-lo quando quiser."
        detalheDestaque={paciente.nome}
        rotuloConfirmar="Sim, inativar paciente"
        destrutivo={false}
        carregando={processandoAcao}
        aoConfirmar={() => void alterarStatus("inativo")}
        aoCancelar={() => setConfirmandoInativar(false)}
      />

      {/* Modal de confirmação para exclusão definitiva (RN18) */}
      <Modal
        aberto={modalExcluirAberto}
        titulo="Excluir paciente definitivamente"
        aoFechar={() => setModalExcluirAberto(false)}
        larguraMax="lg"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setModalExcluirAberto(false)}
              disabled={processandoAcao}
            >
              Cancelar
            </Button>
            {paciente.status === "ativo" && (
              <Button
                variante="secundario"
                onClick={() => {
                  setModalExcluirAberto(false);
                  setConfirmandoInativar(true);
                }}
                disabled={processandoAcao}
              >
                Prefiro apenas inativar
              </Button>
            )}
            <Button
              variante="perigo"
              onClick={() => void confirmarExclusaoDefinitiva()}
              disabled={processandoAcao}
            >
              {processandoAcao ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rosa-claro/40 border border-malva space-y-2 text-base text-texto">
            <p className="font-bold text-malva">
              Sugestão: considere inativar em vez de excluir
            </p>
            <p>
              Ao <strong>inativar</strong>, o paciente deixa de aparecer na
              lista principal, mas o histórico continua guardado com segurança.
            </p>
            <p>
              <strong>Aviso (Resolução CFP nº 01/2009):</strong> recomenda-se a
              guarda mínima de <strong>5 anos</strong> dos registros
              documentais. A exclusão definitiva apagará a ficha cadastral e{" "}
              <strong>todas as sessões</strong> deste paciente sem possibilidade
              de recuperação.
            </p>
          </div>

          <p className="text-base text-texto">
            Para confirmar a exclusão definitiva, digite abaixo o nome completo
            do paciente: <strong>{paciente.nome}</strong>
          </p>

          <Input
            rotulo="Confirme o nome do paciente"
            value={confirmacaoNome}
            onChange={(e) => {
              setConfirmacaoNome(e.target.value);
              if (erroConfirmacaoNome) setErroConfirmacaoNome(null);
            }}
            erro={erroConfirmacaoNome}
            placeholder={paciente.nome}
          />
        </div>
      </Modal>

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
