//! Módulo do cofre (`vault.json`): persistência atômica da DEK embrulhada e rate-limit de login (F1-T2).

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::crypto::{
    desembrulhar_dek_com_chave_recuperacao, desembrulhar_dek_com_segredo,
    embrulhar_dek_com_chave_recuperacao, embrulhar_dek_com_segredo, gerar_chave_recuperacao,
    gerar_dek, DekEmbrulhada, ParametrosArgon2,
};
use crate::error::{Erro, Resultado};
use crate::state::Key;

/// Versão atual do formato `vault.json`.
pub const VERSAO_VAULT: u32 = 1;

/// Nome do arquivo de cofre na pasta de dados.
pub const NOME_ARQUIVO_VAULT: &str = "vault.json";

/// Limite de tentativas erradas seguidas antes de bloquear (RN04: 5 tentativas).
pub const LIMITE_TENTATIVAS_ERRADAS: u32 = 5;

/// Tempo base de bloqueio na primeira sequência de 5 erros: 5 minutos (300 segundos) (RN04).
pub const BLOQUEIO_BASE_SEGUNDOS: i64 = 5 * 60;

/// Tempo máximo de bloqueio: 1 hora (3600 segundos) (RN04).
pub const BLOQUEIO_MAXIMO_SEGUNDOS: i64 = 60 * 60;

/// Estado persistido do controle de tentativas de login (RN04).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EstadoRateLimit {
    /// Tentativas erradas acumuladas na sequência atual (0..5).
    pub tentativas_falhas: u32,
    /// Quantas sequências de 5 erros já ocorreram consecutivamente sem acerto.
    pub sequencias_bloqueio: u32,
    /// Timestamp UTC (segundos desde Unix epoch) até quando o login está bloqueado.
    pub bloqueado_ate_epoch_s: Option<i64>,
}

/// Estrutura persistida no arquivo `vault.json` (Seção 7 da Fonte da Verdade).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Vault {
    pub versao: u32,
    pub parametros_argon2: ParametrosArgon2,
    pub dek_por_senha: DekEmbrulhada,
    pub dek_por_recuperacao: DekEmbrulhada,
    pub rate_limit: EstadoRateLimit,
}

/// Retorno da criação inicial do cofre (setup).
pub struct ResultadoSetupVault {
    pub vault: Vault,
    pub dek: Key,
    pub chave_recuperacao: String,
}

/// Retorna o caminho do arquivo `vault.json` dentro de `data_dir`.
pub fn caminho_vault(data_dir: &Path) -> PathBuf {
    data_dir.join(NOME_ARQUIVO_VAULT)
}

/// Verifica se o `vault.json` já existe na pasta de dados.
pub fn vault_existe(data_dir: &Path) -> bool {
    caminho_vault(data_dir).is_file()
}

/// Lê o `vault.json` do disco.
pub fn carregar_vault(data_dir: &Path) -> Resultado<Vault> {
    let caminho = caminho_vault(data_dir);
    let conteudo = fs::read_to_string(caminho)?;
    serde_json::from_str(&conteudo).map_err(|_| Erro::Criptografia)
}

/// Grava o `vault.json` de forma atômica (escreve em `.tmp`, faz `sync_all` e renomeia).
pub fn salvar_vault_atomico(data_dir: &Path, vault: &Vault) -> Resultado<()> {
    fs::create_dir_all(data_dir)?;
    let destino = caminho_vault(data_dir);
    let temporario = data_dir.join("vault.json.tmp");

    let json = serde_json::to_string_pretty(vault).map_err(|_| Erro::Interno)?;

    {
        let mut arquivo = File::create(&temporario)?;
        arquivo.write_all(json.as_bytes())?;
        arquivo.sync_all()?;
    }

    fs::rename(&temporario, &destino)?;
    Ok(())
}

/// Valida os requisitos mínimos da senha mestra (RN01: mínimo de 8 caracteres).
pub fn validar_requisitos_senha(senha: &str) -> Resultado<()> {
    if senha.chars().count() < 8 {
        return Err(Erro::Validacao(
            "A senha deve ter no mínimo 8 caracteres.".to_string(),
        ));
    }
    Ok(())
}

