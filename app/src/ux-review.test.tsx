import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./components";
import { Layout } from "./components/Layout";
import { Inicio } from "./pages/Inicio";

describe("Revisão de UX e Acessibilidade (F8-T2 — Seção 4 da Fonte da Verdade)", () => {
  it("garante tipografia legível >= 16px (sem classes text-xs ou text-sm) na estrutura de layout e navegação", () => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Layout aoSair={vi.fn()}>
          <div>Conteúdo principal de teste</div>
        </Layout>
      </MemoryRouter>,
    );

    const todosElementos = container.querySelectorAll("*");
    for (const el of todosElementos) {
      const classes = el.getAttribute("class") || "";
      expect(classes).not.toMatch(/\btext-xs\b/);
      expect(classes).not.toMatch(/\btext-sm\b/);
    }
  });

  it("garante que todo diálogo destrutivo apresenta confirmação explícita com detalhes e rótulo claro", () => {
    const aoConfirmar = vi.fn();
    const aoCancelar = vi.fn();

    render(
      <ConfirmDialog
        aberto={true}
        titulo="Excluir paciente"
        mensagem="Tem certeza de que deseja excluir permanentemente o cadastro de Maria Silva?"
        detalheDestaque="Esta ação apagará também o histórico de sessões."
        rotuloConfirmar="Sim, excluir paciente"
        rotuloCancelar="Cancelar"
        destrutivo={true}
        aoConfirmar={aoConfirmar}
        aoCancelar={aoCancelar}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Excluir paciente")).toBeInTheDocument();
    expect(
      screen.getByText(/Tem certeza de que deseja excluir permanentemente/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Esta ação apagará também o histórico de sessões/i),
    ).toBeInTheDocument();

    const botaoConfirmar = screen.getByRole("button", {
      name: "Sim, excluir paciente",
    });
    expect(botaoConfirmar).toHaveClass("bg-[#8B3A52]");
  });

  it("garante navegação em até 2 cliques a partir do painel inicial para todas as áreas", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Inicio />
      </MemoryRouter>,
    );

    // Atalhos de 1 clique no painel inicial
    expect(
      screen.getByRole("button", { name: /Novo paciente/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Registrar sessão/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Buscar paciente/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Documentos/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Fazer backup agora/i }),
    ).toBeInTheDocument();
  });
});
