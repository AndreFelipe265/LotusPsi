//! Comandos de categorias de documentos (`categorias_*`, `categoria_*`) (F6-T2 — RN41).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::error::{Erro, Resultado};
use crate::state::AppState;

/// Chave em `config` que registra que o seed inicial de categorias já foi aplicado.
const CHAVE_CONFIG_SEED_CATEGORIAS: &str = "categorias_iniciais_criadas";

/// Categorias iniciais padrão conforme RN41.
pub const CATEGORIAS_INICIAIS: &[(&str, &str, i64)] = &[
    ("cat-modelos", "Modelos", 1),
    ("cat-administrativo", "Administrativo", 2),
    ("cat-outros", "Outros", 3),
];

/// Representa uma categoria de documento geral (RN41).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CategoriaDocumento {
    pub id: String,
    pub nome: String,
    pub ordem: i64,
    pub total_documentos: i64,
}

/// Garante que as categorias iniciais (`Modelos`, `Administrativo`, `Outros`) sejam criadas
/// uma única vez no banco de dados (RN41).
pub fn garantir_categorias_iniciais_conn(conn: &Connection) -> Resultado<()> {
    let ja_aplicado: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM config WHERE chave = ?1);",
            [CHAVE_CONFIG_SEED_CATEGORIAS],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if ja_aplicado {
        return Ok(());
    }

    let qtd_existentes: i64 =
        conn.query_row("SELECT COUNT(*) FROM categorias_documento;", [], |r| {
            r.get(0)
        })?;

    if qtd_existentes == 0 {
        for &(id, nome, ordem) in CATEGORIAS_INICIAIS {
            conn.execute(
                "INSERT OR IGNORE INTO categorias_documento (id, nome, ordem) VALUES (?1, ?2, ?3);",
                params![id, nome, ordem],
            )?;
        }
    }

    conn.execute(
        "INSERT INTO config (chave, valor) VALUES (?1, '1')
         ON CONFLICT(chave) DO UPDATE SET valor = '1';",
        [CHAVE_CONFIG_SEED_CATEGORIAS],
    )?;

    Ok(())
}

fn validar_nome_categoria(nome: &str) -> Resultado<String> {
    let limpo = nome.trim().to_string();
    if limpo.is_empty() {
        return Err(Erro::Validacao(
            "O nome da categoria é obrigatório.".to_string(),
        ));
    }
    if limpo.chars().count() > 60 {
        return Err(Erro::Validacao(
            "O nome da categoria deve ter no máximo 60 caracteres.".to_string(),
        ));
    }
    Ok(limpo)
}

pub fn obter_categoria_por_id_conn(conn: &Connection, id: &str) -> Resultado<CategoriaDocumento> {
    let cat = conn
        .query_row(
            "SELECT
                c.id,
                c.nome,
                c.ordem,
                (SELECT COUNT(*) FROM documentos d WHERE d.categoria_id = c.id) AS total_documentos
             FROM categorias_documento c
             WHERE c.id = ?1;",
            [id],
            |row| {
                Ok(CategoriaDocumento {
                    id: row.get(0)?,
                    nome: row.get(1)?,
                    ordem: row.get(2)?,
                    total_documentos: row.get(3)?,
                })
            },
        )
        .optional()?;

    cat.ok_or(Erro::NaoEncontrado)
}

/// Lista todas as categorias de documentos ordenadas por `ordem ASC, nome ASC` (RN41).
pub fn executar_categorias_listar(state: &AppState) -> Resultado<Vec<CategoriaDocumento>> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    garantir_categorias_iniciais_conn(conn)?;

    let mut stmt = conn.prepare(
        "SELECT
            c.id,
            c.nome,
            c.ordem,
            (SELECT COUNT(*) FROM documentos d WHERE d.categoria_id = c.id) AS total_documentos
         FROM categorias_documento c
         ORDER BY c.ordem ASC, c.nome ASC;",
    )?;

    let linhas = stmt.query_map([], |row| {
        Ok(CategoriaDocumento {
            id: row.get(0)?,
            nome: row.get(1)?,
            ordem: row.get(2)?,
            total_documentos: row.get(3)?,
        })
    })?;

    let mut categorias = Vec::new();
    for linha in linhas {
        categorias.push(linha?);
    }

    Ok(categorias)
}

