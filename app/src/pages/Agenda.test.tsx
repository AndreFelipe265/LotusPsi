import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Agendamento,
  HorarioSemanal,
  PacienteResumo,
} from "../lib/types";
import { Agenda } from "./Agenda";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const PACIENTES_ATIVOS: PacienteResumo[] = [
  {
    id: "p-joao",
    nome: "João da Conceição",
    data_nascimento: "1990-05-15",
    telefone: "71998765432",
    status: "ativo",
  },
  {
    id: "p-ana",
    nome: "Ana Beatriz",
    data_nascimento: "1995-02-10",
    telefone: "71988887777",
    status: "ativo",
  },
];

describe("Tela T11 — Agenda (F4.5-T3 — RN70–RN76)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("exibe visão Semana por padrão, alterna para Mês e navega com Anterior, Hoje e Próximo (RN71)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "pacientes_listar") return Promise.resolve(PACIENTES_ATIVOS);
      if (cmd === "agendamentos_listar") return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Agenda dataHojeIso="2026-11-02" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /^Agenda$/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("visao-semana")).toBeInTheDocument();
    expect(screen.getByTestId("rotulo-periodo-agenda")).toHaveTextContent(
      "Semana de 02/11/2026 a 08/11/2026",
    );

    // Navegar Próximo e Anterior na semana
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByTestId("rotulo-periodo-agenda")).toHaveTextContent(
      "Semana de 09/11/2026 a 15/11/2026",
    );

    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(screen.getByTestId("rotulo-periodo-agenda")).toHaveTextContent(
      "Semana de 02/11/2026 a 08/11/2026",
    );

    // Alternar para visão Mês
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    expect(screen.getByTestId("visao-mes")).toBeInTheDocument();
    expect(screen.getByTestId("rotulo-periodo-agenda")).toHaveTextContent(
      "Novembro de 2026",
    );
  });

  it("agenda 2 sessões no mesmo horário avisando conflito sem bloquear, exibe ambas na semana, permite remarcar e excluir (RN70, RN72–RN74)", async () => {
    const bancoAgendamentos: Agendamento[] = [];
    let seqId = 1;

    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "pacientes_listar") {
        return Promise.resolve(PACIENTES_ATIVOS);
      }
      if (cmd === "agendamentos_listar") {
        return Promise.resolve([...bancoAgendamentos]);
      }
      if (cmd === "agendamento_criar") {
        const { dados } = args as {
          dados: {
            paciente_id: string;
            data: string;
            hora_inicio: string;
            duracao_min?: number;
            observacao?: string | null;
          };
        };
        const paciente = PACIENTES_ATIVOS.find(
          (p) => p.id === dados.paciente_id,
        );
        const novo: Agendamento = {
          id: `ag-${seqId++}`,
          paciente_id: dados.paciente_id,
          paciente_nome: paciente?.nome ?? "Paciente",
          data: dados.data,
          hora_inicio: dados.hora_inicio,
          duracao_min: dados.duracao_min ?? 50,
          observacao: dados.observacao ?? null,
          criado_em: "2026-11-02T10:00:00Z",
          atualizado_em: "2026-11-02T10:00:00Z",
          conflito: false,
          conflito_descricao: null,
        };
        bancoAgendamentos.push(novo);
        return Promise.resolve(novo);
      }
      if (cmd === "agendamento_atualizar") {
        const { id, dados } = args as {
          id: string;
          dados: {
            paciente_id: string;
            data: string;
            hora_inicio: string;
            duracao_min?: number;
            observacao?: string | null;
          };
        };
        const idx = bancoAgendamentos.findIndex((a) => a.id === id);
        const paciente = PACIENTES_ATIVOS.find(
          (p) => p.id === dados.paciente_id,
        );
        const atualizado: Agendamento = {
          ...bancoAgendamentos[idx],
          paciente_id: dados.paciente_id,
          paciente_nome: paciente?.nome ?? "Paciente",
          data: dados.data,
          hora_inicio: dados.hora_inicio,
          duracao_min: dados.duracao_min ?? 50,
          observacao: dados.observacao ?? null,
          atualizado_em: "2026-11-02T11:00:00Z",
        };
        bancoAgendamentos[idx] = atualizado;
        return Promise.resolve(atualizado);
      }
      if (cmd === "agendamento_excluir") {
        const { id } = args as { id: string };
        const idx = bancoAgendamentos.findIndex((a) => a.id === id);
        if (idx >= 0) bancoAgendamentos.splice(idx, 1);
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Agenda dataHojeIso="2026-11-02" />
      </MemoryRouter>,
    );

    // 1. Criar 1º agendamento clicando em horário vazio (+ 09:00 em 2026-11-02) (RN72)
    const botaoSlot = await screen.findByTestId("slot-vazio-2026-11-02-09:00");
    fireEvent.click(botaoSlot);

    expect(
      await screen.findByRole("dialog", { name: "Novo agendamento" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Paciente/i), {
      target: { value: "p-joao" },
    });
    fireEvent.change(screen.getByLabelText(/Horário de início/i), {
      target: { value: "14:00" },
    });
    fireEvent.change(screen.getByLabelText(/Observação/i), {
      target: { value: "Sessão regular semanal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar agendamento" }));

    await waitFor(() => {
      expect(screen.getByTestId("card-agendamento-ag-1")).toHaveTextContent(
        "João da Conceição",
      );
    });

    // 2. Criar 2º agendamento no mesmo horário (14:00 em 02/11/2026): deve avisar conflito no modal sem bloquear (RN73)
    fireEvent.click(screen.getByRole("button", { name: "Novo agendamento" }));
    fireEvent.change(screen.getByLabelText(/Paciente/i), {
      target: { value: "p-ana" },
    });
    fireEvent.change(screen.getByLabelText(/Data do agendamento/i), {
      target: { value: "02112026" },
    });
    fireEvent.change(screen.getByLabelText(/Horário de início/i), {
      target: { value: "14:00" },
    });

    // Verifica que o aviso de conflito aparece no modal antes mesmo de salvar, mas o botão continua habilitado
    expect(screen.getByTestId("aviso-conflito-modal")).toHaveTextContent(
      /João da Conceição \(14:00\)/i,
    );
    const botaoSalvar = screen.getByRole("button", {
      name: "Salvar agendamento",
    });
    expect(botaoSalvar).not.toBeDisabled();

    fireEvent.click(botaoSalvar);

    // 3. Ambos os agendamentos aparecem na semana e o alerta de conflito é exibido (Aceite F4.5)
    await waitFor(() => {
      expect(screen.getByTestId("card-agendamento-ag-1")).toBeInTheDocument();
      expect(screen.getByTestId("card-agendamento-ag-2")).toBeInTheDocument();
    });
    expect(screen.getByTestId("aviso-conflito-agenda")).toBeInTheDocument();
    expect(screen.getByTestId("badge-conflito-ag-1")).toHaveTextContent(
      /Conflito de horário/i,
    );
    expect(screen.getByTestId("badge-conflito-ag-2")).toHaveTextContent(
      /Conflito de horário/i,
    );

    // 4. Editar / Remarcar o 2º agendamento para 15:00 remove o conflito (RN74)
    fireEvent.click(screen.getByTestId("editar-agendamento-ag-2"));
    fireEvent.change(screen.getByLabelText(/Horário de início/i), {
      target: { value: "15:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar agendamento" }));

    await waitFor(() => {
      expect(
        screen.queryByTestId("aviso-conflito-agenda"),
      ).not.toBeInTheDocument();
    });

    // 5. Excluir agendamento com confirmação (RN74)
    fireEvent.click(screen.getByTestId("excluir-agendamento-ag-2"));
    expect(
      screen.getByRole("dialog", { name: "Excluir agendamento" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Sim, excluir agendamento" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("card-agendamento-ag-2"),
      ).not.toBeInTheDocument();
    });
  });

  it("oferece 'Registrar sessão' em agendamento passado abrindo o modal T08 com a data preenchida, mantendo o agendamento independente (F4.5-T4 — RN76)", async () => {
    const agendamentoPassado: Agendamento = {
      id: "ag-passado",
      paciente_id: "p-joao",
      paciente_nome: "João da Conceição",
      data: "2026-11-02",
      hora_inicio: "10:00",
      duracao_min: 50,
      observacao: "Atendimento de segunda-feira",
      criado_em: "2026-11-01T10:00:00Z",
      atualizado_em: "2026-11-01T10:00:00Z",
      conflito: false,
      conflito_descricao: null,
    };

    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "pacientes_listar") return Promise.resolve(PACIENTES_ATIVOS);
      if (cmd === "agendamentos_listar") {
        return Promise.resolve([agendamentoPassado]);
      }
      if (cmd === "sessao_criar") {
        const { dados } = args as {
          dados: { paciente_id: string; data: string; resumo: string };
        };
        return Promise.resolve({
          id: "s-registrada",
          paciente_id: dados.paciente_id,
          data: dados.data,
          resumo: dados.resumo,
          criado_em: "2026-11-04T12:00:00Z",
          atualizado_em: "2026-11-04T12:00:00Z",
        });
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Agenda dataHojeIso="2026-11-04" />
      </MemoryRouter>,
    );

    const botaoRegistrar = await screen.findByTestId(
      "registrar-sessao-agendamento-ag-passado",
    );
    fireEvent.click(botaoRegistrar);

    // Abre o modal T08 com a data do agendamento (02/11/2026) já preenchida (RN76)
    expect(
      await screen.findByRole("dialog", { name: "Nova sessão" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Data da sessão/i)).toHaveValue("02/11/2026");

    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Sessão registrada a partir do agendamento passado." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("sessao_criar", {
        dados: {
          paciente_id: "p-joao",
          data: "2026-11-02",
          resumo: "Sessão registrada a partir do agendamento passado.",
        },
      });
    });

    // O agendamento continua presente de forma independente (RN76)
    expect(
      screen.getByTestId("card-agendamento-ag-passado"),
    ).toBeInTheDocument();
  });

  it("gerencia a Grade Semanal Fixa (RN90–RN94): cria horário fixo, avisa conflito no mesmo dia da semana, aplica grade na semana e exclui", async () => {
    const bancoGrade: HorarioSemanal[] = [
      {
        id: "h-1",
        paciente_id: "p-joao",
        paciente_nome: "João da Conceição",
        paciente_status: "ativo",
        dia_semana: 1, // Segunda-feira
        hora_inicio: "14:00",
        duracao_min: 50,
        observacao: "Horário fixo semanal",
        criado_em: "2026-11-01T10:00:00Z",
        atualizado_em: "2026-11-01T10:00:00Z",
        conflito: false,
        conflito_descricao: null,
      },
    ];

    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "pacientes_listar") return Promise.resolve(PACIENTES_ATIVOS);
      if (cmd === "agendamentos_listar") return Promise.resolve([]);
      if (cmd === "horarios_semanais_listar") {
        return Promise.resolve([...bancoGrade]);
      }
      if (cmd === "horario_semanal_criar") {
        const { dados } = args as {
          dados: {
            paciente_id: string;
            dia_semana: number;
            hora_inicio: string;
            duracao_min?: number;
            observacao?: string | null;
          };
        };
        const paciente = PACIENTES_ATIVOS.find(
          (p) => p.id === dados.paciente_id,
        );
        const novo: HorarioSemanal = {
          id: "h-2",
          paciente_id: dados.paciente_id,
          paciente_nome: paciente?.nome ?? "Paciente",
          paciente_status: "ativo",
          dia_semana: dados.dia_semana,
          hora_inicio: dados.hora_inicio,
          duracao_min: dados.duracao_min ?? 50,
          observacao: dados.observacao ?? null,
          criado_em: "2026-11-02T10:00:00Z",
          atualizado_em: "2026-11-02T10:00:00Z",
          conflito: false,
          conflito_descricao: null,
        };
        bancoGrade.push(novo);
        return Promise.resolve(novo);
      }
      if (cmd === "horarios_semanais_aplicar_semana") {
        return Promise.resolve({
          data_inicio_semana: "2026-11-02",
          data_fim_semana: "2026-11-08",
          criados: 2,
          ignorados_existentes: 0,
        });
      }
      if (cmd === "horario_semanal_excluir") {
        const { id } = args as { id: string };
        const idx = bancoGrade.findIndex((h) => h.id === id);
        if (idx >= 0) bancoGrade.splice(idx, 1);
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });

    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Agenda dataHojeIso="2026-11-02" />
      </MemoryRouter>,
    );

    // 1. Alternar para a visão "Grade Fixa" (RN92)
    fireEvent.click(screen.getByRole("button", { name: "Grade Fixa" }));
    expect(await screen.findByTestId("visao-grade-semanal")).toBeInTheDocument();
    expect(
      await screen.findByTestId("card-horario-fixo-h-1"),
    ).toHaveTextContent("João da Conceição");

    // 2. Abrir modal clicando em "Fixar neste dia" na Segunda-feira (dia 1) e verificar aviso de conflito (RN93)
    fireEvent.click(screen.getByTestId("slot-grade-1"));
    expect(
      await screen.findByRole("dialog", { name: "Novo horário fixo semanal" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Paciente/i), {
      target: { value: "p-ana" },
    });
    fireEvent.change(screen.getByLabelText(/Horário de início/i), {
      target: { value: "14:00" },
    });

    expect(screen.getByTestId("aviso-conflito-grade-modal")).toHaveTextContent(
      /João da Conceição \(14:00\)/i,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Salvar horário fixo" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("card-horario-fixo-h-2")).toHaveTextContent(
        "Ana Beatriz",
      );
    });

    // 3. Aplicar grade semanal na semana atual (RN94)
    fireEvent.click(screen.getByTestId("botao-aplicar-grade-semana"));
    expect(
      await screen.findByText(
        /Grade semanal aplicada: 2 agendamentos criados na semana/i,
      ),
    ).toBeInTheDocument();

    // 4. Excluir horário fixo com confirmação (RN92)
    fireEvent.click(screen.getByTestId("excluir-horario-fixo-h-2"));
    expect(
      screen.getByRole("dialog", { name: "Excluir horário fixo" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Sim, remover horário fixo" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("card-horario-fixo-h-2"),
      ).not.toBeInTheDocument();
    });
  });
});
