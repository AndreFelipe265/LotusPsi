//! Comandos de aniversariantes do dia, próximos 7 dias e abertura do WhatsApp (`aniversariantes`, `whatsapp_parabens`) (F5-T1, F5-T2 — RN30–RN34).

use chrono::{Datelike, Local, NaiveDate};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::config::{
    ler_config_conn, CHAVE_CONFIG_MENSAGEM_ANIVERSARIO, MENSAGEM_ANIVERSARIO_PADRAO,
};
use crate::error::{Erro, Resultado};
use crate::state::AppState;
use crate::text::somente_digitos;

/// Dados de um aniversariante retornados ao painel inicial (RN30, RN31, RN34).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Aniversariante {
    pub id: String,
    pub nome: String,
    pub data_nascimento: String,
    pub data_comemoracao: String,
    pub idade_completando: u32,
    pub dias_ate_aniversario: i64,
    pub status: String,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
}

/// Verifica se o ano é bissexto no calendário gregoriano.
pub fn eh_ano_bissexto(ano: i32) -> bool {
    NaiveDate::from_ymd_opt(ano, 2, 29).is_some()
}

/// Retorna a data em que o aniversário de `nascimento` é comemorado no `ano` informado.
/// Regra do 29/02 (RN33): nascidos em 29/02 comemoram em 28/02 nos anos não bissextos.
pub fn data_aniversario_no_ano(nascimento: NaiveDate, ano: i32) -> Option<NaiveDate> {
    let mes = nascimento.month();
    let dia = nascimento.day();
    if mes == 2 && dia == 29 && !eh_ano_bissexto(ano) {
        NaiveDate::from_ymd_opt(ano, 2, 28)
    } else {
        NaiveDate::from_ymd_opt(ano, mes, dia)
    }
}

/// Calcula o próximo aniversário de um paciente a partir de `hoje` (inclusive),
/// retornando `(data_comemoracao, dias_ate_aniversario, idade_completando)`.
pub fn proximo_aniversario_a_partir_de(
    nascimento: NaiveDate,
    hoje: NaiveDate,
) -> Option<(NaiveDate, i64, u32)> {
    if nascimento > hoje {
        return None;
    }

    let ano_atual = hoje.year();
    let candidato_este_ano = data_aniversario_no_ano(nascimento, ano_atual)?;

    let (data_comemoracao, ano_comemoracao) = if candidato_este_ano >= hoje {
        (candidato_este_ano, ano_atual)
    } else {
        let proximo_ano = ano_atual + 1;
        let candidato_proximo = data_aniversario_no_ano(nascimento, proximo_ano)?;
        (candidato_proximo, proximo_ano)
    };

    let dias_ate = (data_comemoracao - hoje).num_days();
    let idade = (ano_comemoracao - nascimento.year()).max(0) as u32;

    Some((data_comemoracao, dias_ate, idade))
}

/// Extrai o primeiro nome do paciente para interpolação em `{primeiro_nome}` (RN32).
pub fn extrair_primeiro_nome(nome_completo: &str) -> String {
    nome_completo
        .split_whitespace()
        .next()
        .unwrap_or("Paciente")
        .to_string()
}

/// Codifica um texto em percent-encoding UTF-8 seguro para query string de URL (`?text=...`).
pub fn codificar_url_componente(texto: &str) -> String {
    let mut saida = String::with_capacity(texto.len() * 2);
    for byte in texto.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                saida.push(*byte as char);
            }
            _ => {
                saida.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    saida
}

/// Formata o número de telefone/WhatsApp brasileiro garantindo o DDI `55` (RN31).
pub fn normalizar_numero_whatsapp_br(numero: &str) -> Resultado<String> {
    let digitos = somente_digitos(numero);
    if digitos.len() < 10 {
        return Err(Erro::Validacao(
            "Este paciente não possui um número de telefone/WhatsApp válido cadastrado."
                .to_string(),
        ));
    }

    if digitos.starts_with("55") && (digitos.len() == 12 || digitos.len() == 13) {
        Ok(digitos)
    } else {
        Ok(format!("55{}", digitos))
    }
}

