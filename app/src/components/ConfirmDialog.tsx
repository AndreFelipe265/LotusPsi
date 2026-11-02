import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  detalheDestaque?: string;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  destrutivo?: boolean;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

/**
 * Diálogo de confirmação para ações importantes ou destrutivas.
 * Conforme a Seção 4 da Fonte da Verdade:
 * "Toda ação destrutiva pede confirmação, mostrando claramente o que será apagado."
 */
export function ConfirmDialog({
  aberto,
  titulo,
  mensagem,
  detalheDestaque,
  rotuloConfirmar = "Confirmar",
  rotuloCancelar = "Cancelar",
  destrutivo = true,
  carregando = false,
  aoConfirmar,
  aoCancelar,
}: ConfirmDialogProps) {
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      aoFechar={aoCancelar}
      larguraMax="md"
      rodape={
        <>
          <Button
            variante="contorno"
            onClick={aoCancelar}
            disabled={carregando}
          >
            {rotuloCancelar}
          </Button>
          <Button
            variante={destrutivo ? "perigo" : "primario"}
            onClick={aoConfirmar}
            disabled={carregando}
          >
            {carregando ? "Aguarde..." : rotuloConfirmar}
          </Button>
        </>
      }
    >
      <p className="text-base text-texto">{mensagem}</p>
      {detalheDestaque && (
        <div
          data-testid="confirm-dialog-destaque"
          className="p-4 rounded-xl bg-rosa-claro/40 border border-malva font-semibold text-base text-texto"
        >
          {detalheDestaque}
        </div>
      )}
    </Modal>
  );
}
