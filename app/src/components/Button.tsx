import React from "react";

export type VarianteBotao = "primario" | "secundario" | "contorno" | "perigo";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
  larguraTotal?: boolean;
  children: React.ReactNode;
}

const CLASSES_VARIANTE: Record<VarianteBotao, string> = {
  // Texto branco apenas sobre malva (#AC6E87) ou mais escuro (Seção 4)
  primario: "bg-malva text-white hover:opacity-95",
  // Rosa (#E599A6) com texto escuro (#3A2E36) para contraste WCAG AA
  secundario: "bg-rosa text-texto hover:bg-rosa-claro",
  contorno:
    "bg-fundo-claro text-texto border border-lilas-acinzentado hover:bg-rosa-claro/40",
  perigo: "bg-[#8B3A52] text-white hover:opacity-95",
};

export function Button({
  variante = "primario",
  larguraTotal = false,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-base transition focus:outline-none focus:ring-2 focus:ring-malva focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${CLASSES_VARIANTE[variante]} ${larguraTotal ? "w-full" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
