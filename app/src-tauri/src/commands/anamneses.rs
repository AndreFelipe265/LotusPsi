//! Comandos de gerenciamento de anexos de anamnese (`anamneses_*`, `anamnese_*`) (F6-T5 — RN65–RN68).

use std::fs;

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{Erro, Resultado};
use crate::files::{
    abrir_arquivo_no_sistema, caminho_arquivo_cifrado, caminho_pasta_temporarios,
    decifrar_arquivo_em_blocos, resolver_caminho_destino_download, sanitizar_nome_arquivo,
    sobrescrever_e_remover_arquivo, validar_e_cifrar_origem_flexivel,
};
use crate::state::AppState;

/// Metadados de um anexo de anamnese vinculado a um paciente (RN65, RN68).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Anamnese {
    pub id: String,
    pub paciente_id: String,
    pub nome_original: String,
    pub mime: String,
    pub tamanho_bytes: i64,
    pub sha256: String,
    pub enviado_em: String,
}

pub fn obter_anamnese_por_id_conn(conn: &Connection, id: &str) -> Resultado<Anamnese> {
    let anamnese = conn
        .query_row(
            "SELECT
                id,
                paciente_id,
                nome_original,
                mime,
                tamanho_bytes,
                sha256,
                enviado_em
             FROM anamneses
             WHERE id = ?1;",
            [id],
            |row| {
                Ok(Anamnese {
                    id: row.get(0)?,
                    paciente_id: row.get(1)?,
                    nome_original: row.get(2)?,
                    mime: row.get(3)?,
                    tamanho_bytes: row.get(4)?,
                    sha256: row.get(5)?,
                    enviado_em: row.get(6)?,
                })
            },
        )
        .optional()?;

    anamnese.ok_or(Erro::NaoEncontrado)
}

/// Lista todas as anamneses vinculadas ao paciente em ordem decrescente de envio (RN68).
pub fn executar_anamneses_listar(state: &AppState, paciente_id: &str) -> Resultado<Vec<Anamnese>> {
    state.verificar_desbloqueado()?;
    let pid_limpo = paciente_id.trim();
    if pid_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do paciente é obrigatório.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let mut stmt = conn.prepare(
        "SELECT
            id,
            paciente_id,
            nome_original,
            mime,
            tamanho_bytes,
            sha256,
            enviado_em
         FROM anamneses
         WHERE paciente_id = ?1
         ORDER BY enviado_em DESC, nome_original ASC;",
    )?;

    let linhas = stmt.query_map([pid_limpo], |row| {
        Ok(Anamnese {
            id: row.get(0)?,
            paciente_id: row.get(1)?,
            nome_original: row.get(2)?,
            mime: row.get(3)?,
            tamanho_bytes: row.get(4)?,
            sha256: row.get(5)?,
            enviado_em: row.get(6)?,
        })
    })?;

    let mut resultado = Vec::new();
    for linha in linhas {
        resultado.push(linha?);
    }

    Ok(resultado)
}

/// Anexa um novo arquivo de anamnese criptografado vinculado ao paciente (RN66, RN67).
pub fn executar_anamnese_anexar(
    state: &AppState,
    paciente_id: &str,
    caminho_origem: &str,
    nome_original: Option<&str>,
    conteudo_base64: Option<&str>,
) -> Resultado<Anamnese> {
    state.verificar_desbloqueado()?;
    let pid_limpo = paciente_id.trim();
    if pid_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do paciente é obrigatório.".to_string(),
        ));
    }

    let dek = {
        let dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
        dek_guard.as_ref().ok_or(Erro::Bloqueado)?.clone()
    };

    // Valida a existência do paciente
    {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        let existe_paciente: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pacientes WHERE id = ?1);",
            [pid_limpo],
            |r| r.get(0),
        )?;
        if !existe_paciente {
            return Err(Erro::NaoEncontrado);
        }
    }

    let id = Uuid::new_v4().to_string();
    let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &id);

    let info_cifrado = validar_e_cifrar_origem_flexivel(
        &state.data_dir,
        caminho_origem,
        nome_original,
        conteudo_base64,
        &caminho_cifrado,
        &dek,
    )?;

    let agora = Local::now().to_rfc3339();
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let res_insert = conn.execute(
        "INSERT INTO anamneses (
            id,
            paciente_id,
            nome_original,
            mime,
            tamanho_bytes,
            sha256,
            enviado_em
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);",
        params![
            id,
            pid_limpo,
            info_cifrado.nome_original,
            info_cifrado.mime,
            info_cifrado.tamanho_bytes as i64,
            info_cifrado.sha256,
            agora,
        ],
    );

    if let Err(e) = res_insert {
        sobrescrever_e_remover_arquivo(&caminho_cifrado);
        return Err(Erro::from(e));
    }

    obter_anamnese_por_id_conn(conn, &id)
}

