import { EmptyState } from "../components";

export function Documentos() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-malva">Documentos</h2>
        <p className="text-base text-lilas-acinzentado">
          Modelos, arquivos administrativos e outros documentos protegidos.
        </p>
      </div>

      <EmptyState
        titulo="Seus documentos gerais"
        descricao="Aqui você poderá enviar, organizar por categorias, baixar e abrir seus documentos."
      />
    </div>
  );
}
