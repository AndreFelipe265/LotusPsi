import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PacienteForm } from "./PacienteForm";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("Tela T06 — Formulário de Paciente (F3-T3)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("exibe os 5 grupos, valida que só o nome é obrigatório (RN10) e cria paciente apenas com o nome", async () => {
    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "paciente_criar") {
        const payload = args as { dados: { nome: string } };
        return Promise.resolve({
          id: "novo-id-123",
          nome: payload.dados.nome,
          status: "ativo",
          criado_em: "2026-11-02T10:00:00Z",
          atualizado_em: "2026-11-02T10:00:00Z",
          total_sessoes: 0,
        });
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        initialEntries={["/pacientes/novo"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/pacientes/novo" element={<PacienteForm />} />
          <Route
            path="/pacientes/:id"
            element={<div>Perfil Criado Com Sucesso</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    // Verifica os 5 grupos definidos em T06
    expect(
      screen.getByRole("heading", { name: "Dados pessoais" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contato" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Família/Responsável" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Atendimento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Observações" }),
    ).toBeInTheDocument();

    // Tentar salvar sem nome mostra mensagem amigável
    fireEvent.click(screen.getByRole("button", { name: /Salvar paciente/i }));
    expect(
      screen.getByText(/O nome completo do paciente é obrigatório/i),
    ).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();

    // Preencher apenas o nome deve permitir salvar (RN10)
    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: "Maria Clara" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar paciente/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("paciente_criar", {
        dados: expect.objectContaining({
          nome: "Maria Clara",
          data_nascimento: null,
          telefone: null,
        }),
      });
      expect(screen.getByText("Perfil Criado Com Sucesso")).toBeInTheDocument();
    });
  });

  it("aplica máscara de data e telefone, calcula idade (RN12) e destaca responsável para menores de 18 anos (RN13)", async () => {
    render(
      <MemoryRouter
        initialEntries={["/pacientes/novo"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <PacienteForm />
      </MemoryRouter>,
    );

    const campoData = screen.getByLabelText(/Data de nascimento/i);
    const campoTelefone = screen.getByLabelText(/^Telefone$/i);

    // Sem data de nascimento, aviso de menor de idade não aparece
    expect(screen.queryByTestId("aviso-menor-idade")).not.toBeInTheDocument();

    // Digitar data de menor de 18 anos sem barras -> aplica máscara dd/mm/aaaa
    fireEvent.change(campoData, { target: { value: "10082016" } });
    expect(campoData).toHaveValue("10/08/2016");

    // Aviso e destaque de menor de 18 anos aparecem (RN13)
    expect(screen.getByTestId("aviso-menor-idade")).toBeInTheDocument();
    const campoResponsavel = screen.getByLabelText(
      /Responsável legal \(nome\)/i,
    );
    expect(campoResponsavel).not.toBeRequired();

    // Digitar data de maior de 18 anos -> remove destaque
    fireEvent.change(campoData, { target: { value: "15051990" } });
    expect(campoData).toHaveValue("15/05/1990");
    expect(screen.queryByTestId("aviso-menor-idade")).not.toBeInTheDocument();

    // Digitar telefone aplica máscara (DD) 9XXXX-XXXX
    fireEvent.change(campoTelefone, { target: { value: "71998765432" } });
    expect(campoTelefone).toHaveValue("(71) 99876-5432");
  });

  it("carrega dados existentes no modo edição e envia paciente_atualizar", async () => {
    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "paciente_obter") {
        return Promise.resolve({
          id: "p-1",
          nome: "João da Conceição",
          data_nascimento: "1990-05-15",
          telefone: "71998765432",
          whatsapp: null,
          email: "joao@exemplo.com",
          endereco: null,
          nome_mae: null,
          nome_pai: null,
          responsavel_nome: null,
          responsavel_parentesco: null,
          responsavel_telefone: null,
          contato_emergencia_nome: null,
          contato_emergencia_telefone: null,
          documento: "123.456.789-00",
          ocupacao: "Professor",
          motivo_procura: null,
          modalidade: "particular",
          convenio_nome: null,
          valor_sessao_centavos: 18000,
          observacoes: "Observação inicial",
          status: "ativo",
          inativado_em: null,
          criado_em: "2026-10-01T10:00:00Z",
          atualizado_em: "2026-10-01T10:00:00Z",
          total_sessoes: 2,
          ultima_sessao: "2026-10-20",
        });
      }
      if (cmd === "paciente_atualizar") {
        const payload = args as { id: string; dados: { nome: string } };
        return Promise.resolve({
          id: payload.id,
          nome: payload.dados.nome,
          status: "ativo",
          criado_em: "2026-10-01T10:00:00Z",
          atualizado_em: "2026-11-02T10:00:00Z",
          total_sessoes: 2,
        });
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        initialEntries={["/pacientes/p-1/editar"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/pacientes/:id/editar" element={<PacienteForm />} />
          <Route path="/pacientes/:id" element={<div>Perfil Atualizado</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Nome completo/i)).toHaveValue(
        "João da Conceição",
      );
    });

    expect(screen.getByLabelText(/Data de nascimento/i)).toHaveValue(
      "15/05/1990",
    );
    expect(screen.getByLabelText(/^Telefone$/i)).toHaveValue("(71) 99876-5432");
    expect(screen.getByLabelText(/Valor da sessão/i)).toHaveValue("180,00");

    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: "João Pedro da Conceição" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar paciente/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("paciente_atualizar", {
        id: "p-1",
        dados: expect.objectContaining({
          nome: "João Pedro da Conceição",
          data_nascimento: "1990-05-15",
          telefone: "71998765432",
          valor_sessao_centavos: 18000,
        }),
      });
      expect(screen.getByText("Perfil Atualizado")).toBeInTheDocument();
    });
  });
});