/// Cria e persiste um novo `vault.json` no primeiro uso (RN01 e RN02).
pub fn inicializar_vault(
    data_dir: &Path,
    senha: &str,
    params: ParametrosArgon2,
) -> Resultado<ResultadoSetupVault> {
    validar_requisitos_senha(senha)?;

    let dek = gerar_dek();
    let chave_recuperacao = gerar_chave_recuperacao();

    let dek_por_senha = embrulhar_dek_com_segredo(&dek, senha.as_bytes(), params)?;
    let dek_por_recuperacao =
        embrulhar_dek_com_chave_recuperacao(&dek, &chave_recuperacao, params)?;

    let vault = Vault {
        versao: VERSAO_VAULT,
        parametros_argon2: params,
        dek_por_senha,
        dek_por_recuperacao,
        rate_limit: EstadoRateLimit::default(),
    };

    salvar_vault_atomico(data_dir, &vault)?;

    Ok(ResultadoSetupVault {
        vault,
        dek,
        chave_recuperacao,
    })
}

impl Vault {
    /// Verifica se o login está bloqueado no instante `agora_epoch_s` (RN04).
    /// Se estiver bloqueado, retorna `Err(Erro::LoginBloqueadoTemporariamente { minutos })`.
    pub fn verificar_bloqueio_tempo(&self, agora_epoch_s: i64) -> Resultado<()> {
        if let Some(ate) = self.rate_limit.bloqueado_ate_epoch_s {
            if agora_epoch_s < ate {
                let restante_s = (ate - agora_epoch_s) as u64;
                let minutos = restante_s.div_ceil(60).max(1);
                return Err(Erro::LoginBloqueadoTemporariamente { minutos });
            }
        }
        Ok(())
    }

    /// Retorna quantos segundos restam de bloqueio (ou `None` se não estiver bloqueado).
    pub fn segundos_restantes_bloqueio(&self, agora_epoch_s: i64) -> Option<u64> {
        if let Some(ate) = self.rate_limit.bloqueado_ate_epoch_s {
            if agora_epoch_s < ate {
                return Some((ate - agora_epoch_s) as u64);
            }
        }
        None
    }

    /// Registra uma tentativa de senha incorreta e aplica a regra RN04:
    /// - Após 5 tentativas erradas seguidas, bloqueia por 5 minutos.
    /// - Cada nova sequência de 5 erros dobra o tempo (5m → 10m → 20m → 40m → 60m), até no máximo 1 hora.
    pub fn registrar_falha_login(&mut self, agora_epoch_s: i64) -> Erro {
        self.rate_limit.tentativas_falhas = self.rate_limit.tentativas_falhas.saturating_add(1);

        if self.rate_limit.tentativas_falhas >= LIMITE_TENTATIVAS_ERRADAS {
            self.rate_limit.tentativas_falhas = 0;
            let fator = 1i64
                .checked_shl(self.rate_limit.sequencias_bloqueio.min(10))
                .unwrap_or(16);
            let duracao_s = (BLOQUEIO_BASE_SEGUNDOS * fator).min(BLOQUEIO_MAXIMO_SEGUNDOS);
            self.rate_limit.sequencias_bloqueio =
                self.rate_limit.sequencias_bloqueio.saturating_add(1);
            self.rate_limit.bloqueado_ate_epoch_s = Some(agora_epoch_s + duracao_s);

            let minutos = (duracao_s as u64).div_ceil(60).max(1);
            Erro::LoginBloqueadoTemporariamente { minutos }
        } else {
            Erro::SenhaIncorreta
        }
    }

    /// Zera o contador de erros e bloqueio após um login ou recuperação bem-sucedida (RN04).
    pub fn zerar_rate_limit(&mut self) {
        self.rate_limit = EstadoRateLimit::default();
    }
}

