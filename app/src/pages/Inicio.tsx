import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Modal, SessaoModal, Toast } from "../components";
import {
  agendamentosListar,
  aniversariantesListar,
  backupCriar,
  backupObterCaminhoPadrao,
  backupSelecionarDestino,
  boasVindasObter,
  configObter,
  EVENTO_SESSAO_DESBLOQUEADA,
  extrairErroApi,
  pacientesListar,
  whatsappParabens,
} from "../lib/api";
import {
  calcularDiasDesdeUltimoBackup,
  CHAVE_CONFIG_ULTIMO_BACKUP,
  ehDataIsoBackupValida,
  extrairDigitos,
  formatarDataBr,
  formatarDataHoraBackupBr,
  formatarIdadeComNascimento,
  formatarTelefoneBr,
  gerarNomeBackupSugerido,
  intervalosHorariosConflitam,
  MENSAGENS_BOAS_VINDAS,
  obterDataHojeIso,
  obterSaudacaoHorario,
  precisaLembreteBackup7Dias,
  sortearIndiceBoasVindas,
} from "../lib/format";
import type { Agendamento, Aniversariante, PacienteResumo } from "../lib/types";

let ultimoIndiceBoasVindasLocal: number | null = null;

function sortearMensagemBoasVindasLocal(): string {
  const proximoIndice = sortearIndiceBoasVindas(ultimoIndiceBoasVindasLocal);
  ultimoIndiceBoasVindasLocal = proximoIndice;
  return MENSAGENS_BOAS_VINDAS[proximoIndice];
}

