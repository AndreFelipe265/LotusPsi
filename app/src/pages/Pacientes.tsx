import { useNavigate } from "react-router-dom";
import { Button, EmptyState } from "../components";

export function Pacientes() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-malva">Pacientes</h2>
          <p className="text-base text-lilas-acinzentado">
            Cadastro, busca e acompanhamento dos seus pacientes.
          </p>
        </div>
        <Button onClick={() => navigate("/pacientes/novo")}>
          Novo paciente
        </Button>
      </div>

      <EmptyState
        titulo="Lista de pacientes"
        descricao="Use o botão Novo paciente para iniciar um cadastro."
        rotuloAcao="Novo paciente"
        aoClicarAcao={() => navigate("/pacientes/novo")}
      />
    </div>
  );
}
