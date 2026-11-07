//! Comandos de gerenciamento do módulo Financeiro (`financeiro_*`) (F9-T2 — RN80–RN86).

use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{Erro, Resultado};
use crate::state::AppState;
use crate::text::normalizar_busca;

/// Limite rígido de caracteres da descrição de um lançamento financeiro (RN81).
pub const LIMITE_CARACTERES_DESCRICAO_FINANCEIRO: usize = 200;

/// Formas de pagamento permitidas no módulo financeiro (RN81).
pub const FORMAS_PAGAMENTO_VALIDAS: &[&str] =
    &["pix", "dinheiro", "cartao", "transferencia", "convenio"];

/// Representação completa de um lançamento financeiro retornado ao frontend (RN80–RN85).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LancamentoFinanceiro {
    pub id: String,
    pub paciente_id: Option<String>,
    pub paciente_nome: Option<String>,
    pub tipo: String,
    pub data: String,
    pub valor_centavos: i64,
    pub descricao: String,
    pub forma_pagamento: Option<String>,
    pub criado_em: String,
    pub atualizado_em: String,
}

/// Dados de entrada para criar ou atualizar um lançamento financeiro (RN81, RN85).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DadosLancamentoFinanceiroInput {
    pub paciente_id: Option<String>,
    pub tipo: String,
    pub data: String,
    pub valor_centavos: i64,
    pub descricao: String,
    pub forma_pagamento: Option<String>,
}

/// Resumo financeiro consolidado de um mês `AAAA-MM` (RN83).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResumoFinanceiroMensal {
    pub ano_mes: String,
    pub total_entradas_centavos: i64,
    pub total_gastos_centavos: i64,
    pub saldo_centavos: i64,
    pub quantidade_entradas: usize,
    pub quantidade_gastos: usize,
    pub quantidade_lancamentos: usize,
}

struct DadosLancamentoValidados {
    paciente_id: Option<String>,
    tipo: String,
    data: String,
    valor_centavos: i64,
    descricao: String,
    forma_pagamento: Option<String>,
}

/// Valida um identificador de mês `AAAA-MM`.
pub fn validar_ano_mes(ano_mes: &str) -> Resultado<String> {
    let limpo = ano_mes.trim();
    let partes: Vec<&str> = limpo.split('-').collect();
    if partes.len() != 2 || partes[0].len() != 4 || partes[1].len() != 2 {
        return Err(Erro::Validacao(
            "Mês de referência inválido. Use o formato AAAA-MM.".to_string(),
        ));
    }

    let ano: i32 = partes[0].parse().map_err(|_| {
        Erro::Validacao("Mês de referência inválido. Use o formato AAAA-MM.".to_string())
    })?;
    let mes: u32 = partes[1].parse().map_err(|_| {
        Erro::Validacao("Mês de referência inválido. Use o formato AAAA-MM.".to_string())
    })?;

    if !(1900..=2100).contains(&ano) || !(1..=12).contains(&mes) {
        return Err(Erro::Validacao(
            "Mês de referência inválido. Informe um mês entre 01 e 12.".to_string(),
        ));
    }

    Ok(format!("{:04}-{:02}", ano, mes))
}

