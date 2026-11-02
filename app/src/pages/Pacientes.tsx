import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Input, Toast } from "../components";
import { extrairErroApi, pacientesListar } from "../lib/api";
import {
  extrairDigitos,
  formatarDataBr,
  formatarIdadeComNascimento,
  formatarTelefoneBr,
} from "../lib/format";
import type { PacienteResumo, StatusPaciente } from "../lib/types";

type FiltroStatusOpcao = StatusPaciente | "todos";

function normalizarTextoLocal(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function Pacientes() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusOpcao>("ativo");
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);

    pacientesListar({ busca, status: filtroStatus })
      .then((lista) => {
        if (!cancelado) {
          setPacientes(Array.isArray(lista) ? lista : []);
          setErroMensagem(null);
        }
      })
      .catch((erro) => {
        if (!cancelado) {
          const apiErro = extrairErroApi(erro);
          setErroMensagem(apiErro.mensagem);
          setPacientes([]);
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregando(false);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [busca, filtroStatus]);

  const pacientesFiltrados = useMemo(() => {
    const termo = busca.trim();
    const termoNormalizado = normalizarTextoLocal(termo);
    const termoDigitos = extrairDigitos(termo);

    return [...pacientes]
      .filter((p) => {
        if (filtroStatus !== "todos" && p.status !== filtroStatus) {
          return false;
        }
        if (!termo) return true;

        const nomeNorm = normalizarTextoLocal(p.nome);
        if (termoNormalizado && nomeNorm.includes(termoNormalizado)) {
          return true;
        }
        if (termoDigitos) {
          const telDigitos = extrairDigitos(p.telefone ?? "");
          const zapDigitos = extrairDigitos(p.whatsapp ?? "");
          if (
            telDigitos.includes(termoDigitos) ||
            zapDigitos.includes(termoDigitos)
          ) {
            return true;
          }
        }
        return false;
      })
      .sort((a, b) =>
        normalizarTextoLocal(a.nome).localeCompare(
          normalizarTextoLocal(b.nome),
          "pt-BR",
        ),
      );
  }, [pacientes, busca, filtroStatus]);

  const opcoesStatus: { valor: FiltroStatusOpcao; rotulo: string }[] = [
    { valor: "ativo", rotulo: "Ativos" },
    { valor: "inativo", rotulo: "Inativos" },
    { valor: "todos", rotulo: "Todos" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-malva">Pacientes</h2>
          <p className="text-base text-lilas-acinzentado">
            Cadastro, busca e acompanhamento dos seus pacientes.
          </p>
        </div>
        <Button onClick={() => navigate("/pacientes/novo")}>
          Novo paciente
        </Button>
      </div>

      <section
        aria-label="Busca e filtros de pacientes"
        className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4 shadow-xs"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex-1">
            <Input
              id="busca-pacientes"
              rotulo="Buscar por nome ou telefone"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite o nome ou telefone do paciente..."
            />
          </div>

          <div className="space-y-1">
            <span className="block text-base font-semibold text-texto">
              Status
            </span>
            <div
              role="group"
              aria-label="Filtrar por status"
              className="inline-flex rounded-xl border border-rosa-claro bg-fundo p-1 gap-1"
            >
              {opcoesStatus.map((opcao) => {
                const ativo = filtroStatus === opcao.valor;
                return (
                  <button
                    key={opcao.valor}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setFiltroStatus(opcao.valor)}
                    className={`px-4 py-2 rounded-lg text-base font-semibold transition-colors ${
                      ativo
                        ? "bg-malva text-white shadow-xs"
                        : "text-texto hover:bg-rosa-claro/40"
                    }`}
                  >
                    {opcao.rotulo}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {carregando ? (
        <div className="bg-fundo-claro border border-rosa-claro rounded-2xl p-8 text-center text-base text-texto">
          Carregando pacientes...
        </div>
      ) : pacientesFiltrados.length === 0 ? (
        busca.trim() !== "" || filtroStatus !== "ativo" ? (
          <EmptyState
            titulo="Nenhum paciente encontrado"
            descricao="Não encontramos pacientes com esse filtro ou termo de busca."
            rotuloAcao="Limpar busca e filtros"
            aoClicarAcao={() => {
              setBusca("");
              setFiltroStatus("ativo");
            }}
          />
        ) : (
          <EmptyState
            titulo="Lista de pacientes"
            descricao="Use o botão Novo paciente para iniciar um cadastro."
            rotuloAcao="Novo paciente"
            aoClicarAcao={() => navigate("/pacientes/novo")}
          />
        )
      ) : (
        <div className="bg-fundo-claro border border-rosa-claro rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className="w-full text-left border-collapse"
              aria-label="Lista de pacientes"
            >
              <thead>
                <tr className="border-b border-rosa-claro bg-rosa-claro/25 text-base font-bold text-texto">
                  <th scope="col" className="py-4 px-5">
                    Nome
                  </th>
                  <th scope="col" className="py-4 px-5">
                    Idade
                  </th>
                  <th scope="col" className="py-4 px-5">
                    Telefone
                  </th>
                  <th scope="col" className="py-4 px-5">
                    Última sessão
                  </th>
                  <th scope="col" className="py-4 px-5 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rosa-claro text-base text-texto">
                {pacientesFiltrados.map((paciente) => {
                  const telefoneExibicao = formatarTelefoneBr(
                    paciente.telefone || paciente.whatsapp,
                  );
                  const idadeExibicao = formatarIdadeComNascimento(
                    paciente.data_nascimento,
                  );
                  const ultimaSessaoExibicao = paciente.ultima_sessao
                    ? formatarDataBr(paciente.ultima_sessao)
                    : "Sem sessões";

                  return (
                    <tr
                      key={paciente.id}
                      data-testid={`linha-paciente-${paciente.id}`}
                      onClick={() => navigate(`/pacientes/${paciente.id}`)}
                      className="hover:bg-rosa-claro/20 cursor-pointer transition-colors"
                    >
                      <td className="py-4 px-5 font-semibold">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{paciente.nome}</span>
                          {paciente.status === "inativo" && (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-base font-semibold bg-rosa-claro/60 text-texto border border-lilas-acinzentado">
                              Inativo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-5">{idadeExibicao}</td>
                      <td className="py-4 px-5">{telefoneExibicao}</td>
                      <td className="py-4 px-5">{ultimaSessaoExibicao}</td>
                      <td
                        className="py-4 px-5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variante="contorno"
                          className="px-4 py-2"
                          onClick={() => navigate(`/pacientes/${paciente.id}`)}
                        >
                          Ver perfil
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Toast
        mensagem={erroMensagem}
        tipo="erro"
        aoFechar={() => setErroMensagem(null)}
      />
    </div>
  );
}
