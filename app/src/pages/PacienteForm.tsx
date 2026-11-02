import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "../components";

export function PacienteForm() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-malva">Cadastro de Paciente</h2>
        <Button variante="contorno" onClick={() => navigate("/pacientes")}>
          Voltar para pacientes
        </Button>
      </div>

      <div className="bg-fundo-claro border border-rosa-claro rounded-2xl p-6 space-y-4">
        <Input
          rotulo="Nome completo"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Digite o nome completo do paciente"
        />
      </div>
    </div>
  );
}
