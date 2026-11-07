import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import {
  CHAVE_CONFIG_MENSAGEM_ANIVERSARIO,
  CHAVE_CONFIG_ULTIMO_BACKUP,
  construirUrlWhatsappParabens,
  deslocarDiasIso,
  MENSAGEM_ANIVERSARIO_PADRAO,
  obterDataHojeIso,
} from "../lib/format";
import { Configuracoes } from "./Configuracoes";

// Chave sintética em formato Crockford Base32 utilizada para simulação em testes (RN54)
const CHAVE_RECUPERACAO_TESTE = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ23";

describe("Tela T10 — Configurações: Mensagem de aniversário (F5-T3 — RN32)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("carrega a mensagem padrão quando não há valor customizado salvo, permite editar, salvar e restaurar padrão (RN32)", async () => {
    const obterSpy = vi.spyOn(api, "configObter").mockResolvedValue(null);
    const definirSpy = vi
      .spyOn(api, "configDefinir")
      .mockResolvedValue(undefined);

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    const campo = await screen.findByLabelText(/Mensagem padrão de parabéns/i);
    expect(campo).toHaveValue(MENSAGEM_ANIVERSARIO_PADRAO);
    expect(obterSpy).toHaveBeenCalledWith(CHAVE_CONFIG_MENSAGEM_ANIVERSARIO);

    // Editar para uma mensagem customizada
    const novaMensagem =
      "Querida {primeiro_nome}, parabéns pelo seu dia! Com carinho da psicóloga.";
    fireEvent.change(campo, { target: { value: novaMensagem } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar mensagem/i }));

    await waitFor(() => {
      expect(definirSpy).toHaveBeenCalledWith(
        CHAVE_CONFIG_MENSAGEM_ANIVERSARIO,
        novaMensagem,
      );
    });

    expect(
      await screen.findByText("Mensagem de aniversário salva com sucesso."),
    ).toBeInTheDocument();

    // Restaurar padrão volta ao texto oficial da RN32
    fireEvent.click(screen.getByRole("button", { name: /Restaurar padrão/i }));
    expect(campo).toHaveValue(MENSAGEM_ANIVERSARIO_PADRAO);
  });

  it("carrega mensagem customizada previamente salva em config e formata corretamente o link wa.me (RN31, RN32)", async () => {
    const msgCustom = "Feliz vida, {primeiro_nome}! Abraço carinhoso.";
    vi.spyOn(api, "configObter").mockResolvedValue(msgCustom);

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    const campo = await screen.findByLabelText(/Mensagem padrão de parabéns/i);
    await waitFor(() => {
      expect(campo).toHaveValue(msgCustom);
    });

    const url = construirUrlWhatsappParabens(
      "Beatriz Almeida",
      "(71) 98888-7777",
      msgCustom,
    );
    expect(url).toBe(
      "https://wa.me/5571988887777?text=Feliz%20vida%2C%20Beatriz!%20Abra%C3%A7o%20carinhoso.",
    );
  });

  it("permite fazer backup agora em Configurações, inspecionar arquivo .lotusbackup com senha ou chave de recuperação, ver contagens e restaurar com confirmação (F7-T3 — RN50–RN55)", async () => {
    const hojeIso = obterDataHojeIso();
    const oitoDiasAtrasIso = `${deslocarDiasIso(hojeIso, -8)}T10:00:00-03:00`;

    vi.spyOn(api, "configObter").mockImplementation(async (chave) => {
      if (chave === CHAVE_CONFIG_ULTIMO_BACKUP) {
        return oitoDiasAtrasIso;
      }
      return null;
    });

    const criarBackupSpy = vi.spyOn(api, "backupCriar").mockResolvedValue({
      caminho_arquivo: "D:/Backups/backup-pacientes-2026-11-06-2000.lotusbackup",
      nome_arquivo: "backup-pacientes-2026-11-06-2000.lotusbackup",
      tamanho: 512000,
      tamanho_bytes: 512000,
      criado_em: `${hojeIso}T20:00:00-03:00`,
      verificado: true,
      n_pacientes: 12,
      n_sessoes: 45,
      n_agendamentos: 6,
      n_documentos: 5,
      n_anamneses: 4,
    });

    const inspecionarSpy = vi
      .spyOn(api, "backupInspecionar")
      .mockResolvedValue({
        data: "2026-11-05T18:30:00-03:00",
        criado_em: "2026-11-05T18:30:00-03:00",
        n_pacientes: 12,
        n_documentos: 5,
        n_anamneses: 4,
        n_agendamentos: 6,
        n_sessoes: 45,
        tamanho_bytes: 512000,
      });

    const restaurarSpy = vi.spyOn(api, "backupRestaurar").mockResolvedValue({
      data: "2026-11-05T18:30:00-03:00",
      criado_em: "2026-11-05T18:30:00-03:00",
      n_pacientes: 12,
      n_documentos: 5,
      n_anamneses: 4,
      n_agendamentos: 6,
      n_sessoes: 45,
      caminho_copia_seguranca:
        "/dados/backups_automaticos/pre-restauracao-2026-11-06-200500.lotusbackup",
    });

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    // 1. Exibe lembrete amigável quando passaram mais de 7 dias do último backup (RN53)
    expect(
      await screen.findByTestId("lembrete-backup-7-dias-config"),
    ).toHaveTextContent(/8 dias/i);

    // 2. Clicar em "Fazer backup agora" em Configurações abre modal e salva o backup (RN50, RN51)
    fireEvent.click(
      screen.getByRole("button", { name: /^Fazer backup agora$/i }),
    );
    const inputDestino = await screen.findByLabelText(
      /Pasta ou caminho para salvar o backup/i,
    );
    fireEvent.change(inputDestino, {
      target: {
        value: "D:/Backups/backup-pacientes-2026-11-06-2000.lotusbackup",
      },
    });
    fireEvent.click(screen.getByTestId("confirmar-salvar-backup-config"));

    await waitFor(() => {
      expect(criarBackupSpy).toHaveBeenCalledWith(
        "D:/Backups/backup-pacientes-2026-11-06-2000.lotusbackup",
      );
    });
    expect(
      screen.queryByTestId("lembrete-backup-7-dias-config"),
    ).not.toBeInTheDocument();

    // 3. Inspecionar um backup informando caminho e chave de recuperação (RN52, RN54)
    const inputCaminhoRestaurar = screen.getByLabelText(
      /Arquivo de backup \(\.lotusbackup\)/i,
    );
    const inputSenhaRestaurar = screen.getByLabelText(
      /Senha ou chave de recuperação do backup/i,
    );

    fireEvent.change(inputCaminhoRestaurar, {
      target: { value: "D:/Backups/backup-pacientes-2026-11-05-1830.lotusbackup" },
    });
    fireEvent.change(inputSenhaRestaurar, {
      target: { value: CHAVE_RECUPERACAO_TESTE },
    });

    fireEvent.click(screen.getByTestId("botao-inspecionar-backup"));

    await waitFor(() => {
      expect(inspecionarSpy).toHaveBeenCalledWith({
        caminho: "D:/Backups/backup-pacientes-2026-11-05-1830.lotusbackup",
        senha: CHAVE_RECUPERACAO_TESTE,
        conteudo_base64: null,
      });
    });

    // 4. Exibe card de inspeção com data e contagens de pacientes, documentos, anamneses e agendamentos (RN54, RN56)
    const cardInspecao = await screen.findByTestId("card-inspecao-backup");
    expect(cardInspecao).toBeInTheDocument();
    expect(screen.getByTestId("inspecao-data-backup")).toHaveTextContent(
      "05/11/2026 às 18:30",
    );
    expect(screen.getByTestId("inspecao-qtd-pacientes")).toHaveTextContent(
      "12",
    );
    expect(screen.getByTestId("inspecao-qtd-documentos")).toHaveTextContent(
      "5",
    );
    expect(screen.getByTestId("inspecao-qtd-anamneses")).toHaveTextContent("4");
    expect(screen.getByTestId("inspecao-qtd-agendamentos")).toHaveTextContent(
      "6",
    );

    // 5. Clicar em "Restaurar este backup" abre diálogo de confirmação avisando sobre substituição e cópia automática prévia (RN54)
    fireEvent.click(screen.getByTestId("botao-abrir-confirmacao-restaurar"));
    expect(
      await screen.findByRole("dialog", {
        name: "Confirmar restauração de backup",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Sim, substituir dados e restaurar/i,
      }),
    );

    await waitFor(() => {
      expect(restaurarSpy).toHaveBeenCalledWith({
        caminho: "D:/Backups/backup-pacientes-2026-11-05-1830.lotusbackup",
        senha: CHAVE_RECUPERACAO_TESTE,
        conteudo_base64: null,
      });
    });

    expect(
      await screen.findByText(
        /Backup restaurado com sucesso \(12 paciente\(s\) e 5 documento\(s\)\)/i,
      ),
    ).toBeInTheDocument();
  });

  it("preenche caminho padrão na pasta Downloads ao abrir modal de backup e permite selecionar pasta nativa pelo botão Escolher pasta...", async () => {
    vi.spyOn(api, "configObter").mockResolvedValue(null);
    const obterPadraoSpy = vi
      .spyOn(api, "backupObterCaminhoPadrao")
      .mockResolvedValue(
        "/home/felipe/Downloads/backup-pacientes-2026-11-06-2130.lotusbackup",
      );
    const selecionarDestinoSpy = vi
      .spyOn(api, "backupSelecionarDestino")
      .mockResolvedValue(
        "/media/felipe/PENDRIVE/backup-pacientes-2026-11-06-2130.lotusbackup",
      );

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^Fazer backup agora$/i }),
    );

    await waitFor(() => {
      expect(obterPadraoSpy).toHaveBeenCalled();
    });

    const inputDestino = await screen.findByTestId(
      "campo-caminho-destino-backup-config",
    );
    expect(inputDestino).toHaveValue(
      "/home/felipe/Downloads/backup-pacientes-2026-11-06-2130.lotusbackup",
    );

    // Clicar em "Escolher pasta..." abre a seleção nativa
    const botaoEscolherPasta = screen.getByTestId(
      "botao-escolher-pasta-backup-config",
    );
    fireEvent.click(botaoEscolherPasta);

    await waitFor(() => {
      expect(selecionarDestinoSpy).toHaveBeenCalledWith(
        "/home/felipe/Downloads/backup-pacientes-2026-11-06-2130.lotusbackup",
      );
    });

    await waitFor(() => {
      expect(inputDestino).toHaveValue(
        "/media/felipe/PENDRIVE/backup-pacientes-2026-11-06-2130.lotusbackup",
      );
    });
  });

  it("valida campos ao trocar a senha mestra, rejeita senha curta, senha diferente e chama authChangePassword com sucesso (F8-T1 — RN07, RN08)", async () => {
    vi.spyOn(api, "configObter").mockResolvedValue(null);
    const changePasswordSpy = vi
      .spyOn(api, "authChangePassword")
      .mockResolvedValue(undefined);

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    const campoAtual = await screen.findByTestId("campo-senha-atual");
    const campoNova = screen.getByTestId("campo-nova-senha");
    const campoConfirmar = screen.getByTestId("campo-confirmar-nova-senha");
    const botaoSalvar = screen.getByTestId("botao-salvar-nova-senha");

    // 1. Tentar salvar sem senha atual
    fireEvent.click(botaoSalvar);
    expect(
      await screen.findByText("Informe a sua senha atual."),
    ).toBeInTheDocument();

    // 2. Tentar salvar com nova senha menor que 8 caracteres
    fireEvent.change(campoAtual, { target: { value: "senhaAtual123" } });
    fireEvent.change(campoNova, { target: { value: "12345" } });
    fireEvent.click(botaoSalvar);
    expect(
      await screen.findByText("A nova senha deve ter no mínimo 8 caracteres."),
    ).toBeInTheDocument();

    // 3. Tentar salvar com confirmação diferente
    fireEvent.change(campoNova, { target: { value: "novaSenhaSegura123" } });
    fireEvent.change(campoConfirmar, { target: { value: "outraSenhaIncorreta" } });
    fireEvent.click(botaoSalvar);
    expect(
      await screen.findByText("A confirmação da nova senha não confere."),
    ).toBeInTheDocument();

    // 4. Salvar com sucesso
    fireEvent.change(campoConfirmar, {
      target: { value: "novaSenhaSegura123" },
    });
    fireEvent.click(botaoSalvar);

    await waitFor(() => {
      expect(changePasswordSpy).toHaveBeenCalledWith(
        "senhaAtual123",
        "novaSenhaSegura123",
      );
    });

    expect(
      await screen.findByText("Senha alterada com sucesso."),
    ).toBeInTheDocument();
  });

  it("exibe erro amigável ao tentar trocar senha com a senha atual incorreta (F8-T1 — RN07, RN08)", async () => {
    vi.spyOn(api, "configObter").mockResolvedValue(null);
    vi.spyOn(api, "authChangePassword").mockRejectedValue({
      codigo: "SENHA_INCORRETA",
      mensagem: "Senha incorreta.",
    });

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    const campoAtual = await screen.findByTestId("campo-senha-atual");
    const campoNova = screen.getByTestId("campo-nova-senha");
    const campoConfirmar = screen.getByTestId("campo-confirmar-nova-senha");
    const botaoSalvar = screen.getByTestId("botao-salvar-nova-senha");

    fireEvent.change(campoAtual, { target: { value: "senhaErrada" } });
    fireEvent.change(campoNova, { target: { value: "novaSenha123" } });
    fireEvent.change(campoConfirmar, { target: { value: "novaSenha123" } });
    fireEvent.click(botaoSalvar);

    expect(
      await screen.findByText("Senha incorreta."),
    ).toBeInTheDocument();
  });

  it("gerencia categorias de documentos: lista, cria, renomeia e exclui categoria vazia conforme RN41 (F8-T1 — RN41)", async () => {
    vi.spyOn(api, "configObter").mockResolvedValue(null);

    const categoriasMock = [
      { id: "cat-modelos", nome: "Modelos", ordem: 1, total_documentos: 2 },
      { id: "cat-outros", nome: "Outros", ordem: 2, total_documentos: 0 },
    ];

    const listarSpy = vi
      .spyOn(api, "categoriasListar")
      .mockResolvedValue(categoriasMock);
    const criarSpy = vi.spyOn(api, "categoriaCriar").mockResolvedValue({
      id: "cat-relatorios",
      nome: "Relatórios",
      ordem: 3,
      total_documentos: 0,
    });
    const renomearSpy = vi.spyOn(api, "categoriaRenomear").mockResolvedValue({
      id: "cat-outros",
      nome: "Geral",
      ordem: 2,
      total_documentos: 0,
    });
    const excluirSpy = vi
      .spyOn(api, "categoriaExcluir")
      .mockResolvedValue(undefined);

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    // 1. Lista categorias existentes
    expect(listarSpy).toHaveBeenCalled();
    expect(await screen.findByText("Modelos")).toBeInTheDocument();
    expect(screen.getByText("2 documentos vinculados")).toBeInTheDocument();
    expect(screen.getByText("Outros")).toBeInTheDocument();
    expect(screen.getByText("0 documentos vinculados")).toBeInTheDocument();

    // Categoria com documentos deve ter botão excluir desabilitado (RN41)
    const botaoExcluirModelos = screen.getByTestId(
      "botao-excluir-categoria-cat-modelos",
    );
    expect(botaoExcluirModelos).toBeDisabled();

    // 2. Criar nova categoria
    const campoNovaCat = screen.getByTestId("campo-nova-categoria");
    fireEvent.change(campoNovaCat, { target: { value: "Relatórios" } });
    fireEvent.click(screen.getByTestId("botao-criar-categoria"));

    await waitFor(() => {
      expect(criarSpy).toHaveBeenCalledWith("Relatórios");
    });
    expect(
      await screen.findByText('Categoria "Relatórios" criada com sucesso.'),
    ).toBeInTheDocument();

    // 3. Renomear categoria
    fireEvent.click(screen.getByTestId("botao-renomear-categoria-cat-outros"));
    const campoEditar = await screen.findByTestId("campo-editar-nome-categoria");
    expect(campoEditar).toHaveValue("Outros");
    fireEvent.change(campoEditar, { target: { value: "Geral" } });
    fireEvent.click(screen.getByTestId("confirmar-renomear-categoria"));

    await waitFor(() => {
      expect(renomearSpy).toHaveBeenCalledWith("cat-outros", "Geral");
    });
    expect(
      await screen.findByText('Categoria renomeada para "Geral".'),
    ).toBeInTheDocument();

    // 4. Excluir categoria vazia
    const botaoExcluirOutros = screen.getByTestId(
      "botao-excluir-categoria-cat-outros",
    );
    expect(botaoExcluirOutros).not.toBeDisabled();
    fireEvent.click(botaoExcluirOutros);

    // Confirmação de exclusão
    expect(
      await screen.findByRole("dialog", {
        name: "Excluir categoria de documento",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Sim, excluir categoria" }),
    );

    await waitFor(() => {
      expect(excluirSpy).toHaveBeenCalledWith("cat-outros");
    });
    expect(
      await screen.findByText('Categoria "Outros" excluída.'),
    ).toBeInTheDocument();
  });

  it("exibe informações da seção Sobre o Sistema e Segurança com dados da profissional e criptografia (F8-T1)", async () => {
    vi.spyOn(api, "configObter").mockResolvedValue(null);
    vi.spyOn(api, "categoriasListar").mockResolvedValue([]);

    render(
      <MemoryRouter
        initialEntries={["/configuracoes"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Configuracoes />
      </MemoryRouter>,
    );

    const secaoSobre = await screen.findByTestId("secao-config-sobre");
    expect(secaoSobre).toBeInTheDocument();
    expect(secaoSobre).toHaveTextContent("LotusPsi — Sistema de Gestão Clínica e Prontuário");
    expect(secaoSobre).toHaveTextContent("CRP 00/00000");
    expect(secaoSobre).toHaveTextContent("Versão 1.0.0");
    expect(secaoSobre).toHaveTextContent("100% Offline e Privativo");
    expect(secaoSobre).toHaveTextContent("SQLCipher");
    expect(secaoSobre).toHaveTextContent("Argon2id");
    expect(secaoSobre).toHaveTextContent("Resolução CFP 01/2009");
  });
});
