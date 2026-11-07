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
 * Retorna a saudação conforme o horário local (RN62: Bom dia / Boa tarde / Boa noite).
 */
export function obterSaudacaoHorario(
  referencia: Date = new Date(),
): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hora = referencia.getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Lista fixa de mensagens de boas-vindas do MVP (RN61).
 */
export const MENSAGENS_BOAS_VINDAS: readonly string[] = [
  "Eu te amo, mãe! ❤️",
  "Que seu dia seja leve e cheio de bons encontros.",
  "Respire fundo: hoje vai ser um bom dia.",
  "Obrigado por cuidar de tantas pessoas com tanto carinho.",
  "Você faz a diferença na vida de muita gente.",
  "Cada pessoa tem sua história, e você ajuda a torná-la mais leve.",
  "Seu trabalho faz diferença, mesmo quando você não percebe.",
  "Acolher é respeitar o tempo e a história de cada pessoa.",
  "Não se esqueça de cuidar de quem também cuida.",
];

/**
 * Chave em `config` e mensagem padrão de parabéns no WhatsApp (RN32).
 */
export const CHAVE_CONFIG_MENSAGEM_ANIVERSARIO = "mensagem_aniversario";

/**
 * Chave em `config` onde fica salva a data/hora ISO 8601 do último backup realizado (RN53).
 */
export const CHAVE_CONFIG_ULTIMO_BACKUP = "ultimo_backup";

export const MENSAGEM_ANIVERSARIO_PADRAO =
  "Olá, {primeiro_nome}! Feliz aniversário! Desejo um novo ano cheio de saúde e alegrias. Um abraço, Louriedna.";

export function extrairPrimeiroNome(nomeCompleto: string): string {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0];
  return primeiro || "Paciente";
}

/**
 * Monta a URL `https://wa.me/55<numero>?text=<mensagem>` interpolando `{primeiro_nome}` (RN31, RN32).
 */
