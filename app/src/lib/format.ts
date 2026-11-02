/**
 * Utilitários de formatação no padrão pt-BR (datas dd/mm/aaaa, idade e telefone).
 */

export function formatarDataBr(dataIso: string): string {
  const partes = dataIso.split("-");
  if (partes.length !== 3) return dataIso;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}