/// Baixa (descriptografa) uma cópia do anexo de anamnese para o destino escolhido (RN68).
pub fn executar_anamnese_baixar(
    state: &AppState,
    id: &str,
    caminho_destino: Option<&str>,
) -> Resultado<String> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();

    let dek = {
        let dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
        dek_guard.as_ref().ok_or(Erro::Bloqueado)?.clone()
    };

    let anamnese = {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        obter_anamnese_por_id_conn(conn, id_limpo)?
    };

    let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &anamnese.id);
    if !caminho_cifrado.exists() {
        return Err(Erro::Arquivo);
    }

    let destino_final = resolver_caminho_destino_download(
        &state.data_dir,
        caminho_destino.unwrap_or(""),
        &anamnese.nome_original,
    );

    let sha256_calculado = decifrar_arquivo_em_blocos(&caminho_cifrado, &destino_final, &dek)?;
    if sha256_calculado != anamnese.sha256 {
        sobrescrever_e_remover_arquivo(&destino_final);
        return Err(Erro::Criptografia);
    }

    Ok(destino_final.to_string_lossy().to_string())
}

/// Descriptografa um anexo de anamnese na subpasta temporária e abre no programa padrão (RN68).
pub fn executar_anamnese_abrir(state: &AppState, id: &str) -> Resultado<String> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();

    let dek = {
        let dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
        dek_guard.as_ref().ok_or(Erro::Bloqueado)?.clone()
    };

    let anamnese = {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        obter_anamnese_por_id_conn(conn, id_limpo)?
    };

    let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &anamnese.id);
    if !caminho_cifrado.exists() {
        return Err(Erro::Arquivo);
    }

    let pasta_doc_temp = caminho_pasta_temporarios(&state.data_dir).join(&anamnese.id);
    fs::create_dir_all(&pasta_doc_temp)?;
    let nome_seguro = sanitizar_nome_arquivo(&anamnese.nome_original);
    let caminho_temp = pasta_doc_temp.join(nome_seguro);

    let sha256_calculado = decifrar_arquivo_em_blocos(&caminho_cifrado, &caminho_temp, &dek)?;
    if sha256_calculado != anamnese.sha256 {
        sobrescrever_e_remover_arquivo(&caminho_temp);
        return Err(Erro::Criptografia);
    }

    abrir_arquivo_no_sistema(&caminho_temp)?;

    Ok(caminho_temp.to_string_lossy().to_string())
}

/// Exclui o anexo de anamnese do banco e remove de forma segura o arquivo cifrado em disco (RN68).
pub fn executar_anamnese_excluir(state: &AppState, id: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador da anamnese é obrigatório.".to_string(),
        ));
    }

    let anamnese = {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        let encontrada = obter_anamnese_por_id_conn(conn, id_limpo)?;
        conn.execute("DELETE FROM anamneses WHERE id = ?1;", [id_limpo])?;
        encontrada
    };

    let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &anamnese.id);
    if caminho_cifrado.exists() {
        sobrescrever_e_remover_arquivo(&caminho_cifrado);
    }

    let pasta_doc_temp = caminho_pasta_temporarios(&state.data_dir).join(&anamnese.id);
    if pasta_doc_temp.exists() {
        let _ = fs::remove_dir_all(&pasta_doc_temp);
    }

    Ok(())
}

#[tauri::command]
pub fn anamneses_listar(
    state: State<'_, AppState>,
    paciente_id: String,
) -> Resultado<Vec<Anamnese>> {
    executar_anamneses_listar(&state, &paciente_id)
}

#[tauri::command]
pub fn anamnese_anexar(
    state: State<'_, AppState>,
    paciente_id: String,
    caminho_origem: String,
    nome_original: Option<String>,
    conteudo_base64: Option<String>,
) -> Resultado<Anamnese> {
    executar_anamnese_anexar(
        &state,
        &paciente_id,
        &caminho_origem,
        nome_original.as_deref(),
        conteudo_base64.as_deref(),
    )
}

