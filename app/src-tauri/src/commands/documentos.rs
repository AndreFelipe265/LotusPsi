//! Comandos de gerenciamento de documentos cifrados (`documentos_*`, `documento_*`) (F6-T3 — RN40–RN48).

use std::fs;

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::commands::categorias::{garantir_categorias_iniciais_conn, obter_categoria_por_id_conn};
use crate::error::{Erro, Resultado};
use crate::files::{
    abrir_arquivo_no_sistema, caminho_arquivo_cifrado, caminho_pasta_temporarios,
    decifrar_arquivo_em_blocos, resolver_caminho_destino_download, sanitizar_nome_arquivo,
    sobrescrever_e_remover_arquivo, validar_e_cifrar_origem_flexivel, validar_extensao_e_mime,
};
use crate::state::AppState;
use crate::text::normalizar_busca;

/// Metadados de um documento geral retornados para a interface (RN44).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Documento {
    pub id: String,
    pub categoria_id: Option<String>,
    pub categoria_nome: Option<String>,
    pub nome_original: String,
    pub descricao: Option<String>,
    pub mime: String,
    pub tamanho_bytes: i64,
    pub sha256: String,
    pub enviado_em: String,
    pub atualizado_em: String,
}

/// Dados de entrada para atualizar metadados de um documento (RN46).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DadosDocumentoAtualizarInput {
    pub nome_original: String,
    pub categoria_id: Option<String>,
    pub descricao: Option<String>,
}

fn limpar_opcional(valor: Option<&str>) -> Option<String> {
    valor
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

pub fn obter_documento_por_id_conn(conn: &Connection, id: &str) -> Resultado<Documento> {
    let doc = conn
        .query_row(
            "SELECT
                d.id,
                d.categoria_id,
                c.nome AS categoria_nome,
                d.nome_original,
                d.descricao,
                d.mime,
                d.tamanho_bytes,
                d.sha256,
                d.enviado_em,
                d.atualizado_em
             FROM documentos d
             LEFT JOIN categorias_documento c ON c.id = d.categoria_id
             WHERE d.id = ?1;",
            [id],
            |row| {
                Ok(Documento {
                    id: row.get(0)?,
                    categoria_id: row.get(1)?,
                    categoria_nome: row.get(2)?,
                    nome_original: row.get(3)?,
                    descricao: row.get(4)?,
                    mime: row.get(5)?,
                    tamanho_bytes: row.get(6)?,
                    sha256: row.get(7)?,
                    enviado_em: row.get(8)?,
                    atualizado_em: row.get(9)?,
                })
            },
        )
        .optional()?;

    doc.ok_or(Erro::NaoEncontrado)
}

/// Lista os documentos gerais filtrando opcionalmente por categoria e busca por nome (RN47).
/// Ordenação padrão: mais recentes primeiro (`enviado_em DESC`).
pub fn executar_documentos_listar(
    state: &AppState,
    busca: Option<&str>,
    categoria_id: Option<&str>,
) -> Resultado<Vec<Documento>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    garantir_categorias_iniciais_conn(conn)?;

    let filtro_cat = categoria_id
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("todas"));

    let mut stmt = conn.prepare(
        "SELECT
            d.id,
            d.categoria_id,
            c.nome AS categoria_nome,
            d.nome_original,
            d.descricao,
            d.mime,
            d.tamanho_bytes,
            d.sha256,
            d.enviado_em,
            d.atualizado_em
         FROM documentos d
         LEFT JOIN categorias_documento c ON c.id = d.categoria_id
         WHERE (?1 IS NULL OR d.categoria_id = ?1)
         ORDER BY d.enviado_em DESC, d.nome_original ASC;",
    )?;

    let termo_busca = busca.map(normalizar_busca).unwrap_or_default();

    let linhas = stmt.query_map([filtro_cat], |row| {
        Ok(Documento {
            id: row.get(0)?,
            categoria_id: row.get(1)?,
            categoria_nome: row.get(2)?,
            nome_original: row.get(3)?,
            descricao: row.get(4)?,
            mime: row.get(5)?,
            tamanho_bytes: row.get(6)?,
            sha256: row.get(7)?,
            enviado_em: row.get(8)?,
            atualizado_em: row.get(9)?,
        })
    })?;

    let mut documentos = Vec::new();
    for linha in linhas {
        let doc = linha?;
        if termo_busca.is_empty() {
            documentos.push(doc);
        } else {
            let nome_norm = normalizar_busca(&doc.nome_original);
            let desc_norm = doc
                .descricao
                .as_deref()
                .map(normalizar_busca)
                .unwrap_or_default();
            if nome_norm.contains(&termo_busca) || desc_norm.contains(&termo_busca) {
                documentos.push(doc);
            }
        }
    }

    Ok(documentos)
}

