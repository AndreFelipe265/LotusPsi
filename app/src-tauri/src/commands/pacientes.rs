//! Comandos de gerenciamento de pacientes (`pacientes_*`, `paciente_*`) (F3-T1).

use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{Erro, Resultado};
use crate::state::AppState;
use crate::text::{corresponde_busca_paciente, normalizar_busca, somente_digitos};

/// Resumo de paciente retornado na listagem (T05).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PacienteResumo {
    pub id: String,
    pub nome: String,
    pub data_nascimento: Option<String>,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
    pub status: String,
    pub ultima_sessao: Option<String>,
}

/// Dados completos do paciente para o perfil (T07) e edição (T06).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Paciente {
    pub id: String,
    pub nome: String,
    pub data_nascimento: Option<String>,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub endereco: Option<String>,
    pub nome_mae: Option<String>,
    pub nome_pai: Option<String>,
    pub responsavel_nome: Option<String>,
    pub responsavel_parentesco: Option<String>,
    pub responsavel_telefone: Option<String>,
    pub contato_emergencia_nome: Option<String>,
    pub contato_emergencia_telefone: Option<String>,
    pub documento: Option<String>,
    pub ocupacao: Option<String>,
    pub motivo_procura: Option<String>,
    pub modalidade: Option<String>,
    pub convenio_nome: Option<String>,
    pub valor_sessao_centavos: Option<i64>,
    pub observacoes: Option<String>,
    pub status: String,
    pub inativado_em: Option<String>,
    pub criado_em: String,
    pub atualizado_em: String,
    pub total_sessoes: i64,
    pub ultima_sessao: Option<String>,
}

/// Dados de entrada para criação e atualização de paciente (RN10).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DadosPacienteInput {
    pub nome: String,
    pub data_nascimento: Option<String>,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub endereco: Option<String>,
    pub nome_mae: Option<String>,
    pub nome_pai: Option<String>,
    pub responsavel_nome: Option<String>,
    pub responsavel_parentesco: Option<String>,
    pub responsavel_telefone: Option<String>,
    pub contato_emergencia_nome: Option<String>,
    pub contato_emergencia_telefone: Option<String>,
    pub documento: Option<String>,
    pub ocupacao: Option<String>,
    pub motivo_procura: Option<String>,
    pub modalidade: Option<String>,
    pub convenio_nome: Option<String>,
    pub valor_sessao_centavos: Option<i64>,
    pub observacoes: Option<String>,
}

struct DadosPacienteNormalizados {
    nome: String,
    nome_busca: String,
    data_nascimento: Option<String>,
    telefone: Option<String>,
    whatsapp: Option<String>,
    email: Option<String>,
    endereco: Option<String>,
    nome_mae: Option<String>,
    nome_pai: Option<String>,
    responsavel_nome: Option<String>,
    responsavel_parentesco: Option<String>,
    responsavel_telefone: Option<String>,
    contato_emergencia_nome: Option<String>,
    contato_emergencia_telefone: Option<String>,
    documento: Option<String>,
    ocupacao: Option<String>,
    motivo_procura: Option<String>,
    modalidade: Option<String>,
    convenio_nome: Option<String>,
    valor_sessao_centavos: Option<i64>,
    observacoes: Option<String>,
}

