import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as api from "./lib/api";
import {
  avancarCicloBoasVindas,
  CHAVE_CONFIG_ULTIMO_BACKUP,
  deslocarDiasIso,
  formatarDataBr,
  gerarNovoCicloEmbaralhado,
  MENSAGENS_BOAS_VINDAS,
  obterDataHojeIso,
  obterSaudacaoHorario,
  resetarCicloBoasVindas,
  sortearIndiceBoasVindas,
} from "./lib/format";
import { Inicio } from "./pages/Inicio";

describe("Painel Inicial T04 (F2-T3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exibe saudação inicial, total de pacientes ativos, atalhos, espaço de aniversariantes e backup", async () => {
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
      screen.getByRole("heading", { name: /Olá!/i }),
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
      await screen.findByRole("heading", { name: /Olá!/i }),
    ).toBeInTheDocument();

    // 1 clique no atalho "Novo paciente" leva direto ao formulário T06
    fireEvent.click(screen.getByRole("button", { name: /^Novo paciente$/i }));
    expect(
      await screen.findByRole("heading", { name: /Cadastro de Paciente/i }),
    ).toBeInTheDocument();

    // Volta ao Início em 1 clique na Sidebar
    fireEvent.click(screen.getByRole("link", { name: /^Início$/i }));
    expect(
      await screen.findByRole("heading", { name: /Olá!/i }),
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

    await screen.findByRole("heading", { name: /Olá!/i });

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
      await screen.findByRole("heading", { name: /Olá!/i }),
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
    expect(MENSAGENS_BOAS_VINDAS).toContain(
      "Desejamos um excelente dia de atendimentos! ✨",
    );
    expect(MENSAGENS_BOAS_VINDAS.length).toBe(9);

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

  it("passa por todas as frases da lista embaralhada sem repetir e reinicia novo ciclo garantindo primeira frase diferente da última da lista anterior", () => {
    resetarCicloBoasVindas();
    const total = MENSAGENS_BOAS_VINDAS.length;
    let fila: number[] = [];
    let ultimo: number | null = null;
    const vistasCiclo1 = new Set<number>();

    // Ciclo 1: consome todas as 9 frases
    for (let i = 0; i < total; i++) {
      const res = avancarCicloBoasVindas(fila, ultimo, total);
      expect(vistasCiclo1.has(res.escolhido)).toBe(false);
      vistasCiclo1.add(res.escolhido);
      ultimo = res.escolhido;
      fila = res.novaFila;
    }
    expect(vistasCiclo1.size).toBe(total);
    expect(fila.length).toBe(0);

    // Ciclo 2, 1º passo: a primeira frase do novo ciclo deve ser diferente da última do ciclo 1
    const ultimoDoCiclo1 = ultimo!;
    const resCiclo2 = avancarCicloBoasVindas(fila, ultimo, total);
    expect(resCiclo2.escolhido).not.toBe(ultimoDoCiclo1);
    expect(resCiclo2.novaFila.length).toBe(total - 1);

    // Valida também que gerarNovoCicloEmbaralhado nunca repete o último índice na primeira posição
    for (let u = 0; u < total; u++) {
      for (let trial = 0; trial < 30; trial++) {
        const ciclo = gerarNovoCicloEmbaralhado(total, u);
        expect(ciclo.length).toBe(total);
        expect(new Set(ciclo).size).toBe(total);
        expect(ciclo[0]).not.toBe(u);
      }
    }
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

  it("exibe aniversariantes do dia (incluindo inativos) e próximos 7 dias, e abre o WhatsApp apenas ao clicar em 'Enviar parabéns no WhatsApp' (F5-T2 — RN30, RN31, RN34)", async () => {
    const hojeIso = obterDataHojeIso();
    vi.spyOn(api, "pacientesListar").mockResolvedValue([]);
    vi.spyOn(api, "agendamentosListar").mockResolvedValue([]);
    vi.spyOn(api, "aniversariantesListar").mockResolvedValue([
      {
        id: "p-inativa-hoje",
        nome: "Beatriz Almeida",
        data_nascimento: "1986-11-02",
        data_comemoracao: hojeIso,
        idade_completando: 40,
        dias_ate_aniversario: 0,
        status: "inativo",
        telefone: null,
        whatsapp: "71988887777",
      },
      {
        id: "p-ativo-sem-tel",
        nome: "Carlos Eduardo",
        data_nascimento: "1996-11-02",
        data_comemoracao: hojeIso,
        idade_completando: 30,
        dias_ate_aniversario: 0,
        status: "ativo",
        telefone: null,
        whatsapp: null,
      },
      {
        id: "p-proxima-5d",
        nome: "Daniela Souza",
        data_nascimento: "2010-11-07",
        data_comemoracao: "2026-11-07",
        idade_completando: 16,
        dias_ate_aniversario: 5,
        status: "ativo",
        telefone: "71991112222",
        whatsapp: null,
      },
    ]);

    const whatsappSpy = vi
      .spyOn(api, "whatsappParabens")
      .mockResolvedValue(
        "https://wa.me/5571988887777?text=Ol%C3%A1%2C%20Beatriz%21",
      );

    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Inicio />
      </MemoryRouter>,
    );

    // 1. Paciente inativo que faz aniversário hoje aparece com idade e status (RN30, RN31)
    const itemBeatriz = await screen.findByTestId(
      "aniversariante-hoje-p-inativa-hoje",
    );
    expect(itemBeatriz).toHaveTextContent("Beatriz Almeida");
    expect(itemBeatriz).toHaveTextContent("Inativo");
    expect(itemBeatriz).toHaveTextContent("40 anos");

    // 2. Paciente ativo sem telefone aparece, mas NÃO exibe o botão do WhatsApp (RN31)
    const itemCarlos = screen.getByTestId("aniversariante-hoje-p-ativo-sem-tel");
    expect(itemCarlos).toHaveTextContent("Carlos Eduardo");
    expect(itemCarlos).toHaveTextContent("Ativo");
    expect(itemCarlos).toHaveTextContent("30 anos");
    expect(
      screen.queryByTestId("whatsapp-parabens-p-ativo-sem-tel"),
    ).not.toBeInTheDocument();

    // 3. O WhatsApp NUNCA é chamado automaticamente sem clique da usuária (RN31)
    expect(whatsappSpy).not.toHaveBeenCalled();

    // 4. Ao clicar no botão "Enviar parabéns no WhatsApp", aciona o comando whatsapp_parabens
    const botaoBeatriz = screen.getByTestId(
      "whatsapp-parabens-p-inativa-hoje",
    );
    expect(botaoBeatriz).toHaveTextContent("Enviar parabéns no WhatsApp");
    fireEvent.click(botaoBeatriz);

    await waitFor(() => {
      expect(whatsappSpy).toHaveBeenCalledTimes(1);
      expect(whatsappSpy).toHaveBeenCalledWith("p-inativa-hoje");
    });

    // 5. Expandir "Próximos aniversários (7 dias)" exibe Daniela Souza (RN34)
    fireEvent.click(
      screen.getByRole("button", {
        name: /Próximos aniversários \(7 dias\)/i,
      }),
    );

    const itemDaniela = await screen.findByTestId(
      "aniversariante-proximo-p-proxima-5d",
    );
    expect(itemDaniela).toHaveTextContent("Daniela Souza");
    expect(itemDaniela).toHaveTextContent("daqui a 5 dias");
    expect(itemDaniela).toHaveTextContent("16 anos");
  });

  it("exibe data do último backup, mostra lembrete amigável após 7 dias e permite fazer backup agora pelo painel (F7-T3 — RN50, RN51, RN53, RN55)", async () => {
    const hojeIso = obterDataHojeIso();
    const dezDiasAtrasIso = `${deslocarDiasIso(hojeIso, -10)}T14:20:00-03:00`;
    const dataDezDiasBr = formatarDataBr(dezDiasAtrasIso);

    vi.spyOn(api, "pacientesListar").mockResolvedValue([]);
    vi.spyOn(api, "agendamentosListar").mockResolvedValue([]);
    vi.spyOn(api, "aniversariantesListar").mockResolvedValue([]);
    vi.spyOn(api, "configObter").mockImplementation(async (chave) => {
      if (chave === CHAVE_CONFIG_ULTIMO_BACKUP) {
        return dezDiasAtrasIso;
      }
      return null;
    });

    const novoBackupIso = `${hojeIso}T19:45:00-03:00`;
    const backupCriarSpy = vi.spyOn(api, "backupCriar").mockResolvedValue({
      caminho_arquivo: "/media/pendrive/backup-pacientes-2026-11-06-1945.lotusbackup",
      nome_arquivo: "backup-pacientes-2026-11-06-1945.lotusbackup",
      tamanho: 204800,
      tamanho_bytes: 204800,
      criado_em: novoBackupIso,
      verificado: true,
      n_pacientes: 4,
      n_sessoes: 12,
      n_agendamentos: 3,
      n_documentos: 2,
      n_anamneses: 1,
    });

    render(
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Inicio />
      </MemoryRouter>,
    );

    // 1. Exibe a data do último backup de 10 dias atrás e o lembrete amigável (> 7 dias — RN53)
    await waitFor(() => {
      expect(screen.getByTestId("status-ultimo-backup")).toHaveTextContent(
        `${dataDezDiasBr} às 14:20`,
      );
    });
    const lembrete = screen.getByTestId("lembrete-backup-7-dias");
    expect(lembrete).toHaveTextContent(/10 dias/i);

    // 2. Clicar em "Fazer backup agora" abre o modal com nome sugerido backup-pacientes-AAAA-MM-DD-HHmm.lotusbackup (RN50, RN51)
    fireEvent.click(
      screen.getByRole("button", { name: /^Fazer backup agora$/i }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Fazer backup agora" }),
    ).toBeInTheDocument();

    const inputCaminho = screen.getByLabelText(
      /Pasta ou caminho para salvar o backup/i,
    ) as HTMLInputElement;
    expect(inputCaminho.value).toMatch(
      /^backup-pacientes-\d{4}-\d{2}-\d{2}-\d{4}\.lotusbackup$/,
    );

    // 3. Usuária escolhe pasta de destino e confirma o backup
    fireEvent.change(inputCaminho, {
      target: {
        value: "/media/pendrive/backup-pacientes-2026-11-06-1945.lotusbackup",
      },
    });
    fireEvent.click(screen.getByTestId("confirmar-salvar-backup-inicio"));

    await waitFor(() => {
      expect(backupCriarSpy).toHaveBeenCalledWith(
        "/media/pendrive/backup-pacientes-2026-11-06-1945.lotusbackup",
      );
    });

    // 4. Data do último backup atualiza imediatamente e o lembrete de 7 dias desaparece
    const hojeBr = formatarDataBr(hojeIso);
    await waitFor(() => {
      expect(screen.getByTestId("status-ultimo-backup")).toHaveTextContent(
        `${hojeBr} às 19:45`,
      );
    });
    expect(
      screen.queryByTestId("lembrete-backup-7-dias"),
    ).not.toBeInTheDocument();
  });
});