/// Autentica com a senha mestra no `vault.json`, persistindo imediatamente qualquer mudança
/// no contador de rate-limit (RN03, RN04, RN08).
pub fn autenticar_com_senha(data_dir: &Path, senha: &str, agora_epoch_s: i64) -> Resultado<Key> {
    let mut vault = carregar_vault(data_dir)?;

    // Checa se há bloqueio ativo
    vault.verificar_bloqueio_tempo(agora_epoch_s)?;

    match desembrulhar_dek_com_segredo(
        &vault.dek_por_senha,
        senha.as_bytes(),
        vault.parametros_argon2,
    ) {
        Ok(dek) => {
            if vault.rate_limit.tentativas_falhas > 0
                || vault.rate_limit.sequencias_bloqueio > 0
                || vault.rate_limit.bloqueado_ate_epoch_s.is_some()
            {
                vault.zerar_rate_limit();
                salvar_vault_atomico(data_dir, &vault)?;
            }
            Ok(dek)
        }
        Err(_) => {
            let erro = vault.registrar_falha_login(agora_epoch_s);
            salvar_vault_atomico(data_dir, &vault)?;
            Err(erro)
        }
    }
}

/// Troca a senha mestra exigindo a senha atual (RN07).
/// Apenas re-embrulha a DEK sem re-cifrar o banco nem os documentos (Seção 7).
pub fn alterar_senha(data_dir: &Path, senha_atual: &str, nova_senha: &str) -> Resultado<Key> {
    validar_requisitos_senha(nova_senha)?;
    let mut vault = carregar_vault(data_dir)?;

    let dek = desembrulhar_dek_com_segredo(
        &vault.dek_por_senha,
        senha_atual.as_bytes(),
        vault.parametros_argon2,
    )
    .map_err(|_| Erro::SenhaIncorreta)?;

    vault.dek_por_senha =
        embrulhar_dek_com_segredo(&dek, nova_senha.as_bytes(), vault.parametros_argon2)?;
    vault.zerar_rate_limit();

    salvar_vault_atomico(data_dir, &vault)?;
    Ok(dek)
}

