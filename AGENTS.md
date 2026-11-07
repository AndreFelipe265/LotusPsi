# AGENTS.md — Contrato do Projeto para Pessoas e Assistentes de IA

> **Leia este arquivo inteiro antes de escrever qualquer linha de código ou alterar arquivos.**
>
> Este arquivo é o contrato central do repositório. Ele define os princípios inegociáveis, a arquitetura,
> as convenções e as armadilhas aprendidas para garantir que desenvolvedores e agentes de IA trabalhem
> de forma consistente, segura e alinhada com as necessidades da usuária final.
>
> Vale para Antigravity, Claude Code, Copilot, Cursor, Gemini ou qualquer outro assistente. Se você é uma
> pessoa, leia também: as regras são rigorosamente as mesmas.

---

## 1. O que é este projeto

O **Sistema de Pacientes e Documentos (LC Consultório)** é um software desktop de gestão clínica desenvolvido
sob medida para atendimento em psicologia clínica, desenvolvido pelo engenheiro de software André Felipe.

O sistema atende todas as faixas etárias (crianças, adolescentes e adultos) e organiza:
- Cadastro completo de pacientes com histórico e status ativo/inativo;
- Registro rápido de sessões diárias (data + resumo curto editável);
- Agenda semanal e mensal com detecção de conflitos de horários;
- Repositório de documentos gerais e anexo de fichas de anamnese criptografadas;
- Alerta diário de aniversariantes com atalho para WhatsApp;
- Backup local e restauração criptografados por chave única.

**O coração técnico:**
Um aplicativo desktop **100% offline**, sem custos recorrentes de nuvem, que assegura privacidade médica
absoluta por meio de criptografia local em repouso (**SQLCipher** e **XChaCha20-Poly1305**), com KDF
(**Argon2id**) protegendo o banco e permitindo recuperação física de emergência impressa em papel.
**O projeto NÃO é um SaaS, NÃO possui servidor externo e NÃO se conecta à internet.**

Documentação e planejamento de referência:
- [`Planejamento/01_FONTE_DA_VERDADE.md`](Planejamento/01_FONTE_DA_VERDADE.md) — **Referência absoluta do projeto**.
- [`Planejamento/02_ARQUITETURA.md`](Planejamento/02_ARQUITETURA.md) — Detalhes da estrutura técnica e IPC.
- [`Planejamento/03_ROADMAP.md`](Planejamento/03_ROADMAP.md) — Fases, tarefas e critérios de aceite.
- [`docs/`](docs/) — Documentação viva complementar (requisitos, arquitetura, ADRs e riscos).

---

## 2. Regras inegociáveis

Estas regras não são sugestões ou preferências. Desrespeitar qualquer uma delas invalida a contribuição.

### 2.1 A Fonte da Verdade é soberana
Antes de qualquer tarefa, leia **`Planejamento/01_FONTE_DA_VERDADE.md`**. Ele prevalece sobre qualquer outro
arquivo, código legado ou conversa anterior. Se algo não estiver definido lá, **pergunte ao desenvolvedor** em
vez de inventar comportamentos. Novas decisões aprovadas devem ser registradas na Seção 12 da Fonte da Verdade.

### 2.2 100% Offline e estritamente privativo
- **Nenhuma chamada de rede, telemetria, rastreamento ou analítica.**
- As permissões (`capabilities`) do Tauri devem manter a rede desativada.
- Fontes tipográficas (OpenSans) e ícones devem ser servidos estritamente do pacote local.

### 2.3 Nenhum dado real no repositório
- **Nenhum dado real** de pacientes ou anotações clínicas entra no Git.
- Todos os testes e massas de demonstração devem ser sintéticos e fictícios.
- Arquivos de banco de dados, backups e planilhas reais são bloqueados pelo `.gitignore`.

### 2.4 Regra de negócio reside no Rust (Backend)
- A interface (React + TypeScript) **apenas exibe e coleta dados**.
- Validações críticas, regras de negócio (RN01 a RN77), manipulação de dados, criptografia e operações de disco
  residem exclusivamente no Rust (`app/src-tauri/src/`).

### 2.5 Acesso a dados exclusivo via Tauri IPC
- O frontend nunca acessa diretamente o sistema de arquivos ou SQLite.
- Toda comunicação é intermediada por comandos tipados Tauri (`invoke(...)`).
- Plugins nativos `fs` ou `sql` do Tauri **não** devem ser expostos diretamente à camada web.

### 2.6 Autoria limpa e commits sem menção a IA
- Seguir o padrão de commits convencionais: `<tipo>(<escopo>): <descrição no infinitivo/presente e porquê>`.
- **Nunca** incluir trailers de IA (como `Co-authored-by: ...`, `Generated with Claude`, etc.). O trabalho
  é de autoria do desenvolvedor humano.

### 2.7 Mudanças cirúrgicas e rastreáveis
- Trabalhe estritamente na tarefa atual designada no Roadmap (`Planejamento/03_ROADMAP.md`).
- Não faça refatorações cosméticas em módulos fora do escopo da tarefa.
- Ao concluir uma tarefa, rode os testes (`npm test` e `cargo test`) e atualize o checklist no Roadmap.

---