/// Cria uma nova categoria de documento (RN41).
pub fn executar_categoria_criar(state: &AppState, nome: &str) -> Resultado<CategoriaDocumento> {
    state.verificar_desbloqueado()?;
    let nome_limpo = validar_nome_categoria(nome)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    garantir_categorias_iniciais_conn(conn)?;

    let duplicada: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM categorias_documento WHERE LOWER(nome) = LOWER(?1));",
        [&nome_limpo],
        |r| r.get(0),
    )?;

    if duplicada {
        return Err(Erro::Validacao(
            "Já existe uma categoria com este nome.".to_string(),
        ));
    }

    let proxima_ordem: i64 = conn.query_row(
        "SELECT COALESCE(MAX(ordem), 0) + 1 FROM categorias_documento;",
        [],
        |r| r.get(0),
    )?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO categorias_documento (id, nome, ordem) VALUES (?1, ?2, ?3);",
        params![id, nome_limpo, proxima_ordem],
    )?;

    obter_categoria_por_id_conn(conn, &id)
}

/// Renomeia uma categoria existente (RN41).
pub fn executar_categoria_renomear(
    state: &AppState,
    id: &str,
    nome: &str,
) -> Resultado<CategoriaDocumento> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador da categoria é obrigatório.".to_string(),
        ));
    }
    let nome_limpo = validar_nome_categoria(nome)?;

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let _existente = obter_categoria_por_id_conn(conn, id_limpo)?;

    let duplicada: bool = conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM categorias_documento
            WHERE LOWER(nome) = LOWER(?1) AND id != ?2
        );",
        params![nome_limpo, id_limpo],
        |r| r.get(0),
    )?;

    if duplicada {
        return Err(Erro::Validacao(
            "Já existe outra categoria com este nome.".to_string(),
        ));
    }

    conn.execute(
        "UPDATE categorias_documento SET nome = ?1 WHERE id = ?2;",
        params![nome_limpo, id_limpo],
    )?;

    obter_categoria_por_id_conn(conn, id_limpo)
}