function normalizarTextoLocal(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function Inicio() {
  const navigate = useNavigate();
  const [pacientesAtivos, setPacientesAtivos] = useState<PacienteResumo[]>([]);
  const [sessoesHoje, setSessoesHoje] = useState<Agendamento[]>([]);
  const [aniversariantesLista, setAniversariantesLista] = useState<
    Aniversariante[]
  >([]);
  const [mostrarProximos7Dias, setMostrarProximos7Dias] =
    useState<boolean>(false);
  const [rascunhoRapido, setRascunhoRapido] = useState<string>("");

  // Fluxo F4-T4 / RN76: Atalho "Registrar sessão" ou "Sessões de hoje" -> Modal T08
  const [modalBuscaAberta, setModalBuscaAberta] = useState<boolean>(false);
  const [buscaRapida, setBuscaRapida] = useState<string>("");
  const [pacienteSelecionado, setPacienteSelecionado] =
    useState<PacienteResumo | null>(null);
  const [dataSessaoSelecionadaIso, setDataSessaoSelecionadaIso] = useState<
    string | undefined
  >(undefined);
  const [modalSessaoAberto, setModalSessaoAberto] = useState<boolean>(false);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);
  const [toastErro, setToastErro] = useState<string | null>(null);
  const [mensagemBoasVindas, setMensagemBoasVindas] = useState<string>(() =>
    sortearMensagemBoasVindasLocal(),
  );

  // Estado de Backup no Painel Inicial (RN50, RN51, RN53, RN55)
  const [ultimoBackupIso, setUltimoBackupIso] = useState<string | null>(null);
  const [modalBackupAberto, setModalBackupAberto] = useState<boolean>(false);
  const [caminhoDestinoBackup, setCaminhoDestinoBackup] = useState<string>("");
  const [gerandoBackup, setGerandoBackup] = useState<boolean>(false);
  const [erroModalBackup, setErroModalBackup] = useState<string | null>(null);

  const hojeIso = obterDataHojeIso();
  const saudacaoHorario = obterSaudacaoHorario();
  const dataHojeBr = formatarDataBr(hojeIso);
  const totalAtivos = pacientesAtivos.length;

  const aniversariantesHoje = useMemo(
    () =>
      aniversariantesLista.filter((item) => item.dias_ate_aniversario === 0),
    [aniversariantesLista],
  );

  const proximosAniversariantes = useMemo(
    () =>
      aniversariantesLista.filter(
        (item) =>
          item.dias_ate_aniversario > 0 && item.dias_ate_aniversario <= 7,
      ),
    [aniversariantesLista],
  );

  const carregarAniversariantes = useCallback(() => {
    aniversariantesListar(7)
      .then((lista) => {
        if (Array.isArray(lista)) {
          setAniversariantesLista(lista);
        }
      })
      .catch(() => {
        // Mantém lista atual em caso de erro inicial
      });
  }, []);

  const carregarSessoesHoje = useCallback((dataIso: string) => {
    agendamentosListar({ data_inicio: dataIso, data_fim: dataIso })
      .then((lista) => {
        if (Array.isArray(lista)) {
          const copia = lista.map((item) => ({ ...item }));
          for (let i = 0; i < copia.length; i++) {
            for (let j = 0; j < copia.length; j++) {
              if (
                i !== j &&
                copia[i].data === copia[j].data &&
                intervalosHorariosConflitam(
                  copia[i].hora_inicio,
                  copia[i].duracao_min,
                  copia[j].hora_inicio,
                  copia[j].duracao_min,
                )
              ) {
                copia[i].conflito = true;
              }
            }
          }
          copia.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
          setSessoesHoje(copia);
        }
      })
      .catch(() => {
        // Mantém lista vazia em caso de erro inicial
      });
  }, []);

  const carregarBoasVindas = useCallback((rotacionarFallback: boolean) => {
    boasVindasObter()
      .then((msg) => {
        if (typeof msg === "string" && msg.trim().length > 0) {
          const idx = MENSAGENS_BOAS_VINDAS.indexOf(msg);
          if (idx >= 0) {
            ultimoIndiceBoasVindasLocal = idx;
          }
          setMensagemBoasVindas(msg);
        } else if (rotacionarFallback) {
          setMensagemBoasVindas(sortearMensagemBoasVindasLocal());
        }
      })
      .catch(() => {
        if (rotacionarFallback) {
          setMensagemBoasVindas(sortearMensagemBoasVindasLocal());
        }
      });
  }, []);

  const carregarUltimoBackup = useCallback(() => {
    configObter(CHAVE_CONFIG_ULTIMO_BACKUP)
      .then((valor) => {
        if (ehDataIsoBackupValida(valor)) {
          setUltimoBackupIso(valor!.trim());
        } else {
          setUltimoBackupIso(null);
        }
      })
      .catch(() => {
        // Mantém estado atual em caso de erro inicial
      });
  }, []);

  useEffect(() => {
    let cancelado = false;
    carregarBoasVindas(false);
    carregarSessoesHoje(hojeIso);
    carregarAniversariantes();
    carregarUltimoBackup();
    pacientesListar({ status: "ativo" })
      .then((lista) => {
        if (!cancelado && Array.isArray(lista)) {
          setPacientesAtivos(lista);
        }
      })
      .catch(() => {
        // Mantém lista vazia em caso de erro inicial
      });

    return () => {
      cancelado = true;
    };
  }, [
    carregarAniversariantes,
    carregarBoasVindas,
    carregarSessoesHoje,
    carregarUltimoBackup,
    hojeIso,
  ]);

  useEffect(() => {
    const aoDesbloquear = () => {
      carregarBoasVindas(true);
      carregarSessoesHoje(hojeIso);
      carregarAniversariantes();
      carregarUltimoBackup();
    };
    window.addEventListener(EVENTO_SESSAO_DESBLOQUEADA, aoDesbloquear);
    return () => {
      window.removeEventListener(EVENTO_SESSAO_DESBLOQUEADA, aoDesbloquear);
    };
  }, [
    carregarAniversariantes,
    carregarBoasVindas,
    carregarSessoesHoje,
    carregarUltimoBackup,
    hojeIso,
  ]);

  const pacientesFiltradosBuscaRapida = useMemo(() => {
    const termo = buscaRapida.trim();
    const termoNormalizado = normalizarTextoLocal(termo);
    const termoDigitos = extrairDigitos(termo);

    return [...pacientesAtivos]
      .filter((p) => {
        if (!termo) return true;
        const nomeNorm = normalizarTextoLocal(p.nome);
        if (termoNormalizado && nomeNorm.includes(termoNormalizado)) {
          return true;
        }
        if (termoDigitos) {
          const telDigitos = extrairDigitos(p.telefone ?? "");
          const zapDigitos = extrairDigitos(p.whatsapp ?? "");
          if (
            telDigitos.includes(termoDigitos) ||
            zapDigitos.includes(termoDigitos)
          ) {
            return true;
          }
        }
        return false;
      })
      .sort((a, b) =>
        normalizarTextoLocal(a.nome).localeCompare(
          normalizarTextoLocal(b.nome),
          "pt-BR",
        ),
      );
  }, [pacientesAtivos, buscaRapida]);

  function abrirAtalhoRegistrarSessao() {
    setBuscaRapida("");
    setModalBuscaAberta(true);
    pacientesListar({ status: "ativo" })
      .then((lista) => {
        if (Array.isArray(lista)) {
          setPacientesAtivos(lista);
        }
      })
      .catch(() => {
        // Ignora falha silenciosamente mantendo lista já carregada
      });
  }

  function selecionarPacienteParaSessao(
    paciente: PacienteResumo,
    dataIso?: string,
  ) {
    setPacienteSelecionado(paciente);
    setDataSessaoSelecionadaIso(dataIso);
    setModalBuscaAberta(false);
    setModalSessaoAberto(true);
  }

  function registrarSessaoDeAgendamento(ag: Agendamento) {
    selecionarPacienteParaSessao(
      {
        id: ag.paciente_id,
        nome: ag.paciente_nome,
        status: "ativo",
      },
      ag.data,
    );
  }

  function temContatoWhatsapp(item: Aniversariante): boolean {
    const digitos = extrairDigitos(item.whatsapp || item.telefone || "");
    return digitos.length >= 10;
  }

  async function enviarParabensWhatsapp(item: Aniversariante) {
    setToastErro(null);
    try {
      await whatsappParabens(item.id);
    } catch (erro) {
      setToastErro(extrairErroApi(erro).mensagem);
    }
  }

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

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-fundo-claro border border-rosa-claro rounded-2xl p-6 shadow-xs">
        <div className="space-y-1">
          <p
            data-testid="saudacao-horario"
            className="text-base font-semibold text-lilas-acinzentado"
          >
            {saudacaoHorario}, Louriedna Costa!
          </p>
          <h2 className="text-2xl font-bold text-malva">
            Olá, Louriedna! — Painel Inicial
          </h2>
          <p
            data-testid="mensagem-boas-vindas"
            className="text-lg font-semibold text-malva"
          >
            {mensagemBoasVindas}
          </p>
          <p className="text-base text-texto">
            Bem-vinda ao seu consultório. Hoje é <strong>{dataHojeBr}</strong>.
          </p>
        </div>

        <div
          data-testid="card-total-ativos"
          className="px-5 py-3 rounded-xl bg-rosa-claro/40 border border-malva text-center sm:text-right shrink-0"
        >
          <p className="text-base font-semibold text-texto">Pacientes ativos</p>
          <p
            data-testid="valor-total-ativos"
            className="text-2xl font-bold text-malva"
          >
            {totalAtivos}
          </p>
        </div>
      </header>

      <section
        aria-label="Atalhos rápidos"
        data-testid="secao-atalhos"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
      >
        <h3 className="text-lg font-bold text-malva">Ações rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            variante="primario"
            larguraTotal
            onClick={() => navigate("/pacientes/novo")}
          >
            Novo paciente
          </Button>
          <Button
            variante="secundario"
            larguraTotal
            onClick={abrirAtalhoRegistrarSessao}
          >
            Registrar sessão
          </Button>
          <Button
            variante="contorno"
            larguraTotal
            onClick={() => navigate("/pacientes")}
          >
            Buscar paciente
          </Button>
          <Button
            variante="contorno"
            larguraTotal
            onClick={() => navigate("/documentos")}
          >
            Documentos
          </Button>
        </div>
      </section>

      {/* Sessões de hoje na Agenda (RN75, RN76) */}
      <section
        aria-label="Sessões de hoje"
        data-testid="secao-sessoes-hoje"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-malva">Sessões de hoje</h3>
            <p className="text-base text-texto">
              Atendimentos agendados para hoje ({dataHojeBr}).
            </p>
          </div>
          <Button variante="contorno" onClick={() => navigate("/agenda")}>
            Abrir agenda
          </Button>
        </div>

        {sessoesHoje.length === 0 ? (
          <p className="text-base text-texto">
            Nenhuma sessão agendada para hoje ({dataHojeBr}).
          </p>
        ) : (
          <ul
            data-testid="lista-sessoes-hoje"
            className="divide-y divide-rosa-claro border border-rosa-claro rounded-xl bg-fundo"
          >
            {sessoesHoje.map((ag) => (
              <li
                key={ag.id}
                data-testid={`sessao-hoje-${ag.id}`}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-base text-texto">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-malva">
                      {ag.hora_inicio}
                    </span>
                    <span>—</span>
                    <span className="font-bold text-texto">
                      {ag.paciente_nome}
                    </span>
                    {ag.conflito && (
                      <span
                        data-testid={`conflito-sessao-hoje-${ag.id}`}
                        className="px-2.5 py-0.5 rounded-full bg-rosa-claro/60 border border-malva text-base font-semibold text-texto"
                      >
                        Conflito de horário
                      </span>
                    )}
                  </div>
                  {ag.observacao && (
                    <p className="text-base text-lilas-acinzentado">
                      {ag.observacao}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <Button
                    variante="primario"
                    className="px-3.5 py-2"
                    data-testid={`registrar-sessao-hoje-${ag.id}`}
                    onClick={() => registrarSessaoDeAgendamento(ag)}
                  >
                    Registrar sessão
                  </Button>
                  <Button
                    variante="contorno"
                    className="px-3.5 py-2"
                    onClick={() => navigate(`/pacientes/${ag.paciente_id}`)}
                  >
                    Ver perfil
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-label="Aniversariantes"
          data-testid="secao-aniversariantes"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-malva">
              Aniversariantes do dia
            </h3>

            {aniversariantesHoje.length === 0 ? (
              <p className="text-base text-texto">
                Nenhum aniversariante registrado para hoje ({dataHojeBr}).
              </p>
            ) : (
              <ul
                data-testid="lista-aniversariantes-hoje"
                className="divide-y divide-rosa-claro border border-rosa-claro rounded-xl bg-fundo"
              >
                {aniversariantesHoje.map((aniv) => (
                  <li
                    key={aniv.id}
                    data-testid={`aniversariante-hoje-${aniv.id}`}
                    className="p-4 flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/pacientes/${aniv.id}`)}
                            className="text-base font-bold text-malva hover:underline text-left"
                          >
                            {aniv.nome}
                          </button>
                          <span
                            data-testid={`status-aniversariante-${aniv.id}`}
                            className={`px-2.5 py-0.5 rounded-full text-base font-semibold border ${
                              aniv.status === "ativo"
                                ? "bg-rosa-claro/50 border-malva text-texto"
                                : "bg-fundo-claro border-lilas-acinzentado text-lilas-acinzentado"
                            }`}
                          >
                            {aniv.status === "ativo" ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <p className="text-base text-texto">
                          Completando{" "}
                          <strong>
                            {aniv.idade_completando}{" "}
                            {aniv.idade_completando === 1 ? "ano" : "anos"}
                          </strong>{" "}
                          hoje
                        </p>
                      </div>

                      {temContatoWhatsapp(aniv) && (
                        <Button
                          variante="primario"
                          className="px-4 py-2 shrink-0"
                          data-testid={`whatsapp-parabens-${aniv.id}`}
                          onClick={() => void enviarParabensWhatsapp(aniv)}
                        >
                          Enviar parabéns no WhatsApp
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-2 border-t border-rosa-claro space-y-3">
            <Button
              variante="contorno"
              onClick={() => setMostrarProximos7Dias((prev) => !prev)}
              aria-expanded={mostrarProximos7Dias}
            >
              {mostrarProximos7Dias
                ? "Ocultar próximos aniversários (7 dias)"
                : "Próximos aniversários (7 dias)"}
            </Button>

            {mostrarProximos7Dias && (
              <div
                data-testid="lista-proximos-aniversarios"
                className="p-4 rounded-xl bg-fundo border border-rosa-claro text-base text-texto"
              >
                {proximosAniversariantes.length === 0 ? (
                  "Nenhum aniversário nos próximos 7 dias."
                ) : (
                  <ul className="divide-y divide-rosa-claro">
                    {proximosAniversariantes.map((prox) => (
                      <li
                        key={prox.id}
                        data-testid={`aniversariante-proximo-${prox.id}`}
                        className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => navigate(`/pacientes/${prox.id}`)}
                              className="text-base font-bold text-malva hover:underline text-left"
                            >
                              {prox.nome}
                            </button>
                            <span className="px-2.5 py-0.5 rounded-full text-base font-semibold border border-lilas-acinzentado text-texto">
                              {prox.status === "ativo" ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                          <p className="text-base text-texto">
                            Em{" "}
                            <strong>
                              {formatarDataBr(prox.data_comemoracao).slice(
                                0,
                                5,
                              )}
                            </strong>{" "}
                            (daqui a {prox.dias_ate_aniversario}{" "}
                            {prox.dias_ate_aniversario === 1 ? "dia" : "dias"})
                            — fará{" "}
                            <strong>
                              {prox.idade_completando}{" "}
                              {prox.idade_completando === 1 ? "ano" : "anos"}
                            </strong>
                          </p>
                        </div>

                        {temContatoWhatsapp(prox) && (
                          <Button
                            variante="contorno"
                            className="px-3.5 py-1.5 shrink-0"
                            data-testid={`whatsapp-parabens-${prox.id}`}
                            onClick={() => void enviarParabensWhatsapp(prox)}
                          >
                            Enviar parabéns no WhatsApp
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        <section
          aria-label="Cópia de segurança (Backup)"
          data-testid="secao-backup"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xs"
        >
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-malva">
              Cópia de segurança (Backup)
            </h3>
            <p
              data-testid="status-ultimo-backup"
              className="text-base text-texto"
            >
              Último backup:{" "}
              <strong>{formatarDataHoraBackupBr(ultimoBackupIso)}</strong>
            </p>
            {exibirLembreteBackup7Dias && (
              <div
                role="status"
                data-testid="lembrete-backup-7-dias"
                className="p-3.5 rounded-xl bg-rosa-claro/40 border border-malva text-base text-texto"
              >
                Faz <strong>{diasDesdeUltimoBackup} dias</strong> desde o seu
                último backup. Recomendamos salvar uma nova cópia de segurança
                em seu pendrive ou pasta segura.
              </div>
            )}
            <p className="text-base text-lilas-acinzentado">
              Guarde uma cópia criptografada dos seus pacientes e documentos em
              um pendrive ou pasta segura.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variante="primario" onClick={abrirModalBackup}>
              Fazer backup agora
            </Button>
            <Button
              variante="contorno"
              onClick={() => navigate("/configuracoes")}
            >
              Restaurar em Configurações
            </Button>
          </div>
        </section>
      </div>

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
              data-testid="confirmar-salvar-backup-inicio"
              onClick={() => void confirmarFazerBackupAgora()}
            >
              {gerandoBackup ? "Gerando e verificando..." : "Salvar backup"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-base text-texto">
            O sistema criará um único arquivo <strong>.lcbackup</strong>{" "}
            criptografado com todos os seus pacientes, sessões, agenda,
            documentos gerais e fichas de anamnese, verificando a integridade ao
            final.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <Input
                id="campo-caminho-destino-backup-inicio"
                data-testid="campo-caminho-destino-backup-inicio"
                rotulo="Pasta ou caminho para salvar o backup (.lcbackup)"
                value={caminhoDestinoBackup}
                onChange={(e) => setCaminhoDestinoBackup(e.target.value)}
                placeholder="Ex.: /home/.../Downloads/backup-...lcbackup"
                ajuda="Por padrão, salvo na pasta de Downloads. Você pode clicar em 'Escolher pasta...' para selecionar seu pendrive ou pasta na nuvem."
              />
            </div>
            <Button
              type="button"
              variante="contorno"
              data-testid="botao-escolher-pasta-backup-inicio"
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

      <section className="bg-fundo-claro border border-rosa-claro rounded-2xl shadow-xs p-6 space-y-3">
        <label
          htmlFor="rascunho-anotacao"
          className="block text-base font-semibold text-texto"
        >
          Anotação em andamento
        </label>
        <textarea
          id="rascunho-anotacao"
          rows={3}
          value={rascunhoRapido}
          onChange={(e) => setRascunhoRapido(e.target.value)}
          placeholder="Digite uma anotação rápida..."
          className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
        />
      </section>

      {/* Modal de busca rápida de paciente para registrar sessão (F4-T4) */}
      <Modal
        aberto={modalBuscaAberta}
        titulo="Selecionar paciente para sessão"
        aoFechar={() => setModalBuscaAberta(false)}
        larguraMax="lg"
        rodape={
          <Button
            variante="contorno"
            onClick={() => setModalBuscaAberta(false)}
          >
            Cancelar
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            id="busca-rapida-paciente-sessao"
            rotulo="Buscar paciente por nome ou telefone"
            value={buscaRapida}
            onChange={(e) => setBuscaRapida(e.target.value)}
            placeholder="Digite o nome ou telefone..."
          />

          {pacientesFiltradosBuscaRapida.length === 0 ? (
            <div className="p-4 rounded-xl bg-fundo border border-rosa-claro text-base text-texto">
              Nenhum paciente ativo encontrado.
            </div>
          ) : (
            <ul
              data-testid="lista-busca-rapida-pacientes"
              className="max-h-72 overflow-y-auto divide-y divide-rosa-claro border border-rosa-claro rounded-xl bg-fundo"
            >
              {pacientesFiltradosBuscaRapida.map((p) => (
                <li
                  key={p.id}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-rosa-claro/20"
                >
                  <div className="text-base text-texto">
                    <p className="font-bold text-malva">{p.nome}</p>
                    <p className="text-base text-lilas-acinzentado">
                      {formatarIdadeComNascimento(p.data_nascimento)} ·{" "}
                      {formatarTelefoneBr(p.telefone || p.whatsapp)}
                    </p>
                  </div>
                  <Button
                    variante="primario"
                    className="px-4 py-2 shrink-0"
                    data-testid={`selecionar-paciente-sessao-${p.id}`}
                    onClick={() => selecionarPacienteParaSessao(p)}
                  >
                    Selecionar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Modal T08 — Registrar sessão do paciente selecionado */}
      {pacienteSelecionado && (
        <SessaoModal
          aberto={modalSessaoAberto}
          pacienteId={pacienteSelecionado.id}
          pacienteNome={pacienteSelecionado.nome}
          dataInicialIso={dataSessaoSelecionadaIso}
          aoFechar={() => {
            setModalSessaoAberto(false);
            setPacienteSelecionado(null);
            setDataSessaoSelecionadaIso(undefined);
          }}
          aoSalva={() => {
            setModalSessaoAberto(false);
            setPacienteSelecionado(null);
            setDataSessaoSelecionadaIso(undefined);
            setToastSucesso("Sessão registrada com sucesso.");
          }}
        />
      )}

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
