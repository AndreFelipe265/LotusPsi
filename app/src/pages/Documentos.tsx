import { useEffect, useRef, useState } from "react";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Toast,
} from "../components";
import {
  categoriaCriar,
  categoriaExcluir,
  categoriaRenomear,
  categoriasListar,
  documentoAbrir,
  documentoAtualizar,
  documentoBaixar,
  documentoEnviar,
  documentoExcluir,
  documentosListar,
  extrairErroApi,
} from "../lib/api";
import {
  formatarDataBr,
  formatarTamanhoBytes,
  lerArquivoComoBase64,
  obterRotuloTipoArquivo,
} from "../lib/format";
import type { CategoriaDocumento, Documento } from "../lib/types";

const EXTENSOES_ACEITAS_INPUT =
  ".pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.txt,.jpg,.jpeg,.png";

export function Documentos() {
  const [categorias, setCategorias] = useState<CategoriaDocumento[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("todas");
  const [busca, setBusca] = useState<string>("");
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);

  // Estado de envio (botão + arrastar e soltar — RN42–RN45, T09)
  const inputArquivoRef = useRef<HTMLInputElement | null>(null);
  const [arrastandoSobre, setArrastandoSobre] = useState<boolean>(false);
  const [modalEnviarAberto, setModalEnviarAberto] = useState<boolean>(false);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(
    null,
  );
  const [caminhoManual, setCaminhoManual] = useState<string>("");
  const [categoriaEnvioId, setCategoriaEnvioId] = useState<string>("");
  const [descricaoEnvio, setDescricaoEnvio] = useState<string>("");
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<boolean>(false);

  // Estado de edição de documento (RN46)
  const [docEmEdicao, setDocEmEdicao] = useState<Documento | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState<string>("");
  const [categoriaEdicaoId, setCategoriaEdicaoId] = useState<string>("");
  const [descricaoEdicao, setDescricaoEdicao] = useState<string>("");
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState<boolean>(false);

  // Estado de download de documento (RN46)
  const [docParaBaixar, setDocParaBaixar] = useState<Documento | null>(null);
  const [caminhoDestinoBaixar, setCaminhoDestinoBaixar] = useState<string>("");
  const [baixando, setBaixando] = useState<boolean>(false);

  // Estado de exclusão de documento (RN46)
  const [docParaExcluir, setDocParaExcluir] = useState<Documento | null>(null);
  const [excluindoDoc, setExcluindoDoc] = useState<boolean>(false);

  // Estado de gerenciamento de categorias (RN41)
  const [modalCategoriasAberto, setModalCategoriasAberto] =
    useState<boolean>(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState<string>("");
  const [catRenomeandoId, setCatRenomeandoId] = useState<string | null>(null);
  const [catRenomeandoTexto, setCatRenomeandoTexto] = useState<string>("");
  const [erroCategorias, setErroCategorias] = useState<string | null>(null);
  const [processandoCategoria, setProcessandoCategoria] =
    useState<boolean>(false);

  async function carregarDados(
    termoBusca: string = busca,
    catId: string = categoriaAtiva,
  ) {
    setCarregando(true);
    try {
      const [listaCats, listaDocs] = await Promise.all([
        categoriasListar(),
        documentosListar({
          busca: termoBusca.trim() || undefined,
          categoria_id: catId === "todas" ? null : catId,
        }),
      ]);
      setCategorias(Array.isArray(listaCats) ? listaCats : []);
      setDocumentos(Array.isArray(listaDocs) ? listaDocs : []);
      setErroMensagem(null);
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarDados(busca, categoriaAtiva);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, categoriaAtiva]);

  function categoriaPadraoEnvio(cats: CategoriaDocumento[] = categorias): string {
    if (categoriaAtiva !== "todas" && cats.some((c) => c.id === categoriaAtiva)) {
      return categoriaAtiva;
    }
    return cats[0]?.id ?? "";
  }

  function abrirModalEnvioComArquivo(arquivo: File | null) {
    setArquivoSelecionado(arquivo);
    const caminhoNativo =
      arquivo && "path" in arquivo && typeof (arquivo as { path?: unknown }).path === "string"
        ? ((arquivo as { path: string }).path ?? "")
        : "";
    setCaminhoManual(caminhoNativo);
    setCategoriaEnvioId(categoriaPadraoEnvio());
    setDescricaoEnvio("");
    setErroEnvio(null);
    setModalEnviarAberto(true);
  }

  function aoSelecionarInputArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (arq) {
      abrirModalEnvioComArquivo(arq);
    }
  }

  function aoSoltarArquivo(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setArrastandoSobre(false);
    const arq = e.dataTransfer?.files?.[0] ?? null;
    if (arq) {
      abrirModalEnvioComArquivo(arq);
    }
  }

  async function confirmarEnvioDocumento() {
    setErroEnvio(null);

    if (!arquivoSelecionado && !caminhoManual.trim()) {
      setErroEnvio("Selecione um arquivo para enviar.");
      return;
    }

    setEnviando(true);
    try {
      let caminhoOrigem = caminhoManual.trim();
      let nomeOriginal: string | null = null;
      let conteudoBase64: string | null = null;

      if (arquivoSelecionado) {
        nomeOriginal = arquivoSelecionado.name;
        const caminhoNativo =
          "path" in arquivoSelecionado &&
          typeof (arquivoSelecionado as { path?: unknown }).path === "string"
            ? (arquivoSelecionado as { path: string }).path.trim()
            : "";

        if (caminhoNativo) {
          caminhoOrigem = caminhoNativo;
        } else {
          caminhoOrigem = arquivoSelecionado.name;
          conteudoBase64 = await lerArquivoComoBase64(arquivoSelecionado);
        }
      }

      const enviado = await documentoEnviar({
        caminho_origem: caminhoOrigem,
        categoria_id: categoriaEnvioId || null,
        descricao: descricaoEnvio.trim() || null,
        nome_original: nomeOriginal,
        conteudo_base64: conteudoBase64,
      });

      setModalEnviarAberto(false);
      setArquivoSelecionado(null);
      setCaminhoManual("");
      setDescricaoEnvio("");
      setToastSucesso(
        `Documento "${enviado.nome_original}" enviado e criptografado com sucesso.`,
      );
      await carregarDados(busca, categoriaAtiva);
    } catch (erro) {
      setErroEnvio(extrairErroApi(erro).mensagem);
    } finally {
      setEnviando(false);
    }
  }

  async function acionarAbrirDocumento(doc: Documento) {
    setErroMensagem(null);
    try {
      await documentoAbrir(doc.id);
      setToastSucesso(`Abrindo "${doc.nome_original}"...`);
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    }
  }

  function abrirModalBaixar(doc: Documento) {
    setDocParaBaixar(doc);
    setCaminhoDestinoBaixar("");
  }

  async function confirmarBaixarDocumento() {
    if (!docParaBaixar) return;
    setBaixando(true);
    setErroMensagem(null);
    try {
      const caminhoSalvo = await documentoBaixar(
        docParaBaixar.id,
        caminhoDestinoBaixar.trim() || null,
      );
      setDocParaBaixar(null);
      setCaminhoDestinoBaixar("");
      setToastSucesso(`Documento salvo em: ${caminhoSalvo}`);
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setBaixando(false);
    }
  }

  function abrirModalEditar(doc: Documento) {
    setDocEmEdicao(doc);
    setNomeEdicao(doc.nome_original);
    setCategoriaEdicaoId(doc.categoria_id ?? categorias[0]?.id ?? "");
    setDescricaoEdicao(doc.descricao ?? "");
    setErroEdicao(null);
  }

  async function confirmarEdicaoDocumento() {
    if (!docEmEdicao) return;
    if (!nomeEdicao.trim()) {
      setErroEdicao("O nome do documento é obrigatório.");
      return;
    }

    setSalvandoEdicao(true);
    setErroEdicao(null);
    try {
      const atualizado = await documentoAtualizar(docEmEdicao.id, {
        nome_original: nomeEdicao.trim(),
        categoria_id: categoriaEdicaoId || null,
        descricao: descricaoEdicao.trim() || null,
      });
      setDocEmEdicao(null);
      setToastSucesso(`Documento "${atualizado.nome_original}" atualizado.`);
      await carregarDados(busca, categoriaAtiva);
    } catch (erro) {
      setErroEdicao(extrairErroApi(erro).mensagem);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function confirmarExclusaoDocumento() {
    if (!docParaExcluir) return;
    setExcluindoDoc(true);
    setErroMensagem(null);
    try {
      const nome = docParaExcluir.nome_original;
      await documentoExcluir(docParaExcluir.id);
      setDocParaExcluir(null);
      setToastSucesso(`Documento "${nome}" excluído com sucesso.`);
      await carregarDados(busca, categoriaAtiva);
    } catch (erro) {
      setErroMensagem(extrairErroApi(erro).mensagem);
    } finally {
      setExcluindoDoc(false);
    }
  }

  async function criarNovaCategoria() {
    if (!novaCategoriaNome.trim()) {
      setErroCategorias("Digite o nome da nova categoria.");
      return;
    }
    setProcessandoCategoria(true);
    setErroCategorias(null);
    try {
      const criada = await categoriaCriar(novaCategoriaNome.trim());
      setNovaCategoriaNome("");
      setToastSucesso(`Categoria "${criada.nome}" criada.`);
      await carregarDados(busca, categoriaAtiva);
    } catch (erro) {
      setErroCategorias(extrairErroApi(erro).mensagem);
    } finally {
      setProcessandoCategoria(false);
    }
  }

  async function salvarRenomearCategoria(id: string) {
    if (!catRenomeandoTexto.trim()) {
      setErroCategorias("O nome da categoria não pode ficar vazio.");
      return;
    }
    setProcessandoCategoria(true);
    setErroCategorias(null);
    try {
      await categoriaRenomear(id, catRenomeandoTexto.trim());
      setCatRenomeandoId(null);
      setCatRenomeandoTexto("");
      setToastSucesso("Categoria renomeada com sucesso.");
      await carregarDados(busca, categoriaAtiva);
    } catch (erro) {
      setErroCategorias(extrairErroApi(erro).mensagem);
    } finally {
      setProcessandoCategoria(false);
    }
  }

  async function excluirCategoriaVazia(cat: CategoriaDocumento) {
    setProcessandoCategoria(true);
    setErroCategorias(null);
    try {
      await categoriaExcluir(cat.id);
      if (categoriaAtiva === cat.id) {
        setCategoriaAtiva("todas");
      }
      setToastSucesso(`Categoria "${cat.nome}" excluída.`);
      await carregarDados(
        busca,
        categoriaAtiva === cat.id ? "todas" : categoriaAtiva,
      );
    } catch (erro) {
      setErroCategorias(extrairErroApi(erro).mensagem);
    } finally {
      setProcessandoCategoria(false);
    }
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h2 className="text-2xl font-bold text-malva">Documentos</h2>
          <p className="text-base text-lilas-acinzentado">
            Modelos, arquivos administrativos e outros documentos protegidos com
            criptografia.
          </p>
        </div>

        <div className="flex flex-row items-center gap-3 shrink-0 flex-nowrap">
          <Button
            variante="contorno"
            className="whitespace-nowrap"
            onClick={() => {
              setErroCategorias(null);
              setCatRenomeandoId(null);
              setModalCategoriasAberto(true);
            }}
          >
            Gerenciar categorias
          </Button>
          <Button
            variante="primario"
            className="whitespace-nowrap"
            onClick={() => abrirModalEnvioComArquivo(null)}
          >
            Enviar documento
          </Button>
        </div>
      </div>

      {/* Input oculto para seleção de arquivo */}
      <input
        ref={inputArquivoRef}
        type="file"
        accept={EXTENSOES_ACEITAS_INPUT}
        data-testid="input-arquivo-documento"
        className="hidden"
        onChange={aoSelecionarInputArquivo}
      />

      {/* Zona de Arrastar e Soltar (Drag & Drop — T09, RN42, RN43) */}
      <div
        data-testid="zona-arrastar-documento"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setArrastandoSobre(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setArrastandoSobre(false);
        }}
        onDrop={aoSoltarArquivo}
        className={`rounded-2xl border-2 border-dashed p-6 transition-colors flex flex-col sm:flex-row items-center justify-between gap-4 ${
          arrastandoSobre
            ? "border-malva bg-rosa-claro/40"
            : "border-rosa-claro bg-fundo-claro"
        }`}
      >
        <div className="space-y-1 text-center sm:text-left">
          <p className="text-base font-bold text-texto">
            Arraste e solte um arquivo aqui ou clique em &ldquo;Escolher
            arquivo&rdquo;
          </p>
          <p className="text-base text-lilas-acinzentado">
            Formatos aceitos: PDF, DOC, DOCX, ODT, XLS, XLSX, ODS, TXT, JPG,
            JPEG e PNG (máximo de 25 MB).
          </p>
        </div>
        <Button
          variante="secundario"
          onClick={() => inputArquivoRef.current?.click()}
        >
          Escolher arquivo
        </Button>
      </div>

      {/* Abas de categorias e barra de busca (RN41, RN47) */}
      <section
        aria-label="Filtros de documentos"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-5 space-y-4 shadow-xs"
      >
        <div
          role="tablist"
          aria-label="Categorias de documentos"
          className="flex items-center gap-2 flex-wrap border-b border-rosa-claro pb-3"
        >
          <button
            type="button"
            role="tab"
            data-testid="aba-categoria-todas"
            aria-selected={categoriaAtiva === "todas"}
            onClick={() => setCategoriaAtiva("todas")}
            className={`px-4 py-2 rounded-xl text-base font-semibold transition-colors cursor-pointer ${
              categoriaAtiva === "todas"
                ? "bg-malva text-white"
                : "bg-fundo text-texto hover:bg-rosa-claro/40 border border-rosa-claro"
            }`}
          >
            Todas
          </button>

          {categorias.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              data-testid={`aba-categoria-${cat.id}`}
              aria-selected={categoriaAtiva === cat.id}
              onClick={() => setCategoriaAtiva(cat.id)}
              className={`px-4 py-2 rounded-xl text-base font-semibold transition-colors cursor-pointer ${
                categoriaAtiva === cat.id
                  ? "bg-malva text-white"
                  : "bg-fundo text-texto hover:bg-rosa-claro/40 border border-rosa-claro"
              }`}
            >
              {cat.nome} ({cat.total_documentos})
            </button>
          ))}
        </div>

        <Input
          rotulo="Buscar documento"
          placeholder="Buscar por nome ou descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </section>

      {/* Listagem de documentos (RN44, RN46, RN47) */}
      {carregando ? (
        <div className="p-6 bg-fundo-claro border border-rosa-claro rounded-2xl text-base text-texto">
          Carregando documentos...
        </div>
      ) : documentos.length === 0 ? (
        <EmptyState
          titulo="Nenhum documento encontrado"
          descricao="Envie modelos, fichas ou arquivos administrativos usando o botão 'Enviar documento' ou arrastando um arquivo para a área acima."
          rotuloAcao="Enviar documento"
          aoClicarAcao={() => abrirModalEnvioComArquivo(null)}
        />
      ) : (
        <ul
          data-testid="lista-documentos"
          aria-label="Lista de documentos gerais"
          className="space-y-3"
        >
          {documentos.map((doc) => {
            const tipoRotulo = obterRotuloTipoArquivo(
              doc.nome_original,
              doc.mime,
            );
            return (
              <li
                key={doc.id}
                data-testid={`item-documento-${doc.id}`}
                className="bg-fundo-claro border border-rosa-claro rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-block px-2.5 py-0.5 rounded-lg bg-malva text-white text-base font-bold">
                      {tipoRotulo}
                    </span>
                    <h3 className="text-lg font-bold text-texto">
                      {doc.nome_original}
                    </h3>
                    {doc.categoria_nome && (
                      <span className="inline-block px-3 py-0.5 rounded-full bg-rosa-claro/50 border border-rosa-claro text-base font-semibold text-texto">
                        {doc.categoria_nome}
                      </span>
                    )}
                  </div>

                  <p className="text-base text-lilas-acinzentado">
                    Tamanho:{" "}
                    <strong>{formatarTamanhoBytes(doc.tamanho_bytes)}</strong> ·
                    Enviado em: <strong>{formatarDataBr(doc.enviado_em)}</strong>
                  </p>

                  {doc.descricao && (
                    <p className="text-base text-texto">{doc.descricao}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <Button
                    variante="primario"
                    tamanho="compacto"
                    onClick={() => void acionarAbrirDocumento(doc)}
                    aria-label={`Abrir ${doc.nome_original}`}
                  >
                    Abrir
                  </Button>
                  <Button
                    variante="secundario"
                    tamanho="compacto"
                    onClick={() => abrirModalBaixar(doc)}
                    aria-label={`Baixar ${doc.nome_original}`}
                  >
                    Baixar
                  </Button>
                  <Button
                    variante="contorno"
                    tamanho="compacto"
                    onClick={() => abrirModalEditar(doc)}
                    aria-label={`Editar ${doc.nome_original}`}
                  >
                    Editar
                  </Button>
                  <Button
                    variante="perigo"
                    tamanho="compacto"
                    onClick={() => setDocParaExcluir(doc)}
                    aria-label={`Excluir ${doc.nome_original}`}
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Modal de envio de documento */}
      <Modal
        aberto={modalEnviarAberto}
        titulo="Enviar documento"
        aoFechar={() => setModalEnviarAberto(false)}
        larguraMax="lg"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setModalEnviarAberto(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button
              variante="primario"
              data-testid="botao-confirmar-envio-documento"
              onClick={() => void confirmarEnvioDocumento()}
              disabled={enviando}
            >
              {enviando ? "Criptografando e enviando..." : "Salvar documento"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {arquivoSelecionado ? (
            <div className="p-4 rounded-xl bg-rosa-claro/30 border border-rosa-claro flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold text-texto">
                  {arquivoSelecionado.name}
                </p>
                <p className="text-base text-lilas-acinzentado">
                  Tamanho: {formatarTamanhoBytes(arquivoSelecionado.size)}
                </p>
              </div>
              <Button
                variante="contorno"
                onClick={() => inputArquivoRef.current?.click()}
              >
                Trocar arquivo
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-fundo border border-rosa-claro">
                <span className="text-base text-texto">
                  Selecione um arquivo do seu computador:
                </span>
                <Button
                  variante="secundario"
                  onClick={() => inputArquivoRef.current?.click()}
                >
                  Escolher arquivo
                </Button>
              </div>
              <Input
                rotulo="Ou informe o caminho completo do arquivo"
                placeholder="Ex.: C:\Documentos\modelo.pdf"
                value={caminhoManual}
                onChange={(e) => setCaminhoManual(e.target.value)}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="select-categoria-envio"
              className="block text-base font-semibold text-texto mb-1.5"
            >
              Categoria
            </label>
            <select
              id="select-categoria-envio"
              value={categoriaEnvioId}
              onChange={(e) => setCategoriaEnvioId(e.target.value)}
              className="w-full px-4 py-2.5 text-base text-texto bg-fundo-claro border border-lilas-acinzentado rounded-xl focus:outline-none focus:ring-2 focus:ring-malva"
            >
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          <Input
            rotulo="Descrição (opcional)"
            placeholder="Ex.: Modelo atualizado para primeira entrevista"
            value={descricaoEnvio}
            onChange={(e) => setDescricaoEnvio(e.target.value)}
          />

          {erroEnvio && (
            <p
              role="alert"
              className="text-base font-semibold text-red-700 bg-red-50 border border-red-300 rounded-xl p-3"
            >
              {erroEnvio}
            </p>
          )}
        </div>
      </Modal>

      {/* Modal de edição de documento (RN46) */}
      <Modal
        aberto={Boolean(docEmEdicao)}
        titulo="Editar documento"
        aoFechar={() => setDocEmEdicao(null)}
        larguraMax="lg"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setDocEmEdicao(null)}
              disabled={salvandoEdicao}
            >
              Cancelar
            </Button>
            <Button
              variante="primario"
              onClick={() => void confirmarEdicaoDocumento()}
              disabled={salvandoEdicao}
            >
              {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            rotulo="Nome do documento"
            value={nomeEdicao}
            onChange={(e) => setNomeEdicao(e.target.value)}
            erro={erroEdicao}
          />

          <div>
            <label
              htmlFor="select-categoria-edicao"
              className="block text-base font-semibold text-texto mb-1.5"
            >
              Categoria
            </label>
            <select
              id="select-categoria-edicao"
              value={categoriaEdicaoId}
              onChange={(e) => setCategoriaEdicaoId(e.target.value)}
              className="w-full px-4 py-2.5 text-base text-texto bg-fundo-claro border border-lilas-acinzentado rounded-xl focus:outline-none focus:ring-2 focus:ring-malva"
            >
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          <Input
            rotulo="Descrição (opcional)"
            value={descricaoEdicao}
            onChange={(e) => setDescricaoEdicao(e.target.value)}
          />
        </div>
      </Modal>

      {/* Modal para baixar cópia descriptografada (RN46) */}
      <Modal
        aberto={Boolean(docParaBaixar)}
        titulo="Baixar cópia do documento"
        aoFechar={() => setDocParaBaixar(null)}
        larguraMax="md"
        rodape={
          <>
            <Button
              variante="contorno"
              onClick={() => setDocParaBaixar(null)}
              disabled={baixando}
            >
              Cancelar
            </Button>
            <Button
              variante="primario"
              data-testid="botao-confirmar-baixar-documento"
              onClick={() => void confirmarBaixarDocumento()}
              disabled={baixando}
            >
              {baixando ? "Baixando..." : "Salvar cópia"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-base text-texto">
            Uma cópia descriptografada de{" "}
            <strong>{docParaBaixar?.nome_original}</strong> será salva no seu
            computador.
          </p>
          <Input
            rotulo="Pasta ou caminho de destino (deixe em branco para salvar em Downloads)"
            placeholder="Pasta Downloads padrão"
            value={caminhoDestinoBaixar}
            onChange={(e) => setCaminhoDestinoBaixar(e.target.value)}
          />
        </div>
      </Modal>

      {/* Confirmação de exclusão de documento (RN46) */}
      <ConfirmDialog
        aberto={Boolean(docParaExcluir)}
        titulo="Excluir documento"
        mensagem="Tem certeza de que deseja excluir este documento? O arquivo criptografado será removido definitivamente."
        detalheDestaque={docParaExcluir?.nome_original}
        rotuloConfirmar="Sim, excluir documento"
        destrutivo={true}
        carregando={excluindoDoc}
        aoConfirmar={() => void confirmarExclusaoDocumento()}
        aoCancelar={() => setDocParaExcluir(null)}
      />

      {/* Modal de gerenciamento de categorias (RN41) */}
      <Modal
        aberto={modalCategoriasAberto}
        titulo="Gerenciar categorias"
        aoFechar={() => setModalCategoriasAberto(false)}
        larguraMax="lg"
        rodape={
          <Button
            variante="contorno"
            onClick={() => setModalCategoriasAberto(false)}
          >
            Fechar
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 w-full">
              <Input
                rotulo="Nova categoria"
                placeholder="Ex.: Declarações"
                value={novaCategoriaNome}
                onChange={(e) => setNovaCategoriaNome(e.target.value)}
              />
            </div>
            <Button
              variante="primario"
              onClick={() => void criarNovaCategoria()}
              disabled={processandoCategoria}
            >
              Criar categoria
            </Button>
          </div>

          {erroCategorias && (
            <p
              role="alert"
              className="text-base font-semibold text-red-700 bg-red-50 border border-red-300 rounded-xl p-3"
            >
              {erroCategorias}
            </p>
          )}

          <ul className="space-y-2.5" aria-label="Lista de categorias">
            {categorias.map((cat) => (
              <li
                key={cat.id}
                className="p-3.5 rounded-xl bg-fundo border border-rosa-claro flex flex-wrap items-center justify-between gap-3"
              >
                {catRenomeandoId === cat.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      rotulo="Novo nome da categoria"
                      value={catRenomeandoTexto}
                      onChange={(e) => setCatRenomeandoTexto(e.target.value)}
                    />
                    <Button
                      variante="primario"
                      onClick={() => void salvarRenomearCategoria(cat.id)}
                      disabled={processandoCategoria}
                    >
                      Salvar
                    </Button>
                    <Button
                      variante="contorno"
                      onClick={() => setCatRenomeandoId(null)}
                      disabled={processandoCategoria}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="text-base font-bold text-texto">
                        {cat.nome}
                      </span>{" "}
                      <span className="text-base text-lilas-acinzentado">
                        ({cat.total_documentos}{" "}
                        {cat.total_documentos === 1
                          ? "documento"
                          : "documentos"}
                        )
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variante="contorno"
                        tamanho="compacto"
                        onClick={() => {
                          setCatRenomeandoId(cat.id);
                          setCatRenomeandoTexto(cat.nome);
                          setErroCategorias(null);
                        }}
                      >
                        Renomear
                      </Button>
                      <Button
                        variante="perigo"
                        tamanho="compacto"
                        disabled={
                          cat.total_documentos > 0 || processandoCategoria
                        }
                        title={
                          cat.total_documentos > 0
                            ? "Só é possível excluir uma categoria vazia"
                            : undefined
                        }
                        onClick={() => void excluirCategoriaVazia(cat)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
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
