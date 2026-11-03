import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Modal, SessaoModal, Toast } from "../components";
import {
  boasVindasObter,
  EVENTO_SESSAO_DESBLOQUEADA,
  pacientesListar,
} from "../lib/api";
import {
  extrairDigitos,
  formatarDataBr,
  formatarIdadeComNascimento,
  formatarTelefoneBr,
  MENSAGENS_BOAS_VINDAS,
  obterDataHojeIso,
  obterSaudacaoHorario,
  sortearIndiceBoasVindas,
} from "../lib/format";
import type { PacienteResumo } from "../lib/types";

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
  const [mostrarProximos7Dias, setMostrarProximos7Dias] =
    useState<boolean>(false);
  const [rascunhoRapido, setRascunhoRapido] = useState<string>("");

  // Fluxo F4-T4: Atalho "Registrar sessão" -> busca rápida de paciente -> Modal T08
  const [modalBuscaAberta, setModalBuscaAberta] = useState<boolean>(false);
  const [buscaRapida, setBuscaRapida] = useState<string>("");
  const [pacienteSelecionado, setPacienteSelecionado] =
    useState<PacienteResumo | null>(null);
  const [modalSessaoAberto, setModalSessaoAberto] = useState<boolean>(false);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);
  const [mensagemBoasVindas, setMensagemBoasVindas] = useState<string>(() =>
    sortearMensagemBoasVindasLocal(),
  );

  const saudacaoHorario = obterSaudacaoHorario();
  const dataHojeBr = formatarDataBr(obterDataHojeIso());
  const totalAtivos = pacientesAtivos.length;

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

  useEffect(() => {
    let cancelado = false;
    carregarBoasVindas(false);
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
  }, [carregarBoasVindas]);

  useEffect(() => {
    const aoDesbloquear = () => {
      carregarBoasVindas(true);
    };
    window.addEventListener(EVENTO_SESSAO_DESBLOQUEADA, aoDesbloquear);
    return () => {
      window.removeEventListener(EVENTO_SESSAO_DESBLOQUEADA, aoDesbloquear);
    };
  }, [carregarBoasVindas]);

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

  function selecionarPacienteParaSessao(paciente: PacienteResumo) {
    setPacienteSelecionado(paciente);
    setModalBuscaAberta(false);
    setModalSessaoAberto(true);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-fundo-claro border border-rosa-claro rounded-2xl p-6 shadow-xs">
        <div className="space-y-1">
          <p
            data-testid="saudacao-horario"
            className="text-base font-semibold text-lilas-acinzentado"
          >
            {saudacaoHorario}, Louriedna!
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-label="Aniversariantes"
          data-testid="secao-aniversariantes"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-malva">
              Aniversariantes do dia
            </h3>
            <p className="text-base text-texto">
              Nenhum aniversariante registrado para hoje ({dataHojeBr}).
            </p>
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
                Nenhum aniversário nos próximos 7 dias.
              </div>
            )}
          </div>
        </section>

        <section
          aria-label="Cópia de segurança (Backup)"
          data-testid="secao-backup"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xs"
        >
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-malva">
              Cópia de segurança (Backup)
            </h3>
            <p
              data-testid="status-ultimo-backup"
              className="text-base text-texto"
            >
              Último backup: <strong>Ainda não realizado</strong>
            </p>
            <p className="text-base text-lilas-acinzentado">
              Guarde uma cópia criptografada dos seus pacientes e documentos em
              um pendrive ou pasta segura.
            </p>
          </div>

          <div>
            <Button
              variante="primario"
              onClick={() => navigate("/configuracoes")}
            >
              Fazer backup agora
            </Button>
          </div>
        </section>
      </div>

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
          aoFechar={() => {
            setModalSessaoAberto(false);
            setPacienteSelecionado(null);
          }}
          aoSalva={() => {
            setModalSessaoAberto(false);
            setPacienteSelecionado(null);
            setToastSucesso("Sessão registrada com sucesso.");
          }}
        />
      )}

      <Toast
        mensagem={toastSucesso}
        tipo="sucesso"
        aoFechar={() => setToastSucesso(null)}
      />
    </div>
  );
}
