import { useState } from "react";

export function Inicio() {
  const [rascunhoRapido, setRascunhoRapido] = useState<string>("");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-malva">Painel Inicial</h2>
        <p className="text-base text-texto">
          Sessão ativa e protegida por criptografia local.
        </p>
      </div>

      <section className="bg-fundo-claro border border-rosa-claro rounded-2xl shadow-xs p-6 space-y-3">
        <label
          htmlFor="rascunho-anotacao"
          className="block text-base font-semibold text-texto"
        >
          Anotação em andamento
        </label>
        <textarea
          id="rascunho-anotacao"
          rows={3}
          value={rascunhoRapido}
          onChange={(e) => setRascunhoRapido(e.target.value)}
          placeholder="Digite uma anotação rápida..."
          className="w-full px-4 py-3 text-base rounded-xl border border-lilas-acinzentado bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva"
        />
      </section>
    </div>
  );
}
