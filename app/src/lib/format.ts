/**
 * Utilitários de formatação e validação visual no padrão pt-BR
 * (datas dd/mm/aaaa, idade, telefone, moeda e força de senha).
 */

export function formatarDataBr(dataIso?: string | null): string {
  if (!dataIso) return "—";
  const partes = dataIso.trim().split("T")[0].split("-");
  if (partes.length !== 3) return dataIso;
  const [ano, mes, dia] = partes;
  if (!ano || !mes || !dia) return dataIso;
  return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${ano}`;
}

/**
 * Retorna a data local de hoje no formato ISO `AAAA-MM-DD`.
 */
export function obterDataHojeIso(referencia: Date = new Date()): string {
  const ano = referencia.getFullYear();
  const mes = String(referencia.getMonth() + 1).padStart(2, "0");
  const dia = String(referencia.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * Calcula a idade em anos completos a partir de uma data ISO (AAAA-MM-DD) (RN12).
 */
export function calcularIdade(
  dataIso?: string | null,
  hojeReferencia: Date = new Date(),
): number | null {
  if (!dataIso) return null;
  const partes = dataIso.trim().split("-");
  if (partes.length !== 3) return null;

  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);

  if (
    !Number.isInteger(ano) ||
    !Number.isInteger(mes) ||
    !Number.isInteger(dia) ||
    mes < 1 ||
    mes > 12 ||
    dia < 1 ||
    dia > 31
  ) {
    return null;
  }

  let idade = hojeReferencia.getFullYear() - ano;
  const mesAtual = hojeReferencia.getMonth() + 1;
  const diaAtual = hojeReferencia.getDate();

  if (mesAtual < mes || (mesAtual === mes && diaAtual < dia)) {
    idade -= 1;
  }

  return idade >= 0 ? idade : null;
}

/**
 * Formata a idade acompanhada da data de nascimento para diferenciar homônimos (RN11, RN12).
 * Exemplo: "36 anos (15/05/1990)"
 */
export function formatarIdadeComNascimento(
  dataIso?: string | null,
  hojeReferencia?: Date,
): string {
  if (!dataIso) return "—";
  const idade = calcularIdade(dataIso, hojeReferencia);
  const dataBr = formatarDataBr(dataIso);
  if (idade === null) return dataBr;
  const sufixo = idade === 1 ? "ano" : "anos";
  return `${idade} ${sufixo} (${dataBr})`;
}

/**
 * Extrai apenas dígitos numéricos de uma string.
 */
export function extrairDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Formata um telefone armazenado em dígitos para exibição em pt-BR:
 * - 11 dígitos: `(71) 99876-5432`
 * - 10 dígitos: `(71) 3333-4444`
 */
export function formatarTelefoneBr(telefone?: string | null): string {
  if (!telefone) return "—";
  const digitos = extrairDigitos(telefone);
  if (!digitos) return "—";

  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return telefone;
}

/**
 * Aplica máscara progressiva de telefone brasileiro durante a digitação.
 */
export function aplicarMascaraTelefone(valor: string): string {
  const digitos = extrairDigitos(valor).slice(0, 11);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 6) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  }
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

/**
 * Aplica máscara progressiva de data `dd/mm/aaaa` durante a digitação.
 */
export function aplicarMascaraDataBr(valor: string): string {
  const digitos = extrairDigitos(valor).slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) {
    return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  }
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

/**
 * Converte uma data no formato `dd/mm/aaaa` (ou `AAAA-MM-DD`) para ISO `AAAA-MM-DD`,
 * validando se o dia/mês/ano existem no calendário. Retorna `null` se inválida.
 */
export function converterDataBrParaIso(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) return null;

  let dia: number;
  let mes: number;
  let ano: number;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpo)) {
    const partes = limpo.split("/");
    dia = Number(partes[0]);
    mes = Number(partes[1]);
    ano = Number(partes[2]);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) {
    const partes = limpo.split("-");
    ano = Number(partes[0]);
    mes = Number(partes[1]);
    dia = Number(partes[2]);
  } else {
    return null;
  }

  if (ano < 1900 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return null;
  }

  const dataObj = new Date(ano, mes - 1, dia);
  if (
    dataObj.getFullYear() !== ano ||
    dataObj.getMonth() !== mes - 1 ||
    dataObj.getDate() !== dia
  ) {
    return null;
  }

  const mesStr = String(mes).padStart(2, "0");
  const diaStr = String(dia).padStart(2, "0");
  return `${ano}-${mesStr}-${diaStr}`;
}

/**
 * Formata valor em centavos para moeda BRL (ex.: `15000` -> `"R$ 150,00"`).
 */
export function formatarMoedaBr(centavos?: number | null): string {
  if (centavos === null || centavos === undefined) return "—";
  const reais = (centavos / 100).toFixed(2).replace(".", ",");
  return `R$ ${reais}`;
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
