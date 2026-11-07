//! Comandos de criação, inspeção e restauração de backup (`backup_*` — F7-T1, F7-T2).

use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use tauri::State;
use zeroize::Zeroize;

use crate::backup::{
    criar_backup_com_instante, gerar_nome_backup_sugerido, inspecionar_backup,
    resolver_caminho_destino_backup, restaurar_backup, InspecaoBackup, ResultadoBackupCriado,
    ResultadoBackupRestaurado,
};
use crate::db::abrir_banco;
use crate::error::{Erro, Resultado};
use crate::files::{caminho_pasta_temporarios, decodificar_base64};
use crate::state::AppState;
use crate::vault::vault_existe;

/// Executa a criação de um arquivo `.lcbackup` cifrado no destino escolhido pela usuária (RN50, RN51, RN55, RN56).
pub fn executar_backup_criar(
    state: &AppState,
    caminho_destino: Option<&str>,
) -> Resultado<ResultadoBackupCriado> {
    state.verificar_desbloqueado()?;

    let dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
    let conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;

    let dek = dek_guard.as_ref().ok_or(Erro::Bloqueado)?;
    let conn = conn_guard.as_ref().ok_or(Erro::Bloqueado)?;

    let agora = Local::now();
    let caminho_final = resolver_caminho_destino_backup(
        &state.data_dir,
        caminho_destino.unwrap_or_default(),
        agora,
    );

    criar_backup_com_instante(&state.data_dir, conn, dek, &caminho_final, agora)
}

/// Resolve um arquivo `.lcbackup` vindo de um caminho nativo em disco ou de um upload Base64
/// (quando selecionado via `<input type="file">` no WebView sem caminho nativo).
fn com_arquivo_backup_flexivel<T, F>(
    data_dir: &Path,
    caminho: &str,
    conteudo_base64: Option<&str>,
    acao: F,
) -> Resultado<T>
where
    F: FnOnce(&Path) -> Resultado<T>,
{
    if let Some(b64) = conteudo_base64.map(str::trim).filter(|s| !s.is_empty()) {
        let mut bytes = decodificar_base64(b64)?;
        if bytes.is_empty() {
            return Err(Erro::Validacao(
                "O arquivo de backup selecionado está vazio.".to_string(),
            ));
        }

        let pasta_temp = caminho_pasta_temporarios(data_dir);
        fs::create_dir_all(&pasta_temp)?;
        let caminho_staging = pasta_temp.join(format!(
            "backup_staging_{}.lotusbackup",
            &uuid::Uuid::new_v4().to_string()[..8]
        ));
        let res_write = fs::write(&caminho_staging, &bytes);
        bytes.zeroize();
        res_write?;

        let resultado = acao(&caminho_staging);
        let _ = fs::remove_file(&caminho_staging);
        return resultado;
    }

    let limpo = caminho.trim();
    if limpo.is_empty() {
        return Err(Erro::Validacao(
            "Selecione um arquivo de backup (.lotusbackup).".to_string(),
        ));
    }

    let caminho_path = PathBuf::from(limpo);
    acao(&caminho_path)
}

/// Inspeciona um arquivo `.lcbackup` validando a senha ou a chave de recuperação (RN52, RN54).
/// Se já existir um cofre configurado na pasta de dados, exige que a sessão atual esteja desbloqueada;
/// caso a pasta de dados tenha sido apagada, permite inspecionar diretamente com a senha/chave do backup.
pub fn executar_backup_inspecionar(
    state: &AppState,
    caminho: &str,
    senha: &str,
    conteudo_base64: Option<&str>,
) -> Resultado<InspecaoBackup> {
    if vault_existe(&state.data_dir) {
        state.verificar_desbloqueado()?;
    }

    com_arquivo_backup_flexivel(&state.data_dir, caminho, conteudo_base64, |caminho_arq| {
        inspecionar_backup(caminho_arq, senha)
    })
}

