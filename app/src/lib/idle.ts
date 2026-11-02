import { useEffect, useRef } from "react";

/**
 * Detector de inatividade (RN05 — bloqueio após 30 minutos sem interação de mouse/teclado).
 */

export const TEMPO_INATIVIDADE_PADRAO_MS = 30 * 60 * 1000;

export const EVENTOS_INTERACAO = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "wheel",
] as const;

/**
 * Inicia um monitor de inatividade imperativo e retorna uma função de limpeza.
 */
export function iniciarMonitorInatividade(
  aoInativar: () => void,
  tempoMs: number = TEMPO_INATIVIDADE_PADRAO_MS,
): () => void {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const reiniciarTimer = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      aoInativar();
    }, tempoMs);
  };

  for (const evento of EVENTOS_INTERACAO) {
    window.addEventListener(evento, reiniciarTimer, { passive: true });
  }

  reiniciarTimer();

  return () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    for (const evento of EVENTOS_INTERACAO) {
      window.removeEventListener(evento, reiniciarTimer);
    }
  };
}

export interface OpcoesDetectorInatividade {
  ativo: boolean;
  aoInativar: () => void;
  tempoMs?: number;
}

/**
 * Hook React que monitora eventos de mouse e teclado enquanto `ativo` for verdadeiro
 * e dispara `aoInativar` após `tempoMs` (padrão 30 minutos).
 */
export function useDetectorInatividade({
  ativo,
  aoInativar,
  tempoMs = TEMPO_INATIVIDADE_PADRAO_MS,
}: OpcoesDetectorInatividade): void {
  const callbackRef = useRef(aoInativar);
  callbackRef.current = aoInativar;

  useEffect(() => {
    if (!ativo) {
      return;
    }

    return iniciarMonitorInatividade(() => {
      callbackRef.current();
    }, tempoMs);
  }, [ativo, tempoMs]);
}
