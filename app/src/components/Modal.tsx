import React, { useEffect, useId } from "react";
import { Button } from "./Button";

export interface ModalProps {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  larguraMax?: "md" | "lg" | "xl";
}

const LARGURA_CLASSES = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({
  aberto,
  titulo,
  aoFechar,
  children,
  rodape,
  larguraMax = "lg",
}: ModalProps) {
  const tituloId = useId();

  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        aoFechar();
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, aoFechar]);

  if (!aberto) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      className="fixed inset-0 z-40 bg-texto/40 backdrop-blur-xs flex items-center justify-center p-6"
    >
      <div
        className={`w-full ${LARGURA_CLASSES[larguraMax]} bg-fundo-claro border border-rosa-claro rounded-2xl shadow-lg p-6 space-y-5 text-texto`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-rosa-claro pb-4">
          <h2 id={tituloId} className="text-xl font-bold text-malva">
            {titulo}
          </h2>
          <Button
            variante="contorno"
            onClick={aoFechar}
            className="px-4 py-2"
            aria-label={`Fechar ${titulo}`}
          >
            Fechar
          </Button>
        </div>

        <div className="text-base text-texto space-y-4">{children}</div>

        {rodape && (
          <div className="flex items-center justify-end gap-3 border-t border-rosa-claro pt-4">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
