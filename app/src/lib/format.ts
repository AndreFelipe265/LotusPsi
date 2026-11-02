/**
 * Utilitários de formatação e validação visual no padrão pt-BR (datas dd/mm/aaaa, idade, telefone e força de senha).
 */

export function formatarDataBr(dataIso: string): string {
  const partes = dataIso.split("-");
  if (partes.length !== 3) return dataIso;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

export function calcularForcaSenha(senha: string): {
  nivel: "vazia" | "curta" | "razoavel" | "boa" | "forte";
  rotulo: string;
  pontuacao: number;
} {
  if (senha.length === 0) {
    return { nivel: "vazia", rotulo: "Digite uma senha", pontuacao: 0 };
  }
  if (senha.length < 8) {
    return {
      nivel: "curta",
      rotulo: "Muito curta (mínimo de 8 caracteres)",
      pontuacao: 1,
    };
  }

  let pontos = 1;
  if (senha.length >= 12) pontos += 1;
  if (senha.length >= 16) pontos += 1;
  if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) pontos += 1;
  if (/\d/.test(senha) || /[^A-Za-z0-9]/.test(senha)) pontos += 1;

  if (pontos <= 2) {
    return { nivel: "razoavel", rotulo: "Força: Razoável", pontuacao: 2 };
  }
  if (pontos === 3) {
    return { nivel: "boa", rotulo: "Força: Boa", pontuacao: 3 };
  }
  return { nivel: "forte", rotulo: "Força: Forte", pontuacao: 4 };
}