fn validar_dados_lancamento(
    dados: &DadosLancamentoFinanceiroInput,
) -> Resultado<DadosLancamentoValidados> {
    let tipo = dados.tipo.trim().to_lowercase();
    if tipo != "entrada" && tipo != "gasto" {
        return Err(Erro::Validacao(
            "O tipo do lançamento deve ser 'entrada' ou 'gasto'.".to_string(),
        ));
    }

    let data_limpa = dados.data.trim();
    if data_limpa.is_empty() {
        return Err(Erro::Validacao(
            "A data do lançamento é obrigatória.".to_string(),
        ));
    }

    let data = NaiveDate::parse_from_str(data_limpa, "%Y-%m-%d").map_err(|_| {
        Erro::Validacao("Data do lançamento inválida. Use o formato dd/mm/aaaa.".to_string())
    })?;

    if dados.valor_centavos <= 0 {
        return Err(Erro::Validacao(
            "O valor do lançamento deve ser maior que zero.".to_string(),
        ));
    }

    let descricao = dados.descricao.trim().to_string();
    if descricao.is_empty() {
        return Err(Erro::Validacao(
            "A descrição do lançamento é obrigatória.".to_string(),
        ));
    }
    if descricao.chars().count() > LIMITE_CARACTERES_DESCRICAO_FINANCEIRO {
        return Err(Erro::Validacao(format!(
            "A descrição do lançamento deve ter no máximo {} caracteres.",
            LIMITE_CARACTERES_DESCRICAO_FINANCEIRO
        )));
    }

    let forma_pagamento = match dados
        .forma_pagamento
        .as_ref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
    {
        Some(fp) => {
            if !FORMAS_PAGAMENTO_VALIDAS.contains(&fp.as_str()) {
                return Err(Erro::Validacao(
                    "Forma de pagamento inválida. Escolha entre PIX, Dinheiro, Cartão, Transferência ou Convênio."
                        .to_string(),
                ));
            }
            Some(fp)
        }
        None => None,
    };

    // RN81: paciente é opcional e aplicável às entradas
    let paciente_id = if tipo == "entrada" {
        dados
            .paciente_id
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    };

    Ok(DadosLancamentoValidados {
        paciente_id,
        tipo,
        data: data.format("%Y-%m-%d").to_string(),
        valor_centavos: dados.valor_centavos,
        descricao,
        forma_pagamento,
    })
}

fn paciente_existe_conn(conn: &Connection, paciente_id: &str) -> Resultado<bool> {
    let existe: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM pacientes WHERE id = ?1;",
            [paciente_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(existe.is_some())
}

fn obter_lancamento_por_id_conn(conn: &Connection, id: &str) -> Resultado<LancamentoFinanceiro> {
    conn.query_row(
        "SELECT
            l.id,
            l.paciente_id,
            p.nome,
            l.tipo,
            l.data,
            l.valor_centavos,
            l.descricao,
            l.forma_pagamento,
            l.criado_em,
            l.atualizado_em
         FROM lancamentos_financeiros l
         LEFT JOIN pacientes p ON p.id = l.paciente_id
         WHERE l.id = ?1;",
        [id],
        |row| {
            Ok(LancamentoFinanceiro {
                id: row.get(0)?,
                paciente_id: row.get(1)?,
                paciente_nome: row.get(2)?,
                tipo: row.get(3)?,
                data: row.get(4)?,
                valor_centavos: row.get(5)?,
                descricao: row.get(6)?,
                forma_pagamento: row.get(7)?,
                criado_em: row.get(8)?,
                atualizado_em: row.get(9)?,
            })
        },
    )
    .optional()?
    .ok_or(Erro::NaoEncontrado)
}

/// Lista os lançamentos financeiros filtrados por mês (`AAAA-MM`), tipo (`entrada` | `gasto` | `todos`),
/// paciente opcional e termo de busca sem acento na descrição ou no nome do paciente,
/// ordenados de forma decrescente por data (RN84).
pub fn executar_financeiro_listar(
    state: &AppState,
    ano_mes: Option<&str>,
    tipo: Option<&str>,
    busca: Option<&str>,
    paciente_id: Option<&str>,
) -> Resultado<Vec<LancamentoFinanceiro>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let prefixo_mes = match ano_mes.map(str::trim).filter(|s| !s.is_empty()) {
        Some(am) => Some(format!("{}-%", validar_ano_mes(am)?)),
        None => None,
    };

    let filtro_tipo = match tipo.map(str::trim).filter(|s| !s.is_empty()) {
        Some(t) => {
            let t_low = t.to_lowercase();
            if t_low == "todos" {
                None
            } else if t_low == "entrada" || t_low == "gasto" {
                Some(t_low)
            } else {
                return Err(Erro::Validacao(
                    "Filtro de tipo inválido. Use 'todos', 'entrada' ou 'gasto'.".to_string(),
                ));
            }
        }
        None => None,
    };

    let filtro_paciente = paciente_id.map(str::trim).filter(|s| !s.is_empty());
    let termo_busca = busca.map(normalizar_busca).filter(|s| !s.is_empty());

    let mut stmt = conn.prepare(
        "SELECT
            l.id,
            l.paciente_id,
            p.nome,
            l.tipo,
            l.data,
            l.valor_centavos,
            l.descricao,
            l.forma_pagamento,
            l.criado_em,
            l.atualizado_em
         FROM lancamentos_financeiros l
         LEFT JOIN pacientes p ON p.id = l.paciente_id
         WHERE (?1 IS NULL OR l.data LIKE ?1)
           AND (?2 IS NULL OR l.tipo = ?2)
           AND (?3 IS NULL OR l.paciente_id = ?3)
         ORDER BY l.data DESC, l.criado_em DESC;",
    )?;

    let linhas = stmt.query_map(params![prefixo_mes, filtro_tipo, filtro_paciente], |row| {
        Ok(LancamentoFinanceiro {
            id: row.get(0)?,
            paciente_id: row.get(1)?,
            paciente_nome: row.get(2)?,
            tipo: row.get(3)?,
            data: row.get(4)?,
            valor_centavos: row.get(5)?,
            descricao: row.get(6)?,
            forma_pagamento: row.get(7)?,
            criado_em: row.get(8)?,
            atualizado_em: row.get(9)?,
        })
    })?;

    let mut resultado = Vec::new();
    for linha in linhas {
        let item = linha?;
        if let Some(ref termo) = termo_busca {
            let desc_norm = normalizar_busca(&item.descricao);
            let pac_norm = item
                .paciente_nome
                .as_deref()
                .map(normalizar_busca)
                .unwrap_or_default();
            if !desc_norm.contains(termo) && !pac_norm.contains(termo) {
                continue;
            }
        }
        resultado.push(item);
    }

    Ok(resultado)
}

