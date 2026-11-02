import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Layout,
  Modal,
  Toast,
} from "./components";

describe("Componentes base (F2-T1)", () => {
  it("renderiza Layout e Sidebar com Início, Pacientes, Documentos, Configurações e Sair", () => {
    const aoSair = vi.fn();

    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Layout aoSair={aoSair}>
          <div>Conteúdo principal de teste</div>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /^Início$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Pacientes$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Documentos$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Configurações$/i }),
    ).toBeInTheDocument();

    const botaoSair = screen.getByRole("button", { name: /^Sair$/i });
    expect(botaoSair).toBeInTheDocument();
    fireEvent.click(botaoSair);
    expect(aoSair).toHaveBeenCalledTimes(1);

    expect(
      screen.getByText(/Conteúdo principal de teste/i),
    ).toBeInTheDocument();
  });

  it("renderiza Button e Input com texto >= 16px (text-base), ajuda e erro", () => {
    const aoClicar = vi.fn();
    render(
      <div>
        <Button onClick={aoClicar}>Salvar</Button>
        <Input
          rotulo="Nome completo"
          required
          ajuda="Informe o nome completo"
          placeholder="Ex.: Maria"
        />
        <Input rotulo="Telefone" erro="Telefone inválido" />
      </div>,
    );

    const botao = screen.getByRole("button", { name: /Salvar/i });
    expect(botao.className).toContain("text-base");
    fireEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(1);

    const inputNome = screen.getByLabelText(/Nome completo/i);
    expect(inputNome.className).toContain("text-base");
    expect(screen.getByText(/Informe o nome completo/i)).toBeInTheDocument();

    const inputTelefone = screen.getByLabelText(/Telefone/i);
    expect(inputTelefone).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Telefone inválido");
  });

  it("renderiza Modal e fecha ao clicar em Fechar ou pressionar Escape", () => {
    const aoFechar = vi.fn();
    render(
      <Modal aberto={true} titulo="Nova sessão" aoFechar={aoFechar}>
        <p>Corpo do modal</p>
      </Modal>,
    );

    expect(
      screen.getByRole("dialog", { name: /Nova sessão/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Corpo do modal/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: /Fechar Nova sessão/i }),
    );
    expect(aoFechar).toHaveBeenCalledTimes(2);
  });

  it("renderiza ConfirmDialog mostrando claramente o item que será apagado", () => {
    const aoConfirmar = vi.fn();
    const aoCancelar = vi.fn();

    render(
      <ConfirmDialog
        aberto={true}
        titulo="Excluir sessão"
        mensagem="Tem certeza que deseja excluir esta sessão?"
        detalheDestaque="Sessão de 02/11/2026 — Paciente Maria"
        rotuloConfirmar="Sim, excluir"
        aoConfirmar={aoConfirmar}
        aoCancelar={aoCancelar}
      />,
    );

    expect(screen.getByTestId("confirm-dialog-destaque")).toHaveTextContent(
      "Sessão de 02/11/2026 — Paciente Maria",
    );

    fireEvent.click(screen.getByRole("button", { name: /Sim, excluir/i }));
    expect(aoConfirmar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(aoCancelar).toHaveBeenCalledTimes(1);
  });

  it("renderiza Toast e EmptyState com ação", () => {
    const aoFecharToast = vi.fn();
    const aoClicarAcao = vi.fn();

    render(
      <div>
        <Toast
          mensagem="Paciente salvo com sucesso."
          tipo="sucesso"
          aoFechar={aoFecharToast}
        />
        <EmptyState
          titulo="Nenhum paciente cadastrado"
          descricao="Comece adicionando seu primeiro paciente."
          rotuloAcao="Novo paciente"
          aoClicarAcao={aoClicarAcao}
        />
      </div>,
    );

    expect(screen.getByTestId("toast-mensagem")).toHaveTextContent(
      "Paciente salvo com sucesso.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Fechar$/i }));
    expect(aoFecharToast).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "Nenhum paciente cadastrado",
    );
    fireEvent.click(screen.getByRole("button", { name: /Novo paciente/i }));
    expect(aoClicarAcao).toHaveBeenCalledTimes(1);
  });
});