fn limpar_opcional(valor: &Option<String>) -> Option<String> {
    valor
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn limpar_telefone_opcional(valor: &Option<String>) -> Option<String> {
    valor
        .as_ref()
        .map(|s| somente_digitos(s))
        .filter(|s| !s.is_empty())
}

fn validar_e_normalizar_dados(dados: &DadosPacienteInput) -> Resultado<DadosPacienteNormalizados> {
    let nome = dados.nome.trim().to_string();
    if nome.is_empty() {
        return Err(Erro::Validacao(
            "O nome completo do paciente é obrigatório.".to_string(),
        ));
    }

    let nome_busca = normalizar_busca(&nome);
    if nome_busca.is_empty() {
        return Err(Erro::Validacao(
            "O nome completo do paciente é inválido.".to_string(),
        ));
    }

    let data_nascimento = limpar_opcional(&dados.data_nascimento);
    if let Some(ref data_str) = data_nascimento {
        let data = NaiveDate::parse_from_str(data_str, "%Y-%m-%d").map_err(|_| {
            Erro::Validacao("Data de nascimento inválida. Use o formato dd/mm/aaaa.".to_string())
        })?;
        let hoje = Local::now().date_naive();
        if data > hoje {
            return Err(Erro::Validacao(
                "A data de nascimento não pode ser uma data futura.".to_string(),
            ));
        }
    }

    let modalidade = limpar_opcional(&dados.modalidade);
    if let Some(ref m) = modalidade {
        if m != "particular" && m != "convenio" {
            return Err(Erro::Validacao(
                "Modalidade inválida. Escolha Particular ou Convênio.".to_string(),
            ));
        }
    }

    if let Some(valor) = dados.valor_sessao_centavos {
        if valor < 0 {
            return Err(Erro::Validacao(
                "O valor da sessão não pode ser negativo.".to_string(),
            ));
        }
    }

    Ok(DadosPacienteNormalizados {
        nome,
        nome_busca,
        data_nascimento,
        telefone: limpar_telefone_opcional(&dados.telefone),
        whatsapp: limpar_telefone_opcional(&dados.whatsapp),
        email: limpar_opcional(&dados.email),
        endereco: limpar_opcional(&dados.endereco),
        nome_mae: limpar_opcional(&dados.nome_mae),
        nome_pai: limpar_opcional(&dados.nome_pai),
        responsavel_nome: limpar_opcional(&dados.responsavel_nome),
        responsavel_parentesco: limpar_opcional(&dados.responsavel_parentesco),
        responsavel_telefone: limpar_telefone_opcional(&dados.responsavel_telefone),
        contato_emergencia_nome: limpar_opcional(&dados.contato_emergencia_nome),
        contato_emergencia_telefone: limpar_telefone_opcional(&dados.contato_emergencia_telefone),
        documento: limpar_opcional(&dados.documento),
        ocupacao: limpar_opcional(&dados.ocupacao),
        motivo_procura: limpar_opcional(&dados.motivo_procura),
        modalidade,
        convenio_nome: limpar_opcional(&dados.convenio_nome),
        valor_sessao_centavos: dados.valor_sessao_centavos,
        observacoes: limpar_opcional(&dados.observacoes),
    })
}

fn obter_paciente_por_id_conn(conn: &Connection, id: &str) -> Resultado<Paciente> {
    let mut stmt = conn.prepare(
        "SELECT
            p.id,
            p.nome,
            p.data_nascimento,
            p.telefone,
            p.whatsapp,
            p.email,
            p.endereco,
            p.nome_mae,
            p.nome_pai,
            p.responsavel_nome,
            p.responsavel_parentesco,
            p.responsavel_telefone,
            p.contato_emergencia_nome,
            p.contato_emergencia_telefone,
            p.documento,
            p.ocupacao,
            p.motivo_procura,
            p.modalidade,
            p.convenio_nome,
            p.valor_sessao_centavos,
            p.observacoes,
            p.status,
            p.inativado_em,
            p.criado_em,
            p.atualizado_em,
            (SELECT COUNT(*) FROM sessoes s WHERE s.paciente_id = p.id) AS total_sessoes,
            (SELECT MAX(s.data) FROM sessoes s WHERE s.paciente_id = p.id) AS ultima_sessao
         FROM pacientes p
         WHERE p.id = ?1;",
    )?;

    let paciente = stmt
        .query_row([id], |row| {
            Ok(Paciente {
                id: row.get(0)?,
                nome: row.get(1)?,
                data_nascimento: row.get(2)?,
                telefone: row.get(3)?,
                whatsapp: row.get(4)?,
                email: row.get(5)?,
                endereco: row.get(6)?,
                nome_mae: row.get(7)?,
                nome_pai: row.get(8)?,
                responsavel_nome: row.get(9)?,
                responsavel_parentesco: row.get(10)?,
                responsavel_telefone: row.get(11)?,
                contato_emergencia_nome: row.get(12)?,
                contato_emergencia_telefone: row.get(13)?,
                documento: row.get(14)?,
                ocupacao: row.get(15)?,
                motivo_procura: row.get(16)?,
                modalidade: row.get(17)?,
                convenio_nome: row.get(18)?,
                valor_sessao_centavos: row.get(19)?,
                observacoes: row.get(20)?,
                status: row.get(21)?,
                inativado_em: row.get(22)?,
                criado_em: row.get(23)?,
                atualizado_em: row.get(24)?,
                total_sessoes: row.get(25)?,
                ultima_sessao: row.get(26)?,
            })
        })
        .optional()?;

    paciente.ok_or(Erro::NaoEncontrado)
}

/// Lista pacientes aplicando filtro de status (RN15: padrão `ativo`) e busca por nome/telefone (RN17),
/// em ordem alfabética por nome (RN16).
pub fn executar_pacientes_listar(
    state: &AppState,
    busca: Option<&str>,
    status: Option<&str>,
) -> Resultado<Vec<PacienteResumo>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let filtro_status = status
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("ativo");

    if filtro_status != "ativo" && filtro_status != "inativo" && filtro_status != "todos" {
        return Err(Erro::Validacao("Filtro de status inválido.".to_string()));
    }

    let mut stmt = conn.prepare(
        "SELECT
            p.id,
            p.nome,
            p.nome_busca,
            p.data_nascimento,
            p.telefone,
            p.whatsapp,
            p.status,
            (SELECT MAX(s.data) FROM sessoes s WHERE s.paciente_id = p.id) AS ultima_sessao
         FROM pacientes p
         WHERE (?1 = 'todos' OR p.status = ?1)
         ORDER BY p.nome_busca ASC, p.nome ASC;",
    )?;

    let termo_busca = busca.unwrap_or("").trim();

    let linhas = stmt.query_map([filtro_status], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<String>>(7)?,
        ))
    })?;

    let mut resultado = Vec::new();
    for linha in linhas {
        let (id, nome, nome_busca, data_nascimento, telefone, whatsapp, status_p, ultima_sessao) =
            linha?;

        if corresponde_busca_paciente(
            &nome_busca,
            telefone.as_deref(),
            whatsapp.as_deref(),
            termo_busca,
        ) {
            resultado.push(PacienteResumo {
                id,
                nome,
                data_nascimento,
                telefone,
                whatsapp,
                status: status_p,
                ultima_sessao,
            });
        }
    }

    Ok(resultado)
}

