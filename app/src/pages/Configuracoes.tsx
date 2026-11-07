import { useEffect, useRef, useState } from "react";
import logoLotusPsi from "../assets/logo-lotuspsi.svg";
import { Button, ConfirmDialog, Input, Modal, Toast } from "../components";
import {
  authChangePassword,
  backupCriar,
  backupInspecionar,
  backupObterCaminhoPadrao,
  backupRestaurar,
  backupSelecionarDestino,
  categoriaCriar,
  categoriaExcluir,
  categoriaRenomear,
  categoriasListar,
  configDefinir,
  configObter,
  extrairErroApi,
} from "../lib/api";
import {
  calcularDiasDesdeUltimoBackup,
  calcularForcaSenha,
  CHAVE_CONFIG_MENSAGEM_ANIVERSARIO,
  CHAVE_CONFIG_ULTIMO_BACKUP,
  ehDataIsoBackupValida,
  formatarDataHoraBackupBr,
  formatarTamanhoBytes,
  gerarNomeBackupSugerido,
  lerArquivoComoBase64,
  MENSAGEM_ANIVERSARIO_PADRAO,
  precisaLembreteBackup7Dias,
} from "../lib/format";
import type { CategoriaDocumento, InspecaoBackup } from "../lib/types";

export function Configuracoes() {
  // Estado de Mensagem de Aniversário (RN30–RN34)
  const [mensagemAniversario, setMensagemAniversario] = useState<string>(
    MENSAGEM_ANIVERSARIO_PADRAO,
  );
  const [salvandoMensagem, setSalvandoMensagem] = useState<boolean>(false);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);
  const [toastErro, setToastErro] = useState<string | null>(null);

  // Estado de Troca de Senha Mestra (RN07, RN08)
  const [senhaAtual, setSenhaAtual] = useState<string>("");
  const [novaSenha, setNovaSenha] = useState<string>("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState<string>("");
  const [alterandoSenha, setAlterandoSenha] = useState<boolean>(false);
  const [erroTrocaSenha, setErroTrocaSenha] = useState<string | null>(null);

  // Estado de Cópia de Segurança (Backup — RN50, RN51, RN53, RN55)
  const [ultimoBackupIso, setUltimoBackupIso] = useState<string | null>(null);
  const [modalBackupAberto, setModalBackupAberto] = useState<boolean>(false);
  const [caminhoDestinoBackup, setCaminhoDestinoBackup] = useState<string>("");
  const [gerandoBackup, setGerandoBackup] = useState<boolean>(false);
  const [erroModalBackup, setErroModalBackup] = useState<string | null>(null);

  // Estado de Restauração de Backup (RN52, RN54, RN56)
  const inputArquivoBackupRef = useRef<HTMLInputElement | null>(null);
  const [arquivoBackupSelecionado, setArquivoBackupSelecionado] =
    useState<File | null>(null);
  const [caminhoBackupRestaurar, setCaminhoBackupRestaurar] =
    useState<string>("");
  const [senhaOuChaveBackup, setSenhaOuChaveBackup] = useState<string>("");
  const [inspecionandoBackup, setInspecionandoBackup] =
    useState<boolean>(false);
  const [inspecaoBackup, setInspecaoBackup] = useState<InspecaoBackup | null>(
    null,
  );
  const [erroRestauracao, setErroRestauracao] = useState<string | null>(null);
  const [confirmarRestauracaoAberta, setConfirmarRestauracaoAberta] =
    useState<boolean>(false);
  const [restaurandoBackup, setRestaurandoBackup] = useState<boolean>(false);

  // Estado de Gerenciamento de Categorias de Documentos (RN41)
  const [categorias, setCategorias] = useState<CategoriaDocumento[]>([]);
  const [carregandoCategorias, setCarregandoCategorias] =
    useState<boolean>(false);
  const [nomeNovaCategoria, setNomeNovaCategoria] = useState<string>("");
  const [criandoCategoria, setCriandoCategoria] = useState<boolean>(false);
  const [erroCategorias, setErroCategorias] = useState<string | null>(null);

  const [modalRenomearAberto, setModalRenomearAberto] =
    useState<boolean>(false);
  const [categoriaEmEdicao, setCategoriaEmEdicao] =
    useState<CategoriaDocumento | null>(null);
  const [novoNomeCategoria, setNovoNomeCategoria] = useState<string>("");
  const [salvandoRenomeacao, setSalvandoRenomeacao] = useState<boolean>(false);

  const [categoriaParaExcluir, setCategoriaParaExcluir] =
    useState<CategoriaDocumento | null>(null);
  const [excluindoCategoria, setExcluindoCategoria] = useState<boolean>(false);

  async function carregarCategorias() {
    setCarregandoCategorias(true);
    try {
      const lista = await categoriasListar();
      if (Array.isArray(lista)) {
        setCategorias(lista);
      }
    } catch {
      // Ignora falhas de carregamento em ambiente mockado
    } finally {
      setCarregandoCategorias(false);
    }
  }

  useEffect(() => {
    let cancelado = false;
    configObter(CHAVE_CONFIG_MENSAGEM_ANIVERSARIO)
      .then((valor) => {
        if (
          !cancelado &&
          typeof valor === "string" &&
          valor.trim().length > 0 &&
          !ehDataIsoBackupValida(valor)
        ) {
          setMensagemAniversario(valor);
        }
      })
      .catch(() => {
        // Mantém mensagem padrão em caso de erro inicial
      });

    configObter(CHAVE_CONFIG_ULTIMO_BACKUP)
      .then((valor) => {
        if (!cancelado && ehDataIsoBackupValida(valor)) {
          setUltimoBackupIso(valor!.trim());
        }
      })
      .catch(() => {
        // Mantém estado atual em caso de erro inicial
      });

    void carregarCategorias();

    return () => {
      cancelado = true;
    };
  }, []);

  // --- Ações de Troca de Senha (RN07, RN08) ---
  const forcaNovaSenha = calcularForcaSenha(novaSenha);

  async function lidarComTrocaSenha(e: React.FormEvent) {
    e.preventDefault();
    setErroTrocaSenha(null);
    setToastErro(null);
    setToastSucesso(null);

    if (!senhaAtual) {
      setErroTrocaSenha("Informe a sua senha atual.");
      return;
    }

    if (novaSenha.length < 8) {
      setErroTrocaSenha("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }

    if (novaSenha !== confirmarNovaSenha) {
      setErroTrocaSenha("A confirmação da nova senha não confere.");
      return;
    }

    setAlterandoSenha(true);
    try {
      await authChangePassword(senhaAtual, novaSenha);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarNovaSenha("");
      setToastSucesso("Senha alterada com sucesso.");
    } catch (erro) {
      const apiErr = extrairErroApi(erro);
      setErroTrocaSenha(apiErr.mensagem);
    } finally {
      setAlterandoSenha(false);
    }
  }

  // --- Ações de Mensagem de Aniversário (RN32) ---
  async function salvarMensagemAniversario(e: React.FormEvent) {
    e.preventDefault();
    setToastErro(null);
    setToastSucesso(null);

    const textoLimpo = mensagemAniversario.trim();
    if (!textoLimpo) {
      setToastErro("A mensagem de aniversário não pode ficar em branco.");
      return;
    }

    setSalvandoMensagem(true);
    try {
      await configDefinir(CHAVE_CONFIG_MENSAGEM_ANIVERSARIO, textoLimpo);
      setMensagemAniversario(textoLimpo);
      setToastSucesso("Mensagem de aniversário salva com sucesso.");
    } catch (erro) {
      setToastErro(extrairErroApi(erro).mensagem);
    } finally {
      setSalvandoMensagem(false);
    }
  }

  function restaurarMensagemPadrao() {
    setMensagemAniversario(MENSAGEM_ANIVERSARIO_PADRAO);
  }

  // --- Ações de Backup e Restauração (RN50–RN56) ---
  const diasDesdeUltimoBackup = calcularDiasDesdeUltimoBackup(ultimoBackupIso);
  const exibirLembreteBackup7Dias = precisaLembreteBackup7Dias(ultimoBackupIso);

  async function abrirModalBackup() {
    setErroModalBackup(null);
    setCaminhoDestinoBackup(gerarNomeBackupSugerido());
    setModalBackupAberto(true);
    try {
      const padrao = await backupObterCaminhoPadrao();
      if (padrao) {
        setCaminhoDestinoBackup(padrao);
      }
    } catch {
      // Mantém nome sugerido se não conseguir obter o caminho padrão
    }
  }

  async function escolherPastaBackup() {
    try {
      const selecionado = await backupSelecionarDestino(
        caminhoDestinoBackup.trim() || null,
      );
      if (selecionado) {
        setCaminhoDestinoBackup(selecionado);
      }
    } catch (erro) {
      setErroModalBackup(extrairErroApi(erro).mensagem);
    }
  }

  async function confirmarFazerBackupAgora() {
    setErroModalBackup(null);
    setToastErro(null);
    setToastSucesso(null);
    setGerandoBackup(true);
    try {
      const resultado = await backupCriar(caminhoDestinoBackup.trim() || null);
      setUltimoBackupIso(resultado.criado_em);
      setModalBackupAberto(false);
      setToastSucesso(
        `Backup salvo e verificado com sucesso em: ${resultado.caminho_arquivo}`,
      );
    } catch (erro) {
      setErroModalBackup(extrairErroApi(erro).mensagem);
    } finally {
      setGerandoBackup(false);
    }
  }

  function aoSelecionarArquivoBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!arq) return;

    setArquivoBackupSelecionado(arq);
    const caminhoNativo =
      "path" in arq && typeof (arq as { path?: unknown }).path === "string"
        ? (arq as { path: string }).path.trim()
        : "";
    setCaminhoBackupRestaurar(caminhoNativo || arq.name);
    setInspecaoBackup(null);
    setErroRestauracao(null);
  }

  async function obterPayloadArquivoBackup(): Promise<{
    caminho: string;
    conteudo_base64: string | null;
  }> {
    let caminho = caminhoBackupRestaurar.trim();
    let conteudo_base64: string | null = null;

    if (arquivoBackupSelecionado) {
      const caminhoNativo =
        "path" in arquivoBackupSelecionado &&
        typeof (arquivoBackupSelecionado as { path?: unknown }).path ===
          "string"
          ? (arquivoBackupSelecionado as { path: string }).path.trim()
          : "";

      if (caminhoNativo) {
        caminho = caminhoNativo;
      } else {
        caminho = arquivoBackupSelecionado.name;
        conteudo_base64 = await lerArquivoComoBase64(arquivoBackupSelecionado);
      }
    }

    return { caminho, conteudo_base64 };
  }

  async function verificarArquivoBackup(e: React.FormEvent) {
    e.preventDefault();
    setErroRestauracao(null);
    setToastErro(null);
    setToastSucesso(null);

    if (!arquivoBackupSelecionado && !caminhoBackupRestaurar.trim()) {
      setErroRestauracao("Selecione ou informe o caminho do arquivo .lotusbackup.");
      return;
    }

    if (!senhaOuChaveBackup.trim()) {
      setErroRestauracao(
        "Digite a senha ou a chave de recuperação do backup para continuar.",
      );
      return;
    }

    setInspecionandoBackup(true);
    try {
      const { caminho, conteudo_base64 } = await obterPayloadArquivoBackup();
      const resultado = await backupInspecionar({
        caminho,
        senha: senhaOuChaveBackup.trim(),
        conteudo_base64,
      });
      setInspecaoBackup(resultado);
    } catch (erro) {
      setInspecaoBackup(null);
      setErroRestauracao(extrairErroApi(erro).mensagem);
    } finally {
      setInspecionandoBackup(false);
    }
  }

  async function confirmarRestauracaoBackup() {
    if (!inspecaoBackup) return;
    setErroRestauracao(null);
    setToastErro(null);
    setToastSucesso(null);
    setRestaurandoBackup(true);

    try {
      const { caminho, conteudo_base64 } = await obterPayloadArquivoBackup();
      const restaurado = await backupRestaurar({
        caminho,
        senha: senhaOuChaveBackup.trim(),
        conteudo_base64,
      });

      setConfirmarRestauracaoAberta(false);
      setInspecaoBackup(null);
      setSenhaOuChaveBackup("");
      setArquivoBackupSelecionado(null);
      setCaminhoBackupRestaurar("");
      if (ehDataIsoBackupValida(restaurado.criado_em)) {
        setUltimoBackupIso(restaurado.criado_em);
      }

      const avisoCopiaPrevia = restaurado.caminho_copia_seguranca
        ? ` Uma cópia de segurança dos dados anteriores foi salva automaticamente.`
        : "";
      setToastSucesso(
        `Backup restaurado com sucesso (${restaurado.n_pacientes} paciente(s) e ${restaurado.n_documentos} documento(s)).${avisoCopiaPrevia}`,
      );
      void carregarCategorias();
    } catch (erro) {
      setConfirmarRestauracaoAberta(false);
      setErroRestauracao(extrairErroApi(erro).mensagem);
    } finally {
      setRestaurandoBackup(false);
    }
  }

  // --- Ações de Categorias de Documentos (RN41) ---
  async function lidarComCriarCategoria(e: React.FormEvent) {
    e.preventDefault();
    setErroCategorias(null);
    setToastErro(null);
    setToastSucesso(null);

    const nomeLimpo = nomeNovaCategoria.trim();
    if (!nomeLimpo) {
      setErroCategorias("Digite o nome da nova categoria.");
      return;
    }

    setCriandoCategoria(true);
    try {
      const criada = await categoriaCriar(nomeLimpo);
      setNomeNovaCategoria("");
      setToastSucesso(`Categoria "${criada.nome}" criada com sucesso.`);
      await carregarCategorias();
    } catch (erro) {
      setErroCategorias(extrairErroApi(erro).mensagem);
    } finally {
      setCriandoCategoria(false);
    }
  }

  function abrirModalRenomearCategoria(cat: CategoriaDocumento) {
    setCategoriaEmEdicao(cat);
    setNovoNomeCategoria(cat.nome);
    setModalRenomearAberto(true);
  }

  async function confirmarRenomearCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!categoriaEmEdicao) return;

    const nomeLimpo = novoNomeCategoria.trim();
    if (!nomeLimpo) {
      setToastErro("O nome da categoria não pode ficar em branco.");
      return;
    }

    setSalvandoRenomeacao(true);
    try {
      const renomeada = await categoriaRenomear(categoriaEmEdicao.id, nomeLimpo);
      setModalRenomearAberto(false);
      setCategoriaEmEdicao(null);
      setToastSucesso(`Categoria renomeada para "${renomeada.nome}".`);
      await carregarCategorias();
    } catch (erro) {
      setToastErro(extrairErroApi(erro).mensagem);
    } finally {
      setSalvandoRenomeacao(false);
    }
  }

  async function confirmarExcluirCategoria() {
    if (!categoriaParaExcluir) return;
    setExcluindoCategoria(true);
    try {
      await categoriaExcluir(categoriaParaExcluir.id);
      setToastSucesso(`Categoria "${categoriaParaExcluir.nome}" excluída.`);
      setCategoriaParaExcluir(null);
      await carregarCategorias();
    } catch (erro) {
      setToastErro(extrairErroApi(erro).mensagem);
      setCategoriaParaExcluir(null);
    } finally {
      setExcluindoCategoria(false);
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-malva">Configurações</h2>
        <p className="text-base text-lilas-acinzentado">
          Segurança, troca de senha, cópia de segurança (backup), categorias de documentos e informações do sistema.
        </p>
      </div>

      {/* 1. Seção de Trocar Senha Mestra (RN07, RN08) */}
      <section
        aria-label="Trocar senha mestra"
        data-testid="secao-config-trocar-senha"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
      >
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-malva">
            Trocar Senha Mestra
          </h3>
          <p className="text-base text-texto">
            Altere a senha usada para desbloquear o sistema e acessar seus pacientes e documentos. A alteração exige que você informe a sua senha atual.
          </p>
        </div>

        <form
          onSubmit={(e) => void lidarComTrocaSenha(e)}
          className="space-y-4 max-w-xl"
        >
          <Input
            id="campo-senha-atual"
            data-testid="campo-senha-atual"
            type="password"
            rotulo="Senha atual"
            value={senhaAtual}
            onChange={(e) => {
              setSenhaAtual(e.target.value);
              setErroTrocaSenha(null);
            }}
            placeholder="Digite a sua senha atual..."
          />

          <div className="space-y-2">
            <Input
              id="campo-nova-senha"
              data-testid="campo-nova-senha"
              type="password"
              rotulo="Nova senha"
              value={novaSenha}
              onChange={(e) => {
                setNovaSenha(e.target.value);
                setErroTrocaSenha(null);
              }}
              placeholder="Digite a nova senha (mínimo de 8 caracteres)..."
              ajuda="Dica: use uma frase fácil de lembrar e difícil de adivinhar."
            />

            {novaSenha.length > 0 && (
              <div
                data-testid="indicador-forca-nova-senha"
                className="flex items-center gap-2 text-base text-texto"
              >
                <div className="flex-1 h-2 rounded-full bg-rosa-claro/50 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      forcaNovaSenha.pontuacao <= 1
                        ? "w-1/4 bg-malva"
                        : forcaNovaSenha.pontuacao === 2
                          ? "w-2/4 bg-lilas-acinzentado"
                          : forcaNovaSenha.pontuacao === 3
                            ? "w-3/4 bg-malva"
                            : "w-full bg-malva"
                    }`}
                  />
                </div>
                <span className="font-semibold text-base text-malva">
                  {forcaNovaSenha.rotulo}
                </span>
              </div>
            )}
          </div>

          <Input
            id="campo-confirmar-nova-senha"
            data-testid="campo-confirmar-nova-senha"
            type="password"
            rotulo="Confirmar nova senha"
            value={confirmarNovaSenha}
            onChange={(e) => {
              setConfirmarNovaSenha(e.target.value);
              setErroTrocaSenha(null);
            }}
            placeholder="Redigite a nova senha..."
          />

          {erroTrocaSenha && (
            <p
              role="alert"
              data-testid="erro-troca-senha"
              className="text-base font-semibold text-malva"
            >
              {erroTrocaSenha}
            </p>
          )}

          <div>
            <Button
              type="submit"
              variante="primario"
              disabled={alterandoSenha}
              data-testid="botao-salvar-nova-senha"
            >
              {alterandoSenha ? "Alterando senha..." : "Alterar senha"}
            </Button>
          </div>
        </form>
      </section>

      {/* 2. Seção de Backup e Restauração (RN50–RN56) */}
      <section
        aria-label="Cópia de segurança e restauração"
        data-testid="secao-config-backup"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-6 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-malva">
              Cópia de segurança (Backup e Restauração)
            </h3>
            <p
              data-testid="status-ultimo-backup-config"
              className="text-base text-texto"
            >
              Último backup:{" "}
              <strong>{formatarDataHoraBackupBr(ultimoBackupIso)}</strong>
            </p>
            <p className="text-base text-lilas-acinzentado">
              O arquivo <strong>.lotusbackup</strong> reúne pacientes, sessões,
              agenda, documentos gerais e fichas de anamnese com criptografia.
            </p>
          </div>

          <div className="shrink-0">
            <Button variante="primario" onClick={abrirModalBackup}>
              Fazer backup agora
            </Button>
          </div>
        </div>

        {exibirLembreteBackup7Dias && (
          <div
            role="status"
            data-testid="lembrete-backup-7-dias-config"
            className="p-4 rounded-xl bg-rosa-claro/40 border border-malva text-base text-texto"
          >
            Faz <strong>{diasDesdeUltimoBackup} dias</strong> desde o seu último
            backup. Recomendamos salvar uma nova cópia de segurança em seu
            pendrive ou pasta segura.
          </div>
        )}

        <div className="pt-4 border-t border-rosa-claro space-y-4">
          <div className="space-y-1">
            <h4 className="text-lg font-bold text-malva">
              Restaurar cópia de segurança
            </h4>
            <p className="text-base text-texto">
              Selecione um arquivo <strong>.lotusbackup</strong> e digite a senha
              do backup (ou a sua chave de recuperação de 24 caracteres). Antes
              de substituir os dados, o sistema criará automaticamente uma cópia
              de segurança dos dados atuais.
            </p>
          </div>

          <input
            ref={inputArquivoBackupRef}
            type="file"
            accept=".lotusbackup,.lcbackup"
            data-testid="input-arquivo-restaurar-backup"
            className="hidden"
            onChange={aoSelecionarArquivoBackup}
          />

          <form
            onSubmit={(e) => void verificarArquivoBackup(e)}
            className="space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <Input
                  id="campo-caminho-restaurar-backup"
                  rotulo="Arquivo de backup (.lotusbackup)"
                  value={caminhoBackupRestaurar}
                  onChange={(e) => {
                    setCaminhoBackupRestaurar(e.target.value);
                    setArquivoBackupSelecionado(null);
                    setInspecaoBackup(null);
                  }}
                  placeholder="Selecione o arquivo .lotusbackup ou cole o caminho..."
                />
              </div>
              <Button
                type="button"
                variante="contorno"
                onClick={() => inputArquivoBackupRef.current?.click()}
              >
                Escolher arquivo .lotusbackup
              </Button>
            </div>

            <Input
              id="campo-senha-restaurar-backup"
              type="password"
              rotulo="Senha ou chave de recuperação do backup"
              value={senhaOuChaveBackup}
              onChange={(e) => {
                setSenhaOuChaveBackup(e.target.value);
                setInspecaoBackup(null);
              }}
              placeholder="Digite a senha mestra ou a chave ABCD-EFGH-..."
            />

            {erroRestauracao && (
              <p
                role="alert"
                data-testid="erro-restauracao-backup"
                className="text-base font-semibold text-malva"
              >
                {erroRestauracao}
              </p>
            )}

            <div>
              <Button
                type="submit"
                variante="secundario"
                disabled={inspecionandoBackup}
                data-testid="botao-inspecionar-backup"
              >
                {inspecionandoBackup
                  ? "Verificando backup..."
                  : "Verificar arquivo de backup"}
              </Button>
            </div>
          </form>

          {inspecaoBackup && (
            <div
              data-testid="card-inspecao-backup"
              className="p-5 rounded-xl bg-fundo border border-malva space-y-4"
            >
              <div className="space-y-1">
                <h5 className="text-lg font-bold text-malva">
                  Backup verificado e pronto para restauração
                </h5>
                <p className="text-base text-texto">
                  Data do backup:{" "}
                  <strong data-testid="inspecao-data-backup">
                    {formatarDataHoraBackupBr(inspecaoBackup.data)}
                  </strong>{" "}
                  ({formatarTamanhoBytes(inspecaoBackup.tamanho_bytes)})
                </p>
              </div>

              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-base text-texto">
                <li data-testid="inspecao-qtd-pacientes">
                  Pacientes registrados:{" "}
                  <strong>{inspecaoBackup.n_pacientes}</strong>
                </li>
                <li data-testid="inspecao-qtd-documentos">
                  Documentos gerais:{" "}
                  <strong>{inspecaoBackup.n_documentos}</strong>
                </li>
                <li data-testid="inspecao-qtd-anamneses">
                  Fichas de anamnese:{" "}
                  <strong>{inspecaoBackup.n_anamneses}</strong>
                </li>
                <li data-testid="inspecao-qtd-agendamentos">
                  Agendamentos na agenda:{" "}
                  <strong>{inspecaoBackup.n_agendamentos}</strong>
                </li>
              </ul>

              <p className="text-base text-texto">
                Ao continuar, os dados atuais serão substituídos pelos dados
                deste backup. Uma cópia de segurança dos dados atuais será
                criada automaticamente antes da substituição.
              </p>

              <div>
                <Button
                  type="button"
                  variante="perigo"
                  data-testid="botao-abrir-confirmacao-restaurar"
                  onClick={() => setConfirmarRestauracaoAberta(true)}
                >
                  Restaurar este backup
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Seção de Mensagem de Aniversário (RN30–RN34) */}
      <section
        aria-label="Mensagem de aniversário"
        data-testid="secao-config-mensagem-aniversario"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
      >
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-malva">
            Mensagem de aniversário (WhatsApp)
          </h3>
          <p className="text-base text-texto">
            Personalize o texto preenchido ao clicar em{" "}
            <strong>Enviar parabéns no WhatsApp</strong>. Use{" "}
            <code className="px-1.5 py-0.5 rounded bg-rosa-claro/40 font-semibold text-texto">
              {"{primeiro_nome}"}
            </code>{" "}
            para incluir automaticamente o primeiro nome do paciente.
          </p>
        </div>

        <form
          onSubmit={(e) => void salvarMensagemAniversario(e)}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="campo-mensagem-aniversario"
              className="block text-base font-semibold text-texto"
            >
              Mensagem padrão de parabéns
            </label>
            <textarea
              id="campo-mensagem-aniversario"
              rows={3}
              value={mensagemAniversario}
              onChange={(e) => setMensagemAniversario(e.target.value)}
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variante="primario"
              disabled={salvandoMensagem}
            >
              {salvandoMensagem ? "Salvando..." : "Salvar mensagem"}
            </Button>
            <Button
              type="button"
              variante="contorno"
              onClick={restaurarMensagemPadrao}
            >
              Restaurar padrão
            </Button>
          </div>
        </form>
      </section>

      {/* 4. Seção de Gerenciar Categorias de Documentos (RN41) */}
      <section
        aria-label="Gerenciar categorias de documentos"
        data-testid="secao-config-categorias"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-6 shadow-xs"
      >
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-malva">
            Categorias de Documentos
          </h3>
          <p className="text-base text-texto">
            Organize os modelos, arquivos administrativos e outros documentos gerais da clínica. Categorias que possuem documentos vinculados não podem ser excluídas.
          </p>
        </div>

        {/* Formulário de adicionar nova categoria */}
        <form
          onSubmit={(e) => void lidarComCriarCategoria(e)}
          className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 max-w-xl"
        >
          <div className="flex-1">
            <Input
              id="campo-nova-categoria"
              data-testid="campo-nova-categoria"
              rotulo="Nova categoria"
              value={nomeNovaCategoria}
              onChange={(e) => {
                setNomeNovaCategoria(e.target.value);
                setErroCategorias(null);
              }}
              placeholder="Ex.: Relatórios, Laudos, Fichas..."
            />
          </div>
          <Button
            type="submit"
            variante="primario"
            disabled={criandoCategoria}
            data-testid="botao-criar-categoria"
          >
            {criandoCategoria ? "Adicionando..." : "Adicionar categoria"}
          </Button>
        </form>

        {erroCategorias && (
          <p
            role="alert"
            data-testid="erro-categoria-config"
            className="text-base font-semibold text-malva"
          >
            {erroCategorias}
          </p>
        )}

        {/* Lista de categorias existentes */}
        <div className="space-y-2">
          <h4 className="text-base font-semibold text-texto">
            Categorias cadastradas
          </h4>

          {carregandoCategorias ? (
            <p className="text-base text-lilas-acinzentado">Carregando categorias...</p>
          ) : categorias.length === 0 ? (
            <p className="text-base text-lilas-acinzentado">Nenhuma categoria cadastrada.</p>
          ) : (
            <div
              data-testid="lista-categorias-config"
              className="divide-y divide-rosa-claro rounded-xl border border-rosa-claro overflow-hidden bg-fundo"
            >
              {categorias.map((cat) => (
                <div
                  key={cat.id}
                  data-testid={`item-categoria-${cat.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-rosa-claro/10 transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="text-base font-semibold text-texto">
                      {cat.nome}
                    </p>
                    <p className="text-base text-lilas-acinzentado">
                      {cat.total_documentos === 1
                        ? "1 documento vinculado"
                        : `${cat.total_documentos} documentos vinculados`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variante="contorno"
                      data-testid={`botao-renomear-categoria-${cat.id}`}
                      onClick={() => abrirModalRenomearCategoria(cat)}
                    >
                      Renomear
                    </Button>
                    <Button
                      type="button"
                      variante="perigo"
                      data-testid={`botao-excluir-categoria-${cat.id}`}
                      disabled={cat.total_documentos > 0}
                      title={
                        cat.total_documentos > 0
                          ? "Não é possível excluir categorias que possuem documentos vinculados."
                          : "Excluir categoria"
                      }
                      onClick={() => setCategoriaParaExcluir(cat)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. Seção Sobre o Sistema e Segurança */}
      <section
        aria-label="Sobre o sistema e segurança"
        data-testid="secao-config-sobre"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-6 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <img
            src={logoLotusPsi}
            alt="Logo LotusPsi"
            className="w-20 h-auto select-none shrink-0"
          />
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-malva">
              LotusPsi — Sistema de Gestão Clínica e Prontuário
            </h3>
            <p className="text-base font-semibold text-texto">
              Versão 0.1.0 • Desenvolvido para gestão clínica em psicologia{" "}
              <span className="text-malva">(CRP 00/00000)</span>
            </p>
            <p className="text-base text-lilas-acinzentado">
              Autoria e desenvolvimento por André Felipe.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-rosa-claro">
          <div className="p-4 rounded-xl bg-fundo border border-rosa-claro space-y-1.5">
            <h4 className="text-base font-bold text-malva">
              100% Offline e Privativo
            </h4>
            <p className="text-base text-texto">
              O aplicativo não utiliza nuvem, não faz requisições de rede, não possui telemetria e mantém a privacidade médica absoluta das informações em seu computador.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-fundo border border-rosa-claro space-y-1.5">
            <h4 className="text-base font-bold text-malva">
              Criptografia em Repouso
            </h4>
            <p className="text-base text-texto">
              Banco de dados local protegido com SQLCipher (AES-256) e anexos cifrados em blocos com XChaCha20-Poly1305.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-fundo border border-rosa-claro space-y-1.5">
            <h4 className="text-base font-bold text-malva">
              Proteção de Acesso e KDF
            </h4>
            <p className="text-base text-texto">
              Derivação de chaves através de Argon2id, proteção contra tentativas de força bruta (rate-limit) e chave de recuperação em papel para emergências.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-fundo border border-rosa-claro space-y-1.5">
            <h4 className="text-base font-bold text-malva">
              Conformidade Ética e Legal
            </h4>
            <p className="text-base text-texto">
              Projetado em conformidade com a Resolução CFP 01/2009 (guarda documental mínima de 5 anos) e os princípios da LGPD.
            </p>
          </div>
        </div>
      </section>

      {/* Modal Fazer backup agora (RN50, RN51, RN55) */}
      <Modal
        aberto={modalBackupAberto}
        titulo="Fazer backup agora"
        aoFechar={() => {
          if (!gerandoBackup) setModalBackupAberto(false);
        }}
        larguraMax="lg"
        rodape={
          <>
            <Button
              variante="contorno"
              disabled={gerandoBackup}
              onClick={() => setModalBackupAberto(false)}
            >
              Cancelar
            </Button>
            <Button
              variante="primario"
              disabled={gerandoBackup}
              data-testid="confirmar-salvar-backup-config"
              onClick={() => void confirmarFazerBackupAgora()}
            >
              {gerandoBackup ? "Gerando e verificando..." : "Salvar backup"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-base text-texto">
            O sistema criará um único arquivo <strong>.lotusbackup</strong>{" "}
            criptografado com todos os seus pacientes, sessões, agenda,
            documentos gerais e fichas de anamnese, verificando a integridade ao
            final.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Input
                id="campo-caminho-destino-backup-config"
                data-testid="campo-caminho-destino-backup-config"
                rotulo="Pasta ou caminho para salvar o backup (.lotusbackup)"
                value={caminhoDestinoBackup}
                onChange={(e) => setCaminhoDestinoBackup(e.target.value)}
                placeholder="Ex.: /home/.../Downloads/backup-...lotusbackup"
                ajuda="Por padrão, salvo na pasta de Downloads. Você pode clicar em 'Escolher pasta...' para selecionar seu pendrive ou pasta na nuvem."
              />
            </div>
            <Button
              type="button"
              variante="contorno"
              data-testid="botao-escolher-pasta-backup-config"
              onClick={() => void escolherPastaBackup()}
            >
              Escolher pasta...
            </Button>
          </div>
          {erroModalBackup && (
            <p role="alert" className="text-base font-semibold text-malva">
              {erroModalBackup}
            </p>
          )}
        </div>
      </Modal>

      {/* Modal Renomear Categoria (RN41) */}
      <Modal
        aberto={modalRenomearAberto}
        titulo="Renomear Categoria"
        aoFechar={() => {
          if (!salvandoRenomeacao) setModalRenomearAberto(false);
        }}
        larguraMax="md"
        rodape={
          <>
            <Button
              variante="contorno"
              disabled={salvandoRenomeacao}
              onClick={() => setModalRenomearAberto(false)}
            >
              Cancelar
            </Button>
            <Button
              variante="primario"
              disabled={salvandoRenomeacao}
              data-testid="confirmar-renomear-categoria"
              onClick={(e) => void confirmarRenomearCategoria(e)}
            >
              {salvandoRenomeacao ? "Salvando..." : "Salvar novo nome"}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => void confirmarRenomearCategoria(e)} className="space-y-4">
          <Input
            id="campo-editar-nome-categoria"
            data-testid="campo-editar-nome-categoria"
            rotulo="Nome da categoria"
            required
            value={novoNomeCategoria}
            onChange={(e) => setNovoNomeCategoria(e.target.value)}
            placeholder="Digite o novo nome da categoria..."
          />
        </form>
      </Modal>

      {/* Diálogo de confirmação de exclusão de categoria (RN41) */}
      <ConfirmDialog
        aberto={categoriaParaExcluir !== null}
        titulo="Excluir categoria de documento"
        mensagem={
          categoriaParaExcluir
            ? `Tem certeza de que deseja excluir a categoria "${categoriaParaExcluir.nome}"? Esta ação não pode ser desfeita.`
            : "Tem certeza de que deseja excluir esta categoria?"
        }
        rotuloConfirmar="Sim, excluir categoria"
        rotuloCancelar="Cancelar"
        carregando={excluindoCategoria}
        aoConfirmar={() => void confirmarExcluirCategoria()}
        aoCancelar={() => {
          if (!excluindoCategoria) setCategoriaParaExcluir(null);
        }}
      />

      {/* Diálogo de confirmação de restauração (RN54) */}
      <ConfirmDialog
        aberto={confirmarRestauracaoAberta}
        titulo="Confirmar restauração de backup"
        mensagem={
          inspecaoBackup
            ? `Tem certeza de que deseja substituir os dados atuais pelo backup de ${formatarDataHoraBackupBr(inspecaoBackup.data)} (${inspecaoBackup.n_pacientes} paciente(s) e ${inspecaoBackup.n_documentos} documento(s))? Uma cópia de segurança dos dados atuais será criada automaticamente antes da substituição.`
            : "Tem certeza de que deseja substituir os dados atuais por este backup?"
        }
        rotuloConfirmar="Sim, substituir dados e restaurar"
        rotuloCancelar="Cancelar"
        carregando={restaurandoBackup}
        aoConfirmar={() => void confirmarRestauracaoBackup()}
        aoCancelar={() => {
          if (!restaurandoBackup) setConfirmarRestauracaoAberta(false);
        }}
      />

      <Toast
        mensagem={toastSucesso}
        tipo="sucesso"
        aoFechar={() => setToastSucesso(null)}
      />
      <Toast
        mensagem={toastErro}
        tipo="erro"
        aoFechar={() => setToastErro(null)}
      />
    </div>
  );
}
