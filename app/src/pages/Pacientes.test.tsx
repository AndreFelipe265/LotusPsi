import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PacienteResumo } from "../lib/types";
import { Pacientes } from "./Pacientes";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const LISTA_MOCK: PacienteResumo[] = [
  {
    id: "p-joao",
    nome: "João da Conceição",
    data_nascimento: "1990-05-15",
    telefone: "71998765432",
    whatsapp: null,
    status: "ativo",
    ultima_sessao: "2026-10-20",
  },
  {
    id: "p-ana",
    nome: "Ana Beatriz",
    data_nascimento: "2014-08-10",
    telefone: "71988887777",
    whatsapp: null,
    status: "ativo",
    ultima_sessao: null,
  },
  {
    id: "p-inativo",
    nome: "Carlos Eduardo",
    data_nascimento: "1985-01-20",
    telefone: "71977776666",
    whatsapp: null,
    status: "inativo",
    ultima_sessao: "2025-12-01",
  },
];

describe("Tela T05 — Lista de Pacientes (F3-T2)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "pacientes_listar") {
        return Promise.resolve(LISTA_MOCK);
      }
      return Promise.resolve(null);
    });
  });

  it("exibe colunas definidas, ordenação alfabética e apenas ativos por padrão (RN11, RN12, RN15, RN16)", async () => {
    render(
      <MemoryRouter
        initialEntries={["/pacientes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Pacientes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Ana Beatriz")).toBeInTheDocument();
    });

    // Verifica cabeçalhos das colunas de T05
    expect(
      screen.getByRole("columnheader", { name: "Nome" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Idade" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Telefone" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Última sessão" }),
    ).toBeInTheDocument();

    // Apenas ativos aparecem por padrão (Carlos Eduardo está inativo)
    expect(screen.getByText("João da Conceição")).toBeInTheDocument();
    expect(screen.queryByText("Carlos Eduardo")).not.toBeInTheDocument();

    // Ordem alfabética: Ana Beatriz vem antes de João da Conceição
    const linhas = screen.getAllByRole("row");
    expect(linhas[1]).toHaveTextContent("Ana Beatriz");
    expect(linhas[2]).toHaveTextContent("João da Conceição");

    // Idade + data de nascimento formatada (RN11, RN12), telefone e última sessão
    expect(screen.getByText(/15\/05\/1990/)).toBeInTheDocument();
    expect(screen.getByText("(71) 99876-5432")).toBeInTheDocument();
    expect(screen.getByText("20/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Sem sessões")).toBeInTheDocument();
  });

  it("permite busca instantânea por nome sem acento ('joao' -> 'João') e por telefone (RN17)", async () => {
    render(
      <MemoryRouter
        initialEntries={["/pacientes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Pacientes />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("João da Conceição")).toBeInTheDocument();
    });

    const inputBusca = screen.getByLabelText(/Buscar por nome ou telefone/i);

    // Busca sem acento e minúsculo
    fireEvent.change(inputBusca, { target: { value: "joao" } });

    await waitFor(() => {
      expect(screen.getByText("João da Conceição")).toBeInTheDocument();
      expect(screen.queryByText("Ana Beatriz")).not.toBeInTheDocument();
    });

    // Busca por telefone com máscara
    fireEvent.change(inputBusca, { target: { value: "(71) 98888" } });

    await waitFor(() => {
      expect(screen.getByText("Ana Beatriz")).toBeInTheDocument();
      expect(screen.queryByText("João da Conceição")).not.toBeInTheDocument();
    });
  });

  it("filtra por status: Ativos, Inativos e Todos e navega para perfil ou novo paciente (RN15)", async () => {
    render(
      <MemoryRouter
        initialEntries={["/pacientes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/pacientes" element={<Pacientes />} />
          <Route
            path="/pacientes/novo"
            element={<div>Tela Novo Paciente</div>}
          />
          <Route
            path="/pacientes/:id"
            element={<div>Tela Perfil Paciente</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Ana Beatriz")).toBeInTheDocument();
    });

    // Filtrar Inativos
    fireEvent.click(screen.getByRole("button", { name: "Inativos" }));
    await waitFor(() => {
      expect(screen.getByText("Carlos Eduardo")).toBeInTheDocument();
      expect(screen.queryByText("Ana Beatriz")).not.toBeInTheDocument();
    });

    // Filtrar Todos
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    await waitFor(() => {
      expect(screen.getByText("Ana Beatriz")).toBeInTheDocument();
      expect(screen.getByText("João da Conceição")).toBeInTheDocument();
      expect(screen.getByText("Carlos Eduardo")).toBeInTheDocument();
    });

    // Clicar na linha abre o perfil
    fireEvent.click(screen.getByTestId("linha-paciente-p-joao"));
    expect(screen.getByText("Tela Perfil Paciente")).toBeInTheDocument();
  });
});
