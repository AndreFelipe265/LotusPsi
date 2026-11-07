# Sistema de Pacientes e Documentos (LC Consultório)

[![CI](https://github.com/AndreFelipe265/LC-Pacientes/actions/workflows/ci.yml/badge.svg)](https://github.com/AndreFelipe265/LC-Pacientes/actions/workflows/ci.yml)
![Tauri v2](https://img.shields.io/badge/Tauri-v2.x-24C8DB?logo=tauri&logoColor=white)
![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-2021-DEA584?logo=rust&logoColor=black)
![Ambiente](https://img.shields.io/badge/Ambiente-100%25%20Offline-success)
![Criptografia](https://img.shields.io/badge/SQLCipher-XChaCha20-blueviolet)

Software desktop de gestão clínica e prontuário eletrônico desenvolvido para profissionais
de psicologia clínica.

---

## O Problema

A rotina de consultório psicológico enfrenta desafios específicos na gestão de dados:
- **Dependência de internet e nuvem:** Softwares convencionais em nuvem (SaaS) exigem conexão constante e impõem custos mensais recorrentes.
- **Risco de vazamento de prontuários:** O Código de Ética Profissional do Psicólogo (CFP) e a LGPD exigem sigilo rigoroso sobre histórico e anotações de sessões. Servidores externos e bancos de dados remotos ampliam a superfície de ataque.
- **Sobrecarga de interfaces complexas:** Ferramentas genéricas trazem dezenas de campos desnecessários, dificultando o registro rápido entre um paciente e outro.

## A Solução e Princípio de Projeto

O **LC Consultório** é um aplicativo desktop nativo focado em agilidade, simplicidade e privacidade absoluta:

> **Princípio de projeto:** *100% offline, zero chamadas de rede e privacidade médica assegurada por criptografia local em repouso.*

Toda a informação clínica permanece estritamente na máquina da psicóloga, protegida por criptografia de padrão militar (**SQLCipher** e **XChaCha20-Poly1305**) com derivação por **Argon2id**.

---

## Recursos Principais

- 👥 **Gestão Completa de Pacientes:** Cadastro com cálculo automático de idade, suporte a todas as faixas etárias (adultos e menores de 18 com dados de responsáveis), histórico e alternância entre status Ativo e Inativo.
- 📝 **Registro Ágil de Sessões:** Data e resumo objetivo (até 600 caracteres) com preservação de rascunho em digitação durante o bloqueio de tela.
- 📅 **Agenda Clínica (Semanal e Mensal):** Visualização intuitiva de horários, detecção amigável de conflitos de agendamento e conversão de horário agendado em sessão realizada em 1 clique.
- 🎂 **Painel com Aniversariantes do Dia:** Lembrete na tela inicial (incluindo pacientes inativos) com atalho de 1 clique para WhatsApp (`wa.me`).
- 📁 **Cofre de Documentos e Anamnese:** Repositório de modelos/declarações e anexo de fichas de anamnese criptografadas por blocos no disco.
- 💰 **Controle Financeiro Simples:** Lançamentos de entradas de consultas e despesas do consultório, com consolidação mensal e relatórios.
- 🔒 **Segurança e Privacidade Absoluta:**
  - Banco de dados SQLite criptografado com **SQLCipher**.
  - Derivação de chaves via **Argon2id** e cofre de anexos com **XChaCha20-Poly1305**.
  - Bloqueio automático por inatividade após 30 minutos sem interação.
  - Chave de recuperação física de emergência (24 caracteres Crockford Base32) impressa em papel para recuperação de senha.
- 💾 **Backup Criptografado com 1 Clique:** Exportação de arquivo `.lotusbackup` empacotado e assinado, com verificação de integridade antes da restauração.

---

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                 Interface (React 18 + TS)                   │
│          app/src/ (Telas T01 a T12, Tailwind CSS)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ invoke("comando", { args })
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend Tauri 2 (Rust)                      │
│                   app/src-tauri/src/                        │
│  ┌───────────────────────┬───────────────────────────────┐  │
│  │ commands/             │ vault.rs & crypto.rs          │  │
│  │ (auth, pacientes,     │ (Argon2id, XChaCha20,         │  │
│  │  sessoes, agenda...)  │  KEK, DEK, zeroize em memória)│  │
│  └───────────┬───────────┴───────────────┬───────────────┘  │
│              ▼                           ▼                  │
│       db.rs (SQLCipher)             files.rs & backup.rs    │
│  (SQLite local criptografado)    (Cofre de anexos cifrados) │
└─────────────────────────────────────────────────────────────┘
```

| Camada | Tecnologia | Papel |
|---|---|---|
| **Shell Desktop** | [Tauri v2](https://tauri.app/) (Rust) | Janela nativa leve, segura, sem dependência de browser externo |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Vite | Interface com alto contraste e tipografia acessível |
| **Backend** | Rust (edição 2021) | Regras clínicas (RN01 a RN95), validações, criptografia e IPC seguro |
| **Banco de Dados** | SQLite 3 criptografado com **SQLCipher** | Prontuários e anotações cifrados em repouso |
| **Criptografia** | Argon2id, XChaCha20-Poly1305, Zeroize | Proteção da senha mestra, envelope digital da DEK e anexos |

---

## Como Executar

### Pré-requisitos
- **Node.js** (v18 ou superior) e **npm**
- **Rust** (edição 2021 ou superior com `cargo`)
- Dependências nativas:
  - **Linux (Ubuntu/Debian):** `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
  - **Windows (10/11):** Visual Studio C++ Build Tools e WebView2 Runtime (já nativo no Windows 10/11)

> [!TIP]
> **No Windows**, clone o repositório em um caminho curto (como `C:\dev\LC-Pacientes`) para evitar limites de tamanho de caminho (`Filename too long`), ou execute `git config --global core.longpaths true`.

### 1. Clonar e instalar dependências

**Linux (Bash) / macOS:**
```bash
git clone https://github.com/AndreFelipe265/LC-Pacientes.git
cd LC-Pacientes/app
npm install
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/AndreFelipe265/LC-Pacientes.git
Set-Location LC-Pacientes\app
npm install
```

### 2. Executar em modo de desenvolvimento

```bash
# Dentro da pasta app/
npm run tauri dev
```

### 3. Executar as suítes de teste automatizadas

O projeto conta com testes unitários e de integração abrangentes cobrindo toda a regra de negócio e cofre:

```bash
# Testes do Frontend (Vitest — 65 testes unitários e de integração de interface)
cd app
npm test -- --run

# Testes do Backend Rust (Cargo — 53 testes unitários e de integração de cofre/banco)
cd app/src-tauri
cargo test
```

### 4. Análise estática, formatação e qualidade

```bash
# Linter do Frontend (ESLint)
cd app
npm run lint

# Formatação e Análise Estática do Backend Rust (rustfmt + clippy)
cd app/src-tauri
cargo fmt --check
cargo clippy -- -D warnings
```

### 5. Gerar o instalador final de distribuição

```bash
# Gera o instalador de produção (.msi / .exe no Windows, .AppImage / .deb no Linux)
cd app
npm run tauri build
```

---

## Como Avaliar o Sistema

### Primeiro Acesso (Configuração Inicial)
1. Ao abrir o aplicativo pela primeira vez, a tela **Primeiro Acesso (T01)** é exibida.
2. Defina uma senha mestra (mínimo de 8 caracteres).
3. O sistema gera a **Chave de Recuperação Física** (24 caracteres no padrão Crockford Base32) e oferece botão para impressão em papel para guarda física segura.

### Massa de Dados Sintética para Testes
Para testar o envio de documentos, validação de tipos e anexos de anamnese sem violar o sigilo de pacientes:
- A pasta [`documentos_teste/`](documentos_teste/) contém modelos fictícios em PDF, Word (`.docx`), imagens e arquivos de teste de segurança.
- O script reproduzível [`scripts/gerar_documentos_teste.py`](scripts/gerar_documentos_teste.py) gera toda a massa sintética através da biblioteca padrão do Python (`python3 scripts/gerar_documentos_teste.py`).

---

## Documentação do Projeto

| Documento | Conteúdo |
|---|---|
| **[`AGENTS.md`](AGENTS.md)** | **Contrato central de desenvolvimento para pessoas e assistentes de IA (regras inegociáveis e armadilhas).** |
| **[`Planejamento/01_FONTE_DA_VERDADE.md`](Planejamento/01_FONTE_DA_VERDADE.md)** | **Especificação soberana** do projeto e catálogo completo de regras de negócio (RN01 a RN95). |
| **[`Planejamento/02_ARQUITETURA.md`](Planejamento/02_ARQUITETURA.md)** | Detalhamento da arquitetura técnica, fluxo IPC Tauri, comandos e organização interna. |
| **[`Planejamento/03_ROADMAP.md`](Planejamento/03_ROADMAP.md)** | Fases de execução (F0 a F9), critérios de aceite e rastreabilidade de commits. |
| **[`docs/01-visao-do-produto.md`](docs/01-visao-do-produto.md)** | Visão geral do produto, público atendido, premissas 100% offline e limites de escopo. |
| **[`docs/02-requisitos.md`](docs/02-requisitos.md)** | Requisitos funcionais (RF), requisitos não funcionais (RNF) e rastreabilidade com as RNs. |
| **[`docs/03-arquitetura.md`](docs/03-arquitetura.md)** | Arquitetura de componentes e Registros de Decisões de Arquitetura (ADR-001 a ADR-006). |
| **[`docs/04-riscos-e-seguranca.md`](docs/04-riscos-e-seguranca.md)** | Matriz de riscos do projeto (R1 a R6), impactos e mitigações técnicas. |
| **[`docs/05-revisao-ux-guiada.md`](docs/05-revisao-ux-guiada.md)** | Relatório da sessão de revisão guiada com a psicóloga e refinamentos aplicados. |
| **[`docs/06-auditoria-seguranca.md`](docs/06-auditoria-seguranca.md)** | Auditoria de segurança: rede desativada, memória limpa com Zeroize e dependências auditadas. |
| **[`docs/07-entrega-e-instalacao-final.md`](docs/07-entrega-e-instalacao-final.md)** | Roteiro de instalação assistida no consultório, primeiro backup e entrega da chave física. |
| **[`docs/guia-backup.md`](docs/guia-backup.md)** | Guia prático de 1 página para a usuária sobre como gerar cópias de segurança e restaurar. |
| **[`CONTRIBUTING.md`](CONTRIBUTING.md)** | Guia de contribuição: padrão de branches, mensagens de commit e Definition of Done. |
| **[`SECURITY.md`](SECURITY.md)** | Política de segurança e canal privado para reporte via GitHub Security Advisories. |

---

## Equipe e Papéis

| Participante | Papel | Atribuição |
|---|---|---|
| **André Felipe** ([@AndreFelipe265](https://github.com/AndreFelipe265)) | Desenvolvedor Principal | Arquitetura de software, backend Rust, frontend React e segurança |
| **Especialista Clínica** | Consultoria Clínica | Definição de requisitos, validação do fluxo clínico e aceite de uso |

---

## Licença e Direitos

Copyright (c) 2026 André Felipe. Todos os direitos reservados.  
Software desenvolvido para gestão clínica e consultório de psicologia.
