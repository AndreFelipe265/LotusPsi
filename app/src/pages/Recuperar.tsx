import React, { useState } from "react";
import logoLc from "../assets/logo-lc.svg";
import { authRecover, extrairErroApi } from "../lib/api";
import { calcularForcaSenha } from "../lib/format";

export interface RecuperarProps {
  aoRecuperarComSucesso: () => void;
  aoVoltarParaLogin: () => void;
}

export function Recuperar({
  aoRecuperarComSucesso,
  aoVoltarParaLogin,
}: RecuperarProps) {
  const [chave, setChave] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const forca = calcularForcaSenha(novaSenha);

  async function lidarComRecuperacao(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!chave.trim()) {
      setErro("Digite a chave de recuperação de 24 caracteres.");
      return;
    }

    if (novaSenha.length < 8) {
      setErro("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }

    if (novaSenha !== confirmacaoSenha) {
      setErro("As senhas digitadas não conferem.");
      return;
    }

    setCarregando(true);
    try {
      await authRecover(chave, novaSenha);
      setChave("");
      setNovaSenha("");
      setConfirmacaoSenha("");
      aoRecuperarComSucesso();
    } catch (err) {
      const apiErr = extrairErroApi(err);
      setErro(apiErr.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-fundo text-texto flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-fundo-claro border border-rosa-claro rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <img
            src={logoLc}
            alt="Logo LC — Louriedna Costa Pereira"
            className="w-24 h-auto select-none"
          />
          <h1 className="text-2xl font-bold text-malva">Recuperar acesso</h1>
          <p className="text-base text-texto">
            Digite a chave de recuperação em papel (24 caracteres) e escolha uma
            nova senha mestra.
          </p>
        </div>

        <form onSubmit={lidarComRecuperacao} className="space-y-4">
          <div>
            <label
              htmlFor="chave-recuperacao-input"
              className="block text-base font-semibold text-texto mb-1"
            >
              Chave de recuperação (24 caracteres)
            </label>
            <input
              id="chave-recuperacao-input"
              type="text"
              value={chave}
              onChange={(e) => {
                setChave(e.target.value);
                setErro(null);
              }}
              placeholder="ABCD-EFGH-JKLM-NPQR-STVW-XYZ2"
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>

          <div>
            <label
              htmlFor="nova-senha-recuperacao"
              className="block text-base font-semibold text-texto mb-1"
            >
              Nova senha mestra (mínimo de 8 caracteres)
            </label>
            <input
              id="nova-senha-recuperacao"
              type="password"
              value={novaSenha}
              onChange={(e) => {
                setNovaSenha(e.target.value);
                setErro(null);
              }}
              placeholder="Digite a nova senha"
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
            <p className="mt-1 text-base text-lilas-acinzentado font-semibold">
              {forca.rotulo}
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmar-nova-senha-recuperacao"
              className="block text-base font-semibold text-texto mb-1"
            >
              Confirmar nova senha
            </label>
            <input
              id="confirmar-nova-senha-recuperacao"
              type="password"
              value={confirmacaoSenha}
              onChange={(e) => {
                setConfirmacaoSenha(e.target.value);
                setErro(null);
              }}
              placeholder="Repita a nova senha"
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>

          {erro && (
            <p
              role="alert"
              data-testid="erro-recuperacao"
              className="text-base font-semibold text-malva"
            >
              {erro}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={aoVoltarParaLogin}
              className="flex-1 py-3.5 px-6 rounded-xl bg-rosa text-texto font-semibold text-base hover:opacity-90 transition"
            >
              Voltar para o login
            </button>
            <button
              type="submit"
              disabled={carregando}
              className="flex-1 py-3.5 px-6 rounded-xl bg-malva text-white font-semibold text-base hover:opacity-95 disabled:opacity-50 transition"
            >
              {carregando ? "Redefinindo..." : "Redefinir senha e entrar"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
