//! Comandos de leitura e atualização de configurações (`config_*`) e boas-vindas rotativas (F4.5-T1 — RN60–RN62).

use argon2::password_hash::rand_core::{OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::error::{Erro, Resultado};
use crate::state::AppState;

/// Chave na tabela `config` onde fica salvo o índice da última mensagem de boas-vindas exibida (RN62).
pub const CHAVE_CONFIG_BOAS_VINDAS_INDICE: &str = "boas_vindas_ultimo_indice";

/// Chave na tabela `config` onde fica salva a fila de índices restantes do ciclo embaralhado (RN60, RN62).
pub const CHAVE_CONFIG_BOAS_VINDAS_FILA: &str = "boas_vindas_fila";

/// Chave na tabela `config` onde fica salva a mensagem padrão de parabéns no WhatsApp (RN32).
pub const CHAVE_CONFIG_MENSAGEM_ANIVERSARIO: &str = "mensagem_aniversario";

/// Chave na tabela `config` onde fica salva a data/hora ISO 8601 do último backup realizado (RN53).
pub const CHAVE_CONFIG_ULTIMO_BACKUP: &str = "ultimo_backup";

/// Mensagem padrão de aniversário quando ainda não foi personalizada pela usuária (RN32).
pub const MENSAGEM_ANIVERSARIO_PADRAO: &str =
    "Olá, {primeiro_nome}! Feliz aniversário! Desejo um novo ano cheio de saúde e alegrias. Um abraço, Louriedna.";

/// Lista fixa de mensagens de boas-vindas do MVP (RN61).
/// Inclui obrigatoriamente "Eu te amo, mãe! ❤️".
pub const MENSAGENS_BOAS_VINDAS: [&str; 9] = [
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

/// Embaralha uma fatia de índices utilizando Fisher-Yates (RN60–RN62).
pub fn embaralhar_com_semente(itens: &mut [usize], mut rng: impl FnMut() -> u64) {
    for i in (1..itens.len()).rev() {
        let j = (rng() as usize) % (i + 1);
        itens.swap(i, j);
    }
}

/// Gera uma nova lista com todas as frases embaralhadas [0..total-1], garantindo que a primeira
/// frase dessa nova lista seja diferente da última frase da lista passada (RN60–RN62).
pub fn gerar_novo_ciclo_embaralhado(
    total: usize,
    ultimo_indice: Option<usize>,
    mut rng: impl FnMut() -> u64,
) -> Vec<usize> {
    if total == 0 {
        return Vec::new();
    }
    let mut ciclo: Vec<usize> = (0..total).collect();
    if total == 1 {
        return ciclo;
    }

    embaralhar_com_semente(&mut ciclo, &mut rng);

    if let Some(ultimo) = ultimo_indice {
        if ciclo[0] == ultimo {
            // Garante que o primeiro da nova lista seja diferente do último da lista passada
            let deslocamento = 1 + ((rng() as usize) % (total - 1));
            ciclo.swap(0, deslocamento);
        }
    }

    ciclo
}

/// Consome o próximo índice da fila atual ou cria uma nova lista embaralhada quando a anterior termina,
/// garantindo que a primeira frase da nova lista seja diferente da última da anterior.
pub fn avancar_ciclo_boas_vindas(
    mut fila: Vec<usize>,
    ultimo_indice: Option<usize>,
    total: usize,
    mut rng: impl FnMut() -> u64,
) -> (usize, Vec<usize>) {
    if total == 0 {
        return (0, Vec::new());
    }
    if total == 1 {
        return (0, Vec::new());
    }

    let fila_valida = !fila.is_empty() && fila.iter().all(|&idx| idx < total);
    if !fila_valida {
        fila = gerar_novo_ciclo_embaralhado(total, ultimo_indice, &mut rng);
    }

    // Se o elemento na ponta da fila coincidir com o último índice (ex.: caso de borda), desvia
    if let Some(ultimo) = ultimo_indice {
        if !fila.is_empty() && fila[0] == ultimo {
            if fila.len() > 1 {
                fila.swap(0, 1);
            } else {
                fila = gerar_novo_ciclo_embaralhado(total, Some(ultimo), &mut rng);
            }
        }
    }

    let escolhido = fila.remove(0);
    (escolhido, fila)
}

/// Sorteia o próximo índice da lista sem repetir o `ultimo_indice` (RN60, RN62).
pub fn sortear_proximo_indice_boas_vindas(
    ultimo_indice: Option<usize>,
    total: usize,
    aleatorio: u64,
) -> usize {
    if total <= 1 {
        return 0;
    }

    match ultimo_indice {
        Some(ultimo) if ultimo < total => {
            let deslocamento = (aleatorio as usize) % (total - 1);
            (ultimo + 1 + deslocamento) % total
        }
        _ => (aleatorio as usize) % total,
    }
}

pub fn ler_config_conn(conn: &Connection, chave: &str) -> Resultado<Option<String>> {
    let valor = conn
        .query_row(
            "SELECT valor FROM config WHERE chave = ?1;",
            [chave],
            |row| row.get(0),
        )
        .optional()?;
    Ok(valor)
}

pub fn definir_config_conn(conn: &Connection, chave: &str, valor: &str) -> Resultado<()> {
    conn.execute(
        "INSERT INTO config (chave, valor) VALUES (?1, ?2)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor;",
        params![chave, valor],
    )?;
    Ok(())
}

/// Sorteia uma nova mensagem de boas-vindas diferente da anterior, grava o índice em `config`
/// e retorna o texto da mensagem escolhida (RN60–RN62).
pub fn rotacionar_boas_vindas_conn(conn: &Connection) -> Resultado<String> {
    let aleatorio = OsRng.next_u64();
    rotacionar_boas_vindas_com_semente_conn(conn, aleatorio)
}

pub fn rotacionar_boas_vindas_com_semente_conn(
    conn: &Connection,
    aleatorio: u64,
) -> Resultado<String> {
    let total = MENSAGENS_BOAS_VINDAS.len();
    let ultimo_indice = ler_config_conn(conn, CHAVE_CONFIG_BOAS_VINDAS_INDICE)?
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|&idx| idx < total);

    let fila_atual: Vec<usize> = ler_config_conn(conn, CHAVE_CONFIG_BOAS_VINDAS_FILA)?
        .map(|v| {
            v.split(',')
                .filter_map(|s| s.trim().parse::<usize>().ok())
                .filter(|&idx| idx < total)
                .collect()
        })
        .unwrap_or_default();

    let mut estado_rng = if aleatorio == 0 { 0x853c49e6748fea9b } else { aleatorio };
    let (escolhido, nova_fila) = avancar_ciclo_boas_vindas(
        fila_atual,
        ultimo_indice,
        total,
        || {
            estado_rng ^= estado_rng << 13;
            estado_rng ^= estado_rng >> 7;
            estado_rng ^= estado_rng << 17;
            if estado_rng == 0 {
                estado_rng = 0x853c49e6748fea9b;
            }
            estado_rng
        },
    );

    let fila_serializada = nova_fila
        .iter()
        .map(|n| n.to_string())
        .collect::<Vec<_>>()
        .join(",");

    definir_config_conn(conn, CHAVE_CONFIG_BOAS_VINDAS_FILA, &fila_serializada)?;
    definir_config_conn(
        conn,
        CHAVE_CONFIG_BOAS_VINDAS_INDICE,
        &escolhido.to_string(),
    )?;

    Ok(MENSAGENS_BOAS_VINDAS[escolhido].to_string())
}

/// Obtém a mensagem de boas-vindas atual da sessão autenticada.
/// Caso ainda não haja índice salvo em `config`, sorteia e grava um imediatamente.
pub fn executar_boas_vindas_obter(state: &AppState) -> Resultado<String> {
    state.verificar_desbloqueado()?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    if let Some(valor) = ler_config_conn(conn, CHAVE_CONFIG_BOAS_VINDAS_INDICE)? {
        if let Ok(idx) = valor.trim().parse::<usize>() {
            if idx < MENSAGENS_BOAS_VINDAS.len() {
                return Ok(MENSAGENS_BOAS_VINDAS[idx].to_string());
            }
        }
    }

    rotacionar_boas_vindas_conn(conn)
}

pub fn executar_config_obter(state: &AppState, chave: &str) -> Resultado<Option<String>> {
    state.verificar_desbloqueado()?;
    let chave_limpa = chave.trim();
    if chave_limpa.is_empty() {
        return Err(Erro::Validacao(
            "A chave de configuração é obrigatória.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
    ler_config_conn(conn, chave_limpa)
}

pub fn executar_config_definir(state: &AppState, chave: &str, valor: &str) -> Resultado<()> {
    state.verificar_desbloqueado()?;
    let chave_limpa = chave.trim();
    if chave_limpa.is_empty() {
        return Err(Erro::Validacao(
            "A chave de configuração é obrigatória.".to_string(),
        ));
    }

    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;
    definir_config_conn(conn, chave_limpa, valor)
}

#[tauri::command]
pub fn boas_vindas_obter(state: State<'_, AppState>) -> Resultado<String> {
    executar_boas_vindas_obter(&state)
}

#[tauri::command]
pub fn config_obter(state: State<'_, AppState>, chave: String) -> Resultado<Option<String>> {
    executar_config_obter(&state, &chave)
}

#[tauri::command]
pub fn config_definir(state: State<'_, AppState>, chave: String, valor: String) -> Resultado<()> {
    executar_config_definir(&state, &chave, &valor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::auth::{
        executar_auth_lock, executar_auth_login, executar_auth_setup_com_params,
    };
    use crate::crypto::ParametrosArgon2;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn lista_boas_vindas_inclui_eu_te_amo_mae_e_demais_mensagens_rn61() {
        assert_eq!(MENSAGENS_BOAS_VINDAS.len(), 9);
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Eu te amo, mãe! ❤️"));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Que seu dia seja leve e cheio de bons encontros."));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Respire fundo: hoje vai ser um bom dia."));
        assert!(MENSAGENS_BOAS_VINDAS
            .contains(&"Obrigado por cuidar de tantas pessoas com tanto carinho."));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Você faz a diferença na vida de muita gente."));
        assert!(MENSAGENS_BOAS_VINDAS
            .contains(&"Cada pessoa tem sua história, e você ajuda a torná-la mais leve."));
        assert!(MENSAGENS_BOAS_VINDAS
            .contains(&"Seu trabalho faz diferença, mesmo quando você não percebe."));
        assert!(MENSAGENS_BOAS_VINDAS
            .contains(&"Acolher é respeitar o tempo e a história de cada pessoa."));
        assert!(MENSAGENS_BOAS_VINDAS.contains(&"Não se esqueça de cuidar de quem também cuida."));
    }

    #[test]
    fn sorteio_nunca_repete_indice_anterior_rn60_rn62() {
        let total = MENSAGENS_BOAS_VINDAS.len();
        for anterior in 0..total {
            for semente in 0..100u64 {
                let proximo = sortear_proximo_indice_boas_vindas(Some(anterior), total, semente);
                assert!(proximo < total);
                assert_ne!(
                    proximo, anterior,
                    "O sorteio nunca deve repetir o índice imediatamente anterior"
                );
            }
        }
    }

    #[test]
    fn novo_ciclo_embaralhado_contem_todos_os_indices_e_primeiro_difere_do_ultimo_da_lista_passada() {
        let total = MENSAGENS_BOAS_VINDAS.len();
        for ultimo in 0..total {
            for semente in 1..=50u64 {
                let mut rng_seed = semente;
                let ciclo = gerar_novo_ciclo_embaralhado(total, Some(ultimo), || {
                    rng_seed ^= rng_seed << 13;
                    rng_seed ^= rng_seed >> 7;
                    rng_seed ^= rng_seed << 17;
                    rng_seed
                });

                assert_eq!(ciclo.len(), total);
                // Deve conter todos os índices de 0 a total - 1 sem repetição
                let mut ordenado = ciclo.clone();
                ordenado.sort();
                assert_eq!(ordenado, (0..total).collect::<Vec<_>>());

                // O primeiro elemento da nova lista DEVE ser diferente do último da lista passada
                assert_ne!(
                    ciclo[0], ultimo,
                    "A primeira frase do novo ciclo deve ser diferente da última frase do ciclo anterior"
                );
            }
        }
    }

    #[test]
    fn ciclo_completo_passa_por_todas_as_frases_sem_repeticao_e_persiste_em_config() {
        let total = MENSAGENS_BOAS_VINDAS.len();
        let mut fila = Vec::new();
        let mut ultimo = None;
        let mut vistas = std::collections::HashSet::new();
        let mut seed = 42u64;

        // Ciclo 1: 9 passos
        for _ in 0..total {
            let (escolhido, nova_fila) = avancar_ciclo_boas_vindas(fila, ultimo, total, || {
                seed = seed.wrapping_add(1);
                seed
            });
            assert!(!vistas.contains(&escolhido));
            vistas.insert(escolhido);
            ultimo = Some(escolhido);
            fila = nova_fila;
        }
        assert_eq!(vistas.len(), total);
        assert!(fila.is_empty(), "Ao fim do ciclo, a fila deve estar vazia");

        // Ciclo 2, passo 1: primeira frase do novo ciclo DEVE ser diferente da última do ciclo 1
        let ultimo_ciclo_1 = ultimo.expect("último do ciclo 1");
        let (escolhido_ciclo_2, _) = avancar_ciclo_boas_vindas(fila, ultimo, total, || {
            seed = seed.wrapping_add(1);
            seed
        });
        assert_ne!(
            escolhido_ciclo_2, ultimo_ciclo_1,
            "Primeira frase do ciclo 2 deve ser diferente da última frase do ciclo 1"
        );
    }

    #[test]
    fn logins_consecutivos_rotacionam_mensagem_sem_repetir_anterior_e_persistem_em_config() {
        let dir = std::env::temp_dir().join(format!("lc-boas-vindas-test-{}", Uuid::new_v4()));
        let state = AppState::new(dir.clone());
        let params = ParametrosArgon2 {
            m_cost_kib: 4096,
            t_cost: 1,
            p_cost: 1,
        };
        let t0 = 1_700_000_000i64;

        // Quando bloqueado, rejeita com Erro::Bloqueado
        assert_eq!(executar_boas_vindas_obter(&state), Err(Erro::Bloqueado));

        // Setup inicial já sorteia a 1ª mensagem
        executar_auth_setup_com_params(&state, "MinhaSenha123", params).expect("setup");
        let mut msg_anterior = executar_boas_vindas_obter(&state).expect("mensagem inicial");
        assert!(MENSAGENS_BOAS_VINDAS.contains(&msg_anterior.as_str()));

        // Fazer vários logins consecutivos (incluindo os 3 exigidos no aceite) e verificar que nunca repete a anterior
        for passo in 1..=10 {
            executar_auth_lock(&state).expect("lock");
            executar_auth_login(&state, "MinhaSenha123", t0 + passo).expect("login");

            let nova_msg = executar_boas_vindas_obter(&state).expect("obter boas-vindas");
            assert!(MENSAGENS_BOAS_VINDAS.contains(&nova_msg.as_str()));
            assert_ne!(
                nova_msg, msg_anterior,
                "Login {} não pode repetir a mensagem do login anterior",
                passo
            );

            // Chamadas repetidas na mesma sessão retornam a mesma mensagem até o próximo login
            let mesma_sessao =
                executar_boas_vindas_obter(&state).expect("obter boas-vindas mesma sessão");
            assert_eq!(nova_msg, mesma_sessao);

            // Verifica que o índice está gravado em `config`
            let idx_salvo = executar_config_obter(&state, CHAVE_CONFIG_BOAS_VINDAS_INDICE)
                .expect("ler config")
                .expect("índice existe");
            let idx_num: usize = idx_salvo.parse().expect("índice numérico");
            assert_eq!(MENSAGENS_BOAS_VINDAS[idx_num], nova_msg);

            msg_anterior = nova_msg;
        }

        let _ = fs::remove_dir_all(&dir);
    }
}