/// Restaura um arquivo `.lcbackup` validando a senha ou a chave de recuperação,
/// criando automaticamente uma cópia de segurança prévia dos dados atuais (RN52, RN54)
/// e recarregando a conexão SQLCipher e a DEK em `AppState`.
pub fn executar_backup_restaurar(
    state: &AppState,
    caminho: &str,
    senha: &str,
    conteudo_base64: Option<&str>,
) -> Resultado<ResultadoBackupRestaurado> {
    if vault_existe(&state.data_dir) {
        state.verificar_desbloqueado()?;
    }

    let mut dek_guard = state.dek.lock().map_err(|_| Erro::Interno)?;
    let mut conn_guard = state.conn.lock().map_err(|_| Erro::Interno)?;

    let (nova_dek, resumo) =
        com_arquivo_backup_flexivel(&state.data_dir, caminho, conteudo_base64, |caminho_arq| {
            // Se houver conexão aberta, faz checkpoint e fecha-a logo após a cópia prévia
            let res = restaurar_backup(
                &state.data_dir,
                caminho_arq,
                senha,
                conn_guard.as_ref(),
                dek_guard.as_ref(),
            );
            res
        })?;

    // Abre nova conexão SQLCipher no banco recém-restaurado e atualiza o estado em memória
    let nova_conn = abrir_banco(&state.data_dir, &nova_dek)?;
    *conn_guard = Some(nova_conn);
    *dek_guard = Some(nova_dek);

    Ok(resumo)
}

#[tauri::command]
pub fn backup_criar(
    state: State<'_, AppState>,
    caminho_destino: Option<String>,
) -> Resultado<ResultadoBackupCriado> {
    executar_backup_criar(&state, caminho_destino.as_deref())
}

/// Retorna o caminho absoluto padrão sugerido para o backup (na pasta Downloads).
pub fn executar_backup_obter_caminho_padrao(state: &AppState) -> Resultado<String> {
    state.verificar_desbloqueado()?;
    let caminho = resolver_caminho_destino_backup(&state.data_dir, "", Local::now());
    Ok(caminho.to_string_lossy().to_string())
}

#[tauri::command]
pub fn backup_obter_caminho_padrao(state: State<'_, AppState>) -> Resultado<String> {
    executar_backup_obter_caminho_padrao(&state)
}