/// Calcula o resumo financeiro consolidado de um mês `AAAA-MM` (RN83):
/// total de entradas, total de gastos, saldo líquido e contagens.
pub fn executar_financeiro_resumo_mensal(
    state: &AppState,
    ano_mes: &str,
) -> Resultado<ResumoFinanceiroMensal> {
    state.verificar_desbloqueado()?;
    let ano_mes_validado = validar_ano_mes(ano_mes)?;
    let prefixo = format!("{}-%", ano_mes_validado);

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let mut stmt = conn.prepare(
        "SELECT tipo, valor_centavos
         FROM lancamentos_financeiros
         WHERE data LIKE ?1;",
    )?;

    let linhas = stmt.query_map([&prefixo], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;

    let mut total_entradas_centavos: i64 = 0;
    let mut total_gastos_centavos: i64 = 0;
    let mut quantidade_entradas: usize = 0;
    let mut quantidade_gastos: usize = 0;

    for linha in linhas {
        let (tipo, valor) = linha?;
        if tipo == "entrada" {
            total_entradas_centavos += valor;
            quantidade_entradas += 1;
        } else if tipo == "gasto" {
            total_gastos_centavos += valor;
            quantidade_gastos += 1;
        }
    }

    let saldo_centavos = total_entradas_centavos - total_gastos_centavos;
    let quantidade_lancamentos = quantidade_entradas + quantidade_gastos;

    Ok(ResumoFinanceiroMensal {
        ano_mes: ano_mes_validado,
        total_entradas_centavos,
        total_gastos_centavos,
        saldo_centavos,
        quantidade_entradas,
        quantidade_gastos,
        quantidade_lancamentos,
    })
}

/// Cria um novo lançamento financeiro (entrada ou gasto) (RN80, RN81, RN85).
pub fn executar_financeiro_criar(
    state: &AppState,
    dados: &DadosLancamentoFinanceiroInput,
) -> Resultado<LancamentoFinanceiro> {
    state.verificar_desbloqueado()?;
    let val = validar_dados_lancamento(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    if let Some(ref pid) = val.paciente_id {
        if !paciente_existe_conn(conn, pid)? {
            return Err(Erro::NaoEncontrado);
        }
    }

    let id = Uuid::new_v4().to_string();
    let agora = Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO lancamentos_financeiros (
            id,
            paciente_id,
            tipo,
            data,
            valor_centavos,
            descricao,
            forma_pagamento,
            criado_em,
            atualizado_em
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8);",
        params![
            id,
            val.paciente_id,
            val.tipo,
            val.data,
            val.valor_centavos,
            val.descricao,
            val.forma_pagamento,
            agora,
        ],
    )?;

    obter_lancamento_por_id_conn(conn, &id)
}

/// Atualiza um lançamento financeiro existente (RN85).
pub fn executar_financeiro_atualizar(
    state: &AppState,
    id: &str,
    dados: &DadosLancamentoFinanceiroInput,
) -> Resultado<LancamentoFinanceiro> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do lançamento é obrigatório.".to_string(),
        ));
    }

    let val = validar_dados_lancamento(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let existente = obter_lancamento_por_id_conn(conn, id_limpo)?;
    if let Some(ref pid) = val.paciente_id {
        if !paciente_existe_conn(conn, pid)? {
            return Err(Erro::NaoEncontrado);
        }
    }

    let mut atualizado_em = Local::now().to_rfc3339();
    if atualizado_em == existente.criado_em {
        atualizado_em = (Local::now() + Duration::milliseconds(1)).to_rfc3339();
    }

    conn.execute(
        "UPDATE lancamentos_financeiros
         SET paciente_id = ?1,
             tipo = ?2,
             data = ?3,
             valor_centavos = ?4,
             descricao = ?5,
             forma_pagamento = ?6,
             atualizado_em = ?7
         WHERE id = ?8;",
        params![
            val.paciente_id,
            val.tipo,
            val.data,
            val.valor_centavos,
            val.descricao,
            val.forma_pagamento,
            atualizado_em,
            id_limpo,
        ],
    )?;

    obter_lancamento_por_id_conn(conn, id_limpo)
}

