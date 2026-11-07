import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Documentos } from "./Documentos";
import * as api from "../lib/api";
import type { CategoriaDocumento, Documento } from "../lib/types";

describe("Tela T09 — Documentos (F6-T4 — RN40–RN48)", () => {
  const categoriasMock: CategoriaDocumento[] = [
    { id: "cat-1", nome: "Modelos", ordem: 1, total_documentos: 2 },
    { id: "cat-2", nome: "Administrativo", ordem: 2, total_documentos: 1 },
    { id: "cat-3", nome: "Outros", ordem: 3, total_documentos: 0 },
  ];

  const documentosMock: Documento[] = [
    {
      id: "doc-1",
      categoria_id: "cat-1",
      categoria_nome: "Modelos",
      nome_original: "Contrato_Terapeutico.pdf",
      descricao: "Contrato padrão para novos pacientes",
      mime: "application/pdf",
      tamanho_bytes: 1024 * 50,
      sha256: "sha-1",
      enviado_em: "2026-11-01T10:00:00Z",
      atualizado_em: "2026-11-01T10:00:00Z",
    },
    {
      id: "doc-2",
      categoria_id: "cat-1",
      categoria_nome: "Modelos",
      nome_original: "Ficha_Cadastral.docx",
      descricao: null,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      tamanho_bytes: 1024 * 25,
      sha256: "sha-2",
      enviado_em: "2026-10-25T14:30:00Z",
      atualizado_em: "2026-10-25T14:30:00Z",
    },
    {
      id: "doc-3",
      categoria_id: "cat-2",
      categoria_nome: "Administrativo",
      nome_original: "Recibo_Outubro.pdf",
      descricao: "Recibo consolidado",
      mime: "application/pdf",
      tamanho_bytes: 1024 * 100,
      sha256: "sha-3",
      enviado_em: "2026-10-31T18:00:00Z",
      atualizado_em: "2026-10-31T18:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "categoriasListar").mockResolvedValue(categoriasMock);
    vi.spyOn(api, "documentosListar").mockResolvedValue(documentosMock);
  });

  it("renderiza lista com abas de categorias, contagem e busca", async () => {
    render(<Documentos />);

    expect(await screen.findByRole("heading", { name: "Documentos" })).toBeInTheDocument();

    // Abas de categorias
    expect(screen.getByTestId("aba-categoria-todas")).toBeInTheDocument();
    expect(screen.getByTestId("aba-categoria-cat-1")).toHaveTextContent("Modelos (2)");
    expect(screen.getByTestId("aba-categoria-cat-2")).toHaveTextContent("Administrativo (1)");
    expect(screen.getByTestId("aba-categoria-cat-3")).toHaveTextContent("Outros (0)");

    // Lista de documentos
    expect(screen.getByText("Contrato_Terapeutico.pdf")).toBeInTheDocument();
    expect(screen.getByText("Ficha_Cadastral.docx")).toBeInTheDocument();
    expect(screen.getByText("Recibo_Outubro.pdf")).toBeInTheDocument();
    expect(screen.getByText("Contrato padrão para novos pacientes")).toBeInTheDocument();

    // Filtra ao clicar na aba
    vi.spyOn(api, "documentosListar").mockResolvedValue([documentosMock[2]]);
    fireEvent.click(screen.getByTestId("aba-categoria-cat-2"));

    await waitFor(() => {
      expect(api.documentosListar).toHaveBeenCalledWith({
        busca: undefined,
        categoria_id: "cat-2",
      });
    });
  });

  it("permite abrir, baixar, editar e excluir documento (RN46)", async () => {
    const spyAbrir = vi.spyOn(api, "documentoAbrir").mockResolvedValue("/tmp/aberto.pdf");
    const spyBaixar = vi.spyOn(api, "documentoBaixar").mockResolvedValue("/home/user/Downloads/Contrato_Terapeutico.pdf");
    const spyAtualizar = vi.spyOn(api, "documentoAtualizar").mockResolvedValue({
      ...documentosMock[0],
      nome_original: "Contrato_Editado.pdf",
    });
    const spyExcluir = vi.spyOn(api, "documentoExcluir").mockResolvedValue();

    render(<Documentos />);
    await screen.findByText("Contrato_Terapeutico.pdf");

    // 1. Abrir
    fireEvent.click(screen.getByRole("button", { name: /Abrir Contrato_Terapeutico\.pdf/i }));
    await waitFor(() => {
      expect(spyAbrir).toHaveBeenCalledWith("doc-1");
    });

    // 2. Baixar
    fireEvent.click(screen.getByRole("button", { name: /Baixar Contrato_Terapeutico\.pdf/i }));
    expect(screen.getByRole("heading", { name: /Baixar cópia do documento/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("botao-confirmar-baixar-documento"));
    await waitFor(() => {
      expect(spyBaixar).toHaveBeenCalledWith("doc-1", null);
    });

    // 3. Editar
    fireEvent.click(screen.getByRole("button", { name: /Editar Contrato_Terapeutico\.pdf/i }));
    expect(screen.getByRole("heading", { name: /Editar documento/i })).toBeInTheDocument();
    const inputNome = screen.getByLabelText(/Nome do documento/i);
    fireEvent.change(inputNome, { target: { value: "Contrato_Editado.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/i }));
    await waitFor(() => {
      expect(spyAtualizar).toHaveBeenCalledWith("doc-1", {
        nome_original: "Contrato_Editado.pdf",
        categoria_id: "cat-1",
        descricao: "Contrato padrão para novos pacientes",
      });
    });

    // 4. Excluir com diálogo de confirmação
    fireEvent.click(screen.getByRole("button", { name: /Excluir Contrato_Terapeutico\.pdf/i }));
    expect(screen.getByRole("heading", { name: /Excluir documento/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Sim, excluir documento/i }));
    await waitFor(() => {
      expect(spyExcluir).toHaveBeenCalledWith("doc-1");
    });
  });

  it("permite gerenciar categorias: criar, renomear e excluir vazia (RN41)", async () => {
    const spyCriar = vi.spyOn(api, "categoriaCriar").mockResolvedValue({
      id: "cat-4",
      nome: "Laudos",
      ordem: 4,
      total_documentos: 0,
    });
    const spyRenomear = vi.spyOn(api, "categoriaRenomear").mockResolvedValue({
      ...categoriasMock[0],
      nome: "Modelos 2026",
    });
    const spyExcluir = vi.spyOn(api, "categoriaExcluir").mockResolvedValue();

    render(<Documentos />);
    await screen.findByText("Contrato_Terapeutico.pdf");

    fireEvent.click(screen.getByRole("button", { name: /Gerenciar categorias/i }));
    expect(screen.getByRole("heading", { name: /Gerenciar categorias/i })).toBeInTheDocument();

    // Criar categoria
    const inputNova = screen.getByLabelText(/Nova categoria/i);
    fireEvent.change(inputNova, { target: { value: "Laudos" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar categoria/i }));
    await waitFor(() => {
      expect(spyCriar).toHaveBeenCalledWith("Laudos");
    });

    // Renomear categoria
    const botoesRenomear = screen.getAllByRole("button", { name: /Renomear/i });
    fireEvent.click(botoesRenomear[0]);
    const inputNovoNome = screen.getByLabelText(/Novo nome da categoria/i);
    fireEvent.change(inputNovoNome, { target: { value: "Modelos 2026" } });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/i }));
    await waitFor(() => {
      expect(spyRenomear).toHaveBeenCalledWith("cat-1", "Modelos 2026");
    });

    // Excluir categoria vazia (Outros possui 0 docs e botão ativo; Modelos tem 2 e está desabilitado)
    const botoesExcluir = screen.getAllByRole("button", { name: /^Excluir$/i });
    expect(botoesExcluir[0]).toBeDisabled(); // cat-1 (Modelos tem 2 docs)
    expect(botoesExcluir[2]).not.toBeDisabled(); // cat-3 (Outros tem 0 docs)

    fireEvent.click(botoesExcluir[2]);
    await waitFor(() => {
      expect(spyExcluir).toHaveBeenCalledWith("cat-3");
    });
  });

  it("permite envio com seleção de arquivo e arrastar e soltar (RN42, RN44)", async () => {
    const spyEnviar = vi.spyOn(api, "documentoEnviar").mockResolvedValue(documentosMock[0]);

    render(<Documentos />);
    await screen.findByText("Contrato_Terapeutico.pdf");

    // Simula soltar arquivo na zona de drag & drop
    const zonaDrop = screen.getByTestId("zona-arrastar-documento");
    const fakeFile = new File(["%PDF-1.7..."], "declaracao.pdf", { type: "application/pdf" });

    fireEvent.drop(zonaDrop, {
      dataTransfer: {
        files: [fakeFile],
      },
    });

    // Deve abrir o modal de envio com o arquivo selecionado
    expect(await screen.findByRole("heading", { name: /Enviar documento/i })).toBeInTheDocument();
    expect(screen.getByText("declaracao.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("botao-confirmar-envio-documento"));
    await waitFor(() => {
      expect(spyEnviar).toHaveBeenCalled();
    });
  });
});