/// Exclui uma categoria somente se ela estiver vazia (RN41).
pub fn executar_categoria_excluir(state: &AppState, id: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let id_limpo = id.trim();
    if id_limpo.is_empty() {
        return Err(Erro::Validacao(
            "O identificador da categoria é obrigatório.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let categoria = obter_categoria_por_id_conn(conn, id_limpo)?;
    if categoria.total_documentos > 0 {
        return Err(Erro::Validacao(
            "Só é possível excluir uma categoria vazia. Mova ou exclua os documentos desta categoria antes."
                .to_string(),
        ));
    }

    conn.execute(
        "DELETE FROM categorias_documento WHERE id = ?1;",
        [id_limpo],
    )?;
    Ok(())
}

#[tauri::command]
pub fn categorias_listar(state: State<'_, AppState>) -> Resultado<Vec<CategoriaDocumento>> {
    executar_categorias_listar(&state)
}

#[tauri::command]
pub fn categoria_criar(state: State<'_, AppState>, nome: String) -> Resultado<CategoriaDocumento> {
    executar_categoria_criar(&state, &nome)
}

#[tauri::command]
pub fn categoria_renomear(
    state: State<'_, AppState>,
    id: String,
    nome: String,
) -> Resultado<CategoriaDocumento> {
    executar_categoria_renomear(&state, &id, &nome)
}

#[tauri::command]
pub fn categoria_excluir(state: State<'_, AppState>, id: String) -> Resultado<()> {
    executar_categoria_excluir(&state, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::gerar_dek;
    use crate::db::abrir_banco;
    use std::fs;

    fn criar_estado_desbloqueado() -> AppState {
        let dir = std::env::temp_dir().join(format!("lc-categorias-test-{}", Uuid::new_v4()));
        let dek = gerar_dek();
        let conn = abrir_banco(&dir, &dek).expect("abrir banco");
        let state = AppState::new(dir);
        *state.dek.lock().unwrap() = Some(dek);
        *state.conn.lock().unwrap() = Some(conn);
        state
    }

    #[test]
    fn comandos_rejeitam_acesso_quando_bloqueado() {
        let dir = std::env::temp_dir().join(format!("lc-cat-lock-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());

        assert_eq!(executar_categorias_listar(&state), Err(Erro::Bloqueado));
        assert_eq!(
            executar_categoria_criar(&state, "Nova"),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_categoria_renomear(&state, "id", "Nome"),
            Err(Erro::Bloqueado)
        );
        assert_eq!(
            executar_categoria_excluir(&state, "id"),
            Err(Erro::Bloqueado)
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn seed_categorias_iniciais_e_crud_completo_com_bloqueio_nao_vazia_rn41() {
        let state = criar_estado_desbloqueado();

        // 1. Seed inicial: Modelos, Administrativo, Outros (RN41)
        let iniciais = executar_categorias_listar(&state).expect("listar iniciais");
        assert_eq!(iniciais.len(), 3);
        assert_eq!(iniciais[0].nome, "Modelos");
        assert_eq!(iniciais[1].nome, "Administrativo");
        assert_eq!(iniciais[2].nome, "Outros");

        // 2. Criar nova categoria
        let criada =
            executar_categoria_criar(&state, "  Laudos e Pareceres  ").expect("criar categoria");
        assert_eq!(criada.nome, "Laudos e Pareceres");
        assert_eq!(criada.ordem, 4);
        assert_eq!(criada.total_documentos, 0);

        // Nome duplicado (mesmo em minúsculas) deve falhar
        assert!(matches!(
            executar_categoria_criar(&state, "modelos"),
            Err(Erro::Validacao(_))
        ));

        // 3. Renomear categoria
        let renomeada = executar_categoria_renomear(&state, &criada.id, "Avaliações")
            .expect("renomear categoria");
        assert_eq!(renomeada.nome, "Avaliações");

        // 4. Vincular um documento à categoria "Avaliações" e tentar excluir (deve falhar — RN41)
        {
            let conn_guard = state.conn.lock().unwrap();
            let conn = conn_guard.as_ref().unwrap();
            conn.execute(
                "INSERT INTO documentos (id, categoria_id, nome_original, descricao, mime, tamanho_bytes, sha256, enviado_em, atualizado_em)
                 VALUES ('doc-1', ?1, 'teste.pdf', NULL, 'application/pdf', 100, 'abc', '2026-11-02T10:00:00Z', '2026-11-02T10:00:00Z');",
                [&criada.id],
            )
            .expect("inserir documento de teste");
        }

        let erro_excluir_nao_vazia = executar_categoria_excluir(&state, &criada.id);
        assert!(matches!(erro_excluir_nao_vazia, Err(Erro::Validacao(_))));

        // 5. Remover o documento e excluir a categoria vazia com sucesso
        {
            let conn_guard = state.conn.lock().unwrap();
            let conn = conn_guard.as_ref().unwrap();
            conn.execute("DELETE FROM documentos WHERE id = 'doc-1';", [])
                .expect("remover doc-1");
        }

        executar_categoria_excluir(&state, &criada.id).expect("excluir categoria vazia");

        // 6. Excluir também uma categoria inicial ("Outros") e garantir que não recria no próximo listar
        executar_categoria_excluir(&state, &iniciais[2].id).expect("excluir Outros");
        let restantes = executar_categorias_listar(&state).expect("listar restantes");
        assert_eq!(restantes.len(), 2);
        assert_eq!(restantes[0].nome, "Modelos");
        assert_eq!(restantes[1].nome, "Administrativo");

        let _ = fs::remove_dir_all(&state.data_dir);
    }
}