/// Recupera o acesso usando a chave de recuperação e define uma nova senha mestra (RN07).
pub fn recuperar_com_chave(
    data_dir: &Path,
    chave_recuperacao: &str,
    nova_senha: &str,
) -> Resultado<Key> {
    validar_requisitos_senha(nova_senha)?;
    let mut vault = carregar_vault(data_dir)?;

    let dek = desembrulhar_dek_com_chave_recuperacao(
        &vault.dek_por_recuperacao,
        chave_recuperacao,
        vault.parametros_argon2,
    )?;

    vault.dek_por_senha =
        embrulhar_dek_com_segredo(&dek, nova_senha.as_bytes(), vault.parametros_argon2)?;
    vault.zerar_rate_limit();

    salvar_vault_atomico(data_dir, &vault)?;
    Ok(dek)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn pasta_temporaria_teste() -> PathBuf {
        std::env::temp_dir().join(format!("lc-pacientes-vault-test-{}", Uuid::new_v4()))
    }

    fn params_teste_rapido() -> ParametrosArgon2 {
        ParametrosArgon2 {
            m_cost_kib: 4096,
            t_cost: 1,
            p_cost: 1,
        }
    }

    #[test]
    fn rate_limit_5_erros_bloqueia_persiste_e_dobra_tempo() {
        let dir = pasta_temporaria_teste();
        let params = params_teste_rapido();
        let t0: i64 = 1_700_000_000;

        let setup = inicializar_vault(&dir, "SenhaCorreta123", params).expect("inicializar vault");

        // 4 erros seguidos retornam SenhaIncorreta
        for i in 1..=4 {
            let res = autenticar_com_senha(&dir, "errada", t0 + i);
            assert_eq!(res, Err(Erro::SenhaIncorreta));
        }

        // O 5º erro bloqueia por 5 minutos (300s)
        let res_5 = autenticar_com_senha(&dir, "errada", t0 + 5);
        assert_eq!(
            res_5,
            Err(Erro::LoginBloqueadoTemporariamente { minutos: 5 })
        );

        // Simula reinício do app lendo novamente do disco: bloqueio persiste
        let vault_recarregado = carregar_vault(&dir).expect("recarregar vault do disco");
        assert_eq!(
            vault_recarregado.rate_limit.bloqueado_ate_epoch_s,
            Some(t0 + 5 + 300)
        );
        assert_eq!(vault_recarregado.rate_limit.sequencias_bloqueio, 1);

        // Mesmo tentando a senha correta durante o período de bloqueio, deve continuar bloqueado
        let res_durante_bloqueio = autenticar_com_senha(&dir, "SenhaCorreta123", t0 + 100);
        assert_eq!(
            res_durante_bloqueio,
            Err(Erro::LoginBloqueadoTemporariamente { minutos: 4 })
        );

        // Após passar 5 minutos (t1 = t0 + 306), errar mais 5 vezes dobra o tempo para 10 minutos (600s)
        let t1 = t0 + 306;
        for i in 0..4 {
            assert_eq!(
                autenticar_com_senha(&dir, "errada", t1 + i),
                Err(Erro::SenhaIncorreta)
            );
        }
        let res_segunda_sequencia = autenticar_com_senha(&dir, "errada", t1 + 4);
        assert_eq!(
            res_segunda_sequencia,
            Err(Erro::LoginBloqueadoTemporariamente { minutos: 10 })
        );

        // Após passar os 10 minutos (t2 = t1 + 4 + 601), acertar a senha desbloqueia e zera o contador
        let t2 = t1 + 4 + 601;
        let dek = autenticar_com_senha(&dir, "SenhaCorreta123", t2)
            .expect("login deve funcionar após expirar bloqueio");
        assert_eq!(dek, setup.dek);

        let vault_apos_sucesso = carregar_vault(&dir).expect("recarregar vault");
        assert_eq!(vault_apos_sucesso.rate_limit, EstadoRateLimit::default());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn limite_maximo_de_bloqueio_eh_uma_hora() {
        let dir = pasta_temporaria_teste();
        let params = params_teste_rapido();
        inicializar_vault(&dir, "SenhaCorreta123", params).expect("inicializar vault");

        let mut vault = carregar_vault(&dir).expect("carregar vault");
        let mut agora = 1_700_000_000i64;

        // Sequências esperadas em minutos: 5, 10, 20, 40, 60, 60
        let minutos_esperados = [5u64, 10, 20, 40, 60, 60];
        for esperado in minutos_esperados {
            for _ in 0..4 {
                assert_eq!(vault.registrar_falha_login(agora), Erro::SenhaIncorreta);
            }
            let erro = vault.registrar_falha_login(agora);
            assert_eq!(
                erro,
                Erro::LoginBloqueadoTemporariamente { minutos: esperado }
            );
            agora += 4000;
        }

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn trocar_senha_e_recuperar_com_chave_preservam_dek() {
        let dir = pasta_temporaria_teste();
        let params = params_teste_rapido();

        let setup = inicializar_vault(&dir, "SenhaInicial123", params).expect("inicializar vault");

        // Senha curta deve falhar na validação (RN01)
        assert_eq!(
            alterar_senha(&dir, "SenhaInicial123", "curta"),
            Err(Erro::Validacao(
                "A senha deve ter no mínimo 8 caracteres.".to_string()
            ))
        );

        // Trocar senha com a senha atual correta
        let dek_trocada =
            alterar_senha(&dir, "SenhaInicial123", "NovaSenhaForte456").expect("trocar senha");
        assert_eq!(dek_trocada, setup.dek);

        // Senha antiga não funciona mais
        assert_eq!(
            autenticar_com_senha(&dir, "SenhaInicial123", 1_700_000_000),
            Err(Erro::SenhaIncorreta)
        );

        // Nova senha funciona
        let dek_login =
            autenticar_com_senha(&dir, "NovaSenhaForte456", 1_700_000_010).expect("login nova");
        assert_eq!(dek_login, setup.dek);

        // Recuperar usando a chave de recuperação redefine a senha e preserva a mesma DEK
        let dek_recuperada =
            recuperar_com_chave(&dir, &setup.chave_recuperacao, "SenhaRecuperada789")
                .expect("recuperar com chave");
        assert_eq!(dek_recuperada, setup.dek);

        let dek_pos_rec =
            autenticar_com_senha(&dir, "SenhaRecuperada789", 1_700_000_020).expect("login pos rec");
        assert_eq!(dek_pos_rec, setup.dek);

        let _ = fs::remove_dir_all(&dir);
    }
}
