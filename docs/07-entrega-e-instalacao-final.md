# Roteiro de Entrega Final e Instalação Assistida (F9-T5)

> **Data:** 2026-11-06
> **Responsável pela instalação assistida:** André Felipe
> **Usuária final:** Psicóloga Clínica (CRP 00/00000)
> **Versão da aplicação:** `LotusPsi v1.0.0`

---

## 1. Objetivo

Registrar o procedimento completo de instalação no computador da psicóloga clínica, configuração assistida de primeiro acesso (`T01`), impressão e validação física da chave de recuperação de emergência (24 caracteres), verificação dos módulos da Fase 1 e Fase 2 (`Financeiro` e `Grade Semanal Fixa`) e geração do **primeiro backup criptografado verificado (`.lotusbackup`)**.

---

## 2. Artefatos do Instalador Final (`F9-T4`)

- **Nome oficial do aplicativo:** `LotusPsi`
- **Identificador do pacote:** `br.com.andrefelipe.lotuspsi`
- **Ícone oficial (Flor de Lótus & Prontuário):**
  - Windows: `app/src-tauri/icons/icon.ico`
  - Linux / macOS: `app/src-tauri/icons/icon.png`, `32x32.png`, `128x128.png`, `128x128@2x.png`
- **Configuração do instalador Windows (NSIS):**
  - Idioma: `PortugueseBR`
  - Modo de instalação: `currentUser` (`%LOCALAPPDATA%\Programs\LotusPsi`, sem exigir privilégios de administrador)
  - Pasta de dados criptografados (Windows): `%APPDATA%\LotusPsi\`
  - Pasta de dados criptografados (Linux): `~/.local/share/lotuspsi/`
- **Pacotes gerados e verificados em release:**
  - Pipeline automatizado de CI/CD: [`.github/workflows/release.yml`](../.github/workflows/release.yml) (matriz concorrente Windows e Linux com geração de `SHA256SUMS.txt`)
  - Binário otimizado: `app/src-tauri/target/release/lotuspsi`
  - Pacote Debian/Ubuntu: `app/src-tauri/target/release/bundle/deb/LotusPsi_1.0.0_amd64.deb`
  - Pacote RPM: `app/src-tauri/target/release/bundle/rpm/LotusPsi-1.0.0-1.x86_64.rpm`
  - Pacote AppImage: `app/src-tauri/target/release/bundle/appimage/LotusPsi_1.0.0_amd64.AppImage`
  - Instalador Windows NSIS (`npm run tauri build` em ambiente Windows): `LotusPsi_1.0.0_x64-setup.exe`

---

## 3. Passo a Passo Executado Junto com a Usuária (`F9-T5`)

### Etapa 1 — Instalação no computador da usuária
1. Executar o instalador oficial do **LotusPsi** e confirmar a criação do ícone **LotusPsi** na Área de Trabalho e na Barra de Tarefas.
2. Abrir o aplicativo pela primeira vez e verificar que a tela **T01 — Primeiro Acesso** é exibida imediatamente, com fonte ampla (`>= 16px`) e zero conexão de rede.

### Etapa 2 — Criação da Senha Mestra e Impressão da Chave de Recuperação (`RN01–RN03`)
1. Junto com a profissional, escolher uma **senha mestra pessoal** com pelo menos 8 caracteres (`RN01`).
2. Avançar para a exibição da **Chave de Recuperação de Emergência** (24 caracteres divididos em 6 grupos de 4 caracteres, ex.: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`).
3. Clicar em **"Imprimir folha de recuperação"** (`window.print()`) e também anotar manualmente a chave no cartão impresso de segurança, explicando à usuária que:
   - A chave de recuperação permite abrir o sistema e restaurar qualquer arquivo `.lotusbackup` caso a senha seja esquecida (`RN03`, `RN09`, `RN52`);
   - A folha impressa deve ser guardada em local físico seguro fora do computador.
4. Digitar os grupos solicitados na tela de confirmação para comprovar que a chave impressa está legível e concluir a criação do cofre (`vault.json` + `pacientes.db` cifrado via SQLCipher).

### Etapa 3 — Importação / Cadastro Inicial e Validação da Fase 2
1. Confirmar os pacientes cadastrados/importados da planilha e seus respectivos status (`Ativo` / `Inativo`).
2. Na tela **Agenda (`T11`) → aba `Grade Fixa`**, cadastrar os horários semanais recorrentes dos pacientes ativos e acionar **"Aplicar grade na semana"** (`RN94`), verificando o preenchimento imediato da grade semanal e a exibição dos horários fixos no cabeçalho do perfil do paciente (`T07`, `RN95`).
3. Na tela **Financeiro (`T12`)**, validar o lançamento de entradas (com vínculo opcional ao paciente e forma de pagamento) e gastos do consultório, conferindo os cartões de **Total de Entradas**, **Total de Gastos** e **Saldo do Mês** (`RN80–RN86`).

### Etapa 4 — Geração e Validação do Primeiro Backup (`.lotusbackup`)
1. Inserir o pendrive de backup da usuária (e definir a pasta sincronizada secundária).
2. No **Painel do Dia (`T04`)** ou em **Configurações (`T10`)**, clicar em **"Fazer backup agora"**.
3. Salvar o arquivo `backup-pacientes-AAAA-MM-DD-HHmm.lotusbackup` e aguardar a mensagem de confirmação pós-gravação (`RN55`).
4. Em **Configurações (`T10`) → Restaurar backup**, selecionar o arquivo `.lotusbackup` recém-gerado e testar a inspeção informando a **chave de recuperação impressa**, comprovando que o arquivo está íntegro e pode ser aberto tanto com a senha mestra quanto com a folha impressa.
5. Entregar junto à folha da chave de recuperação uma cópia impressa do guia de 1 página ([`docs/guia-backup.pdf`](guia-backup.pdf)).

---

## 4. Checklist de Verificação da Entrega Final

- [x] Instalador configurado com nome `"LotusPsi"`, ícone da Flor de Lótus e instalador NSIS em Português do Brasil (`PortugueseBR`).
- [x] Cofre criptográfico inicializado com Argon2id + XChaCha20-Poly1305 + SQLCipher (`vault.json` + `pacientes.db`).
- [x] Chave de recuperação de 24 caracteres gerada, impressa/anotada e confirmada no fluxo `T01`.
- [x] Módulos da Fase 2 (**Financeiro `T12`** e **Grade Semanal Fixa em `T11`/`T07`**) operacionais e cobertos por testes automatizados.
- [x] Primeiro backup `.lotusbackup` gerado após `PRAGMA wal_checkpoint(TRUNCATE);`, verificado pós-gravação e validado com a chave de recuperação impressa.
