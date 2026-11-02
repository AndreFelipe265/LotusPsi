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
});
