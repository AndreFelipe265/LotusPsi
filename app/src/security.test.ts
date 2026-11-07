import { describe, expect, it } from "vitest";
import tauriConfig from "../src-tauri/tauri.conf.json";
import defaultCapability from "../src-tauri/capabilities/default.json";

describe("Segurança do Tauri (F0-T2)", () => {
  it("possui CSP restritiva sem carregamento remoto", () => {
    const csp = tauriConfig.app?.security?.csp;
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    // Verifica que não há origens HTTP/HTTPS irrestritas
    expect(csp).not.toContain("http://*");
    expect(csp).not.toContain("https://*");
  });

  it("não possui permissões de rede/HTTP nem acesso direto a fs externo nas capabilities", () => {
    const permissions = defaultCapability.permissions;
    expect(permissions).toEqual(["core:default"]);
    for (const perm of permissions) {
      expect(perm).not.toContain("http");
      expect(perm).not.toContain("network");
    }
  });

  it("desabilita devtools para release na configuração da janela", () => {
    const mainWindow = tauriConfig.app?.windows?.[0];
    expect(mainWindow).toBeDefined();
    expect(mainWindow.devtools).toBe(false);
  });

  it("configura identidade visual, nome LotusPsi e assets de ícones para janela e barra de tarefas (F8-T4)", () => {
    expect(tauriConfig.productName).toBe("LotusPsi");
    const mainWindow = tauriConfig.app?.windows?.[0];
    expect(mainWindow?.title).toBe("LotusPsi");

    const icones = tauriConfig.bundle?.icon;
    expect(icones).toBeDefined();
    expect(icones).toContain("icons/32x32.png");
    expect(icones).toContain("icons/128x128.png");
    expect(icones).toContain("icons/128x128@2x.png");
    expect(icones).toContain("icons/icon.icns");
    expect(icones).toContain("icons/icon.ico");
    expect(icones).toContain("icons/icon.png");

    // Configuração do instalador Windows final (F9-T4): ícone LC, idioma pt-BR e instalação por usuário
    expect(tauriConfig.bundle?.windows?.nsis?.installerIcon).toBe(
      "icons/icon.ico",
    );
    expect(tauriConfig.bundle?.windows?.nsis?.languages).toContain(
      "PortugueseBR",
    );
    expect(tauriConfig.bundle?.windows?.nsis?.installMode).toBe("currentUser");
  });
});