/// Envia um novo documento geral: valida extensão, magic bytes e limite de 25 MB,
/// cifra o arquivo em `docs/<uuid>.bin` e grava os metadados no banco cifrado (RN42–RN45, RN48).
pub fn executar_documento_enviar(
    state: &AppState,
    caminho_origem: &str,
    categoria_id: Option<&str>,
    descricao: Option<&str>,
    nome_original: Option<&str>,
    conteudo_base64: Option<&str>,
) -> Resultado<Documento> {
    state.verificar_desbloqueado()?;

    let dek = {
        let dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
        dek_guard.as_ref().ok_or(Erro::Bloqueado)?.clone()
    };

    let cat_id_resolvida: Option<String> = {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        garantir_categorias_iniciais_conn(conn)?;

        if let Some(cat_str) = limpar_opcional(categoria_id) {
            let cat = obter_categoria_por_id_conn(conn, &cat_str).map_err(|_| {
                Erro::Validacao("A categoria selecionada não foi encontrada.".to_string())
            })?;
            Some(cat.id)
        } else {
            conn.query_row(
                "SELECT id FROM categorias_documento ORDER BY ordem ASC LIMIT 1;",
                [],
                |r| r.get(0),
            )
            .optional()?
        }
    };

    let descricao_limpa = limpar_opcional(descricao);
    if let Some(ref desc) = descricao_limpa {
        if desc.chars().count() > 300 {
            return Err(Erro::Validacao(
                "A descrição do documento deve ter no máximo 300 caracteres.".to_string(),
            ));
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
        "INSERT INTO documentos (
            id,
            categoria_id,
            nome_original,
            descricao,
            mime,
            tamanho_bytes,
            sha256,
            enviado_em,
            atualizado_em
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8);",
        params![
            id,
            cat_id_resolvida,
            info_cifrado.nome_original,
            descricao_limpa,
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

    obter_documento_por_id_conn(conn, &id)
}

/// Baixa (descriptografa) uma cópia de um documento para o caminho escolhido pela usuária,
/// conferindo a integridade SHA-256 (RN46).
pub fn executar_documento_baixar(
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

    let doc = {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        obter_documento_por_id_conn(conn, id_limpo)?
    };

    let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &doc.id);
    if !caminho_cifrado.exists() {
        return Err(Erro::Arquivo);
    }

    let destino_final = resolver_caminho_destino_download(
        &state.data_dir,
        caminho_destino.unwrap_or(""),
        &doc.nome_original,
    );

    let sha256_calculado = decifrar_arquivo_em_blocos(&caminho_cifrado, &destino_final, &dek)?;
    if sha256_calculado != doc.sha256 {
        sobrescrever_e_remover_arquivo(&destino_final);
        return Err(Erro::Criptografia);
    }

    Ok(destino_final.to_string_lossy().to_string())
}

/// Descriptografa um documento em uma subpasta temporária (`temp_abertos/<id>/<nome_original>`),
/// verifica o SHA-256 e solicita a abertura no programa padrão do sistema (RN46, Seção 7).
pub fn executar_documento_abrir(state: &AppState, id: &str) -> Resultado<String> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();

    let dek = {
        let dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
        dek_guard.as_ref().ok_or(Erro::Bloqueado)?.clone()
    };

    let doc = {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        obter_documento_por_id_conn(conn, id_limpo)?
    };

    let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &doc.id);
    if !caminho_cifrado.exists() {
        return Err(Erro::Arquivo);
    }

    let pasta_doc_temp = caminho_pasta_temporarios(&state.data_dir).join(&doc.id);
    fs::create_dir_all(&pasta_doc_temp)?;
    let nome_seguro = sanitizar_nome_arquivo(&doc.nome_original);
    let caminho_temp = pasta_doc_temp.join(nome_seguro);

    let sha256_calculado = decifrar_arquivo_em_blocos(&caminho_cifrado, &caminho_temp, &dek)?;
    if sha256_calculado != doc.sha256 {
        sobrescrever_e_remover_arquivo(&caminho_temp);
        return Err(Erro::Criptografia);
    }

    abrir_arquivo_no_sistema(&caminho_temp)?;

    Ok(caminho_temp.to_string_lossy().to_string())
}

