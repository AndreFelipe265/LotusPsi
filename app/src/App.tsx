import { useCallback, useEffect, useState } from "react";
import logoLc from "./assets/logo-lc.svg";
import { authLock, authStatus } from "./lib/api";
import {
  TEMPO_INATIVIDADE_PADRAO_MS,
  useDetectorInatividade,
} from "./lib/idle";
import { Login } from "./pages/Login";
import { PrimeiroAcesso } from "./pages/PrimeiroAcesso";
import { Recuperar } from "./pages/Recuperar";

export interface AppProps {
  tempoInatividadeMs?: number;
}

export function App({
  tempoInatividadeMs = TEMPO_INATIVIDADE_PADRAO_MS,
}: AppProps) {
  const [configurado, setConfigurado] = useState<boolean>(true);
  const [desbloqueado, setDesbloqueado] = useState<boolean>(false);
  const [sessaoIniciada, setSessaoIniciada] = useState<boolean>(false);
  const [exibindoRecuperar, setExibindoRecuperar] = useState<boolean>(false);
  const [bloqueadoMinutos, setBloqueadoMinutos] = useState<number | null>(null);
  const [rascunhoRapido, setRascunhoRapido] = useState<string>("");

  useEffect(() => {
    let cancelado = false;
    authStatus()
      .then((status) => {
        if (cancelado) return;
        setConfigurado(status.configurado);
        setDesbloqueado(status.desbloqueado);
        if (status.desbloqueado) {
          setSessaoIniciada(true);
        }
        if (status.bloqueado_segundos_restantes) {
          setBloqueadoMinutos(
            Math.max(1, Math.ceil(status.bloqueado_segundos_restantes / 60)),
          );
        } else {
          setBloqueadoMinutos(null);
        }
      })
      .catch(() => {
        // Ambiente de teste sem backend Tauri ativo mantém tela inicial de login
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const bloquearSessao = useCallback(async () => {
    setDesbloqueado(false);
    try {
      await authLock();
    } catch {
      // Estado local permanece bloqueado mesmo se falhar comunicação IPC
    }
  }, []);

  useDetectorInatividade({
    ativo: desbloqueado,
    aoInativar: () => {
      void bloquearSessao();
    },
    tempoMs: tempoInatividadeMs,
  });

  if (!configurado) {
    return (
      <PrimeiroAcesso
        aoConcluir={() => {
          setConfigurado(true);
          setDesbloqueado(true);
          setSessaoIniciada(true);
        }}
      />
    );
  }

  if (exibindoRecuperar) {
    return (
      <Recuperar
        aoRecuperarComSucesso={() => {
          setExibindoRecuperar(false);
          setDesbloqueado(true);
          setSessaoIniciada(true);
        }}
        aoVoltarParaLogin={() => {
          setExibindoRecuperar(false);
        }}
      />
    );
  }

  if (!desbloqueado && !sessaoIniciada) {
    return (
      <Login
        aoEntrar={() => {
          setDesbloqueado(true);
          setSessaoIniciada(true);
        }}
        aoIrParaRecuperar={() => {
          setExibindoRecuperar(true);
        }}
        bloqueadoMinutosIniciais={bloqueadoMinutos}
      />
    );
  }

  return (
    <div className="min-h-screen bg-fundo text-texto flex flex-col">
      <header className="bg-fundo-claro border-b border-rosa-claro px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src={logoLc}
            alt="Logo LC — Louriedna Costa Pereira"
            className="w-12 h-auto select-none"
          />
          <div>
            <h1 className="text-xl font-bold text-malva">LC Pacientes</h1>
            <p className="text-base text-lilas-acinzentado">
              Louriedna Costa Pereira — Psicóloga · CRP 03/29434
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void bloquearSessao()}
          className="px-5 py-2.5 rounded-xl bg-malva text-white font-semibold text-base hover:opacity-95 transition"
        >
          Sair
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-lg w-full bg-fundo-claro border border-rosa-claro rounded-2xl shadow-sm p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-malva">Painel Inicial</h2>
            <p className="text-base text-texto">
              Sessão ativa e protegida por criptografia local.
            </p>
          </div>

          <div>
            <label
              htmlFor="rascunho-anotacao"
              className="block text-base font-semibold text-texto mb-1"
            >
              Anotação em andamento
            </label>
            <textarea
              id="rascunho-anotacao"
              rows={3}
              value={rascunhoRapido}
              onChange={(e) => setRascunhoRapido(e.target.value)}
              placeholder="Digite uma anotação..."
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>

          <section
            aria-label="Paleta da identidade visual"
            className="grid grid-cols-3 gap-3 pt-2 text-center"
          >
            <div className="rounded-lg p-3 bg-malva text-white text-base font-semibold">
              Malva
            </div>
            <div className="rounded-lg p-3 bg-rosa text-texto text-base font-semibold">
              Rosa
            </div>
            <div className="rounded-lg p-3 bg-rosa-claro text-texto text-base font-semibold">
              Rosa Claro
            </div>
          </section>
        </div>
      </main>

      {!desbloqueado && (
        <Login
          modoOverlay
          aoEntrar={() => {
            setDesbloqueado(true);
          }}
          aoIrParaRecuperar={() => {
            setExibindoRecuperar(true);
          }}
          bloqueadoMinutosIniciais={bloqueadoMinutos}
        />
      )}
    </div>
  );
}

export default App;
