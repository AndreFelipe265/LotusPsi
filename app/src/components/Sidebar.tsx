import { NavLink } from "react-router-dom";
import logoLc from "../assets/logo-lc.svg";
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
      className="w-72 shrink-0 bg-fundo-claro border-r border-rosa-claro flex flex-col justify-between p-6 min-h-screen"
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-rosa-claro">
          <img
            src={logoLc}
            alt="Logo LC — Louriedna Costa Pereira"
            className="w-14 h-auto select-none shrink-0"
          />
          <div>
            <h1 className="text-xl font-bold text-malva leading-tight">
              LC Pacientes
            </h1>
            <p className="text-base text-lilas-acinzentado leading-snug">
              Louriedna Costa Pereira
            </p>
            <p className="text-base text-lilas-acinzentado leading-snug">
              Psicóloga · CRP 03/29434
            </p>
          </div>
        </div>

        <nav aria-label="Navegação principal" className="space-y-2">
          {ITENS_MENU_LATERAL.map((item) => (
            <NavLink
              key={item.caminho}
              to={item.caminho}
              end={item.end}
              className={({ isActive }) =>
                `block w-full px-4 py-3.5 rounded-xl font-semibold text-base transition ${
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

      <div className="pt-6 border-t border-rosa-claro">
        <Button variante="primario" larguraTotal onClick={aoSair}>
          Sair
        </Button>
      </div>
    </aside>
  );
}
