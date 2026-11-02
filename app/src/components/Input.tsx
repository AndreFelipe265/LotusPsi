import React, { useId } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  ajuda?: string;
  erro?: string | null;
  destaque?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      rotulo,
      ajuda,
      erro,
      destaque = false,
      id,
      className = "",
      required,
      ...props
    },
    ref,
  ) {
    const idGerado = useId();
    const inputId = id ?? `campo-${idGerado}`;
    const erroId = `${inputId}-erro`;
    const ajudaId = `${inputId}-ajuda`;

    return (
      <div
        className={
          destaque
            ? "p-3 rounded-xl bg-rosa-claro/30 border border-malva"
            : undefined
        }
      >
        <label
          htmlFor={inputId}
          className="block text-base font-semibold text-texto mb-1"
        >
          {rotulo}
          {required && (
            <span className="text-malva ml-1" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={Boolean(erro)}
          aria-describedby={erro ? erroId : ajuda ? ajudaId : undefined}
          className={`w-full px-4 py-3 text-base rounded-xl border ${
            erro ? "border-malva" : "border-lilas-acinzentado"
          } bg-fundo-claro text-texto focus:outline-none focus:ring-2 focus:ring-malva disabled:opacity-60 ${className}`.trim()}
          {...props}
        />
        {ajuda && !erro && (
          <p id={ajudaId} className="mt-1 text-base text-lilas-acinzentado">
            {ajuda}
          </p>
        )}
        {erro && (
          <p
            id={erroId}
            role="alert"
            className="mt-1 text-base font-semibold text-malva"
          >
            {erro}
          </p>
        )}
      </div>
    );
  },
);
