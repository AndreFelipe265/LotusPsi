import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import type { LancamentoFinanceiro, PacienteResumo } from "../lib/types";
import { Financeiro } from "./Financeiro";

const PACIENTES_MOCK: PacienteResumo[] = [
  {
    id: "p-joao",
    nome: "João da Conceição",
    data_nascimento: "1990-05-15",
    telefone: "71999998888",
    whatsapp: "71999998888",
    status: "ativo",
    ultima_sessao: "2026-11-01",
  },
  {
    id: "p-ana",
    nome: "Ana Beatriz",
    data_nascimento: "1995-08-20",
    telefone: "71988887777",
    whatsapp: "71988887777",
    status: "ativo",
    ultima_sessao: null,
  },
];

const LANCAMENTOS_INICIAIS: LancamentoFinanceiro[] = [
  {
    id: "l-1",
    paciente_id: "p-joao",
    paciente_nome: "João da Conceição",
    tipo: "entrada",
    data: "2026-11-05",
    valor_centavos: 18000,
    descricao: "Sessão de psicoterapia",
    forma_pagamento: "pix",
    criado_em: "2026-11-05T14:00:00-03:00",
    atualizado_em: "2026-11-05T14:00:00-03:00",
  },
  {
    id: "l-2",
    paciente_id: null,
    paciente_nome: null,
    tipo: "gasto",
    data: "2026-11-03",
    valor_centavos: 12000,
    descricao: "Energia elétrica e internet",
    forma_pagamento: "pix",
    criado_em: "2026-11-03T10:00:00-03:00",
    atualizado_em: "2026-11-03T10:00:00-03:00",
  },
];

describe("Tela T12 — Financeiro (F9-T2 — RN80–RN86)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "pacientesListar").mockResolvedValue(PACIENTES_MOCK);
    vi.spyOn(api, "financeiroListar").mockResolvedValue([
      ...LANCAMENTOS_INICIAIS,
    ]);
    vi.spyOn(api, "financeiroResumoMensal").mockResolvedValue({
      ano_mes: "2026-11",
      total_entradas_centavos: 18000,
      total_gastos_centavos: 12000,
      saldo_centavos: 6000,
      quantidade_entradas: 1,
      quantidade_gastos: 1,
      quantidade_lancamentos: 2,
    });
  });

  it("exibe o resumo mensal consolidado (entradas, gastos e saldo) e filtra lançamentos por tipo e busca sem acento (RN83, RN84)", async () => {
    render(<Financeiro dataHojeIso="2026-11-06" />);

    expect(
      await screen.findByTestId("rotulo-mes-financeiro"),
    ).toHaveTextContent(/Novembro de 2026/i);

    expect(await screen.findByTestId("card-resumo-entradas")).toHaveTextContent(
      "R$ 180,00",
    );
    expect(screen.getByTestId("card-resumo-gastos")).toHaveTextContent(
      "R$ 120,00",
    );
    expect(screen.getByTestId("card-resumo-saldo")).toHaveTextContent(
      "R$ 60,00",
    );

    expect(screen.getByTestId("item-lancamento-l-1")).toHaveTextContent(
      "João da Conceição",
    );
    expect(screen.getByTestId("item-lancamento-l-2")).toHaveTextContent(
      "Energia elétrica e internet",
    );

    // Filtrar apenas Gastos
    fireEvent.click(screen.getByRole("button", { name: /^Gastos$/i }));
    expect(screen.queryByTestId("item-lancamento-l-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-lancamento-l-2")).toBeInTheDocument();

    // Voltar para Todos e buscar sem acento "joao"
    fireEvent.click(screen.getByRole("button", { name: /^Todos$/i }));
    fireEvent.change(
      screen.getByPlaceholderText(/Buscar por descrição ou paciente/i),
      { target: { value: "joao" } },
    );
    expect(screen.getByTestId("item-lancamento-l-1")).toBeInTheDocument();
    expect(screen.queryByTestId("item-lancamento-l-2")).not.toBeInTheDocument();
  });

  it("cria nova entrada vinculada ao paciente sugerindo o valor da sessão (RN81, RN82) e novo gasto sem paciente", async () => {
    vi.spyOn(api, "pacienteObter").mockResolvedValue({
      id: "p-joao",
      nome: "João da Conceição",
      status: "ativo",
      valor_sessao_centavos: 18000,
      criado_em: "2026-11-01T10:00:00Z",
      atualizado_em: "2026-11-01T10:00:00Z",
      total_sessoes: 2,
    });

    const spyCriar = vi.spyOn(api, "financeiroCriar").mockResolvedValue({
      id: "l-novo",
      paciente_id: "p-joao",
      paciente_nome: "João da Conceição",
      tipo: "entrada",
      data: "2026-11-06",
      valor_centavos: 18000,
      descricao: "Sessão de psicoterapia",
      forma_pagamento: "pix",
      criado_em: "2026-11-06T15:00:00-03:00",
      atualizado_em: "2026-11-06T15:00:00-03:00",
    });

    render(<Financeiro dataHojeIso="2026-11-06" />);
    await screen.findByTestId("item-lancamento-l-1");

    fireEvent.click(screen.getByRole("button", { name: /Nova entrada/i }));

    // Selecionar paciente João preenche sugestão de R$ 180,00 (RN82)
    fireEvent.change(screen.getByLabelText(/Paciente \(opcional\)/i), {
      target: { value: "p-joao" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Valor \(R\$\)/i)).toHaveValue("180,00");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Registrar lançamento/i }),
    );

    await waitFor(() => {
      expect(spyCriar).toHaveBeenCalledWith({
        paciente_id: "p-joao",
        tipo: "entrada",
        data: "2026-11-06",
        valor_centavos: 18000,
        descricao: "Sessão de psicoterapia",
        forma_pagamento: "pix",
      });
    });

    expect(
      await screen.findByText(/Lançamento registrado com sucesso/i),
    ).toBeInTheDocument();
  });

  it("permite editar e excluir lançamento com confirmação (RN85)", async () => {
    const spyAtualizar = vi
      .spyOn(api, "financeiroAtualizar")
      .mockResolvedValue({
        ...LANCAMENTOS_INICIAIS[0],
        valor_centavos: 20000,
        descricao: "Sessão reajustada",
      });
    const spyExcluir = vi
      .spyOn(api, "financeiroExcluir")
      .mockResolvedValue(undefined);

    render(<Financeiro dataHojeIso="2026-11-06" />);
    await screen.findByTestId("item-lancamento-l-1");

    // Editar l-1
    fireEvent.click(screen.getByTestId("editar-lancamento-l-1"));
    fireEvent.change(screen.getByLabelText(/Valor \(R\$\)/i), {
      target: { value: "200,00" },
    });
    fireEvent.change(screen.getByLabelText(/Descrição/i), {
      target: { value: "Sessão reajustada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/i }));

    await waitFor(() => {
      expect(spyAtualizar).toHaveBeenCalledWith(
        "l-1",
        expect.objectContaining({
          valor_centavos: 20000,
          descricao: "Sessão reajustada",
        }),
      );
    });

    // Excluir l-2 com confirmação
    fireEvent.click(screen.getByTestId("excluir-lancamento-l-2"));
    expect(screen.getByTestId("confirm-dialog-destaque")).toHaveTextContent(
      /Energia elétrica e internet/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sim, excluir/i }));

    await waitFor(() => {
      expect(spyExcluir).toHaveBeenCalledWith("l-2");
    });
  });
});