/// Monta a URL `https://wa.me/55<numero>?text=<mensagem>` interpolando `{primeiro_nome}` (RN31, RN32).
pub fn construir_url_whatsapp_parabens(
    nome_paciente: &str,
    numero_contato: &str,
    template_mensagem: &str,
) -> Resultado<String> {
    let numero_wa = normalizar_numero_whatsapp_br(numero_contato)?;
    let primeiro_nome = extrair_primeiro_nome(nome_paciente);
    let template = if template_mensagem.trim().is_empty() {
        MENSAGEM_ANIVERSARIO_PADRAO
    } else {
        template_mensagem.trim()
    };

    let mensagem_final = template.replace("{primeiro_nome}", &primeiro_nome);
    let texto_codificado = codificar_url_componente(&mensagem_final);

    Ok(format!("https://wa.me/{}?text={}", numero_wa, texto_codificado))
}

/// Consulta os aniversariantes entre `hoje` e `hoje + dias` (inclusive),
/// incluindo pacientes ativos e inativos (RN30, RN33, RN34).
pub fn listar_aniversariantes_conn(
    conn: &Connection,
    hoje: NaiveDate,
    dias: i64,
) -> Resultado<Vec<Aniversariante>> {
    if !(0..=365).contains(&dias) {
        return Err(Erro::Validacao(
            "O intervalo de dias deve estar entre 0 e 365.".to_string(),
        ));
    }

    let mut stmt = conn.prepare(
        "SELECT
            id,
            nome,
            nome_busca,
            data_nascimento,
            status,
            telefone,
            whatsapp
         FROM pacientes
         WHERE data_nascimento IS NOT NULL
           AND trim(data_nascimento) != '';",
    )?;

    let linhas = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
        ))
    })?;

    let mut encontrados: Vec<(String, Aniversariante)> = Vec::new();

    for linha in linhas {
        let (id, nome, nome_busca, data_nasc_str, status, telefone, whatsapp) = linha?;
        let Ok(nascimento) = NaiveDate::parse_from_str(data_nasc_str.trim(), "%Y-%m-%d") else {
            continue;
        };

        if let Some((data_comemoracao, dias_ate, idade_completando)) =
            proximo_aniversario_a_partir_de(nascimento, hoje)
        {
            if dias_ate >= 0 && dias_ate <= dias {
                encontrados.push((
                    nome_busca,
                    Aniversariante {
                        id,
                        nome,
                        data_nascimento: nascimento.format("%Y-%m-%d").to_string(),
                        data_comemoracao: data_comemoracao.format("%Y-%m-%d").to_string(),
                        idade_completando,
                        dias_ate_aniversario: dias_ate,
                        status,
                        telefone,
                        whatsapp,
                    },
                ));
            }
        }
    }

    encontrados.sort_by(|(busca_a, a), (busca_b, b)| {
        a.dias_ate_aniversario
            .cmp(&b.dias_ate_aniversario)
            .then_with(|| busca_a.cmp(busca_b))
            .then_with(|| a.nome.cmp(&b.nome))
    });

    Ok(encontrados.into_iter().map(|(_, item)| item).collect())
}

pub fn executar_aniversariantes_em_data(
    state: &AppState,
    dias: Option<i64>,
    hoje: NaiveDate,
) -> Resultado<Vec<Aniversariante>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let limite_dias = dias.unwrap_or(7);
    listar_aniversariantes_conn(conn, hoje, limite_dias)
}

pub fn executar_aniversariantes(
    state: &AppState,
    dias: Option<i64>,
) -> Resultado<Vec<Aniversariante>> {
    let hoje = Local::now().date_naive();
    executar_aniversariantes_em_data(state, dias, hoje)
}