/// Atualiza o nome, a categoria e/ou a descrição de um documento geral (RN46).
pub fn executar_documento_atualizar(
    state: &AppState,
    id: &str,
    dados: &DadosDocumentoAtualizarInput,
) -> Resultado<Documento> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do documento é obrigatório.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let atual = obter_documento_por_id_conn(conn, id_limpo)?;

    let mut novo_nome = sanitizar_nome_arquivo(&dados.nome_original);
    if dados.nome_original.trim().is_empty() {
        return Err(Erro::Validacao(
            "O nome do documento é obrigatório.".to_string(),
        ));
    }

    // Preserva a extensão original caso a usuária digite o novo nome sem extensão
    if let Ok((ext_original, _)) = validar_extensao_e_mime(&atual.nome_original) {
        match validar_extensao_e_mime(&novo_nome) {
            Ok((ext_nova, _)) => {
                if ext_nova != ext_original {
                    return Err(Erro::Validacao(format!(
                        "Não é permitido alterar a extensão do arquivo (.{}).",
                        ext_original
                    )));
                }
            }
            Err(_) => {
                novo_nome = format!("{}.{}", novo_nome.trim_end_matches('.'), ext_original);
            }
        }
    }

    let nova_cat_id = match limpar_opcional(dados.categoria_id.as_deref()) {
        Some(cat_str) => {
            let cat = obter_categoria_por_id_conn(conn, &cat_str).map_err(|_| {
                Erro::Validacao("A categoria selecionada não foi encontrada.".to_string())
            })?;
            Some(cat.id)
        }
        None => atual.categoria_id.clone(),
    };

    let nova_descricao = limpar_opcional(dados.descricao.as_deref());
    if let Some(ref desc) = nova_descricao {
        if desc.chars().count() > 300 {
            return Err(Erro::Validacao(
                "A descrição do documento deve ter no máximo 300 caracteres.".to_string(),
            ));
        }
    }

    let agora = Local::now().to_rfc3339();
    conn.execute(
        "UPDATE documentos
         SET nome_original = ?1,
             categoria_id = ?2,
             descricao = ?3,
             atualizado_em = ?4
         WHERE id = ?5;",
        params![novo_nome, nova_cat_id, nova_descricao, agora, id_limpo],
    )?;

    obter_documento_por_id_conn(conn, id_limpo)
}

/// Exclui um documento geral do banco e apaga de forma segura o arquivo cifrado em disco (RN46).
pub fn executar_documento_excluir(state: &AppState, id: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador do documento é obrigatório.".to_string(),
        ));
    }

    let doc = {
        let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
        let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
        let encontrado = obter_documento_por_id_conn(conn, id_limpo)?;
        conn.execute("DELETE FROM documentos WHERE id = ?1;", [id_limpo])?;
        encontrado
    };

    let caminho_cifrado = caminho_arquivo_cifrado(&state.data_dir, &doc.id);
    if caminho_cifrado.exists() {
        sobrescrever_e_remover_arquivo(&caminho_cifrado);
    }

    let pasta_doc_temp = caminho_pasta_temporarios(&state.data_dir).join(&doc.id);
    if pasta_doc_temp.exists() {
        let _ = fs::remove_dir_all(&pasta_doc_temp);
    }

    Ok(())
}

#[tauri::command]
pub fn documentos_listar(
    state: State<'_, AppState>,
    busca: Option<String>,
    categoria_id: Option<String>,
) -> Resultado<Vec<Documento>> {
    executar_documentos_listar(&state, busca.as_deref(), categoria_id.as_deref())
}

