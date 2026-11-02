import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessaoModal } from "./components";
import type { Sessao } from "./lib/types";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("Modal T08 — Sessão (F4-T2 — RN20, RN21, RN22, RN25)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("abre com data padrão = hoje, 5 linhas visíveis e contador 0/600 que respeita o limite rígido de 600 caracteres (RN20, RN21)", () => {
    render(
      <SessaoModal
        aberto={true}
        pacienteId="p-1"
        pacienteNome="João da Conceição"
        dataHojeIso="2026-11-02"
        aoFechar={vi.fn()}
        aoSalva={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Nova sessão" }),
    ).toBeInTheDocument();
    expect(screen.getByText("João da Conceição")).toBeInTheDocument();

    const inputData = screen.getByLabelText(/Data da sessão/i);
    expect(inputData).toHaveValue("02/11/2026");

    const textareaResumo = screen.getByLabelText(/Resumo da sessão/i);
    expect(textareaResumo).toHaveAttribute("rows", "5");
    expect(textareaResumo).toHaveAttribute("maxlength", "600");

    const contador = screen.getByTestId("contador-resumo-sessao");
    expect(contador).toHaveTextContent("0/600");

    // Digitar texto atualiza contador
    fireEvent.change(textareaResumo, {
      target: { value: "Paciente relatou melhora significativa." },
    });
    expect(contador).toHaveTextContent("39/600");

    // Tentar colar mais de 600 caracteres corta em 600 (limite rígido RN21)
    const texto650 = "a".repeat(650);
    fireEvent.change(textareaResumo, { target: { value: texto650 } });
    expect(contador).toHaveTextContent("600/600");
    expect((textareaResumo as HTMLTextAreaElement).value.length).toBe(600);
  });

  it("valida resumo obrigatório e bloqueia data futura (RN20, RN22)", async () => {
    const aoSalva = vi.fn();

    render(
      <SessaoModal
        aberto={true}
        pacienteId="p-1"
        dataHojeIso="2026-11-02"
        aoFechar={vi.fn()}
        aoSalva={aoSalva}
      />,
    );

    // Tentar salvar com resumo em branco
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));
    expect(
      screen.getByText(/O resumo da sessão é obrigatório/i),
    ).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();

    // Preencher resumo e colocar data futura
    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Resumo válido" },
    });
    fireEvent.change(screen.getByLabelText(/Data da sessão/i), {
      target: { value: "03112026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    expect(
      screen.getByText(/A data da sessão não pode ser uma data futura/i),
    ).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();

    // Colocar data passada válida e salvar
    const sessaoCriada: Sessao = {
      id: "s-1",
      paciente_id: "p-1",
      data: "2026-10-28",
      resumo: "Resumo válido",
      criado_em: "2026-11-02T15:00:00Z",
      atualizado_em: "2026-11-02T15:00:00Z",
    };
    mockInvoke.mockResolvedValueOnce(sessaoCriada);

    fireEvent.change(screen.getByLabelText(/Data da sessão/i), {
      target: { value: "28102026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("sessao_criar", {
        dados: {
          paciente_id: "p-1",
          data: "2026-10-28",
          resumo: "Resumo válido",
        },
      });
      expect(aoSalva).toHaveBeenCalledWith(sessaoCriada);
    });
  });

  it("permite editar uma sessão existente carregando data e resumo atuais (RN25)", async () => {
    const sessaoExistente: Sessao = {
      id: "s-existente",
      paciente_id: "p-1",
      data: "2026-10-15",
      resumo: "Resumo original",
      criado_em: "2026-10-15T10:00:00Z",
      atualizado_em: "2026-10-15T10:00:00Z",
    };

    const sessaoAtualizada: Sessao = {
      ...sessaoExistente,
      resumo: "Resumo atualizado",
      atualizado_em: "2026-11-02T15:10:00Z",
    };
    mockInvoke.mockResolvedValueOnce(sessaoAtualizada);
    const aoSalva = vi.fn();

    render(
      <SessaoModal
        aberto={true}
        pacienteId="p-1"
        sessaoParaEditar={sessaoExistente}
        dataHojeIso="2026-11-02"
        aoFechar={vi.fn()}
        aoSalva={aoSalva}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Editar sessão" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Data da sessão/i)).toHaveValue("15/10/2026");
    expect(screen.getByLabelText(/Resumo da sessão/i)).toHaveValue(
      "Resumo original",
    );
    expect(screen.getByTestId("contador-resumo-sessao")).toHaveTextContent(
      "15/600",
    );

    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Resumo atualizado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("sessao_atualizar", {
        id: "s-existente",
        dados: {
          data: "2026-10-15",
          resumo: "Resumo atualizado",
        },
      });
      expect(aoSalva).toHaveBeenCalledWith(sessaoAtualizada);
    });
  });
});
