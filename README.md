# LotusPsi — Sistema de Gestão Clínica e Prontuário

[![CI](https://github.com/AndreFelipe265/LC-Pacientes/actions/workflows/ci.yml/badge.svg)](https://github.com/AndreFelipe265/LC-Pacientes/actions/workflows/ci.yml)
![Tauri v2](https://img.shields.io/badge/Tauri-v2.x-24C8DB?logo=tauri&logoColor=white)
![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-2021-DEA584?logo=rust&logoColor=black)
![Ambiente](https://img.shields.io/badge/Ambiente-100%25%20Offline-success)
![Criptografia](https://img.shields.io/badge/SQLCipher-XChaCha20-blueviolet)

Software desktop **100% offline** de gestão clínica e prontuário eletrônico desenvolvido sob medida
para atendimento em psicologia clínica.

---

## O Problema

A rotina de consultório psicológico enfrenta desafios operacionais e regulatórios críticos na gestão de dados:
- **Dependência de nuvem e mensalidades recorrentes:** Softwares convencionais em nuvem (SaaS) exigem conexão ininterrupta à internet e impõem custos recorrentes previsíveis que oneram o consultório autônomo.
- **Risco ético e legal de vazamento de prontuários:** O Código de Ética Profissional do Psicólogo (Resolução CFP nº 01/2009) e a LGPD exigem sigilo rigoroso sobre o histórico, anotações de evolução e anamneses de pacientes. Servidores remotos e bancos de dados externos multiplicam a superfície de ataque.
- **Interfaces lentas e complexas:** Sistemas genéricos trazem dezenas de campos burocráticos desnecessários, dificultando o registro rápido e humanizado entre uma sessão e a seguinte.

## A Solução e Princípio de Projeto

O **LotusPsi** é um aplicativo desktop nativo projetado para proporcionar agilidade de atendimento, simplicidade operacional e privacidade absoluta:

> **Princípio de projeto:** *100% offline, zero chamadas de rede e privacidade médica assegurada por criptografia local em repouso.*

Toda a informação clínica permanece estritamente no computador da profissional, protegida por criptografia de padrão militar em repouso (**SQLCipher** e **XChaCha20-Poly1305**), derivação robusta de chaves (**Argon2id**) e limpeza ativa de buffers em memória (**Zeroize**).

---

## Recursos Principais

- 👥 **Gestão Completa de Pacientes (T05, T06, T07):** Cadastro completo com cálculo automático de idade, máscaras de formulário, suporte a menores de 18 anos com dados de responsáveis destacados, busca instantânea sem acento por nome ou telefone e alternância entre status Ativo e Inativo.
- 📝 **Registro Ágil de Sessões (T08):** Data e resumo objetivo (até 600 caracteres) com contador em tempo real, histórico em ordem decrescente, selo de auditoria "(editado)" e preservação do rascunho em digitação caso ocorra bloqueio de tela.
- 📅 **Agenda Clínica e Grade Semanal Fixa (T11):** Visualização semanal e mensal de atendimentos, detecção amigável de conflito de horários (sem bloqueio impeditivo), conversão em 1 clique de horário agendado em sessão realizada, e aba "Grade Fixa" por paciente com aplicação semanal automática sem duplicidades.
- 💰 **Controle Financeiro Simples (T12):** Lançamento rápido de entradas de consultas (com sugestão do valor da sessão e vínculo opcional a paciente) e despesas do consultório; resumo mensal consolidado (Total de Entradas, Total de Gastos e Saldo Líquido) com filtros por tipo e busca sem acento.
- 📁 **Cofre de Documentos Gerais (T09):** Repositório de modelos e declarações categorizado ("Modelos", "Administrativo", "Outros" e categorias personalizadas), envio por arrastar e soltar (drag & drop), validação rigorosa de extensão e cabeçalho (*magic bytes*) contra arquivos maliciosos, e visualização em ambiente temporário seguro limpo ao sair.
- 📋 **Anamnese Criptografada no Perfil (T07):** Anexo de fichas e relatórios clínicos de anamnese (PDF, DOCX ou imagem) diretamente no prontuário do paciente, criptografados no cofre local de arquivos.
- 🎂 **Painel Inteligente e Aniversariantes do Dia (T04):** Saudação personalizada com ciclo rotativo de 9 mensagens acolhedoras, resumo de "Sessões de hoje", alerta de aniversariantes (incluindo inativos e regra para 29/02) com atalho de 1 clique para WhatsApp (`wa.me`).
- 🔒 **Segurança e Privacidade em Profundidade:**
  - Banco relacional SQLite local cifrado via **SQLCipher** (AES-256).
  - Derivação de chaves via **Argon2id** (64 MB de RAM, 3 iterações) e envelope digital da DEK com **XChaCha20-Poly1305**.
  - Proteção contra força bruta: *rate-limit* persistido que bloqueia tentativas progressivamente após 5 erros.
  - Limpeza de memória com a trait `Zeroize` no descarte de chaves e buffers de senha.
  - Bloqueio automático por inatividade após 30 minutos sem interação do teclado ou mouse.
  - Chave de emergência física (24 caracteres Crockford Base32) impressa em papel no primeiro acesso para recuperação de senha sem internet.
- 💾 **Backup Criptografado com 1 Clique (`.lotusbackup`):** Empacotamento unificado do banco de dados (com checkpoint WAL), documentos gerais, anexos de anamnese e metadados do cofre; integridade validada via SHA-256 pós-gravação, salvaguarda preventiva automática antes de restaurações e compatibilidade retroativa com arquivos `.lcbackup`.

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
│  │ (auth, pacientes,     │ (Argon2id, XChaCha20-Poly,    │  │
│  │  sessoes, agenda,     │  KEK, DEK, zeroize em RAM)    │  │
│  │  financeiro, docs...) │                               │  │
│  └───────────┬───────────┴───────────────┬───────────────┘  │
│              ▼                           ▼                  │
│       db.rs (SQLCipher)             files.rs & backup.rs    │
│  (SQLite local criptografado)    (Cofre de anexos cifrados  │
│                                   e backup .lotusbackup)    │
└─────────────────────────────────────────────────────────────┘
```

### Stack Tecnológica e Escolhas de Projeto

| Camada | Tecnologia | Por quê / Papel |
|---|---|---|
| **Shell Desktop** | [Tauri v2](https://tauri.app/) (Rust) | Janela nativa leve (~15 MB), menor consumo de memória em relação ao Electron, sem navegador externo e capacidades restritas sem acesso a rede. |
| **Frontend** | React 18, TypeScript 5.x, Vite, Tailwind CSS | Interface reativa, tipagem estrita de contratos IPC, design com alto contraste e tipografia acessível (WCAG AA). |
| **Backend** | Rust (edição 2021) | Segurança de memória em tempo de compilação, alta performance, regras de negócio clínicas estritas (RN01 a RN95) e gerenciamento seguro de chaves com `Zeroize`. |
| **Banco de Dados** | SQLite 3 criptografado com **SQLCipher** | Armazenamento relacional local com suporte a WAL e transações seguras; base 100% cifrada em repouso ilegível sem chave derivada. |
| **Criptografia & KDF** | Argon2id, XChaCha20-Poly1305 | Resistência a ataques de dicionário e GPU no hash da senha mestra; cifragem autenticada de arquivos com nonces de 192 bits sem risco de reutilização. |

Detalhamento arquitetural completo e decisões registradas em [`Planejamento/02_ARQUITETURA.md`](Planejamento/02_ARQUITETURA.md) e [`docs/03-arquitetura.md`](docs/03-arquitetura.md).

---

## Como Executar

### Pré-requisitos
- **Node.js** (v18 ou superior) e **npm**
- **Rust** (edição 2021 ou superior com `cargo`)
- Dependências nativas:
  - **Linux (Ubuntu/Debian):** `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
  - **Windows (10/11):** Visual Studio C++ Build Tools e WebView2 Runtime (nativo no Windows 10/11)

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

### 3. Localização dos Dados Locais
A aplicação armazena seu banco criptografado, cofre de documentos e metadados na pasta segura do sistema:
- **Windows:** `%APPDATA%\LotusPsi\`
- **Linux:** `~/.local/share/lotuspsi/`

---

## Como Avaliar o Sistema

### Primeiro Acesso (Configuração Inicial)
1. Ao abrir o aplicativo pela primeira vez, a tela **Primeiro Acesso (T01)** é exibida.
2. Defina uma senha mestra (mínimo de 8 caracteres).
3. O sistema gera a **Chave de Recuperação Física** (24 caracteres no padrão Crockford Base32) e oferece botão para impressão em papel para guarda segura fora do computador.

### Massa de Dados Sintética para Testes
Para testar o envio de documentos gerais, validação de tipos de arquivo e anexos de anamnese sem expor dados reais de pacientes:
- A pasta [`documentos_teste/`](documentos_teste/) contém modelos fictícios em PDF, Word (`.docx`), imagens e arquivos de teste de segurança.
- O script reproduzível [`scripts/gerar_documentos_teste.py`](scripts/gerar_documentos_teste.py) gera toda a massa sintética através da biblioteca padrão do Python (`python3 scripts/gerar_documentos_teste.py`).

---

## Desenvolvimento, Testes e Qualidade

O projeto conta com suítes de testes automatizadas cobrindo 100% dos fluxos clínicos, segurança do cofre e comandos IPC:

```bash
# 1. Testes do Frontend (Vitest — 65 testes unitários e de integração de interface)
cd app
npm test -- --run

# 2. Testes do Backend Rust (Cargo — 54 testes unitários e de integração de cofre/banco)
cd app/src-tauri
cargo test

# 3. Análise estática do Frontend (ESLint)
cd app
npm run lint

# 4. Formatação e Análise Estática do Backend Rust (rustfmt + clippy)
cd app/src-tauri
cargo fmt --check
cargo clippy -- -D warnings
```

### Gerar o Instalador de Distribuição

```bash
# Gera o instalador de produção (.msi / .exe no Windows, .AppImage / .deb no Linux)
cd app
npm run tauri build
```

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
| **André Felipe** ([@AndreFelipe265](https://github.com/AndreFelipe265)) | Desenvolvedor Principal | Engenharia de software, arquitetura do sistema, backend Rust, frontend React e segurança |
| **Especialista Clínica** | Consultoria Clínica | Definição de requisitos, validação do fluxo clínico e aceite de uso |

---

## Licença e Direitos

Copyright (c) 2026 André Felipe. Todos os direitos reservados.  
Software desenvolvido sob medida para gestão clínica e consultório de psicologia.
