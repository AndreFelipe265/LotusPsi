import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
import { themeColors } from "./lib/theme";

describe("App e identidade visual (F0-T1)", () => {
  it("renderiza o título principal e identificação da profissional em pt-BR", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /LC Pacientes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Louriedna Costa Pereira/i)).toBeInTheDocument();
    expect(screen.getByText(/CRP 03\/29434/i)).toBeInTheDocument();
  });

  it("configura todos os tokens de cor da seção 4 da Fonte da Verdade no Tailwind", () => {
    expect(themeColors.rosa).toBe("#E599A6");
    expect(themeColors.malva).toBe("#AC6E87");
    expect(themeColors["lilas-acinzentado"]).toBe("#92798F");
    expect(themeColors["rosa-claro"]).toBe("#E9BFD5");
    expect(themeColors.fundo.DEFAULT).toBe("#FBF7F9");
    expect(themeColors.fundo.claro).toBe("#FFFFFF");
    expect(themeColors.texto).toBe("#3A2E36");
  });
});
