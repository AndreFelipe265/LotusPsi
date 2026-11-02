import React, { useState } from "react";
import logoLc from "../assets/logo-lc.svg";
import { authSetup, extrairErroApi } from "../lib/api";
import { calcularForcaSenha } from "../lib/format";

export interface PrimeiroAcessoProps {
  aoConcluir: () => void;
}

export function PrimeiroAcesso({ aoConcluir }: PrimeiroAcessoProps) {
  const [senha, setSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [chaveRecuperacao, setChaveRecuperacao] = useState<string | null>(null);
  const [ultimosQuatroDigitados, setUltimosQuatroDigitados] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const forca = calcularForcaSenha(senha);

  async function lidarComCriacaoSenha(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    if (senha !== confirmacaoSenha) {
      setErro("As senhas digitadas não conferem.");
      return;
    }

    setCarregando(true);
    try {
      const resposta = await authSetup(senha);
      setChaveRecuperacao(resposta.chave_recuperacao);
      setSenha("");
      setConfirmacaoSenha("");
    } catch (err) {
      const apiErr = extrairErroApi(err);
      setErro(apiErr.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  function lidarComImpressao() {
    window.print();
  }

  function lidarComConfirmacaoChave(e: React.FormEvent) {
    e.preventDefault();
    if (!chaveRecuperacao) return;

    const limpa = chaveRecuperacao.replace(/-/g, "").toUpperCase();
    const ultimos4Esperados = limpa.slice(-4);
    const digitado = ultimosQuatroDigitados.trim().toUpperCase();

    if (digitado !== ultimos4Esperados) {
      setErro(
        "Os 4 últimos caracteres não conferem com a chave exibida acima.",
      );
      return;
    }

    setErro(null);
    aoConcluir();
  }

  if (chaveRecuperacao) {
    const limpa = chaveRecuperacao.replace(/-/g, "").toUpperCase();
    const ultimos4Esperados = limpa.slice(-4);
    const confirmacaoValida =
      ultimosQuatroDigitados.trim().toUpperCase() === ultimos4Esperados;

    return (
      <main className="min-h-screen bg-fundo text-texto flex flex-col items-center justify-center p-6">
        <div className="max-w-xl w-full bg-fundo-claro border border-rosa-claro rounded-2xl shadow-sm p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <img
              src={logoLc}
              alt="Logo LC — Louriedna Costa Pereira"
              className="w-24 h-auto select-none"
            />
            <h1 className="text-2xl font-bold text-malva">
              Chave de recuperação em papel
            </h1>
            <p className="text-base text-texto">
              Guarde esta chave em um local seguro (impressa ou anotada no
              papel).
            </p>
          </div>

          <div
            role="alert"
            className="bg-rosa-claro/40 border border-malva rounded-xl p-4 text-base text-texto font-semibold text-center"
          >
            Sem a senha e sem esta chave, os dados não poderão ser recuperados.
          </div>

          <div className="bg-fundo border-2 border-malva rounded-xl p-5 text-center space-y-3">
            <p className="text-base text-lilas-acinzentado font-semibold">
              Sua chave de recuperação (24 caracteres):
            </p>
            <p
              data-testid="chave-recuperacao-valor"
              className="text-xl font-bold tracking-wider text-texto select-all font-mono break-all"
            >
              {chaveRecuperacao}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={lidarComImpressao}
                className="px-5 py-3 rounded-xl bg-rosa text-texto font-semibold text-base hover:opacity-90 transition"
              >
                Imprimir chave de recuperação
              </button>
            </div>
          </div>

          <form onSubmit={lidarComConfirmacaoChave} className="space-y-4">
            <div>
              <label
                htmlFor="confirmar-ultimos-4"
                className="block text-base font-semibold text-texto mb-2"
              >
                Para confirmar que você guardou a chave, digite os 4 últimos
                caracteres dela:
              </label>
              <input
                id="confirmar-ultimos-4"
                type="text"
                maxLength={4}
                value={ultimosQuatroDigitados}
                onChange={(e) => {
                  setUltimosQuatroDigitados(e.target.value);
                  setErro(null);
                }}
                placeholder="Ex.: ABCD"
                className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-malva"
              />
            </div>

            {erro && (
              <p role="alert" className="text-base font-semibold text-malva">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={!confirmacaoValida}
              className="w-full py-3.5 px-6 rounded-xl bg-malva text-white font-semibold text-base disabled:opacity-50 transition"
            >
              Confirmar que guardei a chave e entrar
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-fundo text-texto flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-fundo-claro border border-rosa-claro rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <img
            src={logoLc}
            alt="Logo LC — Louriedna Costa Pereira"
            className="w-28 h-auto select-none"
          />
          <h1 className="text-2xl font-bold text-malva">
            Bem-vinda ao LC Pacientes
          </h1>
          <p className="text-base text-lilas-acinzentado">
            Louriedna Costa Pereira — Psicóloga · CRP 03/29434
          </p>
          <p className="text-base text-texto pt-1">
            Este é o seu primeiro acesso. Crie uma senha mestra para proteger os
            dados dos seus pacientes neste computador.
          </p>
        </div>

        <div className="bg-rosa-claro/30 border border-rosa-claro rounded-xl p-4 text-base text-texto">
          <strong>Sugestão:</strong> escolha uma frase fácil para você lembrar,
          com pelo menos 8 caracteres (por exemplo:{" "}
          <em>CafeComBoloDeMilho2026</em>).
        </div>

        <form onSubmit={lidarComCriacaoSenha} className="space-y-4">
          <div>
            <label
              htmlFor="senha-mestra"
              className="block text-base font-semibold text-texto mb-1"
            >
              Criar senha mestra (mínimo de 8 caracteres)
            </label>
            <input
              id="senha-mestra"
              type="password"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setErro(null);
              }}
              placeholder="Digite sua senha mestra"
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
            <div className="mt-2 flex items-center justify-between text-base">
              <span
                data-testid="indicador-forca-senha"
                className="text-lilas-acinzentado font-semibold"
              >
                {forca.rotulo}
              </span>
              <div className="flex gap-1.5 w-32" aria-hidden="true">
                {[1, 2, 3, 4].map((barra) => (
                  <span
                    key={barra}
                    className={`h-2 flex-1 rounded-full ${
                      forca.pontuacao >= barra ? "bg-malva" : "bg-rosa-claro"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmar-senha-mestra"
              className="block text-base font-semibold text-texto mb-1"
            >
              Confirmar senha mestra
            </label>
            <input
              id="confirmar-senha-mestra"
              type="password"
              value={confirmacaoSenha}
              onChange={(e) => {
                setConfirmacaoSenha(e.target.value);
                setErro(null);
              }}
              placeholder="Repita a senha mestra"
              className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
            />
          </div>

          {erro && (
            <p role="alert" className="text-base font-semibold text-malva">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-3.5 px-6 rounded-xl bg-malva text-white font-semibold text-base hover:opacity-95 disabled:opacity-50 transition"
          >
            {carregando
              ? "Gerando chave de segurança..."
              : "Criar senha e continuar"}
          </button>
        </form>
      </div>
    </main>
  );
}