## 3. Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                 Interface (React 18 + TS)                   │
│          app/src/ (Telas T01 a T11, Componentes)            │
└──────────────────────────────┬──────────────────────────────┘
                               │ invoke("comando", { args })
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend Tauri 2 (Rust)                      │
│                   app/src-tauri/src/                        │
│  ┌───────────────────────┬───────────────────────────────┐  │
│  │ commands/             │ vault.rs & crypto.rs          │  │
│  │ (auth, pacientes,     │ (Argon2id, XChaCha20,         │  │
│  │  sessoes, agenda...)  │  KEK, DEK, chaves em memória) │  │
│  └───────────┬───────────┴───────────────┬───────────────┘  │
│              ▼                           ▼                  │
│       db.rs (SQLCipher)             files.rs & backup.rs    │
│  (SQLite local criptografado)    (Cofre de anexos cifrados) │
└─────────────────────────────────────────────────────────────┘
```

### Responsabilidades por camada

| Camada | Responsabilidade | O que **não** faz |
|---|---|---|
| `app/src/` | Interface visual, navegação, feedback à usuária, formatação de tela | Não calcula regras clínicas, não acessa disco, não guarda chaves mestras |
| `app/src-tauri/src/commands/` | Validação de entrada, autorização de sessão, despacho para serviços | Não contém lógica de apresentação |
| `app/src-tauri/src/crypto.rs` | Derivação Argon2id, criptografia XChaCha20-Poly1305, envelope digital | Não manipula UI nem faz persistência direta |
| `app/src-tauri/src/db.rs` | Gerenciamento de conexões SQLCipher, WAL e migrações SQL | Não executa fora do contexto seguro da chave DEK |
| `Planejamento/` | Fonte da Verdade viva, arquitetura de referência e roadmap de tarefas | Não versiona código de produção |
| `docs/` | Documentação pública e viva, ADRs e catálogo de riscos | Não contradiz `01_FONTE_DA_VERDADE.md` |

### Stack tecnológica fixada

- **Desktop Shell:** Tauri v2.x
- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite, Lucide React
- **Backend:** Rust (edição 2021)
- **Banco de Dados:** SQLite 3 com SQLCipher embutido (`rusqlite` com `bundled-sqlcipher`)
- **Criptografia:** Argon2id (`argon2`), XChaCha20-Poly1305 (`chacha20poly1305`), Zeroize (`zeroize`)

---

## 4. Convenções e Comandos Úteis

### Comandos de desenvolvimento e teste

```bash
# Frontend (executar dentro da pasta app/)
npm install               # Instala dependências
npm test -- --run         # Executa testes unitários (Vitest)
npm run lint              # Análise estática com ESLint
npm run build             # Compila os assets do frontend

# Backend (executar dentro da pasta app/src-tauri/)
cargo test                # Executa toda a suíte de testes Rust
cargo clippy              # Análise estática do Rust

# Execução integrada da aplicação
npm run tauri dev         # Sobe a aplicação em modo de desenvolvimento
npm run tauri build       # Gera o instalador final de distribuição
```

---

## 5. Armadilhas conhecidas (Pitfalls)

### A1. SQLCipher e modo WAL antes de Backups
- **Sintoma:** O arquivo `.sqlite` copiado diretamente durante o backup fica corrompido ou incompleto.
- **Causa:** O SQLite em modo WAL (Write-Ahead Logging) mantém escritas recentes no arquivo `-wal`.
- **Solução:** Antes de compactar ou cifrar o banco para o backup, executar um checkpoint explícito:
  `PRAGMA wal_checkpoint(TRUNCATE);`.

### A2. Argon2id e limpeza de chaves em memória (Zeroize)
- **Sintoma:** Chaves mestras ou senhas continuam residindo em páginas de memória mesmo após o logout.
- **Causa:** Strings comuns no Rust não garantem limpeza segura após descarte (`drop`).
- **Solução:** Utilizar tipos que implementam `zeroize::Zeroize` ou `zeroize::ZeroizeOnDrop` para buffers que
  guardam senhas, DEK ou chaves derivadas.

### A3. Bloqueio por inatividade não pode apagar rascunhos em digitação
- **Sintoma:** A usuária é interrompida no meio do registro de uma sessão (30 min) e perde o texto digitado.
- **Causa:** O redirecionamento de tela desmonta o modal e limpa o estado React local.
- **Solução:** O modal de sessão e formulários críticos devem preservar seu rascunho de texto durante o
  bloqueio de sessão, permitindo que a usuária retome a digitação exatamente de onde parou após reinserir a senha.

### A4. Normalização de texto e buscas sem acento
- **Sintoma:** Buscar "Joao" não encontra "João", ou buscar "(71) 98888" não encontra "7198888".
- **Causa:** Comparação literal de strings em banco de dados ou em memória.
- **Solução:** Utilizar a rotina centralizada `text.rs` (`normaliza_nome` e `extrai_digitos`) tanto ao indexar
  quanto ao consultar registros.

### A5. Diferenças de plataforma (Linux de dev vs Windows de produção)
- **Sintoma:** Separadores de caminho (`/` vs `\`) ou manipulação de pastas padrão falham no Windows.
- **Causa:** Construção manual de paths com strings literais.
- **Solução:** Sempre utilizar `PathBuf` e métodos da biblioteca padrão do Rust (`join()`), além dos diretórios
  de dados providos pela API oficial do Tauri (`app.path().app_data_dir()`).