/// Abre a caixa de diálogo nativa do sistema operacional para a usuária selecionar onde salvar o `.lcbackup`.
#[tauri::command]
pub async fn backup_selecionar_destino(
    state: State<'_, AppState>,
    caminho_atual: Option<String>,
) -> Resultado<Option<String>> {
    state.verificar_desbloqueado()?;

    let agora = Local::now();
    let nome_padrao = gerar_nome_backup_sugerido(agora);

    let (dir_inicial, nome_arquivo) = if let Some(ref atual) = caminho_atual {
        let p = PathBuf::from(atual.trim());
        if p.is_dir() {
            (Some(p), nome_padrao)
        } else {
            let dir = p.parent().map(|d| d.to_path_buf());
            let nome = p
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or(nome_padrao);
            (dir, nome)
        }
    } else {
        let caminho_padrao = resolver_caminho_destino_backup(&state.data_dir, "", agora);
        (
            caminho_padrao.parent().map(|d| d.to_path_buf()),
            nome_padrao,
        )
    };

    let mut dialog = rfd::AsyncFileDialog::new()
        .set_title("Escolher onde salvar a cópia de segurança (.lotusbackup)")
        .set_file_name(&nome_arquivo)
        .add_filter(
            "Cópia de Segurança LotusPsi (*.lotusbackup)",
            &["lotusbackup", "lcbackup"],
        );

    if let Some(ref dir) = dir_inicial {
        dialog = dialog.set_directory(dir);
    }

    let handle = dialog.save_file().await;
    Ok(handle.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub fn backup_inspecionar(
    state: State<'_, AppState>,
    caminho: String,
    senha: String,
    conteudo_base64: Option<String>,
) -> Resultado<InspecaoBackup> {
    executar_backup_inspecionar(&state, &caminho, &senha, conteudo_base64.as_deref())
}

#[tauri::command]
pub fn backup_restaurar(
    state: State<'_, AppState>,
    caminho: String,
    senha: String,
    conteudo_base64: Option<String>,
) -> Resultado<ResultadoBackupRestaurado> {
    executar_backup_restaurar(&state, &caminho, &senha, conteudo_base64.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::agendamentos::{
        executar_agendamento_criar, executar_agendamentos_listar, DadosAgendamentoInput,
    };
    use crate::commands::anamneses::{
        executar_anamnese_anexar, executar_anamnese_baixar, executar_anamneses_listar,
    };
    use crate::commands::auth::{
        executar_auth_lock, executar_auth_login, executar_auth_setup_com_params,
    };
    use crate::commands::categorias::executar_categorias_listar;
    use crate::commands::config::{
        executar_config_definir, executar_config_obter, CHAVE_CONFIG_MENSAGEM_ANIVERSARIO,
        CHAVE_CONFIG_ULTIMO_BACKUP,
    };
    use crate::commands::documentos::{
        executar_documento_baixar, executar_documento_enviar, executar_documentos_listar,
    };
    use crate::commands::pacientes::{
        executar_paciente_criar, executar_pacientes_listar, DadosPacienteInput,
    };
    use crate::commands::sessoes::{
        executar_sessao_criar, executar_sessoes_listar, DadosSessaoCriarInput,
    };
    use crate::crypto::ParametrosArgon2;
    use crate::files::calcular_sha256_arquivo;
    use uuid::Uuid;

    fn pasta_teste() -> PathBuf {
        std::env::temp_dir().join(format!("lc-cmd-backup-test-{}", Uuid::new_v4()))
    }

    fn params_argon_rapido() -> ParametrosArgon2 {
        ParametrosArgon2 {
            m_cost_kib: 4096,
            t_cost: 1,
            p_cost: 1,
        }
    }

    #[test]
    fn obter_caminho_padrao_rejeita_quando_bloqueado_e_retorna_downloads_quando_desbloqueado() {
        let dir_base = pasta_teste();
        let data_dir = dir_base.join("dados_app");
        let state = AppState::new(data_dir);

        // Bloqueado rejeita
        assert!(matches!(
            executar_backup_obter_caminho_padrao(&state),
            Err(Erro::Bloqueado)
        ));

        // Desbloqueado retorna caminho .lcbackup
        executar_auth_setup_com_params(&state, "SenhaMestraSegura2026", params_argon_rapido())
            .expect("setup inicial");

        let caminho_padrao =
            executar_backup_obter_caminho_padrao(&state).expect("obter caminho padrão");
        assert!(caminho_padrao.ends_with(".lotusbackup"));
        assert!(caminho_padrao.contains("backup-pacientes-"));
    }

    #[test]
    fn fluxo_completo_aceite_f7_backup_apagar_pasta_restaurar_tudo_identico_e_chave_recuperacao() {
        let dir_base = pasta_teste();
        let data_dir = dir_base.join("dados_app");
        let pasta_externa = dir_base.join("externo");
        fs::create_dir_all(&pasta_externa).expect("criar pasta externa");

        let state = AppState::new(data_dir.clone());
        let setup = executar_auth_setup_com_params(
            &state,
            "SenhaMestraSegura2026",
            params_argon_rapido(),
        )
        .expect("setup inicial");
        let chave_recuperacao = setup.chave_recuperacao;

        // 1. Popula dados completos: config, paciente, sessão, agendamento, documento geral e anamnese
        executar_config_definir(
            &state,
            CHAVE_CONFIG_MENSAGEM_ANIVERSARIO,
            "Parabéns especial para {primeiro_nome}!",
        )
        .expect("definir config");

        let paciente = executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "João Pedro Nascimento".to_string(),
                data_nascimento: Some("1988-04-12".to_string()),
                telefone: Some("(71) 98877-6655".to_string()),
                whatsapp: Some("(71) 98877-6655".to_string()),
                email: Some("joao@exemplo.local".to_string()),
                endereco: Some("Rua das Hortênsias, 100".to_string()),
                nome_mae: None,
                nome_pai: None,
                responsavel_nome: None,
                responsavel_parentesco: None,
                responsavel_telefone: None,
                contato_emergencia_nome: None,
                contato_emergencia_telefone: None,
                documento: Some("123.456.789-00".to_string()),
                ocupacao: Some("Professor".to_string()),
                motivo_procura: Some("Ansiedade".to_string()),
                modalidade: Some("particular".to_string()),
                convenio_nome: None,
                valor_sessao_centavos: Some(18000),
                observacoes: Some("Observação clínica importante".to_string()),
            },
        )
        .expect("criar paciente");

        let sessao = executar_sessao_criar(
            &state,
            &DadosSessaoCriarInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-02".to_string(),
                resumo: "Sessão de acompanhamento semanal.".to_string(),
            },
        )
        .expect("criar sessão");

        let agendamento = executar_agendamento_criar(
            &state,
            &DadosAgendamentoInput {
                paciente_id: paciente.id.clone(),
                data: "2026-11-09".to_string(),
                hora_inicio: "16:30".to_string(),
                duracao_min: Some(50),
                observacao: Some("Trazer relatório".to_string()),
            },
        )
        .expect("criar agendamento");

        let orig_doc = pasta_externa.join("relatorio_geral.pdf");
        fs::write(
            &orig_doc,
            b"%PDF-1.7\nConteudo integral do documento geral da clinica\n%%EOF",
        )
        .expect("escrever pdf geral");
        let sha_doc_original = calcular_sha256_arquivo(&orig_doc).expect("sha doc");

        let orig_anam = pasta_externa.join("anamnese_joao.pdf");
        fs::write(
            &orig_anam,
            b"%PDF-1.7\nFicha de anamnese completa do paciente Joao Pedro\n%%EOF",
        )
        .expect("escrever pdf anamnese");
        let sha_anam_original = calcular_sha256_arquivo(&orig_anam).expect("sha anamnese");

        let categorias = executar_categorias_listar(&state).expect("categorias");
        let doc_criado = executar_documento_enviar(
            &state,
            &orig_doc.to_string_lossy(),
            Some(&categorias[0].id),
            Some("Relatório modelo"),
            None,
            None,
        )
        .expect("enviar doc");

        let anam_criada = executar_anamnese_anexar(
            &state,
            &paciente.id,
            &orig_anam.to_string_lossy(),
            None,
            None,
        )
        .expect("anexar anamnese");

        // 2. Faz o backup (.lotusbackup) para a pasta externa
        let criado = executar_backup_criar(&state, Some(&pasta_externa.to_string_lossy()))
            .expect("backup_criar");
        assert!(criado.verificado);
        assert!(criado.nome_arquivo.starts_with("backup-pacientes-"));
        assert!(criado.nome_arquivo.ends_with(".lotusbackup"));
        assert_eq!(criado.n_pacientes, 1);
        assert_eq!(criado.n_documentos, 1);
        assert_eq!(criado.n_anamneses, 1);
        assert_eq!(criado.n_agendamentos, 1);

        // Verifica que ultimo_backup foi gravado em config (RN53)
        let ultimo_bkp = executar_config_obter(&state, CHAVE_CONFIG_ULTIMO_BACKUP)
            .expect("ler ultimo_backup")
            .expect("ultimo_backup presente");
        assert_eq!(ultimo_bkp, criado.criado_em);

        // 3. Inspecionar com a senha funciona; com a chave de recuperação também funciona (RN52);
        //    com senha errada falha com Erro::SenhaIncorreta.
        let inspecao_senha = executar_backup_inspecionar(
            &state,
            &criado.caminho_arquivo,
            "SenhaMestraSegura2026",
            None,
        )
        .expect("inspecionar com senha");
        assert_eq!(inspecao_senha.n_pacientes, 1);
        assert_eq!(inspecao_senha.n_documentos, 1);
        assert_eq!(inspecao_senha.n_anamneses, 1);
        assert_eq!(inspecao_senha.n_agendamentos, 1);

        let inspecao_chave =
            executar_backup_inspecionar(&state, &criado.caminho_arquivo, &chave_recuperacao, None)
                .expect("inspecionar com chave de recuperação (RN52)");
        assert_eq!(inspecao_chave, inspecao_senha);

        assert_eq!(
            executar_backup_inspecionar(&state, &criado.caminho_arquivo, "SenhaErrada999", None),
            Err(Erro::SenhaIncorreta)
        );

        // 4. Critério de Aceite F7: apagar a pasta de dados → restaurar → tudo idêntico!
        executar_auth_lock(&state).expect("bloquear antes de apagar pasta");
        fs::remove_dir_all(&data_dir).expect("apagar toda a pasta de dados");
        assert!(!data_dir.exists());

        // Restaura usando a CHAVE DE RECUPERAÇÃO em pasta de dados limpa (Aceite F7 + RN52)
        let restaurado =
            executar_backup_restaurar(&state, &criado.caminho_arquivo, &chave_recuperacao, None)
                .expect("restaurar em pasta limpa usando a chave de recuperação");
        assert_eq!(restaurado.n_pacientes, 1);
        assert_eq!(restaurado.n_documentos, 1);
        assert_eq!(restaurado.n_anamneses, 1);
        assert_eq!(restaurado.n_agendamentos, 1);
        assert!(
            restaurado.caminho_copia_seguranca.is_none(),
            "Em pasta limpa não há dados anteriores para cópia prévia"
        );

        // Confere que TODOS os dados voltaram idênticos:
        let pacientes_rest = executar_pacientes_listar(&state, None, Some("todos"))
            .expect("listar pacientes restaurados");
        assert_eq!(pacientes_rest.len(), 1);
        assert_eq!(pacientes_rest[0].id, paciente.id);
        assert_eq!(pacientes_rest[0].nome, "João Pedro Nascimento");

        let sessoes_rest =
            executar_sessoes_listar(&state, &paciente.id).expect("listar sessões restauradas");
        assert_eq!(sessoes_rest.len(), 1);
        assert_eq!(sessoes_rest[0].id, sessao.id);
        assert_eq!(sessoes_rest[0].resumo, sessao.resumo);

        let agendamentos_rest = executar_agendamentos_listar(&state, None, None, None)
            .expect("listar agendamentos restaurados");
        assert_eq!(agendamentos_rest.len(), 1);
        assert_eq!(agendamentos_rest[0].id, agendamento.id);
        assert_eq!(agendamentos_rest[0].hora_inicio, "16:30");

        let msg_aniv_rest = executar_config_obter(&state, CHAVE_CONFIG_MENSAGEM_ANIVERSARIO)
            .expect("config msg")
            .expect("msg existe");
        assert_eq!(msg_aniv_rest, "Parabéns especial para {primeiro_nome}!");

        let docs_rest =
            executar_documentos_listar(&state, None, None).expect("listar docs restaurados");
        assert_eq!(docs_rest.len(), 1);
        assert_eq!(docs_rest[0].id, doc_criado.id);

        let destino_doc_baixado = pasta_externa.join("doc_restaurado.pdf");
        executar_documento_baixar(
            &state,
            &doc_criado.id,
            Some(&destino_doc_baixado.to_string_lossy()),
        )
        .expect("baixar doc restaurado");
        assert_eq!(
            calcular_sha256_arquivo(&destino_doc_baixado).unwrap(),
            sha_doc_original
        );

        let anams_rest =
            executar_anamneses_listar(&state, &paciente.id).expect("listar anamneses restauradas");
        assert_eq!(anams_rest.len(), 1);
        assert_eq!(anams_rest[0].id, anam_criada.id);

        let destino_anam_baixada = pasta_externa.join("anam_restaurada.pdf");
        executar_anamnese_baixar(
            &state,
            &anam_criada.id,
            Some(&destino_anam_baixada.to_string_lossy()),
        )
        .expect("baixar anamnese restaurada");
        assert_eq!(
            calcular_sha256_arquivo(&destino_anam_baixada).unwrap(),
            sha_anam_original
        );

        // 5. Agora adiciona um 2º paciente nos dados atuais e restaura novamente o backup antigo
        //    usando a SENHA MESTRA: deve criar antes uma cópia automática de segurança dos dados atuais (RN54)!
        executar_paciente_criar(
            &state,
            &DadosPacienteInput {
                nome: "Segundo Paciente Antes da Restauracao".to_string(),
                data_nascimento: None,
                telefone: None,
                whatsapp: None,
                email: None,
                endereco: None,
                nome_mae: None,
                nome_pai: None,
                responsavel_nome: None,
                responsavel_parentesco: None,
                responsavel_telefone: None,
                contato_emergencia_nome: None,
                contato_emergencia_telefone: None,
                documento: None,
                ocupacao: None,
                motivo_procura: None,
                modalidade: None,
                convenio_nome: None,
                valor_sessao_centavos: None,
                observacoes: None,
            },
        )
        .expect("criar 2º paciente");

        assert_eq!(
            executar_pacientes_listar(&state, None, Some("todos"))
                .unwrap()
                .len(),
            2
        );

        let restaurado_sobre_existente = executar_backup_restaurar(
            &state,
            &criado.caminho_arquivo,
            "SenhaMestraSegura2026",
            None,
        )
        .expect("restaurar sobre dados existentes");

        let caminho_copia_previa = restaurado_sobre_existente
            .caminho_copia_seguranca
            .expect("deve ter criado cópia automática de segurança prévia (RN54)");
        assert!(Path::new(&caminho_copia_previa).is_file());

        // Dados atuais voltaram para 1 paciente (do backup original)
        assert_eq!(
            executar_pacientes_listar(&state, None, Some("todos"))
                .unwrap()
                .len(),
            1
        );

        // E a cópia automática prévia contém os 2 pacientes que existiam antes da restauração!
        let inspecao_copia_previa = executar_backup_inspecionar(
            &state,
            &caminho_copia_previa,
            "SenhaMestraSegura2026",
            None,
        )
        .expect("inspecionar cópia automática prévia");
        assert_eq!(inspecao_copia_previa.n_pacientes, 2);

        // Verifica também que bloquear e logar novamente com a senha mestra funciona normalmente
        executar_auth_lock(&state).expect("lock pos restauracao");
        executar_auth_login(&state, "SenhaMestraSegura2026", 1_700_000_500)
            .expect("login pos restauracao");

        let _ = fs::remove_dir_all(&dir_base);
    }
}
