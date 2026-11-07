import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./lib/api";

describe("Rotas com guarda de sessão (F2-T2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("redireciona qualquer rota protegida para o Login quando bloqueado", async () => {
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: false,
    });

    render(<App rotaInicial="/pacientes" />);

    expect(
      await screen.findByLabelText(/Senha de acesso/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^Pacientes$/i }),
    ).not.toBeInTheDocument();
  });

  it("permite navegar em 1 clique entre Início, Pacientes, Documentos e Configurações quando desbloqueado", async () => {
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: true,
    });

    render(<App rotaInicial="/" />);

    // Começa no Painel Inicial
    expect(
      await screen.findByRole("heading", { name: /Painel Inicial/i }),
    ).toBeInTheDocument();

    // 1 clique para Pacientes
    fireEvent.click(screen.getByRole("link", { name: /^Pacientes$/i }));
    expect(
      await screen.findByRole("heading", { name: /^Pacientes$/i }),
    ).toBeInTheDocument();

    // Mais 1 clique (total 2 cliques desde o início) para Novo paciente
    fireEvent.click(
      screen.getAllByRole("button", { name: /Novo paciente/i })[0],
    );
    expect(
      await screen.findByRole("heading", { name: /Cadastro de Paciente/i }),
    ).toBeInTheDocument();

    // 1 clique para Documentos
    fireEvent.click(screen.getByRole("link", { name: /^Documentos$/i }));
    expect(
      await screen.findByRole("heading", { name: /^Documentos$/i }),
    ).toBeInTheDocument();

    // 1 clique para Agenda (RN70)
    fireEvent.click(screen.getByRole("link", { name: /^Agenda$/i }));
    expect(
      await screen.findByRole("heading", { name: /^Agenda$/i }),
    ).toBeInTheDocument();

    // 1 clique para Financeiro (RN80)
    fireEvent.click(screen.getByRole("link", { name: /^Financeiro$/i }));
    expect(
      await screen.findByRole("heading", { name: /^Financeiro$/i }),
    ).toBeInTheDocument();

    // 1 clique para Configurações
    fireEvent.click(screen.getByRole("link", { name: /^Configurações$/i }));
    expect(
      await screen.findByRole("heading", { name: /^Configurações$/i }),
    ).toBeInTheDocument();

    // 1 clique de volta para Início
    fireEvent.click(screen.getByRole("link", { name: /^Início$/i }));
    expect(
      await screen.findByRole("heading", { name: /Painel Inicial/i }),
    ).toBeInTheDocument();
  });

  it("aciona o bloqueio de sessão quando um comando retorna Erro::Bloqueado", async () => {
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: true,
    });

    render(<App rotaInicial="/pacientes/novo" />);

    const inputNome = await screen.findByLabelText(/Nome completo/i);
    fireEvent.change(inputNome, { target: { value: "Paciente em Edição" } });

    // Simula um comando de dados retornando BLOQUEADO
    act(() => {
      window.dispatchEvent(new CustomEvent(api.EVENTO_SESSAO_BLOQUEADA));
    });

    expect(
      await screen.findByRole("dialog", { name: /Sessão bloqueada/i }),
    ).toBeInTheDocument();

    // O formulário na rota /pacientes/novo permanece montado com o rascunho preservado (RN05)
    expect(screen.getByLabelText(/Nome completo/i)).toHaveValue(
      "Paciente em Edição",
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Senha de acesso/i)).toBeInTheDocument();
    });
  });
});