/// Obtém os dados completos de um paciente pelo ID.
pub fn executar_paciente_obter(state: &AppState, id: &str) -> Resultado<Paciente> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    obter_paciente_por_id_conn(conn, id.trim())
}

/// Cria um novo paciente com status padrão `ativo` (RN10, RN14).
pub fn executar_paciente_criar(
    state: &AppState,
    dados: &DadosPacienteInput,
) -> Resultado<Paciente> {
    state.verificar_desbloqueado()?;
    let norm = validar_e_normalizar_dados(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id = Uuid::new_v4().to_string();
    let agora = Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO pacientes (
            id,
            nome,
            nome_busca,
            data_nascimento,
            telefone,
            whatsapp,
            email,
            endereco,
            nome_mae,
            nome_pai,
            responsavel_nome,
            responsavel_parentesco,
            responsavel_telefone,
            contato_emergencia_nome,
            contato_emergencia_telefone,
            documento,
            ocupacao,
            motivo_procura,
            modalidade,
            convenio_nome,
            valor_sessao_centavos,
            observacoes,
            status,
            inativado_em,
            criado_em,
            atualizado_em
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
            ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22,
            'ativo', NULL, ?23, ?23
        );",
        params![
            id,
            norm.nome,
            norm.nome_busca,
            norm.data_nascimento,
            norm.telefone,
            norm.whatsapp,
            norm.email,
            norm.endereco,
            norm.nome_mae,
            norm.nome_pai,
            norm.responsavel_nome,
            norm.responsavel_parentesco,
            norm.responsavel_telefone,
            norm.contato_emergencia_nome,
            norm.contato_emergencia_telefone,
            norm.documento,
            norm.ocupacao,
            norm.motivo_procura,
            norm.modalidade,
            norm.convenio_nome,
            norm.valor_sessao_centavos,
            norm.observacoes,
            agora,
        ],
    )?;

    obter_paciente_por_id_conn(conn, &id)
}

