import { Button } from "./Button";

export interface EmptyStateProps {
  titulo: string;
  descricao: string;
  rotuloAcao?: string;
  aoClicarAcao?: () => void;
}

export function EmptyState({
  titulo,
  descricao,
  rotuloAcao,
  aoClicarAcao,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="w-full rounded-2xl border border-rosa-claro bg-fundo-claro p-8 text-center space-y-4"
    >
      <h3 className="text-lg font-bold text-malva">{titulo}</h3>
      <p className="text-base text-texto max-w-md mx-auto">{descricao}</p>
      {rotuloAcao && aoClicarAcao && (
        <div className="pt-2">
          <Button variante="primario" onClick={aoClicarAcao}>
            {rotuloAcao}
          </Button>
        </div>
      )}
    </div>
  );
}
