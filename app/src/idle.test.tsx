import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./lib/api";
import {
  iniciarMonitorInatividade,
  TEMPO_INATIVIDADE_PADRAO_MS,
} from "./lib/idle";

describe("Inatividade de 30 min e botão Sair (F1-T6 — RN05 e RN06)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("iniciarMonitorInatividade dispara após 30 min sem eventos e reinicia ao mover mouse/teclado", () => {
    vi.useFakeTimers();
    const aoInativar = vi.fn();

    const limpar = iniciarMonitorInatividade(
      aoInativar,
      TEMPO_INATIVIDADE_PADRAO_MS,
    );

    // Avança 20 minutos e simula uma tecla pressionada
    act(() => {
      vi.advanceTimersByTime(20 * 60 * 1000);
      window.dispatchEvent(new Event("keydown"));
    });
    expect(aoInativar).not.toHaveBeenCalled();

    // Avança mais 20 minutos (total 40m, mas só 20m desde a última interação)
    act(() => {
      vi.advanceTimersByTime(20 * 60 * 1000);
    });
    expect(aoInativar).not.toHaveBeenCalled();

    // Avança os 10 minutos restantes para completar 30 min sem interação
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(aoInativar).toHaveBeenCalledTimes(1);

    limpar();
  });

  it("bloqueia após inatividade sem perder o texto digitado em formulários abertos e botão Sair bloqueia a sessão", async () => {
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: true,
    });
    const lockSpy = vi.spyOn(api, "authLock").mockResolvedValue(undefined);
    const loginSpy = vi.spyOn(api, "authLogin").mockResolvedValue(undefined);

    render(<App tempoInatividadeMs={80} />);

    // Aguarda entrar no estado desbloqueado e verifica o botão Sair sempre visível (RN06)
    const botaoSair = await screen.findByRole("button", { name: /^Sair$/i });
    expect(botaoSair).toBeInTheDocument();

    // Digita um rascunho no formulário aberto
    const campoRascunho = screen.getByLabelText(/Anotação em andamento/i);
    fireEvent.change(campoRascunho, {
      target: { value: "Rascunho importante da sessão em andamento" },
    });
    expect(campoRascunho).toHaveValue(
      "Rascunho importante da sessão em andamento",
    );

    // Aguarda o timeout de inatividade disparar
    await waitFor(
      () => {
        expect(
          screen.getByRole("dialog", { name: /Sessão bloqueada/i }),
        ).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    expect(lockSpy).toHaveBeenCalled();

    // O rascunho permanece montado no DOM sem perder o valor (RN05)
    expect(screen.getByLabelText(/Anotação em andamento/i)).toHaveValue(
      "Rascunho importante da sessão em andamento",
    );

    // Desbloqueia digitando a senha no overlay
    fireEvent.change(screen.getByLabelText(/Senha de acesso/i), {
      target: { value: "SenhaCorreta123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Sessão bloqueada/i }),
      ).not.toBeInTheDocument();
    });
    expect(loginSpy).toHaveBeenCalledWith("SenhaCorreta123");

    // O texto digitado antes do bloqueio continua intacto!
    expect(screen.getByLabelText(/Anotação em andamento/i)).toHaveValue(
      "Rascunho importante da sessão em andamento",
    );

    // Clicar no botão "Sair" bloqueia imediatamente (RN06)
    fireEvent.click(screen.getByRole("button", { name: /^Sair$/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /Sessão bloqueada/i }),
      ).toBeInTheDocument();
    });
  });
});