/// Exclui um lançamento financeiro pelo ID (RN85).
pub fn executar_financeiro_excluir(state: &AppState, id: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id_limpo = id.trim();
    let linhas_afetadas = conn.execute(
        "DELETE FROM lancamentos_financeiros WHERE id = ?1;",
        [id_limpo],
    )?;
    if linhas_afetadas == 0 {
        return Err(Erro::NaoEncontrado);
    }

    Ok(())
}

#[tauri::command]
pub fn financeiro_listar(
    state: State<'_, AppState>,
    ano_mes: Option<String>,
    tipo: Option<String>,
    busca: Option<String>,
    paciente_id: Option<String>,
) -> Resultado<Vec<LancamentoFinanceiro>> {
    executar_financeiro_listar(
        &state,
        ano_mes.as_deref(),
        tipo.as_deref(),
        busca.as_deref(),
        paciente_id.as_deref(),
    )
}

#[tauri::command]
pub fn financeiro_resumo_mensal(
    state: State<'_, AppState>,
    ano_mes: String,
) -> Resultado<ResumoFinanceiroMensal> {
    executar_financeiro_resumo_mensal(&state, &ano_mes)
}

#[tauri::command]
pub fn financeiro_criar(
    state: State<'_, AppState>,
    dados: DadosLancamentoFinanceiroInput,
) -> Resultado<LancamentoFinanceiro> {
    executar_financeiro_criar(&state, &dados)
}

#[tauri::command]
pub fn financeiro_atualizar(
    state: State<'_, AppState>,
    id: String,
    dados: DadosLancamentoFinanceiroInput,
) -> Resultado<LancamentoFinanceiro> {
    executar_financeiro_atualizar(&state, &id, &dados)
}