#[tauri::command]
pub fn documento_enviar(
    state: State<'_, AppState>,
    caminho_origem: String,
    categoria_id: Option<String>,
    descricao: Option<String>,
    nome_original: Option<String>,
    conteudo_base64: Option<String>,
) -> Resultado<Documento> {
    executar_documento_enviar(
        &state,
        &caminho_origem,
        categoria_id.as_deref(),
        descricao.as_deref(),
        nome_original.as_deref(),
        conteudo_base64.as_deref(),
    )
}

#[tauri::command]
pub fn documento_baixar(
    state: State<'_, AppState>,
    id: String,
    caminho_destino: Option<String>,
) -> Resultado<String> {
    executar_documento_baixar(&state, &id, caminho_destino.as_deref())
}

#[tauri::command]
pub fn documento_abrir(state: State<'_, AppState>, id: String) -> Resultado<String> {
    executar_documento_abrir(&state, &id)
}

#[tauri::command]
pub fn documento_atualizar(
    state: State<'_, AppState>,
    id: String,
    dados: Option<DadosDocumentoAtualizarInput>,
    nome_original: Option<String>,
    categoria_id: Option<String>,
    descricao: Option<String>,
) -> Resultado<Documento> {
    let payload = dados.unwrap_or(DadosDocumentoAtualizarInput {
        nome_original: nome_original.unwrap_or_default(),
        categoria_id,
        descricao,
    });
    executar_documento_atualizar(&state, &id, &payload)
}

