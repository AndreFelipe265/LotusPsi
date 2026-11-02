import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components";

export function PacientePerfil() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-malva">Perfil do Paciente</h2>
        <Button variante="contorno" onClick={() => navigate("/pacientes")}>
          Voltar para pacientes
        </Button>
      </div>

      <div className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6">
        <p className="text-base text-texto">
          Visualizando perfil do paciente {id}.
        </p>
      </div>
    </div>
  );
}
