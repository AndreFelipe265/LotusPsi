//! Módulo de normalização de texto sem acentos e dígitos para busca instantânea (F3-T1).

use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

/// Normaliza um texto para busca:
/// - Decompõe caracteres acentuados (NFD) e remove marcas combinantes (acentos/cedilha).
/// - Converte para minúsculas.
/// - Colapsa múltiplos espaços em um único espaço e remove espaços nas extremidades.
///
/// Exemplo: `"  João   José da Conceição "` -> `"joao jose da conceicao"`.
pub fn normalizar_busca(texto: &str) -> String {
    let sem_acento: String = texto
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase();

    sem_acento.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Extrai apenas os dígitos ASCII (`0-9`) de um texto (ex.: telefone com máscara).
///
/// Exemplo: `"(71) 99999-8888"` -> `"71999998888"`.
pub fn somente_digitos(texto: &str) -> String {
    texto.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// Verifica se um paciente corresponde ao termo de busca informado (RN17).
/// A busca é instantânea por nome (sem diferenciar maiúsculas/minúsculas nem acentos)
/// ou por telefone/WhatsApp (com ou sem máscara).
pub fn corresponde_busca_paciente(
    nome_busca_paciente: &str,
    telefone_paciente: Option<&str>,
    whatsapp_paciente: Option<&str>,
    termo_busca: &str,
) -> bool {
    let termo_limpo = termo_busca.trim();
    if termo_limpo.is_empty() {
        return true;
    }

    let termo_nome = normalizar_busca(termo_limpo);
    if !termo_nome.is_empty() && nome_busca_paciente.contains(&termo_nome) {
        return true;
    }

    let termo_digitos = somente_digitos(termo_limpo);
    if !termo_digitos.is_empty() {
        if let Some(tel) = telefone_paciente {
            let tel_digitos = somente_digitos(tel);
            if tel_digitos.contains(&termo_digitos) {
                return true;
            }
        }
        if let Some(zap) = whatsapp_paciente {
            let zap_digitos = somente_digitos(zap);
            if zap_digitos.contains(&termo_digitos) {
                return true;
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normaliza_nomes_sem_acento_e_minusculo() {
        assert_eq!(normalizar_busca("João"), "joao");
        assert_eq!(normalizar_busca("JOÃO DA SILVA"), "joao da silva");
        assert_eq!(
            normalizar_busca("  Maria   Conceição   Ávila  "),
            "maria conceicao avila"
        );
        assert_eq!(normalizar_busca("Ícaro Ômega Úrsula"), "icaro omega ursula");
    }

    #[test]
    fn extrai_somente_digitos_de_telefones() {
        assert_eq!(somente_digitos("(71) 99876-5432"), "71998765432");
        assert_eq!(somente_digitos("+55 71 9 8888-7777"), "5571988887777");
        assert_eq!(somente_digitos("71998765432"), "71998765432");
        assert_eq!(somente_digitos("sem digitos"), "");
    }

    #[test]
    fn busca_paciente_por_nome_sem_acento_e_por_telefone_com_ou_sem_mascara() {
        let nome_busca = normalizar_busca("João Pedro Conceição");
        let telefone = Some("71998765432");
        let whatsapp = Some("71991112222");

        // Busca vazia retorna true
        assert!(corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "   "
        ));

        // Busca por nome sem acento / maiúsculas
        assert!(corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "joao"
        ));
        assert!(corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "JOÃO"
        ));
        assert!(corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "conceicao"
        ));
        assert!(!corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "maria"
        ));

        // Busca por telefone sem máscara
        assert!(corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "998765432"
        ));

        // Busca por telefone com máscara
        assert!(corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "(71) 99876-5432"
        ));

        // Busca pelo WhatsApp com máscara
        assert!(corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "(71) 99111-2222"
        ));

        // Telefone diferente não encontra
        assert!(!corresponde_busca_paciente(
            &nome_busca,
            telefone,
            whatsapp,
            "(11) 90000-0000"
        ));
    }
}
