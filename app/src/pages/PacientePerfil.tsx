import { useEffect, useRef, useState } from "react";
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
  anamneseAbrir,
  anamneseAnexar,
  anamneseBaixar,
  anamneseExcluir,
  anamnesesListar,
  extrairErroApi,
  horariosSemanaisListar,
  pacienteDefinirStatus,
  pacienteExcluir,
  pacienteObter,
  sessaoExcluir,
  sessoesListar,
} from "../lib/api";
import {
  formatarDataBr,
  formatarDiaSemanaCurtoBr,
  formatarIdadeComNascimento,
  formatarMoedaBr,
  formatarTamanhoBytes,
  formatarTelefoneBr,
  lerArquivoComoBase64,
  obterRotuloTipoArquivo,
} from "../lib/format";
import type {
  Agendamento,
  Anamnese,
  HorarioSemanal,
  Paciente,
  Sessao,
} from "../lib/types";

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
  const [anamneses, setAnamneses] = useState<Anamnese[]>([]);
  const [proximoAgendamento, setProximoAgendamento] =
    useState<Agendamento | null>(null);
  const [horariosFixos, setHorariosFixos] = useState<HorarioSemanal[]>([]);
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

  // Estado de Anamnese (RN65–RN69)
  const inputAnamneseRef = useRef<HTMLInputElement | null>(null);
  const [arrastandoAnamnese, setArrastandoAnamnese] = useState<boolean>(false);
  const [modalAnamneseAberto, setModalAnamneseAberto] = useState<boolean>(false);
  const [arquivoAnamnese, setArquivoAnamnese] = useState<File | null>(null);
  const [caminhoManualAnamnese, setCaminhoManualAnamnese] =
    useState<string>("");
  const [erroAnamnese, setErroAnamnese] = useState<string | null>(null);
  const [anexandoAnamnese, setAnexandoAnamnese] = useState<boolean>(false);
  const [anamneseParaBaixar, setAnamneseParaBaixar] =
    useState<Anamnese | null>(null);
  const [caminhoBaixarAnamnese, setCaminhoBaixarAnamnese] =
    useState<string>("");
  const [baixandoAnamnese, setBaixandoAnamnese] = useState<boolean>(false);
  const [anamneseParaExcluir, setAnamneseParaExcluir] =
    useState<Anamnese | null>(null);
  const [excluindoAnamnese, setExcluindoAnamnese] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    setCarregando(true);

    Promise.all([
      pacienteObter(id),
      sessoesListar(id).catch(() => [] as Sessao[]),
      agendamentoProximoPaciente(id).catch(() => null),
      anamnesesListar(id).catch(() => [] as Anamnese[]),
      horariosSemanaisListar(id).catch(() => [] as HorarioSemanal[]),
    ])
      .then(
        ([
          dadosPaciente,
          listaSessoes,
          proxAg,
          listaAnamneses,
          listaHorariosFixos,
        ]) => {
          if (!cancelado) {
            const sessoesValidas = Array.isArray(listaSessoes)
              ? ordenarSessoesDecrescente(listaSessoes)
              : [];
            setSessoes(sessoesValidas);
            setAnamneses(Array.isArray(listaAnamneses) ? listaAnamneses : []);
            setHorariosFixos(
              Array.isArray(listaHorariosFixos) ? listaHorariosFixos : [],
            );
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

  async function recarregarAnamneses(pacienteId: string) {
    try {
      const lista = await anamnesesListar(pacienteId);
      setAnamneses(Array.isArray(lista) ? lista : []);
    } catch {
      // Ignora erro no recarregamento silencioso
    }
  }

  function abrirModalAnamneseComArquivo(arquivo: File | null) {
    setArquivoAnamnese(arquivo);
    const caminhoNativo =
      arquivo && "path" in arquivo && typeof (arquivo as { path?: unknown }).path === "string"
        ? ((arquivo as { path: string }).path ?? "")
        : "";
    setCaminhoManualAnamnese(caminhoNativo);
    setErroAnamnese(null);
    setModalAnamneseAberto(true);
  }

  function aoSelecionarArquivoAnamnese(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (arq) {
      abrirModalAnamneseComArquivo(arq);
    }
  }

  function aoSoltarArquivoAnamnese(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setArrastandoAnamnese(false);
    const arq = e.dataTransfer?.files?.[0] ?? null;
    if (arq) {
      abrirModalAnamneseComArquivo(arq);
    }
  }

  async function confirmarAnexarAnamnese() {
    if (!paciente) return;
    setErroAnamnese(null);

    if (!arquivoAnamnese && !caminhoManualAnamnese.trim()) {
      setErroAnamnese("Selecione um arquivo de anamnese para anexar.");
      return;
    }

    setAnexandoAnamnese(true);
    try {
      let caminhoOrigem = caminhoManualAnamnese.trim();
      let nomeOriginal: string | null = null;
      let conteudoBase64: string | null = null;

      if (arquivoAnamnese) {
        nomeOriginal = arquivoAnamnese.name;
        const caminhoNativo =
          "path" in arquivoAnamnese &&
          typeof (arquivoAnamnese as { path?: unknown }).path === "string"
            ? (arquivoAnamnese as { path: string }).path.trim()
            : "";

        if (caminhoNativo) {
          caminhoOrigem = caminhoNativo;
        } else {
          caminhoOrigem = arquivoAnamnese.name;
          conteudoBase64 = await lerArquivoComoBase64(arquivoAnamnese);
        }
      }

      const anexada = await anamneseAnexar({
        paciente_id: paciente.id,
        caminho_origem: caminhoOrigem,
        nome_original: nomeOriginal,
        conteudo_base64: conteudoBase64,
      });

      setModalAnamneseAberto(false);
      setArquivoAnamnese(null);
      setCaminhoManualAnamnese("");
      setToastSucesso(
        `Anamnese "${anexada.nome_original}" anexada com sucesso.`,
      );
      await recarregarAnamneses(paciente.id);
    } catch (erro) {
      setErroAnamnese(extrairErroApi(erro).mensagem);
    } finally {
      setAnexandoAnamnese(false);
    }
  }

  async function acionarAbrirAnamnese(item: Anamnese) {
    setErroMensagem(null);
    try {
      await anamneseAbrir(item.id);
      setToastSucesso(`Abrindo "${item.nome_original}"...`);
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    }
  }

  function abrirModalBaixarAnamnese(item: Anamnese) {
    setAnamneseParaBaixar(item);
    setCaminhoBaixarAnamnese("");
  }

  async function confirmarBaixarAnamnese() {
    if (!anamneseParaBaixar) return;
    setBaixandoAnamnese(true);
    setErroMensagem(null);
    try {
      const caminhoSalvo = await anamneseBaixar(
        anamneseParaBaixar.id,
        caminhoBaixarAnamnese.trim() || null,
      );
      setAnamneseParaBaixar(null);
      setCaminhoBaixarAnamnese("");
      setToastSucesso(`Anamnese salva em: ${caminhoSalvo}`);
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setBaixandoAnamnese(false);
    }
  }

  async function confirmarExclusaoAnamnese() {
    if (!anamneseParaExcluir || !paciente) return;
    setExcluindoAnamnese(true);
    setErroMensagem(null);
    try {
      const nome = anamneseParaExcluir.nome_original;
      await anamneseExcluir(anamneseParaExcluir.id);
      setAnamneseParaExcluir(null);
      setToastSucesso(`Anamnese "${nome}" excluída com sucesso.`);
      await recarregarAnamneses(paciente.id);
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setExcluindoAnamnese(false);
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
      <div className="w-full max-w-[1600px] mx-auto p-6 bg-fundo-claro border border-rosa-claro rounded-2xl text-base text-texto">
        Carregando perfil do paciente...
      </div>
    );
  }

  if (!paciente) {
    return (
      <div className="w-full max-w-[1600px] mx-auto space-y-6">
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
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
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
            <span data-testid="horarios-fixos-paciente">
              <strong>Horário fixo semanal:</strong>{" "}
              {horariosFixos.length > 0
                ? horariosFixos
                    .map(
                      (h) =>
                        `${formatarDiaSemanaCurtoBr(h.dia_semana)} às ${h.hora_inicio}`,
                    )
                    .join(" · ")
                : "Nenhum definido"}
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

      {/* Seção Anamnese (RN19, RN65–RN69) — documento único e compacto */}
      <section
        aria-label="Anamnese do paciente"
        data-testid="secao-anamnese"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-4 sm:p-5 space-y-3 shadow-xs"
      >
        <div className="flex items-center justify-between gap-3 border-b border-rosa-claro pb-3">
          <div>
            <h3 className="text-xl font-bold text-malva">Anamnese</h3>
            <p className="text-base text-lilas-acinzentado">
              Ficha clínica de anamnese anexada ao paciente.
            </p>
          </div>
        </div>

        {anamneses.length === 0 ? (
          <div
            data-testid="estado-vazio-anamnese"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setArrastandoAnamnese(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setArrastandoAnamnese(false);
            }}
            onDrop={aoSoltarArquivoAnamnese}
            className={`p-4 rounded-xl border border-dashed flex flex-col sm:flex-row items-center justify-between gap-4 text-base text-texto transition-colors ${
              arrastandoAnamnese
                ? "border-malva bg-rosa-claro/40"
                : "border-rosa-claro bg-fundo"
            }`}
          >
            <div className="space-y-0.5 text-center sm:text-left">
              <span className="font-semibold text-texto block">
                Nenhuma anamnese anexada
              </span>
              <p className="text-base text-lilas-acinzentado">
                Arraste um arquivo (PDF, Word ou imagem) aqui ou clique em &ldquo;Anexar anamnese&rdquo;.
              </p>
            </div>
            <Button
              variante="primario"
              className="shrink-0"
              onClick={() => abrirModalAnamneseComArquivo(null)}
            >
              Anexar anamnese
            </Button>
          </div>
        ) : (
          (() => {
            const doc = anamneses[0];
            const tipoRotulo = obterRotuloTipoArquivo(
              doc.nome_original,
              doc.mime,
            );
            return (
              <div
                data-testid={`item-anamnese-${doc.id}`}
                className="p-3.5 rounded-xl bg-fundo border border-rosa-claro flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-block px-2.5 py-0.5 rounded-lg bg-malva text-white text-base font-bold">
                      {tipoRotulo}
                    </span>
                    <span className="text-base font-bold text-texto truncate">
                      {doc.nome_original}
                    </span>
                  </div>
                  <p className="text-base text-lilas-acinzentado">
                    Tamanho:{" "}
                    <strong>{formatarTamanhoBytes(doc.tamanho_bytes)}</strong> ·
                    Enviado em: <strong>{formatarDataBr(doc.enviado_em)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <Button
                    variante="primario"
                    tamanho="compacto"
                    onClick={() => void acionarAbrirAnamnese(doc)}
                    aria-label={`Abrir ${doc.nome_original}`}
                  >
                    Abrir
                  </Button>
                  <Button
                    variante="secundario"
                    tamanho="compacto"
                    onClick={() => abrirModalBaixarAnamnese(doc)}
                    aria-label={`Baixar ${doc.nome_original}`}
                  >
                    Baixar
                  </Button>
                  <Button
                    variante="perigo"
                    tamanho="compacto"
                    onClick={() => setAnamneseParaExcluir(doc)}
                    aria-label={`Excluir ${doc.nome_original}`}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            );
          })()
        )}
      </section>

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
                        tamanho="compacto"
                        onClick={() => abrirEditarSessao(sessao)}
                        aria-label={`Editar sessão de ${formatarDataBr(sessao.data)}`}
                      >
                        Editar
                      </Button>
                      <Button
                        variante="perigo"
                        tamanho="compacto"
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

      {/* Input oculto para anexar anamnese */}
      <input
        ref={inputAnamneseRef}
        type="file"
        accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.txt,.jpg,.jpeg,.png"
        data-testid="input-arquivo-anamnese"
        className="hidden"
        onChange={aoSelecionarArquivoAnamnese}
      />

      {/* Modal para anexar anamnese (RN66, RN68) */}
      <Modal
        aberto={modalAnamneseAberto}
        titulo="Anexar anamnese"
        aoFechar={() => setModalAnamneseAberto(false)}
        larguraMax="md"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setModalAnamneseAberto(false)}
              disabled={anexandoAnamnese}
            >
              Cancelar
            </Button>
            <Button
              variante="primario"
              data-testid="botao-confirmar-anexo-anamnese"
              onClick={() => void confirmarAnexarAnamnese()}
              disabled={anexandoAnamnese}
            >
              {anexandoAnamnese ? "Criptografando e anexando..." : "Salvar anexo"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {arquivoAnamnese ? (
            <div className="p-4 rounded-xl bg-rosa-claro/30 border border-rosa-claro flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold text-texto">
                  {arquivoAnamnese.name}
                </p>
                <p className="text-base text-lilas-acinzentado">
                  Tamanho: {formatarTamanhoBytes(arquivoAnamnese.size)}
                </p>
              </div>
              <Button
                variante="contorno"
                onClick={() => inputAnamneseRef.current?.click()}
              >
                Trocar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-fundo border border-rosa-claro">
                <span className="text-base text-texto">
                  Selecione o arquivo de anamnese:
                </span>
                <Button
                  variante="secundario"
                  onClick={() => inputAnamneseRef.current?.click()}
                >
                  Escolher arquivo
                </Button>
              </div>
              <Input
                rotulo="Ou informe o caminho completo do arquivo"
                placeholder="Ex.: C:\Documentos\anamnese.pdf"
                value={caminhoManualAnamnese}
                onChange={(e) => setCaminhoManualAnamnese(e.target.value)}
              />
            </div>
          )}

          {erroAnamnese && (
            <p
              role="alert"
              className="text-base font-semibold text-red-700 bg-red-50 border border-red-300 rounded-xl p-3"
            >
              {erroAnamnese}
            </p>
          )}
        </div>
      </Modal>

      {/* Modal para baixar cópia da anamnese (RN68) */}
      <Modal
        aberto={Boolean(anamneseParaBaixar)}
        titulo="Baixar cópia da anamnese"
        aoFechar={() => setAnamneseParaBaixar(null)}
        larguraMax="md"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setAnamneseParaBaixar(null)}
              disabled={baixandoAnamnese}
            >
              Cancelar
            </Button>
            <Button
              variante="primario"
              data-testid="botao-confirmar-baixar-anamnese"
              onClick={() => void confirmarBaixarAnamnese()}
              disabled={baixandoAnamnese}
            >
              {baixandoAnamnese ? "Baixando..." : "Salvar cópia"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-base text-texto">
            Uma cópia descriptografada de{" "}
            <strong>{anamneseParaBaixar?.nome_original}</strong> será salva no
            seu computador.
          </p>
          <Input
            rotulo="Pasta ou caminho de destino (deixe em branco para salvar em Downloads)"
            placeholder="Pasta Downloads padrão"
            value={caminhoBaixarAnamnese}
            onChange={(e) => setCaminhoBaixarAnamnese(e.target.value)}
          />
        </div>
      </Modal>

      {/* Diálogo de confirmação para excluir anamnese (RN68) */}
      <ConfirmDialog
        aberto={Boolean(anamneseParaExcluir)}
        titulo="Excluir anamnese"
        mensagem="Tem certeza de que deseja excluir este arquivo de anamnese? Esta ação removerá definitivamente o arquivo criptografado."
        detalheDestaque={anamneseParaExcluir?.nome_original}
        rotuloConfirmar="Sim, excluir anamnese"
        destrutivo={true}
        carregando={excluindoAnamnese}
        aoConfirmar={() => void confirmarExclusaoAnamnese()}
        aoCancelar={() => setAnamneseParaExcluir(null)}
      />

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
