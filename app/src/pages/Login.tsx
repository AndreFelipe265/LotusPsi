import React, { useState } from "react";
import logoLotusPsi from "../assets/logo-lotuspsi.svg";
import { authLogin, extrairErroApi } from "../lib/api";

export interface LoginProps {
  aoEntrar: () => void;
  aoIrParaRecuperar: () => void;
  bloqueadoMinutosIniciais?: number | null;
  modoOverlay?: boolean;
}

export function Login({
  aoEntrar,
  aoIrParaRecuperar,
  bloqueadoMinutosIniciais = null,
  modoOverlay = false,
}: LoginProps) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueadoMensagem, setBloqueadoMensagem] = useState<string | null>(
    bloqueadoMinutosIniciais && bloqueadoMinutosIniciais > 0
      ? `Muitas tentativas incorretas. Tente novamente em ${bloqueadoMinutosIniciais} min.`
      : null,
  );
  const [carregando, setCarregando] = useState(false);

  async function lidarComSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!senha) {
      setErro("Digite sua senha para entrar.");
      return;
    }

    setCarregando(true);
    try {
      await authLogin(senha);
      setSenha("");
      setBloqueadoMensagem(null);
      aoEntrar();
    } catch (err) {
      const apiErr = extrairErroApi(err);
      if (apiErr.codigo === "LOGIN_BLOQUEADO_TEMPORARIAMENTE") {
        setBloqueadoMensagem(apiErr.mensagem);
        setErro(null);
      } else {
        setErro("Senha incorreta");
      }
    } finally {
      setCarregando(false);
    }
  }

  const cardConteudo = (
    <div className="max-w-md w-full bg-fundo-claro border border-rosa-claro rounded-2xl shadow-sm p-8 space-y-6">
      <div className="flex flex-col items-center text-center space-y-2">
        <img
          src={logoLotusPsi}
          alt="Logo LotusPsi"
          className="w-28 h-auto select-none"
        />
        <h1 className="text-2xl font-bold text-malva">LotusPsi</h1>
        <p className="text-base text-lilas-acinzentado">
          Psicóloga Clínica · CRP 00/00000
        </p>
        {modoOverlay && (
          <p className="text-base font-semibold text-texto pt-1">
            Sessão bloqueada por segurança. Digite sua senha para continuar de
            onde parou.
          </p>
        )}
      </div>

      {bloqueadoMensagem && (
        <div
          role="alert"
          data-testid="aviso-bloqueio-temporario"
          className="bg-rosa-claro/40 border border-malva rounded-xl p-4 text-base text-texto font-semibold text-center"
        >
          {bloqueadoMensagem}
        </div>
      )}

      <form onSubmit={lidarComSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="campo-senha-login"
            className="block text-base font-semibold text-texto mb-1"
          >
            Senha de acesso
          </label>
          <input
            id="campo-senha-login"
            type="password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setErro(null);
            }}
            placeholder="Digite sua senha"
            className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
          />
        </div>

        {erro && (
          <p
            role="alert"
            data-testid="erro-login"
            className="text-base font-semibold text-malva"
          >
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={carregando}
          className="w-full py-3.5 px-6 rounded-xl bg-malva text-white font-semibold text-base hover:opacity-95 disabled:opacity-50 transition"
        >
          {carregando ? "Verificando..." : "Entrar"}
        </button>
      </form>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={aoIrParaRecuperar}
          className="px-4 py-2 rounded-lg text-base font-semibold text-malva hover:bg-rosa-claro/30 transition"
        >
          Esqueci a senha
        </button>
      </div>
    </div>
  );

  if (modoOverlay) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sessão bloqueada"
        className="fixed inset-0 z-50 bg-fundo/95 backdrop-blur-sm flex flex-col items-center justify-center p-6"
      >
        {cardConteudo}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-fundo text-texto flex flex-col items-center justify-center p-6">
      {cardConteudo}
    </main>
  );
}
