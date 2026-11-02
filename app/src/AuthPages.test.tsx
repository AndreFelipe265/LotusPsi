import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./lib/api";
import { Login } from "./pages/Login";
import { PrimeiroAcesso } from "./pages/PrimeiroAcesso";
import { Recuperar } from "./pages/Recuperar";

describe("Telas de autenticação T01, T02 e T03 (F1-T5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("T01 (PrimeiroAcesso): mostra sugestão, indicador de força, exibe/imprime chave e exige os 4 últimos caracteres (RN01 e RN02)", async () => {
    const aoConcluir = vi.fn();
    vi.spyOn(api, "authSetup").mockResolvedValue({
      chave_recuperacao: "ABCD-EFGH-JKLM-NPQR-STVW-XYZ2",
    });
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(<PrimeiroAcesso aoConcluir={aoConcluir} />);

    // Verifica sugestão de frase e indicador de força (RN01)
    expect(screen.getByText(/CafeComBoloDeMilho2026/i)).toBeInTheDocument();

    const inputSenha = screen.getByLabelText(/Criar senha mestra/i);
    const inputConfirmar = screen.getByLabelText(/Confirmar senha mestra/i);

    fireEvent.change(inputSenha, { target: { value: "curta" } });
    expect(screen.getByTestId("indicador-forca-senha")).toHaveTextContent(
      /Muito curta/i,
    );

    fireEvent.change(inputSenha, {
      target: { value: "CafeComBoloDeMilho2026!" },
    });
    expect(screen.getByTestId("indicador-forca-senha")).toHaveTextContent(
      /Força: Forte/i,
    );

    fireEvent.change(inputConfirmar, {
      target: { value: "CafeComBoloDeMilho2026!" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Criar senha e continuar/i }),
    );

    // Exibe a chave de recuperação e o aviso obrigatório (RN02)
    await waitFor(() => {
      expect(screen.getByTestId("chave-recuperacao-valor")).toHaveTextContent(
        "ABCD-EFGH-JKLM-NPQR-STVW-XYZ2",
      );
    });
    expect(
      screen.getByText(
        /Sem a senha e sem esta chave, os dados não poderão ser recuperados\./i,
      ),
    ).toBeInTheDocument();

    // Testa botão de impressão
    fireEvent.click(
      screen.getByRole("button", { name: /Imprimir chave de recuperação/i }),
    );
    expect(printSpy).toHaveBeenCalledTimes(1);

    // Botão de concluir fica desabilitado até digitar os 4 últimos caracteres ("XYZ2")
    const botaoConcluir = screen.getByRole("button", {
      name: /Confirmar que guardei a chave e entrar/i,
    });
    expect(botaoConcluir).toBeDisabled();

    const inputUltimos4 = screen.getByLabelText(/4 últimos caracteres/i);
    fireEvent.change(inputUltimos4, { target: { value: "AAAA" } });
    expect(botaoConcluir).toBeDisabled();

    fireEvent.change(inputUltimos4, { target: { value: "xyz2" } });
    expect(botaoConcluir).not.toBeDisabled();

    fireEvent.click(botaoConcluir);
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("T02 (Login): mostra erro genérico 'Senha incorreta' e aviso de bloqueio temporário (RN03, RN04, RN08)", async () => {
    const aoEntrar = vi.fn();
    const aoIrParaRecuperar = vi.fn();

    const loginSpy = vi
      .spyOn(api, "authLogin")
      .mockRejectedValueOnce({
        codigo: "SENHA_INCORRETA",
        mensagem: "Senha incorreta",
      })
      .mockRejectedValueOnce({
        codigo: "LOGIN_BLOQUEADO_TEMPORARIAMENTE",
        mensagem: "Muitas tentativas incorretas. Tente novamente em 5 min.",
      })
      .mockResolvedValueOnce(undefined);

    render(<Login aoEntrar={aoEntrar} aoIrParaRecuperar={aoIrParaRecuperar} />);

    const inputSenha = screen.getByLabelText(/Senha de acesso/i);
    const botaoEntrar = screen.getByRole("button", { name: /Entrar/i });

    // 1. Senha incorreta mostra mensagem genérica
    fireEvent.change(inputSenha, { target: { value: "errada1" } });
    fireEvent.click(botaoEntrar);

    await waitFor(() => {
      expect(screen.getByTestId("erro-login")).toHaveTextContent(
        "Senha incorreta",
      );
    });

    // 2. Bloqueio temporário exibe alerta destacado
    fireEvent.change(inputSenha, { target: { value: "errada5" } });
    fireEvent.click(botaoEntrar);

    await waitFor(() => {
      expect(screen.getByTestId("aviso-bloqueio-temporario")).toHaveTextContent(
        "Muitas tentativas incorretas. Tente novamente em 5 min.",
      );
    });

    // 3. Sucesso chama aoEntrar
    fireEvent.change(inputSenha, { target: { value: "SenhaCorreta123" } });
    fireEvent.click(botaoEntrar);

    await waitFor(() => {
      expect(aoEntrar).toHaveBeenCalledTimes(1);
    });
    expect(loginSpy).toHaveBeenCalledTimes(3);

    // 4. Botão "Esqueci a senha" navega para T03
    fireEvent.click(screen.getByRole("button", { name: /Esqueci a senha/i }));
    expect(aoIrParaRecuperar).toHaveBeenCalledTimes(1);
  });

  it("T03 (Recuperar): valida chave de recuperação e redefine a senha (RN07)", async () => {
    const aoRecuperarComSucesso = vi.fn();
    const aoVoltarParaLogin = vi.fn();
    const recoverSpy = vi
      .spyOn(api, "authRecover")
      .mockResolvedValue(undefined);

    render(
      <Recuperar
        aoRecuperarComSucesso={aoRecuperarComSucesso}
        aoVoltarParaLogin={aoVoltarParaLogin}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Chave de recuperação/i), {
      target: { value: "ABCD-EFGH-JKLM-NPQR-STVW-XYZ2" },
    });
    fireEvent.change(screen.getByLabelText(/Nova senha mestra/i), {
      target: { value: "NovaSenhaSegura2026" },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar nova senha/i), {
      target: { value: "NovaSenhaSegura2026" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Redefinir senha e entrar/i }),
    );

    await waitFor(() => {
      expect(recoverSpy).toHaveBeenCalledWith(
        "ABCD-EFGH-JKLM-NPQR-STVW-XYZ2",
        "NovaSenhaSegura2026",
      );
      expect(aoRecuperarComSucesso).toHaveBeenCalledTimes(1);
    });
  });
});
