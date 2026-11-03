# Sistema de Pacientes e Documentos (LC Consultório)

Sistema desktop de gestão clínica e prontuário de pacientes desenvolvido sob medida para a psicóloga
**Louriedna Costa Pereira** (CRP 03/29434).

O projeto é focado em simplicidade, privacidade absoluta e agilidade no atendimento diário, funcionando
de forma **100% offline e local**, sem custos recorrentes de servidores ou dependência de internet.

---

## Recursos Principais

- 👥 **Gestão Completa de Pacientes:** Cadastro com cálculo de idade, histórico de atendimentos e status Ativo/Inativo.
- 📝 **Registro Ágil de Sessões:** Data e resumo objetivo, com preservação de rascunho durante bloqueio por inatividade.
- 📅 **Agenda Clínica (Semanal e Mensal):** Visualização de horários com detecção inteligente de conflitos de agendamento.
- 🎂 **Painel com Aniversariantes do Dia:** Lembrete na tela inicial com atalho de 1 clique para WhatsApp (`wa.me`).
- 📁 **Cofre de Documentos e Anamnese:** Armazenamento seguro de arquivos anexados ao paciente, cifrados em repouso.
- 🔒 **Segurança e Privacidade Absoluta:**
  - Banco de dados SQLite criptografado com **SQLCipher**.
  - Derivação de chaves via **Argon2id** e cofre criptográfico com **XChaCha20-Poly1305**.
  - Bloqueio automático de tela por inatividade (30 minutos).
  - Chave de recuperação física impressa em papel para emergências.
- 💾 **Backup com 1 Clique:** Exportação de arquivo `.lcbackup` criptografado com verificação automática de integridade.

---

## Arquitetura e Tecnologias

| Camada | Tecnologia | Papel |
|---|---|---|
| **Shell Desktop** | [Tauri v2](https://tauri.app/) (Rust) | Aplicação nativa leve, segura e offline |
| **Frontend** | React 18, TypeScript, Tailwind CSS, Vite | Interface com alto contraste e tipografia acessível |
| **Banco de Dados** | SQLite 3 criptografado com **SQLCipher** | Prontuários e dados cifrados em repouso |
| **Criptografia** | Argon2id, XChaCha20-Poly1305, Zeroize | Proteção da senha mestra, chave de recuperação e arquivos |

---

## Como Executar

### Pré-requisitos
- **Node.js** (v18 ou superior) e **npm**
- **Rust** (edição 2021 ou superior com `cargo`)
- Dependências de sistema para o Tauri (no Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `libssl-dev`)

### 1. Clonar e instalar dependências

```bash
# Clone o repositório
git clone <url-do-repositorio>
cd "Sistema Pacientes"

# Instale as dependências da interface web
cd app
npm install
```

### 2. Executar em modo de desenvolvimento

```bash
# Dentro da pasta app/
npm run tauri dev
```

### 3. Executar as suítes de teste

```bash
# Testes unitários do Frontend (Vitest - 40 testes)
cd app
npm test -- --run

# Testes unitários do Backend Rust (Cargo - 28 testes)
cd app/src-tauri
cargo test
```

### 4. Gerar o instalador final de distribuição

```bash
# Gera o pacote instalador (.msi / .exe no Windows, .AppImage / .deb no Linux)
cd app
npm run tauri build
```

---

## Documentação do Projeto

- **[`AGENTS.md`](AGENTS.md)** — Contrato de desenvolvimento e regras inegociáveis para pessoas e agentes de IA.
- **[`Planejamento/01_FONTE_DA_VERDADE.md`](Planejamento/01_FONTE_DA_VERDADE.md)** — Fonte da Verdade e regras de negócio detalhadas (RN01 a RN77).
- **[`Planejamento/02_ARQUITETURA.md`](Planejamento/02_ARQUITETURA.md)** — Detalhes da arquitetura de IPC, comandos e pastas.
- **[`Planejamento/03_ROADMAP.md`](Planejamento/03_ROADMAP.md)** — Fases do desenvolvimento (F0 a F9) e status de execução.
- **[`docs/`](docs/)** — Documentação viva complementar (visão, requisitos, ADRs e gestão de riscos).

---

## Licença e Direitos

Copyright (c) 2026 Felipe / Louriedna Costa Pereira. Todos os direitos reservados.  
Software proprietário para uso exclusivo da psicóloga Louriedna Costa Pereira (CRP 03/29434).