export function construirUrlWhatsappParabens(
  nomePaciente: string,
  numeroContato: string,
  templateMensagem?: string | null,
): string | null {
  const digitos = extrairDigitos(numeroContato);
  if (digitos.length < 10) return null;

  const numeroComDdi =
    digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)
      ? digitos
      : `55${digitos}`;

  const primeiroNome = extrairPrimeiroNome(nomePaciente);
  const template =
    templateMensagem && templateMensagem.trim().length > 0
      ? templateMensagem.trim()
      : MENSAGEM_ANIVERSARIO_PADRAO;

  const mensagem = template.replace(/\{primeiro_nome\}/g, primeiroNome);
  return `https://wa.me/${numeroComDdi}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Embaralha um array de índices utilizando o algoritmo Fisher-Yates (Knuth shuffle) (RN60, RN62).
 */
export function embaralharIndices(
  total: number,
  gerador: () => number = Math.random,
): number[] {
  const itens = Array.from({ length: total }, (_, i) => i);
  for (let i = itens.length - 1; i > 0; i--) {
    const j = Math.floor(gerador() * (i + 1));
    const temp = itens[i];
    itens[i] = itens[j];
    itens[j] = temp;
  }
  return itens;
}

/**
 * Cria uma lista aleatória com todas as frases embaralhadas, garantindo que a primeira frase
 * dessa nova lista seja diferente da última frase da lista passada (RN60–RN62).
 */
export function gerarNovoCicloEmbaralhado(
  total: number,
  ultimoIndice: number | null,
  gerador: () => number = Math.random,
): number[] {
  if (total <= 0) return [];
  if (total === 1) return [0];

  const ciclo = embaralharIndices(total, gerador);

  if (ultimoIndice !== null && ciclo[0] === ultimoIndice) {
    const deslocamento = 1 + Math.floor(gerador() * (total - 1));
    const temp = ciclo[0];
    ciclo[0] = ciclo[deslocamento];
    ciclo[deslocamento] = temp;
  }

  return ciclo;
}

/**
 * Avança o ciclo de mensagens de boas-vindas: consome o próximo índice da lista embaralhada
 * salva na memória, e quando terminar de passar por toda a lista, gera outra lista aleatória
 * garantindo que a primeira frase da nova lista seja diferente da última frase da lista passada.
 */
export function avancarCicloBoasVindas(
  fila: readonly number[],
  ultimoIndice: number | null,
  total: number = MENSAGENS_BOAS_VINDAS.length,
  gerador: () => number = Math.random,
): { escolhido: number; novaFila: number[] } {
  if (total <= 0) return { escolhido: 0, novaFila: [] };
  if (total === 1) return { escolhido: 0, novaFila: [] };

  const filaValida =
    fila.length > 0 && fila.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < total)
      ? [...fila]
      : gerarNovoCicloEmbaralhado(total, ultimoIndice, gerador);

  if (ultimoIndice !== null && filaValida.length > 0 && filaValida[0] === ultimoIndice) {
    if (filaValida.length > 1) {
      const temp = filaValida[0];
      filaValida[0] = filaValida[1];
      filaValida[1] = temp;
    } else {
      const novoCiclo = gerarNovoCicloEmbaralhado(total, ultimoIndice, gerador);
      filaValida.splice(0, filaValida.length, ...novoCiclo);
    }
  }

  const escolhido = filaValida.shift() ?? 0;
  return { escolhido, novaFila: filaValida };
}

let filaBoasVindasGlobal: number[] = [];

export function resetarCicloBoasVindas(): void {
  filaBoasVindasGlobal = [];
}

/**
 * Sorteia ou avança o próximo índice da lista de boas-vindas pelo ciclo embaralhado (RN60–RN62).
 */
export function sortearIndiceBoasVindas(
  ultimoIndice: number | null = null,
  aleatorio?: number,
): number {
  const gerador = typeof aleatorio === "number" ? () => aleatorio : Math.random;
  const res = avancarCicloBoasVindas(
    filaBoasVindasGlobal,
    ultimoIndice,
    MENSAGENS_BOAS_VINDAS.length,
    gerador,
  );
  filaBoasVindasGlobal = res.novaFila;
  return res.escolhido;
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
  const negativo = centavos < 0;
  const reais = (Math.abs(centavos) / 100).toFixed(2).replace(".", ",");
  return negativo ? `-R$ ${reais}` : `R$ ${reais}`;
}

/**
 * Converte um valor digitado em Reais (ex.: `"180,00"`, `"180.50"`, `"180"`) para centavos inteiros (`18000`).
 * Retorna `null` se inválido ou menor/igual a zero.
 */
export function converterValorReaisParaCentavos(texto: string): number | null {
  const limpo = texto
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (!limpo) return null;

  let normalizado = limpo;
  if (limpo.includes(",") && limpo.includes(".")) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (limpo.includes(",")) {
    normalizado = limpo.replace(",", ".");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return null;
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero <= 0) {
    return null;
  }

  const centavos = Math.round(numero * 100);
  return centavos > 0 ? centavos : null;
}

export function formatarValorInputReais(centavos?: number | null): string {
  if (centavos === null || centavos === undefined || centavos <= 0) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export function formatarFormaPagamentoBr(forma?: string | null): string {
  if (!forma) return "—";
  switch (forma.toLowerCase()) {
    case "pix":
      return "PIX";
    case "dinheiro":
      return "Dinheiro";
    case "cartao":
      return "Cartão";
    case "transferencia":
      return "Transferência";
    case "convenio":
      return "Convênio";
    default:
      return forma;
  }
}

export function obterAnoMesIso(dataIso: string): string {
  return dataIso.trim().slice(0, 7);
}

export const DIAS_SEMANA_GRADE_ORDEM: readonly {
  diaSemana: number;
  nomeCurto: string;
  nomeCompleto: string;
}[] = [
  { diaSemana: 1, nomeCurto: "Seg", nomeCompleto: "Segunda-feira" },
  { diaSemana: 2, nomeCurto: "Ter", nomeCompleto: "Terça-feira" },
  { diaSemana: 3, nomeCurto: "Qua", nomeCompleto: "Quarta-feira" },
  { diaSemana: 4, nomeCurto: "Qui", nomeCompleto: "Quinta-feira" },
  { diaSemana: 5, nomeCurto: "Sex", nomeCompleto: "Sexta-feira" },
  { diaSemana: 6, nomeCurto: "Sáb", nomeCompleto: "Sábado" },
  { diaSemana: 0, nomeCurto: "Dom", nomeCompleto: "Domingo" },
];

export function formatarDiaSemanaCurtoBr(diaSemana: number): string {
  const encontrado = DIAS_SEMANA_GRADE_ORDEM.find(
    (d) => d.diaSemana === diaSemana,
  );
  return encontrado ? encontrado.nomeCurto : "—";
}

export function formatarDiaSemanaCompletoBr(diaSemana: number): string {
  const encontrado = DIAS_SEMANA_GRADE_ORDEM.find(
    (d) => d.diaSemana === diaSemana,
  );
  return encontrado ? encontrado.nomeCompleto : "—";
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

/**
 * Aplica máscara progressiva de horário `HH:MM` durante a digitação.
 */
export function aplicarMascaraHoraBr(valor: string): string {
  const limpo = valor.trim();
  if (/^\d{1,2}:\d{0,2}$/.test(limpo)) {
    return limpo;
  }
  const digitos = extrairDigitos(valor).slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

/**
 * Valida e normaliza um horário `HH:MM` (entre `00:00` e `23:59`).
 * Retorna `null` se inválido.
 */
export function validarHoraHhMm(texto: string): string | null {
  const limpo = texto.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(limpo);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function horaParaMinutos(horaHhMm: string): number | null {
  const norm = validarHoraHhMm(horaHhMm);
  if (!norm) return null;
  const [h, m] = norm.split(":").map(Number);
  return h * 60 + m;
}

export function intervalosHorariosConflitam(
  horaA: string,
  duracaoA: number,
  horaB: string,
  duracaoB: number,
): boolean {
  const iniA = horaParaMinutos(horaA);
  const iniB = horaParaMinutos(horaB);
  if (iniA === null || iniB === null) return false;
  const fimA = iniA + Math.max(1, duracaoA);
  const fimB = iniB + Math.max(1, duracaoB);
  return iniA < fimB && iniB < fimA;
}

const NOMES_DIAS_SEMANA_CURTOS = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;

const NOMES_MESES_BR = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function parseDataIsoLocal(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1);
}

export interface DiaCalendarioSemana {
  dataIso: string;
  nomeCurto: string;
  diaMesBr: string;
}

/**
 * Retorna os 7 dias da semana (Segunda a Domingo) que contém `dataReferenciaIso`.
 */
export function obterDiasDaSemana(
  dataReferenciaIso: string,
): DiaCalendarioSemana[] {
  const ref = parseDataIsoLocal(dataReferenciaIso);
  const diaSemana = ref.getDay(); // 0 = Dom, 1 = Seg, ..., 6 = Sáb
  const deslocamentoSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;

  const segunda = new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate() + deslocamentoSegunda,
  );

  const dias: DiaCalendarioSemana[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(
      segunda.getFullYear(),
      segunda.getMonth(),
      segunda.getDate() + i,
    );
    const dataIso = obterDataHojeIso(d);
    const nomeCurto = NOMES_DIAS_SEMANA_CURTOS[d.getDay()];
    const diaStr = String(d.getDate()).padStart(2, "0");
    const mesStr = String(d.getMonth() + 1).padStart(2, "0");
    dias.push({
      dataIso,
      nomeCurto,
      diaMesBr: `${diaStr}/${mesStr}`,
    });
  }
  return dias;
}

export interface DiaCalendarioMes {
  dataIso: string;
  dia: number;
  nomeCurto: string;
}

/**
 * Retorna todos os dias do mês correspondente a `dataReferenciaIso`.
 */
export function obterDiasDoMes(dataReferenciaIso: string): DiaCalendarioMes[] {
  const ref = parseDataIsoLocal(dataReferenciaIso);
  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();

  const dias: DiaCalendarioMes[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const d = new Date(ano, mes, dia);
    dias.push({
      dataIso: obterDataHojeIso(d),
      dia,
      nomeCurto: NOMES_DIAS_SEMANA_CURTOS[d.getDay()],
    });
  }
  return dias;
}

export function deslocarDiasIso(
  dataReferenciaIso: string,
  dias: number,
): string {
  const ref = parseDataIsoLocal(dataReferenciaIso);
  const nova = new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate() + dias,
  );
  return obterDataHojeIso(nova);
}

export function deslocarMesesIso(
  dataReferenciaIso: string,
  meses: number,
): string {
  const ref = parseDataIsoLocal(dataReferenciaIso);
  const nova = new Date(ref.getFullYear(), ref.getMonth() + meses, 1);
  return obterDataHojeIso(nova);
}

export function formatarMesAnoBr(dataReferenciaIso: string): string {
  const ref = parseDataIsoLocal(dataReferenciaIso);
  const nomeMes = NOMES_MESES_BR[ref.getMonth()] ?? "";
  return `${nomeMes} de ${ref.getFullYear()}`;
}

/**
 * Formata um tamanho em bytes para exibição amigável em pt-BR (ex.: "850 B", "124 KB", "3,2 MB") (RN44, RN68).
 */
export function formatarTamanhoBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.max(1, Math.round(kb))} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * Retorna um rótulo curto em maiúsculas para o tipo de arquivo a partir do nome ou MIME (RN44).
 */
export function obterRotuloTipoArquivo(
  nomeArquivo: string,
  mime?: string | null,
): string {
  const partes = nomeArquivo.trim().split(".");
  if (partes.length > 1) {
    const ext = partes[partes.length - 1].trim().toUpperCase();
    if (ext) return ext;
  }
  if (mime) {
    if (mime.includes("pdf")) return "PDF";
    if (mime.includes("word")) return "DOCX";
    if (mime.includes("sheet") || mime.includes("excel")) return "XLSX";
    if (mime.includes("png")) return "PNG";
    if (mime.includes("jpeg")) return "JPG";
    if (mime.includes("text")) return "TXT";
  }
  return "ARQUIVO";
}

/**
 * Converte um objeto `File` selecionado pela usuária (botão ou arrastar e soltar) em Base64
 * para envio seguro ao backend via IPC.
 */
export function lerArquivoComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      if (typeof leitor.result === "string") {
        const idx = leitor.result.indexOf(";base64,");
        resolve(idx >= 0 ? leitor.result.slice(idx + 8) : leitor.result);
      } else {
        reject(new Error("Não foi possível ler o arquivo selecionado."));
      }
    };
    leitor.onerror = () => {
      reject(new Error("Não foi possível ler o arquivo selecionado."));
    };
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * Gera o nome sugerido para o arquivo de backup conforme RN51:
 * `backup-pacientes-AAAA-MM-DD-HHmm.lcbackup`.
 */
export function gerarNomeBackupSugerido(referencia: Date = new Date()): string {
  const ano = referencia.getFullYear();
  const mes = String(referencia.getMonth() + 1).padStart(2, "0");
  const dia = String(referencia.getDate()).padStart(2, "0");
  const hora = String(referencia.getHours()).padStart(2, "0");
  const min = String(referencia.getMinutes()).padStart(2, "0");
  return `backup-pacientes-${ano}-${mes}-${dia}-${hora}${min}.lcbackup`;
}

/**
 * Verifica se uma string inicia com uma data ISO válida `AAAA-MM-DD`.
 */
export function ehDataIsoBackupValida(valor?: string | null): boolean {
  if (!valor) return false;
  return /^\d{4}-\d{2}-\d{2}/.test(valor.trim());
}

/**
 * Formata a data/hora do último backup para exibição amigável em pt-BR (ex.: "06/11/2026 às 20:15" ou "06/11/2026").
 * Caso não exista ou não seja uma data ISO válida, retorna "Ainda não realizado" (RN53).
 */
export function formatarDataHoraBackupBr(dataIso?: string | null): string {
  if (!ehDataIsoBackupValida(dataIso)) {
    return "Ainda não realizado";
  }
  const limpo = dataIso!.trim();
  const dataBr = formatarDataBr(limpo);
  const matchHora = /T(\d{2}:\d{2})/.exec(limpo);
  if (matchHora) {
    return `${dataBr} às ${matchHora[1]}`;
  }
  return dataBr;
}

/**
 * Calcula quantos dias inteiros se passaram desde a data do último backup até `referencia` (RN53).
 * Retorna `null` se nunca houve backup ou se a string não for uma data ISO válida.
 */
export function calcularDiasDesdeUltimoBackup(
  ultimoBackupIso?: string | null,
  referencia: Date = new Date(),
): number | null {
  if (!ehDataIsoBackupValida(ultimoBackupIso)) {
    return null;
  }
  const parteData = ultimoBackupIso!.trim().slice(0, 10);
  const [ano, mes, dia] = parteData.split("-").map(Number);
  if (!ano || !mes || !dia) return null;

  const utcBackup = Date.UTC(ano, mes - 1, dia);
  const utcHoje = Date.UTC(
    referencia.getFullYear(),
    referencia.getMonth(),
    referencia.getDate(),
  );
  const diffDias = Math.floor((utcHoje - utcBackup) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDias);
}

/**
 * Retorna `true` se o último backup tiver sido realizado há mais de 7 dias (RN53).
 */
export function precisaLembreteBackup7Dias(
  ultimoBackupIso?: string | null,
  referencia: Date = new Date(),
): boolean {
  const dias = calcularDiasDesdeUltimoBackup(ultimoBackupIso, referencia);
  return dias !== null && dias > 7;
}


