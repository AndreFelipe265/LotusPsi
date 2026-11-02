use serde::{Serialize, Serializer};
use thiserror::Error;

/// Erros de domínio da aplicação.
/// As mensagens são amigáveis, em português do Brasil e nunca expõem dados sensíveis.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum Erro {
    #[error("Sessão bloqueada. Digite sua senha para continuar.")]
    Bloqueado,

    #[error("Senha incorreta")]
    SenhaIncorreta,

    #[error("Chave de recuperação inválida")]
    ChaveRecuperacaoInvalida,

    #[error("Muitas tentativas incorretas. Tente novamente em {minutos} min.")]
    LoginBloqueadoTemporariamente { minutos: u64 },

    #[error("{0}")]
    Validacao(String),

    #[error("Registro não encontrado.")]
    NaoEncontrado,

    #[error("Não foi possível acessar os dados locais.")]
    BancoDados,

    #[error("Não foi possível processar o arquivo solicitado.")]
    Arquivo,

    #[error("Erro de criptografia ou verificação de integridade.")]
    Criptografia,

    #[error("Ocorreu um erro interno inesperado.")]
    Interno,
}

impl Erro {
    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Bloqueado => "BLOQUEADO",
            Self::SenhaIncorreta => "SENHA_INCORRETA",
            Self::ChaveRecuperacaoInvalida => "CHAVE_RECUPERACAO_INVALIDA",
            Self::LoginBloqueadoTemporariamente { .. } => "LOGIN_BLOQUEADO_TEMPORARIAMENTE",
            Self::Validacao(_) => "VALIDACAO",
            Self::NaoEncontrado => "NAO_ENCONTRADO",
            Self::BancoDados => "BANCO_DADOS",
            Self::Arquivo => "ARQUIVO",
            Self::Criptografia => "CRIPTOGRAFIA",
            Self::Interno => "INTERNO",
        }
    }
}

#[derive(Serialize)]
struct ErroSerializado<'a> {
    codigo: &'static str,
    mensagem: &'a str,
}

impl Serialize for Erro {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mensagem = self.to_string();
        let payload = ErroSerializado {
            codigo: self.codigo(),
            mensagem: &mensagem,
        };
        payload.serialize(serializer)
    }
}

impl From<rusqlite::Error> for Erro {
    fn from(_: rusqlite::Error) -> Self {
        Self::BancoDados
    }
}

impl From<std::io::Error> for Erro {
    fn from(_: std::io::Error) -> Self {
        Self::Arquivo
    }
}

pub type Resultado<T> = Result<T, Erro>;
