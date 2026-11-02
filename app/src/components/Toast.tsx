import { Button } from "./Button";

export type TipoToast = "sucesso" | "erro" | "info";

export interface ToastProps {
  mensagem: string | null;
  tipo?: TipoToast;
  aoFechar?: () => void;
}

const ESTILO_TOAST: Record<TipoToast, string> = {
  sucesso: "bg-malva text-white border-malva",
  erro: "bg-[#8B3A52] text-white border-[#8B3A52]",
  info: "bg-fundo-claro text-texto border-malva",
};

export function Toast({ mensagem, tipo = "info", aoFechar }: ToastProps) {
  if (!mensagem) {
    return null;
  }

  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      aria-live="polite"
      data-testid="toast-mensagem"
      className={`fixed bottom-6 right-6 z-40 max-w-md rounded-2xl border px-5 py-4 shadow-lg flex items-center justify-between gap-4 text-base font-semibold ${ESTILO_TOAST[tipo]}`}
    >
      <span>{mensagem}</span>
      {aoFechar && (
        <Button
          variante={tipo === "info" ? "contorno" : "secundario"}
          onClick={aoFechar}
          className="px-3 py-1.5 text-base"
        >
          Fechar
        </Button>
      )}
    </div>
  );
}