#[tauri::command]
pub fn financeiro_excluir(state: State<'_, AppState>, id: String) -> Resultado<()> {
    executar_financeiro_excluir(&state, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::pacientes::{
        executar_paciente_criar, executar_paciente_excluir, DadosPacienteInput,
    };
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use std::fs;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-financeiro-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_financeiro_rejeitam_quando_bloqueado() {
        let dir = std::env::temp_dir().join(format!("lc-financeiro-lock-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(
            executar_financeiro_listar(&state, Some("2026-11"), None, None, None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_financeiro_resumo_mensal(&state, "2026-11"),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_financeiro_criar(
                &state,
                &DadosLancamentoFinanceiroInput {
                    paciente_id: None,
                    tipo: "entrada".to_string(),
                    data: "2026-11-06".to_string(),
                    valor_centavos: 18000,
                    descricao: "Sessão".to_string(),
                    forma_pagamento: Some("pix".to_string()),
                }
            ),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_financeiro_excluir(&state, "l-1"),
            Err(Erro::Bloqueado)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn validacoes_financeiro_tipo_valor_descricao_e_forma_pagamento() {
        let state = criar_estado_desbloqueado();

        // 1. Tipo inválido
        let res_tipo = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: None,
                tipo: "investimento".to_string(),
                data: "2026-11-06".to_string(),
                valor_centavos: 10000,
                descricao: "Teste".to_string(),
                forma_pagamento: None,
            },
        );
        assert!(matches!(res_tipo, Err(Erro::Validacao(_))));

        // 2. Valor <= 0
        let res_valor = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: None,
                tipo: "entrada".to_string(),
                data: "2026-11-06".to_string(),
                valor_centavos: 0,
                descricao: "Sessão".to_string(),
                forma_pagamento: None,
            },
        );
        assert!(matches!(res_valor, Err(Erro::Validacao(_))));

        // 3. Descrição vazia ou acima de 200 caracteres
        let res_desc_vazia = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: None,
                tipo: "gasto".to_string(),
                data: "2026-11-06".to_string(),
                valor_centavos: 5000,
                descricao: "   ".to_string(),
                forma_pagamento: None,
            },
        );
        assert!(matches!(res_desc_vazia, Err(Erro::Validacao(_))));

        let res_desc_longa = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: None,
                tipo: "gasto".to_string(),
                data: "2026-11-06".to_string(),
                valor_centavos: 5000,
                descricao: "a".repeat(201),
                forma_pagamento: None,
            },
        );
        assert!(matches!(res_desc_longa, Err(Erro::Validacao(msg)) if msg.contains("200")));

        // 4. Forma de pagamento inválida
        let res_fp = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: None,
                tipo: "entrada".to_string(),
                data: "2026-11-06".to_string(),
                valor_centavos: 15000,
                descricao: "Sessão".to_string(),
                forma_pagamento: Some("cheque".to_string()),
            },
        );
        assert!(matches!(res_fp, Err(Erro::Validacao(_))));

        let _ = fs::remove_dir_all(&state.data_dir);
    }

    #[test]
    fn crud_completo_vinculo_opcional_paciente_resumo_mensal_e_busca_sem_acento() {
        let state = criar_estado_desbloqueado();

        let joao = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "João da Conceição".to_string(),
                valor_sessao_centavos: Some(18000),
                ..Default::default()
            },
        )
        .expect("criar paciente João");

        // 1. Entrada vinculada a paciente (R$ 180,00 via PIX)
        let e1 = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: Some(joao.id.clone()),
                tipo: "entrada".to_string(),
                data: "2026-11-05".to_string(),
                valor_centavos: 18000,
                descricao: "Sessão individual".to_string(),
                forma_pagamento: Some("pix".to_string()),
            },
        )
        .expect("criar entrada vinculada");
        assert_eq!(e1.paciente_id.as_deref(), Some(joao.id.as_str()));
        assert_eq!(e1.paciente_nome.as_deref(), Some("João da Conceição"));

        // 2. Entrada sem paciente (ex.: palestra/supervisão R$ 250,00)
        let e2 = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: None,
                tipo: "entrada".to_string(),
                data: "2026-11-10".to_string(),
                valor_centavos: 25000,
                descricao: "Supervisão clínica".to_string(),
                forma_pagamento: Some("transferencia".to_string()),
            },
        )
        .expect("criar entrada avulsa");
        assert!(e2.paciente_id.is_none());

        // 3. Gasto do consultório (R$ 120,00 — mesmo passando paciente_id, gasto ignora vínculo)
        let g1 = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: Some(joao.id.clone()),
                tipo: "gasto".to_string(),
                data: "2026-11-08".to_string(),
                valor_centavos: 12000,
                descricao: "Energia elétrica e internet".to_string(),
                forma_pagamento: Some("pix".to_string()),
            },
        )
        .expect("criar gasto");
        assert!(g1.paciente_id.is_none());

        // 4. Lançamento em outro mês (outubro/2026) não afeta o resumo de novembro/2026
        let _outro_mes = executar_financeiro_criar(
            &state,
            &DadosLancamentoFinanceiroInput {
                paciente_id: None,
                tipo: "gasto".to_string(),
                data: "2026-10-25".to_string(),
                valor_centavos: 99900,
                descricao: "Aluguel outubro".to_string(),
                forma_pagamento: None,
            },
        )
        .expect("criar lançamento outubro");

        // 5. Verificar resumo mensal de 2026-11 (RN83):
        // Entradas = 18000 + 25000 = 43000; Gastos = 12000; Saldo = 31000
        let resumo =
            executar_financeiro_resumo_mensal(&state, "2026-11").expect("resumo mensal 2026-11");
        assert_eq!(resumo.ano_mes, "2026-11");
        assert_eq!(resumo.total_entradas_centavos, 43000);
        assert_eq!(resumo.total_gastos_centavos, 12000);
        assert_eq!(resumo.saldo_centavos, 31000);
        assert_eq!(resumo.quantidade_entradas, 2);
        assert_eq!(resumo.quantidade_gastos, 1);
        assert_eq!(resumo.quantidade_lancamentos, 3);

        // 6. Listar mês 2026-11 em ordem decrescente de data (10/11, 08/11, 05/11) (RN84)
        let lista_nov = executar_financeiro_listar(&state, Some("2026-11"), None, None, None)
            .expect("listar 2026-11");
        assert_eq!(lista_nov.len(), 3);
        assert_eq!(lista_nov[0].id, e2.id);
        assert_eq!(lista_nov[1].id, g1.id);
        assert_eq!(lista_nov[2].id, e1.id);

        // 7. Filtro por tipo e busca sem acento ("joao" -> "João da Conceição", "eletrica" -> "elétrica")
        let so_gastos =
            executar_financeiro_listar(&state, Some("2026-11"), Some("gasto"), None, None)
                .expect("filtrar gastos");
        assert_eq!(so_gastos.len(), 1);
        assert_eq!(so_gastos[0].id, g1.id);

        let busca_joao =
            executar_financeiro_listar(&state, Some("2026-11"), None, Some("joao"), None)
                .expect("buscar joao sem acento");
        assert_eq!(busca_joao.len(), 1);
        assert_eq!(busca_joao[0].id, e1.id);

        let busca_eletrica =
            executar_financeiro_listar(&state, Some("2026-11"), None, Some("eletrica"), None)
                .expect("buscar eletrica sem acento");
        assert_eq!(busca_eletrica.len(), 1);
        assert_eq!(busca_eletrica[0].id, g1.id);

        // 8. Atualizar lançamento (RN85)
        let e1_atualizado = executar_financeiro_atualizar(
            &state,
            &e1.id,
            &DadosLancamentoFinanceiroInput {
                paciente_id: Some(joao.id.clone()),
                tipo: "entrada".to_string(),
                data: "2026-11-05".to_string(),
                valor_centavos: 20000,
                descricao: "Sessão individual (ajustada)".to_string(),
                forma_pagamento: Some("cartao".to_string()),
            },
        )
        .expect("atualizar lançamento");
        assert_eq!(e1_atualizado.valor_centavos, 20000);
        assert_eq!(e1_atualizado.forma_pagamento.as_deref(), Some("cartao"));

        // 9. Excluir paciente mantém o lançamento financeiro com paciente_id = NULL (ON DELETE SET NULL — RN81)
        executar_paciente_excluir(&state, &joao.id, "João da Conceição").expect("excluir João");
        let apos_exclusao_paciente =
            executar_financeiro_listar(&state, Some("2026-11"), None, None, None)
                .expect("listar após exclusão do paciente");
        let lanc_joao = apos_exclusao_paciente
            .iter()
            .find(|l| l.id == e1.id)
            .expect("lançamento continua existindo");
        assert!(lanc_joao.paciente_id.is_none());

        // 10. Excluir lançamento financeiro (RN85)
        executar_financeiro_excluir(&state, &g1.id).expect("excluir gasto");
        let resumo_apos =
            executar_financeiro_resumo_mensal(&state, "2026-11").expect("resumo após exclusão");
        assert_eq!(resumo_apos.total_entradas_centavos, 45000);
        assert_eq!(resumo_apos.total_gastos_centavos, 0);
        assert_eq!(resumo_apos.saldo_centavos, 45000);

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