/// Atualiza os dados cadastrais de um paciente existente.
pub fn executar_paciente_atualizar(
    state: &AppState,
    id: &str,
    dados: &DadosPacienteInput,
) -> Resultado<Paciente> {
    state.verificar_desbloqueado()?;
    let norm = validar_e_normalizar_dados(dados)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id_limpo = id.trim();
    let agora = Local::now().to_rfc3339();

    let linhas_afetadas = conn.execute(
        "UPDATE pacientes SET
            nome = ?1,
            nome_busca = ?2,
            data_nascimento = ?3,
            telefone = ?4,
            whatsapp = ?5,
            email = ?6,
            endereco = ?7,
            nome_mae = ?8,
            nome_pai = ?9,
            responsavel_nome = ?10,
            responsavel_parentesco = ?11,
            responsavel_telefone = ?12,
            contato_emergencia_nome = ?13,
            contato_emergencia_telefone = ?14,
            documento = ?15,
            ocupacao = ?16,
            motivo_procura = ?17,
            modalidade = ?18,
            convenio_nome = ?19,
            valor_sessao_centavos = ?20,
            observacoes = ?21,
            atualizado_em = ?22
         WHERE id = ?23;",
        params![
            norm.nome,
            norm.nome_busca,
            norm.data_nascimento,
            norm.telefone,
            norm.whatsapp,
            norm.email,
            norm.endereco,
            norm.nome_mae,
            norm.nome_pai,
            norm.responsavel_nome,
            norm.responsavel_parentesco,
            norm.responsavel_telefone,
            norm.contato_emergencia_nome,
            norm.contato_emergencia_telefone,
            norm.documento,
            norm.ocupacao,
            norm.motivo_procura,
            norm.modalidade,
            norm.convenio_nome,
            norm.valor_sessao_centavos,
            norm.observacoes,
            agora,
            id_limpo,
        ],
    )?;

    if linhas_afetadas == 0 {
        return Err(Erro::NaoEncontrado);
    }

    obter_paciente_por_id_conn(conn, id_limpo)
}

