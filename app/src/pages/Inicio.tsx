import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components";
import { pacientesListar } from "../lib/api";
import { formatarDataBr } from "../lib/format";

function obterDataHojeIso(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function Inicio() {
  const navigate = useNavigate();
  const [totalAtivos, setTotalAtivos] = useState<number>(0);
  const [mostrarProximos7Dias, setMostrarProximos7Dias] =
    useState<boolean>(false);
  const [rascunhoRapido, setRascunhoRapido] = useState<string>("");

  const dataHojeBr = formatarDataBr(obterDataHojeIso());

  useEffect(() => {
    let cancelado = false;
    pacientesListar({ status: "ativo" })
      .then((lista) => {
        if (!cancelado && Array.isArray(lista)) {
          setTotalAtivos(lista.length);
        }
      })
      .catch(() => {
        // Enquanto o comando pacientes_listar ainda não estiver implementado no backend (F3), mantém 0
      });

    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-fundo-claro border border-rosa-claro rounded-2xl p-6 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-malva">
            Olá, Louriedna! — Painel Inicial
          </h2>
          <p className="text-base text-texto">
            Bem-vinda ao seu consultório. Hoje é <strong>{dataHojeBr}</strong>.
          </p>
        </div>

        <div
          data-testid="card-total-ativos"
          className="px-5 py-3 rounded-xl bg-rosa-claro/40 border border-malva text-center sm:text-right shrink-0"
        >
          <p className="text-base font-semibold text-texto">Pacientes ativos</p>
          <p
            data-testid="valor-total-ativos"
            className="text-2xl font-bold text-malva"
          >
            {totalAtivos}
          </p>
        </div>
      </header>

      <section
        aria-label="Atalhos rápidos"
        data-testid="secao-atalhos"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
      >
        <h3 className="text-lg font-bold text-malva">Ações rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            variante="primario"
            larguraTotal
            onClick={() => navigate("/pacientes/novo")}
          >
            Novo paciente
          </Button>
          <Button
            variante="secundario"
            larguraTotal
            onClick={() => navigate("/pacientes")}
          >
            Registrar sessão
          </Button>
          <Button
            variante="contorno"
            larguraTotal
            onClick={() => navigate("/pacientes")}
          >
            Buscar paciente
          </Button>
          <Button
            variante="contorno"
            larguraTotal
            onClick={() => navigate("/documentos")}
          >
            Documentos
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-label="Aniversariantes"
          data-testid="secao-aniversariantes"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
        >
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-malva">
              Aniversariantes do dia
            </h3>
            <p className="text-base text-texto">
              Nenhum aniversariante registrado para hoje ({dataHojeBr}).
            </p>
          </div>

          <div className="pt-2 border-t border-rosa-claro space-y-3">
            <Button
              variante="contorno"
              onClick={() => setMostrarProximos7Dias((prev) => !prev)}
              aria-expanded={mostrarProximos7Dias}
            >
              {mostrarProximos7Dias
                ? "Ocultar próximos aniversários (7 dias)"
                : "Próximos aniversários (7 dias)"}
            </Button>

            {mostrarProximos7Dias && (
              <div
                data-testid="lista-proximos-aniversarios"
                className="p-4 rounded-xl bg-fundo border border-rosa-claro text-base text-texto"
              >
                Nenhum aniversário nos próximos 7 dias.
              </div>
            )}
          </div>
        </section>

        <section
          aria-label="Cópia de segurança (Backup)"
          data-testid="secao-backup"
          className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xs"
        >
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-malva">
              Cópia de segurança (Backup)
            </h3>
            <p
              data-testid="status-ultimo-backup"
              className="text-base text-texto"
            >
              Último backup: <strong>Ainda não realizado</strong>
            </p>
            <p className="text-base text-lilas-acinzentado">
              Guarde uma cópia criptografada dos seus pacientes e documentos em
              um pendrive ou pasta segura.
            </p>
          </div>

          <div>
            <Button
              variante="primario"
              onClick={() => navigate("/configuracoes")}
            >
              Fazer backup agora
            </Button>
          </div>
        </section>
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
