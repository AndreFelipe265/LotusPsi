import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paciente, Sessao } from "../lib/types";
import { PacientePerfil } from "./PacientePerfil";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const PACIENTE_BASE: Paciente = {
  id: "p-joao",
  nome: "João da Conceição",
  data_nascimento: "1990-05-15",
  telefone: "71998765432",
  whatsapp: null,
  email: "joao@exemplo.com",
  endereco: "Rua das Flores, 100",
  nome_mae: "Maria da Conceição",
  nome_pai: null,
  responsavel_nome: null,
  responsavel_parentesco: null,
  responsavel_telefone: null,
  contato_emergencia_nome: "Ana",
  contato_emergencia_telefone: "71988887777",
  documento: "123.456.789-00",
  ocupacao: "Professor",
  motivo_procura: "Ansiedade",
  modalidade: "particular",
  convenio_nome: null,
  valor_sessao_centavos: 18000,
  observacoes: "Prefere atendimento pela manhã",
  status: "ativo",
  inativado_em: null,
  criado_em: "2026-10-01T10:00:00Z",
  atualizado_em: "2026-10-20T10:00:00Z",
  total_sessoes: 3,
  ultima_sessao: "2026-10-20",
};

describe("Tela T07 — Perfil do Paciente (F3-T4)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("exibe cabeçalho, dados cadastrais, total de sessões, última sessão, próximo agendamento e botão Nova sessão (RN19, RN27, RN77)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "paciente_obter") {
        return Promise.resolve(PACIENTE_BASE);
      }
      if (cmd === "agendamento_proximo_paciente") {
        return Promise.resolve({
          id: "ag-prox",
          paciente_id: "p-joao",
          paciente_nome: "João da Conceição",
          data: "2026-11-05",
          hora_inicio: "15:30",
          duracao_min: 50,
          observacao: null,
          criado_em: "2026-11-02T10:00:00Z",
          atualizado_em: "2026-11-02T10:00:00Z",
          conflito: false,
          conflito_descricao: null,
        });
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        initialEntries={["/pacientes/p-joao"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/pacientes/:id" element={<PacientePerfil />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "João da Conceição" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId("badge-status-paciente")).toHaveTextContent(
      "Ativo",
    );
    expect(screen.getAllByText("(71) 99876-5432").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 180,00")).toBeInTheDocument();
    expect(screen.getByText("Professor")).toBeInTheDocument();

    // Área reservada para sessões com total e data da última (RN27)
    const secaoSessoes = screen.getByTestId("secao-historico-sessoes");
    expect(secaoSessoes).toHaveTextContent("Total de sessões: 3");
    expect(secaoSessoes).toHaveTextContent("Última sessão: 20/10/2026");

    // Próximo agendamento do paciente no cabeçalho (RN77)
    expect(
      screen.getByTestId("proximo-agendamento-paciente"),
    ).toHaveTextContent("Próximo agendamento: 05/11/2026 às 15:30");

    // Mais opções começa recolhido (RN18)
    expect(screen.queryByTestId("secao-mais-opcoes")).not.toBeInTheDocument();
  });

  it("permite inativar com confirmação e reativar mantendo o histórico (RN14)", async () => {
    let estadoAtual: Paciente = { ...PACIENTE_BASE };

    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "paciente_obter") {
        return Promise.resolve(estadoAtual);
      }
      if (cmd === "paciente_definir_status") {
        const { status } = args as { id: string; status: "ativo" | "inativo" };
        estadoAtual = {
          ...estadoAtual,
          status,
          inativado_em: status === "inativo" ? "2026-11-02T15:00:00Z" : null,
        };
        return Promise.resolve(estadoAtual);
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        initialEntries={["/pacientes/p-joao"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/pacientes/:id" element={<PacientePerfil />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "João da Conceição" }),
      ).toBeInTheDocument();
    });

    // Abrir Mais opções
    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    expect(screen.getByTestId("secao-mais-opcoes")).toBeInTheDocument();

    // Clicar em Inativar paciente abre o ConfirmDialog
    fireEvent.click(screen.getByRole("button", { name: "Inativar paciente" }));
    expect(
      screen.getByRole("dialog", { name: "Inativar paciente" }),
    ).toBeInTheDocument();

    // Confirmar inativação
    fireEvent.click(
      screen.getByRole("button", { name: "Sim, inativar paciente" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("badge-status-paciente")).toHaveTextContent(
        "Inativo",
      );
      expect(
        screen.getByText(/Inativado em 02\/11\/2026/i),
      ).toBeInTheDocument();
    });

    // Abrir Mais opções novamente e Reativar
    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    fireEvent.click(screen.getByRole("button", { name: "Reativar paciente" }));

    await waitFor(() => {
      expect(screen.getByTestId("badge-status-paciente")).toHaveTextContent(
        "Ativo",
      );
    });
  });

  it("exige digitação do nome para excluir definitivamente e exibe aviso CFP 01/2009 (RN18)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "paciente_obter") {
        return Promise.resolve(PACIENTE_BASE);
      }
      if (cmd === "paciente_excluir") {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        initialEntries={["/pacientes/p-joao"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/pacientes/:id" element={<PacientePerfil />} />
          <Route path="/pacientes" element={<div>Voltou Para Lista</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "João da Conceição" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Mais opções" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir definitivamente" }),
    );

    // Verifica aviso de 5 anos da Resolução CFP 01/2009 e sugestão de inativar
    expect(screen.getByText(/Resolução CFP nº 01\/2009/i)).toBeInTheDocument();
    expect(screen.getByText(/5 anos/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Prefiro apenas inativar/i }),
    ).toBeInTheDocument();

    // Tentar confirmar com nome incorreto bloqueia a exclusão
    const inputConfirmacao = screen.getByLabelText(
      /Confirme o nome do paciente/i,
    );
    fireEvent.change(inputConfirmacao, { target: { value: "Outro Nome" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    expect(
      screen.getByText(
        /Digite o nome completo exatamente como consta no cadastro/i,
      ),
    ).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "paciente_excluir",
      expect.anything(),
    );

    // Digitar o nome correto confirma e redireciona para a lista
    fireEvent.change(inputConfirmacao, {
      target: { value: "João da Conceição" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("paciente_excluir", {
        id: "p-joao",
        confirmacaoNome: "João da Conceição",
        confirmacao_nome: "João da Conceição",
      });
      expect(screen.getByText("Voltou Para Lista")).toBeInTheDocument();
    });
  });

  it("registra 3 sessões, exibe em ordem decrescente, edita 1 exibindo '(editado)', exclui 1 com confirmação e atualiza total e última sessão (F4-T3 — RN24–RN27)", async () => {
    const sessoesBanco: Sessao[] = [];
    let contadorId = 1;

    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "paciente_obter") {
        return Promise.resolve({
          ...PACIENTE_BASE,
          total_sessoes: sessoesBanco.length,
          ultima_sessao: null,
        });
      }
      if (cmd === "sessoes_listar") {
        return Promise.resolve([...sessoesBanco]);
      }
      if (cmd === "sessao_criar") {
        const { dados } = args as {
          dados: { paciente_id: string; data: string; resumo: string };
        };
        const ts = `2026-11-02T15:00:0${contadorId}Z`;
        const nova: Sessao = {
          id: `s-${contadorId++}`,
          paciente_id: dados.paciente_id,
          data: dados.data,
          resumo: dados.resumo,
          criado_em: ts,
          atualizado_em: ts,
        };
        sessoesBanco.push(nova);
        return Promise.resolve(nova);
      }
      if (cmd === "sessao_atualizar") {
        const { id, dados } = args as {
          id: string;
          dados: { data: string; resumo: string };
        };
        const idx = sessoesBanco.findIndex((s) => s.id === id);
        const editada: Sessao = {
          ...sessoesBanco[idx],
          data: dados.data,
          resumo: dados.resumo,
          atualizado_em: "2026-11-02T16:30:00Z",
        };
        sessoesBanco[idx] = editada;
        return Promise.resolve(editada);
      }
      if (cmd === "sessao_excluir") {
        const { id } = args as { id: string };
        const idx = sessoesBanco.findIndex((s) => s.id === id);
        if (idx >= 0) sessoesBanco.splice(idx, 1);
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        initialEntries={["/pacientes/p-joao"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/pacientes/:id" element={<PacientePerfil />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "João da Conceição" }),
      ).toBeInTheDocument();
    });

    const secaoSessoes = screen.getByTestId("secao-historico-sessoes");
    expect(secaoSessoes).toHaveTextContent("Total de sessões: 0");
    expect(secaoSessoes).toHaveTextContent("Última sessão: Nenhuma");

    // 1. Registrar 1ª sessão (10/10/2026)
    fireEvent.click(screen.getAllByRole("button", { name: "Nova sessão" })[0]);
    fireEvent.change(screen.getByLabelText(/Data da sessão/i), {
      target: { value: "10102026" },
    });
    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Primeira sessão: acolhimento inicial." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(
        screen.getByText("Primeira sessão: acolhimento inicial."),
      ).toBeInTheDocument();
    });

    // 2. Registrar 2ª sessão (25/10/2026)
    fireEvent.click(screen.getAllByRole("button", { name: "Nova sessão" })[0]);
    fireEvent.change(screen.getByLabelText(/Data da sessão/i), {
      target: { value: "25102026" },
    });
    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Segunda sessão: evolução semanal." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(
        screen.getByText("Segunda sessão: evolução semanal."),
      ).toBeInTheDocument();
    });

    // 3. Registrar 3ª sessão (18/10/2026 — data intermediária para testar ordenação decrescente)
    fireEvent.click(screen.getAllByRole("button", { name: "Nova sessão" })[0]);
    fireEvent.change(screen.getByLabelText(/Data da sessão/i), {
      target: { value: "18102026" },
    });
    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Terceira sessão lançada retroativamente." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(
        screen.getByText("Terceira sessão lançada retroativamente."),
      ).toBeInTheDocument();
    });

    // Verifica total = 3, última = 25/10/2026 e ordem decrescente: 25/10 -> 18/10 -> 10/10 (RN24, RN27)
    expect(secaoSessoes).toHaveTextContent("Total de sessões: 3");
    expect(secaoSessoes).toHaveTextContent("Última sessão: 25/10/2026");

    const itens = screen
      .getByTestId("lista-historico-sessoes")
      .querySelectorAll("li");
    expect(itens.length).toBe(3);
    expect(itens[0]).toHaveTextContent("25/10/2026");
    expect(itens[1]).toHaveTextContent("18/10/2026");
    expect(itens[2]).toHaveTextContent("10/10/2026");

    // Nenhuma sessão tem selo "(editado)" ainda
    expect(screen.queryByText("(editado)")).not.toBeInTheDocument();

    // 4. Editar 1 sessão (a de 18/10/2026, id s-3) -> deve mostrar "(editado)" (RN25)
    fireEvent.click(
      screen.getByRole("button", { name: "Editar sessão de 18/10/2026" }),
    );
    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Sessão de 18/10 revisada e complementada." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(
        screen.getByText("Sessão de 18/10 revisada e complementada."),
      ).toBeInTheDocument();
      expect(screen.getByTestId("selo-editado-s-3")).toHaveTextContent(
        "(editado)",
      );
    });

    // 5. Excluir 1 sessão (a de 25/10/2026, id s-2) com diálogo de confirmação (RN26)
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir sessão de 25/10/2026" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Excluir sessão" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Sim, excluir sessão" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByText("Segunda sessão: evolução semanal."),
      ).not.toBeInTheDocument();
    });

    // Total atualizado para 2 e última sessão passa a ser 18/10/2026 (RN27)
    expect(secaoSessoes).toHaveTextContent("Total de sessões: 2");
    expect(secaoSessoes).toHaveTextContent("Última sessão: 18/10/2026");
  });
});