#[tauri::command]
pub fn documento_excluir(state: State<'_, AppState>, id: String) -> Resultado<()> {
    executar_documento_excluir(&state, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::categorias::executar_categorias_listar;
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use crate::files::calcular_sha256_arquivo;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-documentos-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_rejeitam_acesso_quando_bloqueado() {
        let dir = std::env::temp_dir().join(format!("lc-doc-lock-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(
            executar_documentos_listar(&state, None, None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_documento_enviar(&state, "/tmp/x.pdf", None, None, None, None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_documento_baixar(&state, "id", None),
            Err(Erro::Bloqueado)
        );
        assert_eq!(executar_documento_abrir(&state, "id"), Err(Erro::Bloqueado));
        assert_eq!(
            executar_documento_excluir(&state, "id"),
            Err(Erro::Bloqueado)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn fluxo_completo_enviar_pdf_e_docx_listar_buscar_baixar_identico_abrir_atualizar_e_excluir() {
        let state = criar_estado_desbloqueado();
        let pasta_origem = state.data_dir.join("origens_teste");
        fs::create_dir_all(&pasta_origem).expect("criar pasta origem");

        let categorias = executar_categorias_listar(&state).expect("listar categorias");
        let cat_modelos = &categorias[0].id;
        let cat_admin = &categorias[1].id;

        // 1. Criar um PDF e um DOCX sintéticos válidos
        let origem_pdf = pasta_origem.join("Termo_de_Consentimento.pdf");
        let conteudo_pdf =
            b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\nConteudo sigiloso do termo!\n%%EOF";
        fs::write(&origem_pdf, conteudo_pdf).expect("gravar pdf");
        let sha_pdf_original = calcular_sha256_arquivo(&origem_pdf).expect("sha256 pdf");

        let origem_docx = pasta_origem.join("Recibo_Consultorio.docx");
        let conteudo_docx = b"PK\x03\x04\x14\x00\x00\x00\x08\x00Conteudo zipado do DOCX de teste";
        fs::write(&origem_docx, conteudo_docx).expect("gravar docx");
        let sha_docx_original = calcular_sha256_arquivo(&origem_docx).expect("sha256 docx");

        // 2. Enviar PDF e DOCX (RN42, RN44, RN45)
        let doc_pdf = executar_documento_enviar(
            &state,
            origem_pdf.to_str().unwrap(),
            Some(cat_modelos),
            Some("Modelo padrão para novos pacientes"),
            None,
            None,
        )
        .expect("enviar PDF");

        assert_eq!(doc_pdf.nome_original, "Termo_de_Consentimento.pdf");
        assert_eq!(doc_pdf.categoria_id.as_deref(), Some(cat_modelos.as_str()));
        assert_eq!(doc_pdf.categoria_nome.as_deref(), Some("Modelos"));
        assert_eq!(doc_pdf.sha256, sha_pdf_original);

        let doc_docx = executar_documento_enviar(
            &state,
            origem_docx.to_str().unwrap(),
            Some(cat_admin),
            Some("Recibo mensal"),
            None,
            None,
        )
        .expect("enviar DOCX");

        assert_eq!(doc_docx.nome_original, "Recibo_Consultorio.docx");
        assert_eq!(doc_docx.sha256, sha_docx_original);

        // 3. Verificar que o arquivo em disco `docs/<id>.bin` existe e é ilegível em texto claro (RN45)
        let cifrado_pdf_em_disco = caminho_arquivo_cifrado(&state.data_dir, &doc_pdf.id);
        assert!(cifrado_pdf_em_disco.exists());
        let bytes_em_disco = fs::read(&cifrado_pdf_em_disco).expect("ler cifrado");
        assert!(!bytes_em_disco
            .windows(b"Conteudo sigiloso".len())
            .any(|w| w == b"Conteudo sigiloso"));

        // 4. Nomes duplicados são permitidos (RN48)
        let doc_pdf_dup = executar_documento_enviar(
            &state,
            origem_pdf.to_str().unwrap(),
            Some(cat_modelos),
            None,
            None,
            None,
        )
        .expect("enviar PDF duplicado");
        assert_ne!(doc_pdf_dup.id, doc_pdf.id);
        assert_eq!(doc_pdf_dup.nome_original, doc_pdf.nome_original);

        // 5. Listar por categoria e buscar por nome sem acento (RN47)
        let todos = executar_documentos_listar(&state, None, None).expect("listar todos");
        assert_eq!(todos.len(), 3);

        let so_admin =
            executar_documentos_listar(&state, None, Some(cat_admin)).expect("listar admin");
        assert_eq!(so_admin.len(), 1);
        assert_eq!(so_admin[0].id, doc_docx.id);

        let busca_recibo =
            executar_documentos_listar(&state, Some("consultorio"), None).expect("buscar recibo");
        assert_eq!(busca_recibo.len(), 1);
        assert_eq!(busca_recibo[0].id, doc_docx.id);

        // 6. Baixar PDF e DOCX e confirmar que o SHA-256 é idêntico (Critério de Aceite F6)
        let destino_pdf = pasta_origem.join("baixado_termo.pdf");
        executar_documento_baixar(&state, &doc_pdf.id, destino_pdf.to_str()).expect("baixar PDF");
        assert_eq!(
            calcular_sha256_arquivo(&destino_pdf).unwrap(),
            sha_pdf_original
        );

        let destino_docx = pasta_origem.join("baixado_recibo.docx");
        executar_documento_baixar(&state, &doc_docx.id, destino_docx.to_str())
            .expect("baixar DOCX");
        assert_eq!(
            calcular_sha256_arquivo(&destino_docx).unwrap(),
            sha_docx_original
        );

        // 7. Abrir documento cria cópia temporária em `temp_abertos` que é apagada ao bloquear (RN46)
        let caminho_aberto = executar_documento_abrir(&state, &doc_pdf.id).expect("abrir PDF");
        let path_aberto = std::path::PathBuf::from(&caminho_aberto);
        assert!(path_aberto.exists());
        assert_eq!(
            calcular_sha256_arquivo(&path_aberto).unwrap(),
            sha_pdf_original
        );

        // 8. Atualizar documento: renomear (preservando extensão), trocar categoria e descrição (RN46)
        let atualizado = executar_documento_atualizar(
            &state,
            &doc_pdf.id,
            &DadosDocumentoAtualizarInput {
                nome_original: "Termo Atualizado 2026".to_string(),
                categoria_id: Some(cat_admin.clone()),
                descricao: Some("Nova descrição revisada".to_string()),
            },
        )
        .expect("atualizar documento");
        assert_eq!(atualizado.nome_original, "Termo Atualizado 2026.pdf");
        assert_eq!(atualizado.categoria_id.as_deref(), Some(cat_admin.as_str()));
        assert_eq!(
            atualizado.descricao.as_deref(),
            Some("Nova descrição revisada")
        );

        // 9. Excluir documento remove do banco e apaga o arquivo cifrado do disco (RN46)
        executar_documento_excluir(&state, &doc_pdf_dup.id).expect("excluir duplicado");
        assert!(!caminho_arquivo_cifrado(&state.data_dir, &doc_pdf_dup.id).exists());

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
