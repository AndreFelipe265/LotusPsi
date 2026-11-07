import { NavLink } from "react-router-dom";
import logoLotusPsi from "../assets/logo-lotuspsi.svg";
import { Button } from "./Button";

export interface SidebarProps {
  aoSair: () => void;
}

interface ItemMenu {
  rotulo: string;
  caminho: string;
  end?: boolean;
}

const ITENS_MENU_LATERAL: readonly ItemMenu[] = [
  { rotulo: "Início", caminho: "/", end: true },
  { rotulo: "Pacientes", caminho: "/pacientes" },
  { rotulo: "Agenda", caminho: "/agenda" },
  { rotulo: "Financeiro", caminho: "/financeiro" },
  { rotulo: "Documentos", caminho: "/documentos" },
  { rotulo: "Configurações", caminho: "/configuracoes" },
];

/**
 * Menu lateral fixo (Seção 4 da Fonte da Verdade):
 * Início · Pacientes · Documentos · Configurações + botão Sair sempre visível (RN06).
 */
export function Sidebar({ aoSair }: SidebarProps) {
  return (
    <aside
      aria-label="Menu lateral"
      className="w-64 xl:w-72 shrink-0 bg-fundo-claro border-r border-rosa-claro flex flex-col justify-between p-5 lg:p-6 h-screen sticky top-0 overflow-y-auto select-none"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-rosa-claro">
          <img
            src={logoLotusPsi}
            alt="Logo LotusPsi"
            className="w-12 xl:w-14 h-auto select-none shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-malva leading-tight truncate">
              LotusPsi
            </h1>
            <p className="text-base text-lilas-acinzentado leading-snug truncate">
              Psicóloga Clínica
            </p>
            <p className="text-base text-lilas-acinzentado leading-snug truncate">
              CRP 00/00000
            </p>
          </div>
        </div>

        <nav aria-label="Navegação principal" className="space-y-1.5">
          {ITENS_MENU_LATERAL.map((item) => (
            <NavLink
              key={item.caminho}
              to={item.caminho}
              end={item.end}
              className={({ isActive }) =>
                `block w-full px-4 py-2.5 xl:py-3 rounded-xl font-semibold text-base transition ${
                  isActive
                    ? "bg-malva text-white shadow-xs"
                    : "text-texto hover:bg-rosa-claro/50"
                }`
              }
            >
              {item.rotulo}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="pt-4 border-t border-rosa-claro mt-auto">
        <Button variante="primario" larguraTotal onClick={aoSair}>
          Sair
        </Button>
      </div>
    </aside>
  );
}