/// Altera o status do paciente entre `ativo` e `inativo` (RN14).
/// Ao inativar, grava `inativado_em`. Ao reativar, limpa `inativado_em` e mantém todo o histórico.
pub fn executar_paciente_definir_status(
    state: &AppState,
    id: &str,
    status: &str,
) -> Resultado<Paciente> {
    state.verificar_desbloqueado()?;
    let novo_status = status.trim();
    if novo_status != "ativo" && novo_status != "inativo" {
        return Err(Erro::Validacao(
            "Status inválido. Use 'ativo' ou 'inativo'.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id_limpo = id.trim();
    let agora = Local::now().to_rfc3339();
    let inativado_em = if novo_status == "inativo" {
        Some(agora.clone())
    } else {
        None
    };

    let linhas_afetadas = conn.execute(
        "UPDATE pacientes
         SET status = ?1,
             inativado_em = ?2,
             atualizado_em = ?3
         WHERE id = ?4;",
        params![novo_status, inativado_em, agora, id_limpo],
    )?;

    if linhas_afetadas == 0 {
        return Err(Erro::NaoEncontrado);
    }

    obter_paciente_por_id_conn(conn, id_limpo)
}

/// Exclui definitivamente um paciente e suas sessões (RN18).
/// Exige que `confirmacao_nome` corresponda exatamente ao nome do paciente.
pub fn executar_paciente_excluir(
    state: &AppState,
    id: &str,
    confirmacao_nome: &str,
) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let id_limpo = id.trim();
    let paciente = obter_paciente_por_id_conn(conn, id_limpo)?;

    let confirmacao_limpa = confirmacao_nome.trim();
    if confirmacao_limpa.is_empty()
        || confirmacao_limpa.to_lowercase() != paciente.nome.trim().to_lowercase()
    {
        return Err(Erro::Validacao(
            "O nome digitado não confere com o nome do paciente.".to_string(),
        ));
    }

    // Busca os IDs dos anexos de anamnese para limpar os arquivos cifrados do disco (RN67)
    let ids_anamneses: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM anamneses WHERE paciente_id = ?1;")?;
        let rows = stmt.query_map([id_limpo], |r| r.get(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    conn.execute("DELETE FROM pacientes WHERE id = ?1;", [id_limpo])?;

    for id_anam in ids_anamneses {
        let caminho = crate::files::caminho_arquivo_cifrado(&state.data_dir, &id_anam);
        if caminho.exists() {
            crate::files::sobrescrever_e_remover_arquivo(&caminho);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn pacientes_listar(
    state: State<'_, AppState>,
    busca: Option<String>,
    status: Option<String>,
) -> Resultado<Vec<PacienteResumo>> {
    executar_pacientes_listar(&state, busca.as_deref(), status.as_deref())
}

#[tauri::command]
pub fn paciente_obter(state: State<'_, AppState>, id: String) -> Resultado<Paciente> {
    executar_paciente_obter(&state, &id)
}

#[tauri::command]
pub fn paciente_criar(
    state: State<'_, AppState>,
    dados: DadosPacienteInput,
) -> Resultado<Paciente> {
    executar_paciente_criar(&state, &dados)
}

#[tauri::command]
pub fn paciente_atualizar(
    state: State<'_, AppState>,
    id: String,
    dados: DadosPacienteInput,
) -> Resultado<Paciente> {
    executar_paciente_atualizar(&state, &id, &dados)
}

#[tauri::command]
pub fn paciente_definir_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> Resultado<Paciente> {
    executar_paciente_definir_status(&state, &id, &status)
}

#[tauri::command]
pub fn paciente_excluir(
    state: State<'_, AppState>,
    id: String,
    confirmacao_nome: String,
) -> Resultado<()> {
    executar_paciente_excluir(&state, &id, &confirmacao_nome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use std::fs;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-pacientes-crud-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_rejeitam_acesso_quando_bloqueado() {
        let dir = std::env::temp_dir().join(format!("lc-pacientes-lock-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(
            executar_pacientes_listar(&state, None, None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_paciente_obter(&state, "qualquer"),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_paciente_criar(
                &state,
                &DadosPacienteInput {
                    nome: "João".to_string(),
                    ..Default::default()
                }
            ),
            Err(Erro::Bloqueado)
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn crud_completo_busca_sem_acento_status_e_exclusao_com_confirmacao() {
        let state = criar_estado_desbloqueado();

        // 1. Nome é obrigatório (RN10)
        let res_sem_nome = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "   ".to_string(),
                ..Default::default()
            },
        );
        assert!(matches!(res_sem_nome, Err(Erro::Validacao(_))));

        // 2. Criar pacientes (nomes com acento, telefone com máscara)
        let joao = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "João da Conceição".to_string(),
                data_nascimento: Some("1990-05-15".to_string()),
                telefone: Some("(71) 99876-5432".to_string()),
                modalidade: Some("particular".to_string()),
                valor_sessao_centavos: Some(15000),
                ..Default::default()
            },
        )
        .expect("criar João");

        assert_eq!(joao.nome, "João da Conceição");
        assert_eq!(joao.telefone.as_deref(), Some("71998765432"));
        assert_eq!(joao.status, "ativo");
        assert!(joao.inativado_em.is_none());

        let ana = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Ana Beatriz".to_string(),
                telefone: Some("71988887777".to_string()),
                ..Default::default()
            },
        )
        .expect("criar Ana");

        // 3. Listagem padrão: apenas ativos e em ordem alfabética (Ana antes de João — RN15, RN16)
        let lista = executar_pacientes_listar(&state, None, None).expect("listar ativos");
        assert_eq!(lista.len(), 2);
        assert_eq!(lista[0].nome, "Ana Beatriz");
        assert_eq!(lista[1].nome, "João da Conceição");

        // 4. Busca sem acento: "joao" encontra "João da Conceição" (RN17)
        let busca_joao =
            executar_pacientes_listar(&state, Some("joao"), None).expect("buscar joao");
        assert_eq!(busca_joao.len(), 1);
        assert_eq!(busca_joao[0].id, joao.id);

        let busca_conceicao =
            executar_pacientes_listar(&state, Some("CONCEICAO"), None).expect("buscar conceicao");
        assert_eq!(busca_conceicao.len(), 1);
        assert_eq!(busca_conceicao[0].id, joao.id);

        // 5. Busca por telefone com e sem máscara (RN17)
        let busca_tel_sem_mascara =
            executar_pacientes_listar(&state, Some("998765432"), None).expect("buscar tel");
        assert_eq!(busca_tel_sem_mascara.len(), 1);
        assert_eq!(busca_tel_sem_mascara[0].id, joao.id);

        let busca_tel_com_mascara =
            executar_pacientes_listar(&state, Some("(71) 99876-5432"), None)
                .expect("buscar tel com máscara");
        assert_eq!(busca_tel_com_mascara.len(), 1);
        assert_eq!(busca_tel_com_mascara[0].id, joao.id);

        // 6. Atualizar paciente
        let joao_editado = executar_paciente_atualizar(
            &state,
            &joao.id,
            &DadosPacienteInput {
                nome: "João Pedro da Conceição".to_string(),
                data_nascimento: Some("1990-05-15".to_string()),
                telefone: Some("(71) 99876-5432".to_string()),
                ocupacao: Some("Engenheiro".to_string()),
                ..Default::default()
            },
        )
        .expect("atualizar João");
        assert_eq!(joao_editado.nome, "João Pedro da Conceição");
        assert_eq!(joao_editado.ocupacao.as_deref(), Some("Engenheiro"));

        // 7. Inativar e reativar (RN14, RN15)
        let joao_inativo =
            executar_paciente_definir_status(&state, &joao.id, "inativo").expect("inativar João");
        assert_eq!(joao_inativo.status, "inativo");
        assert!(joao_inativo.inativado_em.is_some());

        let ativos_apos_inativar =
            executar_pacientes_listar(&state, None, Some("ativo")).expect("listar ativos");
        assert_eq!(ativos_apos_inativar.len(), 1);
        assert_eq!(ativos_apos_inativar[0].id, ana.id);

        let inativos =
            executar_pacientes_listar(&state, None, Some("inativo")).expect("listar inativos");
        assert_eq!(inativos.len(), 1);
        assert_eq!(inativos[0].id, joao.id);

        let todos = executar_pacientes_listar(&state, None, Some("todos")).expect("listar todos");
        assert_eq!(todos.len(), 2);

        let joao_reativado =
            executar_paciente_definir_status(&state, &joao.id, "ativo").expect("reativar João");
        assert_eq!(joao_reativado.status, "ativo");
        assert!(joao_reativado.inativado_em.is_none());

        // 8. Excluir exige digitação correta do nome e apaga sessões em cascata (RN18)
        {
            let conn_guard = state.conn.lock().unwrap();
            let conn = conn_guard.as_ref().unwrap();
            conn.execute(
                "INSERT INTO sessoes (id, paciente_id, data, resumo, criado_em, atualizado_em)
                 VALUES ('sessao-1', ?1, '2026-10-10', 'Resumo teste', '2026-10-10T10:00:00Z', '2026-10-10T10:00:00Z');",
                [&joao.id],
            )
            .expect("inserir sessão de teste");
        }

        let joao_com_sessao = executar_paciente_obter(&state, &joao.id).expect("obter João");
        assert_eq!(joao_com_sessao.total_sessoes, 1);
        assert_eq!(joao_com_sessao.ultima_sessao.as_deref(), Some("2026-10-10"));

        // Nome errado falha
        let erro_excluir = executar_paciente_excluir(&state, &joao.id, "Nome Errado");
        assert!(matches!(erro_excluir, Err(Erro::Validacao(_))));

        // Nome correto exclui paciente e sessões (ON DELETE CASCADE)
        executar_paciente_excluir(&state, &joao.id, "João Pedro da Conceição")
            .expect("excluir João com nome confirmado");
        assert_eq!(
            executar_paciente_obter(&state, &joao.id),
            Err(Erro::NaoEncontrado)
        );

        let qtd_sessoes_restantes: i64 = {
            let conn_guard = state.conn.lock().unwrap();
            let conn = conn_guard.as_ref().unwrap();
            conn.query_row(
                "SELECT COUNT(*) FROM sessoes WHERE paciente_id = ?1;",
                [&joao.id],
                |r| r.get(0),
            )
            .expect("contar sessões")
        };
        assert_eq!(qtd_sessoes_restantes, 0);

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