/// Gera a URL `https://wa.me/55<numero>?text=<mensagem>` para um paciente do banco,
/// utilizando o `whatsapp` (ou `telefone` caso `whatsapp` esteja vazio) e a mensagem
/// configurada em `config` (RN31, RN32).
pub fn gerar_url_whatsapp_parabens_paciente(
    state: &AppState,
    paciente_id: &str,
) -> Resultado<String> {
    state.verificar_desbloqueado()?;
    let id_limpo = paciente_id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do paciente é obrigatório.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let dados_paciente: Option<(String, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT nome, telefone, whatsapp FROM pacientes WHERE id = ?1;",
            [id_limpo],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;

    let (nome, telefone, whatsapp) = dados_paciente.ok_or(Erro::NaoEncontrado)?;

    let contato = whatsapp
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or_else(|| telefone.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .ok_or_else(|| {
            Erro::Validacao(
                "Este paciente não possui telefone ou WhatsApp cadastrado.".to_string(),
            )
        })?;

    let template_salvo = ler_config_conn(conn, CHAVE_CONFIG_MENSAGEM_ANIVERSARIO)?;
    let template = template_salvo
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(MENSAGEM_ANIVERSARIO_PADRAO);

    construir_url_whatsapp_parabens(&nome, contato, template)
}

/// Abre uma URL `https://wa.me/...` no navegador padrão do sistema operacional (RN31).
/// Esta é a única abertura de link externo permitida no aplicativo e só ocorre mediante clique da usuária.
fn abrir_url_no_navegador_padrao(url: &str) -> Resultado<()> {
    if !url.starts_with("https://wa.me/55") {
        return Err(Erro::Validacao(
            "Apenas links de parabéns do WhatsApp (wa.me) são permitidos.".to_string(),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|_| Erro::Interno)?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|_| Erro::Interno)?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|_| Erro::Interno)?;
    }

    Ok(())
}

#[tauri::command]
pub fn aniversariantes(
    state: State<'_, AppState>,
    dias: Option<i64>,
) -> Resultado<Vec<Aniversariante>> {
    executar_aniversariantes(&state, dias)
}

#[tauri::command]
pub fn whatsapp_parabens(state: State<'_, AppState>, paciente_id: String) -> Resultado<String> {
    let url = gerar_url_whatsapp_parabens_paciente(&state, &paciente_id)?;
    let _ = abrir_url_no_navegador_padrao(&url);
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::config::definir_config_conn;
    use crate::commands::pacientes::{
        executar_paciente_criar, executar_paciente_definir_status, DadosPacienteInput,
    };
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use std::fs;
    use uuid::Uuid;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-aniversarios-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_rejeitam_acesso_quando_bloqueado() {
        let dir =
            std::env::temp_dir().join(format!("lc-aniversarios-lock-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());
        let hoje = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();

        assert_eq!(
            executar_aniversariantes_em_data(&state, Some(7), hoje),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            gerar_url_whatsapp_parabens_paciente(&state, "qualquer"),
            Err(Erro::Bloqueado)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn lista_aniversariantes_hoje_proximos_7_dias_inclui_inativos_e_virada_de_ano_rn30_rn31_rn34() {
        let state = criar_estado_desbloqueado();

        // Pacientes de teste:
        // 1. Ativo fazendo aniversário hoje (02/11)
        let p_hoje_ativo = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Carlos Eduardo".to_string(),
                data_nascimento: Some("1996-11-02".to_string()),
                telefone: Some("(71) 99111-2222".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Carlos");

        // 2. INATIVO fazendo aniversário hoje (02/11) — RN30 exige incluir inativos!
        let p_hoje_inativo = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Beatriz Almeida".to_string(),
                data_nascimento: Some("1986-11-02".to_string()),
                whatsapp: Some("(71) 98888-7777".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Beatriz");
        executar_paciente_definir_status(&state, &p_hoje_inativo.id, "inativo")
            .expect("inativar Beatriz");

        // 3. Próximos 7 dias: em 5 dias (07/11)
        let p_em_5_dias = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Daniela Souza".to_string(),
                data_nascimento: Some("2010-11-07".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Daniela");

        // 4. Exatamente em 7 dias (09/11)
        let p_em_7_dias = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Fernando Lima".to_string(),
                data_nascimento: Some("2000-11-09".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Fernando");

        // 5. Fora da janela: em 8 dias (10/11)
        let _p_em_8_dias = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Gabriela Rocha".to_string(),
                data_nascimento: Some("1995-11-10".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Gabriela");

        // 6. Virada de ano: nascido em 03/01/1992 quando hoje é 29/12/2026 (daqui a 5 dias, completando 35 anos em 2027)
        let p_virada = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Helena Martins".to_string(),
                data_nascimento: Some("1992-01-03".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Helena");

        let hoje = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();

        // Consulta apenas hoje (dias = 0)
        let apenas_hoje =
            executar_aniversariantes_em_data(&state, Some(0), hoje).expect("aniversariantes hoje");
        assert_eq!(apenas_hoje.len(), 2);
        // Ordenado por nome_busca: Beatriz (inativo) vem antes de Carlos (ativo)
        assert_eq!(apenas_hoje[0].id, p_hoje_inativo.id);
        assert_eq!(apenas_hoje[0].status, "inativo");
        assert_eq!(apenas_hoje[0].idade_completando, 40);
        assert_eq!(apenas_hoje[0].dias_ate_aniversario, 0);

        assert_eq!(apenas_hoje[1].id, p_hoje_ativo.id);
        assert_eq!(apenas_hoje[1].status, "ativo");
        assert_eq!(apenas_hoje[1].idade_completando, 30);
        assert_eq!(apenas_hoje[1].dias_ate_aniversario, 0);

        // Consulta hoje + próximos 7 dias (dias = 7)
        let ate_7_dias =
            executar_aniversariantes_em_data(&state, Some(7), hoje).expect("aniversariantes 7d");
        assert_eq!(ate_7_dias.len(), 4);
        assert_eq!(ate_7_dias[0].id, p_hoje_inativo.id);
        assert_eq!(ate_7_dias[1].id, p_hoje_ativo.id);
        assert_eq!(ate_7_dias[2].id, p_em_5_dias.id);
        assert_eq!(ate_7_dias[2].dias_ate_aniversario, 5);
        assert_eq!(ate_7_dias[2].idade_completando, 16);
        assert_eq!(ate_7_dias[3].id, p_em_7_dias.id);
        assert_eq!(ate_7_dias[3].dias_ate_aniversario, 7);
        assert_eq!(ate_7_dias[3].idade_completando, 26);

        // Consulta na virada de ano (29/12/2026 -> 03/01/2027 = 5 dias)
        let fim_de_ano = NaiveDate::from_ymd_opt(2026, 12, 29).unwrap();
        let lista_virada =
            executar_aniversariantes_em_data(&state, Some(7), fim_de_ano).expect("virada de ano");
        assert_eq!(lista_virada.len(), 1);
        assert_eq!(lista_virada[0].id, p_virada.id);
        assert_eq!(lista_virada[0].dias_ate_aniversario, 5);
        assert_eq!(lista_virada[0].idade_completando, 35);
        assert_eq!(lista_virada[0].data_comemoracao, "2027-01-03");

        let _ = fs::remove_dir_all(&state.data_dir);
    }

    #[test]
    fn regra_29_de_fevereiro_em_anos_bissextos_e_nao_bissextos_rn33() {
        let state = criar_estado_desbloqueado();

        let p_bissexto = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Lucas Bissexto".to_string(),
                data_nascimento: Some("2000-02-29".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Lucas");

        // 1. Ano NÃO bissexto (2026): em 28/02/2026 deve aparecer como aniversariante do dia (dias_ate = 0)
        let dia_28_fev_2026 = NaiveDate::from_ymd_opt(2026, 2, 28).unwrap();
        let lista_nao_bissexto =
            executar_aniversariantes_em_data(&state, Some(0), dia_28_fev_2026).expect("28/02/2026");
        assert_eq!(lista_nao_bissexto.len(), 1);
        assert_eq!(lista_nao_bissexto[0].id, p_bissexto.id);
        assert_eq!(lista_nao_bissexto[0].data_comemoracao, "2026-02-28");
        assert_eq!(lista_nao_bissexto[0].idade_completando, 26);
        assert_eq!(lista_nao_bissexto[0].dias_ate_aniversario, 0);

        // Em 25/02/2026 (ano não bissexto), falta 3 dias para 28/02/2026
        let dia_25_fev_2026 = NaiveDate::from_ymd_opt(2026, 2, 25).unwrap();
        let lista_25_fev =
            executar_aniversariantes_em_data(&state, Some(7), dia_25_fev_2026).expect("25/02/2026");
        assert_eq!(lista_25_fev.len(), 1);
        assert_eq!(lista_25_fev[0].dias_ate_aniversario, 3);
        assert_eq!(lista_25_fev[0].data_comemoracao, "2026-02-28");

        // 2. Ano BISSEXTO (2028): em 28/02/2028 falta 1 dia (comemora em 29/02/2028)
        let dia_28_fev_2028 = NaiveDate::from_ymd_opt(2028, 2, 28).unwrap();
        let hoje_28_2028 = executar_aniversariantes_em_data(&state, Some(0), dia_28_fev_2028)
            .expect("hoje 28/02/2028");
        assert!(hoje_28_2028.is_empty());

        let dia_29_fev_2028 = NaiveDate::from_ymd_opt(2028, 2, 29).unwrap();
        let hoje_29_2028 = executar_aniversariantes_em_data(&state, Some(0), dia_29_fev_2028)
            .expect("hoje 29/02/2028");
        assert_eq!(hoje_29_2028.len(), 1);
        assert_eq!(hoje_29_2028[0].data_comemoracao, "2028-02-29");
        assert_eq!(hoje_29_2028[0].idade_completando, 28);

        let _ = fs::remove_dir_all(&state.data_dir);
    }

    #[test]
    fn gera_url_whatsapp_parabens_com_mensagem_padrao_e_customizada_rn31_rn32() {
        let state = criar_estado_desbloqueado();

        let maria = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Maria Clara Oliveira".to_string(),
                data_nascimento: Some("1990-11-02".to_string()),
                telefone: Some("(71) 99876-5432".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Maria");

        // 1. Usa mensagem padrão com {primeiro_nome} = "Maria" e telefone com DDI 55
        let url_padrao =
            gerar_url_whatsapp_parabens_paciente(&state, &maria.id).expect("url padrão");
        assert!(url_padrao.starts_with("https://wa.me/5571998765432?text="));
        // "Olá, Maria! Feliz aniversário!" codificado em UTF-8
        assert!(url_padrao.contains("Maria"));
        assert!(url_padrao.contains("Louriedna"));

        // 2. Quando a usuária personaliza a mensagem em Configurações (RN32), usa o novo texto
        {
            let conn_guard = state.conn.lock().unwrap();
            let conn = conn_guard.as_ref().unwrap();
            definir_config_conn(
                conn,
                CHAVE_CONFIG_MENSAGEM_ANIVERSARIO,
                "Parabéns, {primeiro_nome}! Tudo de bom!",
            )
            .expect("salvar mensagem customizada");
        }

        let url_custom =
            gerar_url_whatsapp_parabens_paciente(&state, &maria.id).expect("url customizada");
        assert_eq!(
            url_custom,
            "https://wa.me/5571998765432?text=Parab%C3%A9ns%2C%20Maria%21%20Tudo%20de%20bom%21"
        );

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