#[tauri::command]
pub fn anamnese_baixar(
    state: State<'_, AppState>,
    id: String,
    caminho_destino: Option<String>,
) -> Resultado<String> {
    executar_anamnese_baixar(&state, &id, caminho_destino.as_deref())
}

#[tauri::command]
pub fn anamnese_abrir(state: State<'_, AppState>, id: String) -> Resultado<String> {
    executar_anamnese_abrir(&state, &id)
}

#[tauri::command]
pub fn anamnese_excluir(state: State<'_, AppState>, id: String) -> Resultado<()> {
    executar_anamnese_excluir(&state, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::pacientes::{executar_paciente_criar, DadosPacienteInput};
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use crate::files::calcular_sha256_arquivo;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-anamneses-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_rejeitam_acesso_quando_bloqueado() {
        let dir = std::env::temp_dir().join(format!("lc-anam-lock-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(
            executar_anamneses_listar(&state, "pac-1"),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_anamnese_anexar(&state, "pac-1", "/tmp/x.pdf", None, None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(executar_anamnese_abrir(&state, "id"), Err(Erro::Bloqueado));
        assert_eq!(
            executar_anamnese_baixar(&state, "id", None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_anamnese_excluir(&state, "id"),
            Err(Erro::Bloqueado)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn fluxo_completo_anexar_anamnese_listar_abrir_baixar_e_excluir_rn65_rn68() {
        let state = criar_estado_desbloqueado();

        // 1. Criar paciente
        let paciente = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Mariana Costa".to_string(),
                ..Default::default()
            },
        )
        .expect("criar paciente");

        // 2. Criar arquivo sintético de anamnese
        let pasta_teste = state.data_dir.join("anamnese_origens");
        fs::create_dir_all(&pasta_teste).expect("criar pasta_teste");
        let arq_origem = pasta_teste.join("Anamnese_Mariana.pdf");
        let conteudo = b"%PDF-1.7\nFicha detalhada de anamnese clinica.\n%%EOF";
        fs::write(&arq_origem, conteudo).expect("gravar arquivo anamnese");
        let sha_original = calcular_sha256_arquivo(&arq_origem).expect("sha256");

        // 3. Anexar anamnese ao paciente (RN66, RN67)
        let anexada = executar_anamnese_anexar(
            &state,
            &paciente.id,
            arq_origem.to_str().unwrap(),
            None,
            None,
        )
        .expect("anexar anamnese");

        assert_eq!(anexada.paciente_id, paciente.id);
        assert_eq!(anexada.nome_original, "Anamnese_Mariana.pdf");
        assert_eq!(anexada.sha256, sha_original);
        assert_eq!(anexada.mime, "application/pdf");

        // Arquivo em disco cifrado
        let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &anexada.id);
        assert!(caminho_cifrado.exists());

        // 4. Listar anamneses do paciente
        let lista = executar_anamneses_listar(&state, &paciente.id).expect("listar anamneses");
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0].id, anexada.id);

        // 5. Baixar e validar hash idêntico
        let destino_baixado = pasta_teste.join("Anamnese_Mariana_Baixada.pdf");
        executar_anamnese_baixar(&state, &anexada.id, destino_baixado.to_str())
            .expect("baixar anamnese");
        assert_eq!(
            calcular_sha256_arquivo(&destino_baixado).unwrap(),
            sha_original
        );

        // 6. Abrir anamnese (cópia temporária)
        let caminho_temp_str = executar_anamnese_abrir(&state, &anexada.id).expect("abrir");
        let caminho_temp = std::path::PathBuf::from(&caminho_temp_str);
        assert!(caminho_temp.exists());
        assert_eq!(
            calcular_sha256_arquivo(&caminho_temp).unwrap(),
            sha_original
        );

        // 7. Excluir anamnese remove do banco e do disco
        executar_anamnese_excluir(&state, &anexada.id).expect("excluir anamnese");
        assert!(!caminho_cifrado.exists());
        let lista_vazia = executar_anamneses_listar(&state, &paciente.id).expect("listar vazia");
        assert!(lista_vazia.is_empty());

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
