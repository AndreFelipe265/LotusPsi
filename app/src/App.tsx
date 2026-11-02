import { useCallback, useEffect, useState } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { authLock, authStatus, EVENTO_SESSAO_BLOQUEADA } from "./lib/api";
import {
  TEMPO_INATIVIDADE_PADRAO_MS,
  useDetectorInatividade,
} from "./lib/idle";
import { Configuracoes } from "./pages/Configuracoes";
import { Documentos } from "./pages/Documentos";
import { Inicio } from "./pages/Inicio";
import { Login } from "./pages/Login";
import { PacienteForm } from "./pages/PacienteForm";
import { PacientePerfil } from "./pages/PacientePerfil";
import { Pacientes } from "./pages/Pacientes";
import { PrimeiroAcesso } from "./pages/PrimeiroAcesso";
import { Recuperar } from "./pages/Recuperar";

export interface AppProps {
  tempoInatividadeMs?: number;
  rotaInicial?: string;
}

export function App({
  tempoInatividadeMs = TEMPO_INATIVIDADE_PADRAO_MS,
  rotaInicial = "/",
}: AppProps) {
  const [configurado, setConfigurado] = useState<boolean>(true);
  const [desbloqueado, setDesbloqueado] = useState<boolean>(false);
  const [sessaoIniciada, setSessaoIniciada] = useState<boolean>(false);
  const [exibindoRecuperar, setExibindoRecuperar] = useState<boolean>(false);
  const [bloqueadoMinutos, setBloqueadoMinutos] = useState<number | null>(null);

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

  useEffect(() => {
    const aoReceberBloqueio = () => {
      setDesbloqueado(false);
    };
    window.addEventListener(EVENTO_SESSAO_BLOQUEADA, aoReceberBloqueio);
    return () => {
      window.removeEventListener(EVENTO_SESSAO_BLOQUEADA, aoReceberBloqueio);
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

  // Guarda de sessão: enquanto nenhuma sessão foi iniciada e o app está bloqueado, exibe o Login
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
    <MemoryRouter
      initialEntries={[rotaInicial]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <div className="relative min-h-screen">
        <Routes>
          <Route element={<Layout aoSair={() => void bloquearSessao()} />}>
            <Route path="/" element={<Inicio />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/novo" element={<PacienteForm />} />
            <Route path="/pacientes/:id" element={<PacientePerfil />} />
            <Route path="/pacientes/:id/editar" element={<PacienteForm />} />
            <Route path="/documentos" element={<Documentos />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>

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
    </MemoryRouter>
  );
}

export default App;
