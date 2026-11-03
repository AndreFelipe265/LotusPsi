import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./lib/api";
import {
  MENSAGENS_BOAS_VINDAS,
  obterDataHojeIso,
  obterSaudacaoHorario,
  sortearIndiceBoasVindas,
} from "./lib/format";
import { Inicio } from "./pages/Inicio";

describe("Painel Inicial T04 (F2-T3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exibe saudação à Louriedna, total de pacientes ativos, atalhos, espaço de aniversariantes e backup", async () => {
    vi.spyOn(api, "pacientesListar").mockResolvedValue([
      {
        id: "1",
        nome: "Ana Silva",
        status: "ativo",
      },
      {
        id: "2",
        nome: "Carlos Souza",
        status: "ativo",
      },
    ]);

    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Inicio />
      </MemoryRouter>,
    );

    // Saudação em pt-BR
    expect(
      screen.getByRole("heading", { name: /Olá, Louriedna!/i }),
    ).toBeInTheDocument();

    // Total de pacientes ativos atualizado
    await waitFor(() => {
      expect(screen.getByTestId("valor-total-ativos")).toHaveTextContent("2");
    });

    // Atalhos principais (T04)
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

    // Espaço reservado para aniversariantes + lista recolhível de 7 dias (RN30, RN34)
    expect(screen.getByTestId("secao-aniversariantes")).toBeInTheDocument();
    const botaoProximos7Dias = screen.getByRole("button", {
      name: /Próximos aniversários \(7 dias\)/i,
    });
    fireEvent.click(botaoProximos7Dias);
    expect(
      screen.getByTestId("lista-proximos-aniversarios"),
    ).toBeInTheDocument();

    // Espaço reservado para backup + botão Fazer backup agora (RN50, RN53)
    expect(screen.getByTestId("secao-backup")).toBeInTheDocument();
    expect(screen.getByTestId("status-ultimo-backup")).toHaveTextContent(
      /Último backup:/i,
    );
    expect(
      screen.getByRole("button", { name: /Fazer backup agora/i }),
    ).toBeInTheDocument();
  });

  it("navega pelos atalhos do painel em apenas 1 clique para cada área principal", async () => {
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: true,
    });
    vi.spyOn(api, "pacientesListar").mockResolvedValue([]);

    render(<App rotaInicial="/" />);

    // Aguarda carregar o Painel Inicial
    expect(
      await screen.findByRole("heading", { name: /Olá, Louriedna!/i }),
    ).toBeInTheDocument();

    // 1 clique no atalho "Novo paciente" leva direto ao formulário T06
    fireEvent.click(screen.getByRole("button", { name: /^Novo paciente$/i }));
    expect(
      await screen.findByRole("heading", { name: /Cadastro de Paciente/i }),
    ).toBeInTheDocument();

    // Volta ao Início em 1 clique na Sidebar
    fireEvent.click(screen.getByRole("link", { name: /^Início$/i }));
    expect(
      await screen.findByRole("heading", { name: /Olá, Louriedna!/i }),
    ).toBeInTheDocument();

    // 1 clique no atalho "Buscar paciente" leva à lista de pacientes T05
    fireEvent.click(screen.getByRole("button", { name: /^Buscar paciente$/i }));
    expect(
      await screen.findByRole("heading", { name: /^Pacientes$/i }),
    ).toBeInTheDocument();
  });

  it("atende aos critérios de aceite da Fase F2: texto >= 16px (sem text-xs/text-sm) e contraste AA (texto branco apenas sobre malva ou mais escuro)", async () => {
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: true,
    });
    vi.spyOn(api, "pacientesListar").mockResolvedValue([]);

    const { container } = render(<App rotaInicial="/" />);

    await screen.findByRole("heading", { name: /Olá, Louriedna!/i });

    const todosElementos = Array.from(container.querySelectorAll("*"));
    for (const el of todosElementos) {
      const classes = el.className;
      if (typeof classes === "string" && classes.length > 0) {
        // Nenhum elemento deve usar fonte menor que 16px (text-xs ou text-sm)
        expect(classes).not.toMatch(/\btext-xs\b/);
        expect(classes).not.toMatch(/\btext-sm\b/);

        // Se usar texto branco (text-white), deve estar sobre bg-malva ou cor mais escura (#8B3A52)
        if (/\btext-white\b/.test(classes)) {
          expect(classes).toMatch(/\bbg-malva\b|\bbg-\[#8B3A52\]/);
          expect(classes).not.toMatch(
            /\bbg-rosa\b|\bbg-rosa-claro\b|\bbg-fundo\b/,
          );
        }
      }
    }
  });

  it("atalho 'Registrar sessão' abre busca rápida de paciente, seleciona paciente e abre modal T08, preservando o texto durante bloqueio por inatividade (F4-T4 — RN05, T08)", async () => {
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: true,
    });
    vi.spyOn(api, "pacientesListar").mockResolvedValue([
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
    ]);
    const criarSessaoSpy = vi.spyOn(api, "sessaoCriar").mockResolvedValue({
      id: "s-nova",
      paciente_id: "p-joao",
      data: "2026-11-02",
      resumo: "Resumo digitado antes do bloqueio de 30 minutos.",
      criado_em: "2026-11-02T15:00:00Z",
      atualizado_em: "2026-11-02T15:00:00Z",
    });
    const lockSpy = vi.spyOn(api, "authLock").mockResolvedValue(undefined);
    const loginSpy = vi.spyOn(api, "authLogin").mockResolvedValue(undefined);

    render(<App rotaInicial="/" tempoInatividadeMs={120} />);

    expect(
      await screen.findByRole("heading", { name: /Olá, Louriedna!/i }),
    ).toBeInTheDocument();

    // 1. Clicar no atalho "Registrar sessão" abre a busca rápida de paciente
    fireEvent.click(
      screen.getByRole("button", { name: /^Registrar sessão$/i }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Selecionar paciente para sessão",
      }),
    ).toBeInTheDocument();

    // 2. Buscar "joao" sem acento filtra "João da Conceição"
    const inputBusca = screen.getByLabelText(
      /Buscar paciente por nome ou telefone/i,
    );
    fireEvent.change(inputBusca, { target: { value: "joao" } });
    expect(screen.getByText("João da Conceição")).toBeInTheDocument();
    expect(screen.queryByText("Ana Beatriz")).not.toBeInTheDocument();

    // 3. Selecionar paciente abre o Modal T08 (Nova sessão)
    fireEvent.click(screen.getByTestId("selecionar-paciente-sessao-p-joao"));
    expect(
      await screen.findByRole("dialog", { name: "Nova sessão" }),
    ).toBeInTheDocument();

    // 4. Digitar texto no resumo da sessão
    const campoResumo = screen.getByLabelText(/Resumo da sessão/i);
    fireEvent.change(campoResumo, {
      target: { value: "Resumo digitado antes do bloqueio de 30 minutos." },
    });
    expect(campoResumo).toHaveValue(
      "Resumo digitado antes do bloqueio de 30 minutos.",
    );

    // 5. Aguardar o bloqueio automático por inatividade (RN05)
    await waitFor(
      () => {
        expect(
          screen.getByRole("dialog", { name: /Sessão bloqueada/i }),
        ).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    expect(lockSpy).toHaveBeenCalled();

    // 6. Desbloquear com a senha e verificar que o modal T08 e o texto digitado continuam intactos
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

    expect(screen.getByLabelText(/Resumo da sessão/i)).toHaveValue(
      "Resumo digitado antes do bloqueio de 30 minutos.",
    );

    // 7. Salvar a sessão após desbloquear
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(criarSessaoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          paciente_id: "p-joao",
          resumo: "Resumo digitado antes do bloqueio de 30 minutos.",
        }),
      );
    });
  });

  it("exibe saudação por horário e boas-vindas rotativas sem repetir a anterior ao logar 3 vezes (F4.5-T1 — RN60–RN62)", async () => {
    expect(MENSAGENS_BOAS_VINDAS).toContain("Eu te amo, mãe! ❤️");
    expect(MENSAGENS_BOAS_VINDAS.length).toBe(6);

    for (let idx = 0; idx < MENSAGENS_BOAS_VINDAS.length; idx++) {
      for (let step = 0; step < 20; step++) {
        const sorteado = sortearIndiceBoasVindas(idx, (step + 0.3) / 20);
        expect(sorteado).not.toBe(idx);
      }
    }

    expect(obterSaudacaoHorario(new Date(2026, 10, 2, 9, 0))).toBe("Bom dia");
    expect(obterSaudacaoHorario(new Date(2026, 10, 2, 14, 30))).toBe(
      "Boa tarde",
    );
    expect(obterSaudacaoHorario(new Date(2026, 10, 2, 20, 15))).toBe(
      "Boa noite",
    );

    let indiceAtual = -1;
    vi.spyOn(api, "authStatus").mockResolvedValue({
      configurado: true,
      desbloqueado: false,
    });
    vi.spyOn(api, "pacientesListar").mockResolvedValue([]);
    vi.spyOn(api, "authLock").mockResolvedValue(undefined);
    vi.spyOn(api, "authLogin").mockImplementation(async () => {
      indiceAtual = sortearIndiceBoasVindas(
        indiceAtual >= 0 ? indiceAtual : null,
      );
    });
    vi.spyOn(api, "boasVindasObter").mockImplementation(async () => {
      return MENSAGENS_BOAS_VINDAS[indiceAtual >= 0 ? indiceAtual : 0];
    });

    render(<App rotaInicial="/" />);

    // 1º Login
    const inputSenha1 = await screen.findByLabelText(/Senha de acesso/i);
    fireEvent.change(inputSenha1, { target: { value: "MinhaSenha123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("mensagem-boas-vindas")).toHaveTextContent(
        MENSAGENS_BOAS_VINDAS[indiceAtual],
      );
    });
    expect(screen.getByTestId("saudacao-horario")).toHaveTextContent(
      /Bom dia|Boa tarde|Boa noite/,
    );
    const msgLogin1 = screen.getByTestId("mensagem-boas-vindas").textContent;
    expect(MENSAGENS_BOAS_VINDAS).toContain(msgLogin1);

    // Bloquear (Sair) e 2º Login
    fireEvent.click(screen.getByRole("button", { name: /^Sair$/i }));
    const inputSenha2 = await screen.findByLabelText(/Senha de acesso/i);
    fireEvent.change(inputSenha2, { target: { value: "MinhaSenha123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Sessão bloqueada/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("mensagem-boas-vindas").textContent).not.toBe(
        msgLogin1,
      );
    });
    const msgLogin2 = screen.getByTestId("mensagem-boas-vindas").textContent;
    expect(MENSAGENS_BOAS_VINDAS).toContain(msgLogin2);
    expect(msgLogin2).not.toBe(msgLogin1);

    // Bloquear (Sair) e 3º Login
    fireEvent.click(screen.getByRole("button", { name: /^Sair$/i }));
    const inputSenha3 = await screen.findByLabelText(/Senha de acesso/i);
    fireEvent.change(inputSenha3, { target: { value: "MinhaSenha123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Entrar$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /Sessão bloqueada/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("mensagem-boas-vindas").textContent).not.toBe(
        msgLogin2,
      );
    });
    const msgLogin3 = screen.getByTestId("mensagem-boas-vindas").textContent;
    expect(MENSAGENS_BOAS_VINDAS).toContain(msgLogin3);
    expect(msgLogin3).not.toBe(msgLogin2);
  });

  it("exibe 'Sessões de hoje' com horário, nome do paciente, aviso de conflito e permite registrar sessão (F4.5-T4 — RN75, RN76)", async () => {
    const hojeIso = obterDataHojeIso();
    vi.spyOn(api, "pacientesListar").mockResolvedValue([]);
    vi.spyOn(api, "agendamentosListar").mockResolvedValue([
      {
        id: "ag-1",
        paciente_id: "p-joao",
        paciente_nome: "João da Conceição",
        data: hojeIso,
        hora_inicio: "14:00",
        duracao_min: 50,
        observacao: "Atendimento quinzenal",
        criado_em: `${hojeIso}T09:00:00Z`,
        atualizado_em: `${hojeIso}T09:00:00Z`,
        conflito: true,
        conflito_descricao: "Conflito de horário com Ana Beatriz (14:00)",
      },
      {
        id: "ag-2",
        paciente_id: "p-ana",
        paciente_nome: "Ana Beatriz",
        data: hojeIso,
        hora_inicio: "14:00",
        duracao_min: 50,
        observacao: null,
        criado_em: `${hojeIso}T09:05:00Z`,
        atualizado_em: `${hojeIso}T09:05:00Z`,
        conflito: true,
        conflito_descricao: "Conflito de horário com João da Conceição (14:00)",
      },
    ]);
    const criarSessaoSpy = vi.spyOn(api, "sessaoCriar").mockResolvedValue({
      id: "s-hoje",
      paciente_id: "p-joao",
      data: hojeIso,
      resumo: "Sessão realizada conforme agendamento de hoje.",
      criado_em: `${hojeIso}T15:00:00Z`,
      atualizado_em: `${hojeIso}T15:00:00Z`,
    });

    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Inicio />
      </MemoryRouter>,
    );

    const secaoHoje = await screen.findByTestId("secao-sessoes-hoje");
    expect(secaoHoje).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("sessao-hoje-ag-1")).toHaveTextContent("14:00");
      expect(screen.getByTestId("sessao-hoje-ag-1")).toHaveTextContent(
        "João da Conceição",
      );
      expect(screen.getByTestId("sessao-hoje-ag-2")).toHaveTextContent(
        "Ana Beatriz",
      );
    });

    expect(screen.getByTestId("conflito-sessao-hoje-ag-1")).toHaveTextContent(
      "Conflito de horário",
    );

    // Clicar em "Registrar sessão" em um agendamento de hoje abre o modal T08 (RN76)
    fireEvent.click(screen.getByTestId("registrar-sessao-hoje-ag-1"));
    expect(
      await screen.findByRole("dialog", { name: "Nova sessão" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Resumo da sessão/i), {
      target: { value: "Sessão realizada conforme agendamento de hoje." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar sessão" }));

    await waitFor(() => {
      expect(criarSessaoSpy).toHaveBeenCalledWith({
        paciente_id: "p-joao",
        data: hojeIso,
        resumo: "Sessão realizada conforme agendamento de hoje.",
      });
    });
  });
});
