# FONTE DA VERDADE — Sistema de Pacientes e Documentos

> [!IMPORTANT]
> **Este arquivo é a referência absoluta do projeto.**
> Toda IA ou pessoa que trabalhar no projeto deve ler este arquivo antes de qualquer tarefa.
> - Se outro arquivo (questionário, rascunhos, conversas, código) contradisser este documento, **vale este documento**.
> - Se algo não estiver definido aqui, **não invente**: pergunte ao desenvolvedor (Felipe) e registre a decisão na seção 12 (Registro de Decisões).
> - Só altere este arquivo quando o desenvolvedor aprovar a mudança, e sempre registre a alteração na seção 12.

**Versão:** 1.2 — 06/11/2026

---

## 1. Contexto

| Item | Valor |
|---|---|
| Usuária única | **Louriedna Costa Pereira**, Psicóloga, CRP 03/29434 |
| Desenvolvedor | Felipe (filho da usuária) |
| Tipo de aplicação | **Programa desktop local, 100% offline** |
| Computador | De uso exclusivo da usuária, com um único usuário |
| Público atendido | Todas as faixas etárias (crianças, adolescentes e adultos) |
| Idioma | Português do Brasil (interface, mensagens e datas no formato dd/mm/aaaa) |

**Fontes originais**, já incorporadas a este documento:
- Áudios transcritos da usuária (`WhatsApp-Ptt-*.pdf`)
- Respostas do formulário (`Questionário — ... .csv`)
- Identidade visual (`LC_apresentação_cubo.pdf`)
- Documento de requisitos inicial

**Palavras da usuária (áudios):**
- *"um programinha para o computador"*
- *"lugarzinho dos documentos… para eu baixar e preencher"*
- *"no íconezinho desse paciente, está tudo dele lá"*
- *"a cada dia pode ser pequenininho… umas quatro linhas, no máximo cinco… e a data, só"*

---

## 2. Escopo

### 2.1 Fase 1 — MVP (construir agora)
1. Login com senha, bloqueio por inatividade e chave de recuperação em papel.
2. Painel inicial com os aniversariantes do dia.
3. Pacientes: cadastro, lista, busca, perfil e status ativo/inativo.
4. Sessões: data + resumo curto, que pode ser editado e excluído.
5. Documentos gerais: enviar, listar, organizar por categorias, baixar/abrir e excluir.
6. Backup criptografado feito pelo botão, e restauração.
7. Configurações: trocar senha, backup/restauração e informações de segurança.

### 2.1.1 Pedidos de 02/11/2026 (feedback do instalador provisório — boas-vindas e agenda na fase F4.5, logo após a F4; anamnese na F6)
8. **Mensagens de boas-vindas personalizadas** que mudam a cada login, incluindo *"Eu te amo, mãe"* (RN60–RN62).
9. **Anamnese anexada ao paciente:** seção no perfil, entre o cabeçalho com o nome e o histórico de sessões (RN65–RN69).
10. **Agenda (calendário de sessões):** registrar o dia e o horário de cada sessão marcada (RN70–RN77).

### 2.2 Fase 2 — pedida pela usuária, construir depois do MVP
- **Financeiro:** entradas (pagamentos de sessões) e gastos do consultório, com resumo mensal.
- **Grade de horários semanais:** horários fixos de cada paciente (pode reaproveitar a Agenda da F4.5).

### 2.3 Fora do escopo (NÃO implementar)
- **Preenchimento** da ficha de anamnese dentro do sistema (formulário). Apenas o **anexo do arquivo** ao paciente é permitido (RN65).
- Múltiplos usuários, compartilhamento, sincronização ou acesso pela internet.
- Exportar o histórico em PDF (ela respondeu "raramente"; reavaliar no futuro).
- Envio automático de mensagens. O WhatsApp só será **aberto** pela usuária com um clique.
- Telemetria, analytics, atualização automática pela internet ou qualquer chamada de rede.

---

## 3. Stack tecnológica (decidida)

| Camada | Tecnologia |
|---|---|
| Shell desktop | **Tauri 2** (Rust) |
| Frontend | **React 18 + TypeScript + Vite** |
| Estilo | **Tailwind CSS**, com tokens da identidade visual |
| Roteamento | React Router |
| Banco de dados | **SQLite criptografado com SQLCipher** (`rusqlite` com a feature `bundled-sqlcipher`) |
| Hash de senha / KDF | **Argon2id** (crate `argon2`) |
| Criptografia de arquivos e backups | **XChaCha20-Poly1305** (crate `chacha20poly1305`) |
| Migrações | SQL versionado embutido no binário |
| Testes | `cargo test` (backend) e Vitest (frontend) |
| Empacotamento | Instalador **Windows (.msi/.exe)**, padrão. Linux (AppImage) para testes do desenvolvedor |

**Regras da stack:**
- Toda lógica de dados, criptografia e arquivos fica no **Rust**. O frontend só chama `invoke()` em comandos Tauri.
- O frontend **nunca** acessa disco, banco ou chaves diretamente.
  - Plugins `fs`/`sql` do Tauri **não** devem ser expostos ao frontend.
- Permissões (capabilities) do Tauri devem ser mínimas.
  - Sem permissão de HTTP/rede.
  - CSP restritiva, sem carregar recursos remotos (fontes devem ser locais).
- Dependências fixadas (`Cargo.lock` e `package-lock.json` versionados).

> **Sistema operacional confirmado da usuária:** Windows 10/11 (64-bit).

---

## 4. Identidade visual

| Token | Cor | Uso |
|---|---|---|
| `rosa` | `#E599A6` | Destaques e botões secundários |
| `malva` | `#AC6E87` | **Cor primária**: botões principais e cabeçalho |
| `lilas-acinzentado` | `#92798F` | Textos secundários, ícones e bordas |
| `rosa-claro` | `#E9BFD5` | Fundos suaves, cards e seleção |
| `fundo` | `#FFFFFF` / `#FBF7F9` | Fundo geral |
| `texto` | `#3A2E36` | Texto principal (bom contraste) |

**Visual:**
- Logo/monograma "LC" com borboletas. Exportar do PDF para `src/assets/`.
- Ícone e logo da aplicação na barra de tarefas e na janela customizados com a identidade LC (tarefa F8-T4).
- Fonte cursiva só no logo. Interface em sans-serif legível (ex.: *Nunito* ou *Inter*), **embutida localmente**.

**Princípios de interface:**
- Texto base de no mínimo 16px e botões grandes com rótulos em texto (não apenas ícones).
- No máximo 2 cliques para chegar a qualquer função principal.
- Menu lateral fixo: **Início · Pacientes · Agenda · Financeiro · Documentos · Configurações** (+ botão Sair).
- Toda ação destrutiva pede confirmação, mostrando claramente o que será apagado.
- Mensagens amigáveis, sem jargão técnico.
- Contraste mínimo WCAG AA. Texto branco só sobre `malva` ou cores mais escuras.

---

## 5. Regras de negócio

### 5.1 Acesso e segurança
- **RN01** — Primeiro uso: a usuária cria a senha mestra.
  - Mínimo de 8 caracteres.
  - Mostrar um indicador de força e sugerir uma frase.
- **RN02** — Após criar a senha, o sistema gera uma **chave de recuperação** (24 caracteres em grupos, ex.: `ABCD-EFGH-...`). A tela:
  - Exibe a chave e oferece imprimi-la.
  - Exige que a usuária confirme que a guardou, redigitando os 4 últimos caracteres.
  - Avisa: *"Sem a senha e sem esta chave, os dados não poderão ser recuperados."*
- **RN03** — Login somente por senha (usuária única, sem campo de usuário).
- **RN04** — Após **5 tentativas erradas seguidas**, o login é bloqueado por **5 minutos**.
  - Cada nova sequência de erros dobra o tempo, até no máximo 1 hora.
  - O contador fica persistido, então reiniciar o app não zera o bloqueio.
  - Um acerto zera o contador.
- **RN05** — Após **30 minutos sem interação** (mouse/teclado), o sistema bloqueia:
  - Exige a senha novamente.
  - **Não perde** o texto que estiver sendo digitado em formulários abertos.
- **RN06** — Botão **"Sair"** sempre visível: bloqueia o app e apaga a chave da memória.
- **RN07** — Trocar a senha exige a senha atual.
  - "Esqueci a senha" usa a chave de recuperação e obriga a criar uma nova senha.
- **RN08** — Mensagens de erro de login são genéricas: *"Senha incorreta"*.
  - Os logs nunca contêm dados de pacientes, senhas ou conteúdo de sessões.

### 5.2 Pacientes
- **RN10** — Campos obrigatórios: **Nome completo**. Todos os outros são opcionais.
- **RN11** — Podem existir nomes iguais. A lista mostra a idade/data de nascimento para diferenciar.
- **RN12** — A idade é calculada automaticamente a partir da data de nascimento.
- **RN13** — Se o paciente tiver **menos de 18 anos**, a interface destaca os campos de responsável legal (sem torná-los obrigatórios).
- **RN14** — Status: `ativo` (padrão) ou `inativo`.
  - Inativar exige confirmação e grava a data.
  - Reativar é permitido e mantém todo o histórico.
- **RN15** — A lista mostra só os **ativos** por padrão. Filtros: Ativos | Inativos | Todos.
- **RN16** — Ordenação padrão: alfabética por nome.
- **RN17** — Busca instantânea por **nome ou telefone**, sem diferenciar maiúsculas/minúsculas nem acentos ("joao" encontra "João").
- **RN18** — Exclusão definitiva é permitida, mas rara:
  - Fica escondida em "Mais opções" no perfil.
  - Exige digitar o nome do paciente para confirmar.
  - Apaga também as sessões. Sugira inativar em vez de excluir.
  - Aviso: guarda mínima de 5 anos, conforme a Resolução CFP 01/2009.
- **RN19** — O perfil reúne, em uma única tela, nesta ordem: cabeçalho com o nome → **Anamnese** (RN65) → histórico de sessões + botão "Nova sessão" → dados cadastrais (editáveis).

### 5.3 Sessões
- **RN20** — Campos: **data** (obrigatória, padrão hoje) e **resumo** (obrigatório).
- **RN21** — Resumo com limite rígido de **600 caracteres**, mostrando um contador.
  - Isso equivale a cerca de 4–5 linhas.
  - O campo exibe 5 linhas visíveis.
- **RN22** — Datas passadas são permitidas (para lançar registros antigos). **Datas futuras são proibidas.**
- **RN23** — Pode haver mais de uma sessão na mesma data.
- **RN24** — A lista fica em ordem cronológica **decrescente** (mais recente primeiro) e mostra só a data + o resumo, em formato compacto (sem página inteira por sessão).
- **RN25** — Editar é permitido. O sistema guarda `atualizado_em` e mostra "(editado)". Não há histórico de versões no MVP.
- **RN26** — Excluir uma sessão exige confirmação.
- **RN27** — O perfil mostra o total de sessões e a data da última.

### 5.4 Aniversariantes
- **RN30** — O painel inicial mostra os **aniversariantes do dia**, **incluindo os inativos**. A usuária pediu: *"os pacientes que já passaram por mim"*.
- **RN31** — Cada aniversariante mostra nome, idade que está completando e status.
  - Se houver telefone/WhatsApp, mostra o botão **"Enviar parabéns no WhatsApp"**.
  - O botão abre `https://wa.me/55<numero>?text=<mensagem>` no navegador padrão. Esta é a **única** abertura de link externo permitida, e só acontece com um clique da usuária.
- **RN32** — Mensagem padrão editável em Configurações. Padrão:
  > *"Olá, {primeiro_nome}! Feliz aniversário! Desejo um novo ano cheio de saúde e alegrias. Um abraço, Louriedna."*
- **RN33** — Nascidos em 29/02: em anos não bissextos, aparecem em 28/02.
- **RN34** — Também mostrar "Próximos aniversários (7 dias)" em uma lista recolhível.

### 5.5 Documentos gerais
- **RN40** — Os documentos não têm vínculo com pacientes.
- **RN41** — Categorias iniciais: **Modelos**, **Administrativo**, **Outros**.
  - A usuária pode criar, renomear e excluir categorias.
  - Só é possível excluir uma categoria vazia.
- **RN42** — Formatos aceitos: PDF, DOC, DOCX, ODT, XLS, XLSX, ODS, TXT, JPG, JPEG, PNG.
  - Validar pela extensão **e** pela assinatura do arquivo (magic bytes).
- **RN43** — Tamanho máximo de **25 MB** por arquivo.
- **RN44** — Metadados exibidos: nome, categoria, tipo, tamanho, data de envio e descrição opcional.
- **RN45** — Os arquivos são guardados **criptografados** na pasta de dados do app, com nome aleatório (UUID). O nome original fica apenas no banco criptografado.
- **RN46** — Ações disponíveis:
  - **Baixar** (salva uma cópia descriptografada onde a usuária escolher).
  - **Abrir** (descriptografa em uma pasta temporária, abre no programa padrão e apaga a cópia temporária ao fechar o app).
  - Renomear, trocar de categoria, editar descrição.
  - Excluir (com confirmação).
- **RN47** — Busca por nome e filtro por categoria. Ordenação padrão: mais recentes primeiro.
- **RN48** — Nomes duplicados são permitidos.

### 5.6 Backup e restauração
- **RN50** — Botão **"Fazer backup agora"** no painel inicial e em Configurações.
- **RN51** — O backup é um único arquivo `.lcbackup` contendo banco + documentos, criptografado.
  - A usuária escolhe onde salvar (pendrive, pasta do Google Drive etc.).
  - Nome sugerido: `backup-pacientes-AAAA-MM-DD-HHmm.lcbackup`.
- **RN52** — O backup é aberto com a **mesma senha** ou com a **chave de recuperação**.
- **RN53** — O painel mostra a data do último backup.
  - Se passar de **7 dias**, mostra um lembrete amigável (sem bloquear nada).
- **RN54** — Restaurar fica em Configurações:
  - Exige a senha do backup.
  - Mostra a data do backup e quantos pacientes/documentos ele tem.
  - Confirma que os dados atuais serão substituídos.
  - Cria antes, automaticamente, uma cópia de segurança dos dados atuais.
- **RN55** — Depois de gerar o backup, validar que o arquivo abre (verificação de integridade).
- **RN56** — O backup inclui também os anexos de anamnese (RN67), os agendamentos (RN70), os lançamentos financeiros (RN80) e a grade semanal de horários fixos (RN90).

### 5.7 Mensagens de boas-vindas
- **RN60** — A cada login bem-sucedido, o sistema consome uma mensagem de boas-vindas a partir de uma lista aleatória com todas as frases embaralhadas, salva em memória/banco (`config`). Quando terminar de passar por toda a lista (após exibir todas as frases uma vez), no próximo login é criada outra lista aleatória embaralhada, garantindo que a primeira frase dessa nova lista seja diferente da última frase da lista passada.
- **RN61** — A lista de mensagens de boas-vindas rotativas contém 9 mensagens embutidas no app:
  - *"Eu te amo, mãe! ❤️"*
  - *"Que seu dia seja leve e cheio de bons encontros."*
  - *"Respire fundo: hoje vai ser um bom dia."*
  - *"Obrigado por cuidar de tantas pessoas com tanto carinho."*
  - *"Você faz a diferença na vida de muita gente."*
  - *"Cada pessoa tem sua história, e você ajuda a torná-la mais leve."*
  - *"Seu trabalho faz diferença, mesmo quando você não percebe."*
  - *"Acolher é respeitar o tempo e a história de cada pessoa."*
  - *"Não se esqueça de cuidar de quem também cuida."*
- **RN62** — A fila de mensagens restantes (`boas_vindas_fila`) e o índice da última exibida (`boas_vindas_ultimo_indice`) persistem na tabela `config`. Saudação por horário (Bom dia/Boa tarde/Boa noite) continua acima da mensagem. A lista é fixa no código no MVP (sem edição em Configurações).

### 5.8 Anamnese do paciente
- **RN65** — O perfil do paciente (T07) tem a seção **"Anamnese"** entre o cabeçalho com o nome e o histórico de sessões.
- **RN66** — Permite anexar um ou mais arquivos de anamnese por paciente (ex.: ficha escaneada ou preenchida no Word). Formatos e tamanho seguem RN42/RN43.
- **RN67** — Os arquivos são guardados **criptografados**, como em RN45, vinculados ao `paciente_id`. Excluir o paciente (RN18) apaga também seus anexos.
- **RN68** — Ações: Anexar (botão + arrastar e soltar), Abrir, Baixar, Excluir (com confirmação). Mostra nome, data de envio e tamanho.
- **RN69** — Sem anexo, a seção mostra *"Nenhuma anamnese anexada"* e o botão "Anexar anamnese".

### 5.9 Agenda (calendário de sessões)
- **RN70** — Item **"Agenda"** no menu lateral. Cada agendamento tem: **paciente** (obrigatório), **data** (obrigatória), **horário de início** (obrigatório, HH:MM), duração (padrão 50 min) e observação curta opcional (≤ 200 caracteres).
- **RN71** — Visualizações: **semana** (padrão) e **mês**, com botões "Hoje", "Anterior" e "Próximo".
- **RN72** — Datas futuras e passadas são permitidas. Criar clicando em um horário vazio ou no botão "Novo agendamento".
- **RN73** — Avisar (sem bloquear) quando houver conflito de horário com outro agendamento.
- **RN74** — Editar, remarcar e excluir (com confirmação) agendamentos.
- **RN75** — O painel inicial (T04) mostra **"Sessões de hoje"** com horário e nome do paciente.
- **RN76** — Ao clicar em um agendamento passado, oferecer "Registrar sessão", abrindo o modal T08 com a data preenchida. Agendamento e registro de sessão são independentes.
- **RN77** — O perfil do paciente mostra o próximo agendamento dele e seus horários semanais fixos (RN95). Sem lembretes/notificações externas.

### 5.10 Financeiro (Fase 2 — F9)
- **RN80** — Item **"Financeiro"** no menu lateral (T12). Registra lançamentos do tipo **`entrada`** (recebimentos de sessões/atendimentos) ou **`gasto`** (despesas do consultório), já quitados no ato do lançamento.
- **RN81** — Campos de cada lançamento: **data** (obrigatória, ISO `AAAA-MM-DD`, padrão hoje), **tipo** (`entrada` | `gasto`, obrigatório), **valor** em centavos (`> 0`, obrigatório), **descrição** (obrigatória, ≤ 200 caracteres), **forma de pagamento** opcional (`pix`, `dinheiro`, `cartao`, `transferencia`, `convenio`) e **paciente** opcional (`paciente_id`, aplicável às entradas; se o paciente for excluído, o lançamento permanece com `paciente_id = NULL` via `ON DELETE SET NULL`).
- **RN82** — Ao selecionar um paciente em uma entrada, se ele possuir `valor_sessao_centavos` cadastrado e o campo de valor estiver vazio, preencher automaticamente como sugestão editável.
- **RN83** — **Resumo mensal:** na tela T12, seletor de mês/ano (com botões "Mês anterior", "Mês atual" e "Próximo mês") exibindo três cards consolidados do mês selecionado: **Total de Entradas**, **Total de Gastos** e **Saldo do Mês** (`entradas - gastos`), além da contagem de lançamentos.
- **RN84** — Lista de lançamentos do mês selecionado em ordem cronológica decrescente (`data DESC, criado_em DESC`), com filtro por tipo (`Todos` | `Entradas` | `Gastos`) e busca por descrição ou nome do paciente.
- **RN85** — Permitir criar, editar e excluir (com confirmação) qualquer lançamento financeiro.
- **RN86** — Os lançamentos financeiros fazem parte do banco SQLCipher e são incluídos automaticamente no backup `.lcbackup` (RN56).

### 5.11 Grade semanal de horários fixos (Fase 2 — F9)
- **RN90** — Permite cadastrar os **horários semanais fixos** de cada paciente na tabela `horarios_semanais`.
- **RN91** — Campos de cada horário fixo: **paciente** (`paciente_id`, obrigatório, `ON DELETE CASCADE`), **dia da semana** (`dia_semana`, obrigatório, `0` = Domingo a `6` = Sábado), **horário de início** (`hora_inicio`, obrigatório, `HH:MM`), **duração** (`duracao_min`, padrão 50 min, entre 1 e 720) e **observação** curta opcional (≤ 200 caracteres).
- **RN92** — A tela de **Agenda (T11)** exibe a aba/visão **"Grade Fixa"** (além de `Semana` e `Mês`), organizando os horários fixos por dia da semana (Segunda a Domingo) e permitindo criar, editar e excluir (com confirmação) horários fixos.
- **RN93** — Detecção de conflitos na grade fixa: avisar (sem bloquear) quando dois horários fixos no mesmo `dia_semana` tiverem sobreposição de horário.
- **RN94** — Botão **"Aplicar grade na semana"** na Agenda (T11): gera os agendamentos pontuais (`agendamentos`) para os dias da semana selecionada a partir dos horários fixos de pacientes ativos, ignorando sem duplicar aqueles que já possuam agendamento para o mesmo paciente, data e horário de início.
- **RN95** — O **perfil do paciente (T07)** exibe os horários semanais fixos daquele paciente no cabeçalho/resumo de atendimento.

---

## 6. Modelo de dados (SQLite / SQLCipher)

```sql
-- configuracoes chave/valor (não sensível fica no banco cifrado igualmente)
CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);

CREATE TABLE pacientes (
  id TEXT PRIMARY KEY,                -- UUID v4
  nome TEXT NOT NULL,
  nome_busca TEXT NOT NULL,           -- nome normalizado (minúsculo, sem acento)
  data_nascimento TEXT,               -- ISO AAAA-MM-DD
  telefone TEXT,                      -- só dígitos, com DDD
  whatsapp TEXT,                      -- só dígitos; se vazio usa telefone
  email TEXT,
  endereco TEXT,
  nome_mae TEXT,
  nome_pai TEXT,
  responsavel_nome TEXT,
  responsavel_parentesco TEXT,
  responsavel_telefone TEXT,
  contato_emergencia_nome TEXT,
  contato_emergencia_telefone TEXT,
  documento TEXT,                     -- CPF ou RG (texto livre)
  ocupacao TEXT,                      -- profissão ou escola/série
  motivo_procura TEXT,
  modalidade TEXT CHECK (modalidade IN ('particular','convenio')),
  convenio_nome TEXT,
  valor_sessao_centavos INTEGER,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  inativado_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_pacientes_busca ON pacientes(nome_busca);
CREATE INDEX idx_pacientes_status ON pacientes(status);

CREATE TABLE sessoes (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                 -- ISO AAAA-MM-DD
  resumo TEXT NOT NULL CHECK (length(resumo) <= 600),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_sessoes_paciente_data ON sessoes(paciente_id, data DESC);

CREATE TABLE categorias_documento (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE documentos (
  id TEXT PRIMARY KEY,                -- também é o nome do arquivo cifrado em disco
  categoria_id TEXT REFERENCES categorias_documento(id),
  nome_original TEXT NOT NULL,
  descricao TEXT,
  mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,               -- do conteúdo original, para integridade
  enviado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- F6: anexos de anamnese (arquivo cifrado em docs/<id>.bin)
CREATE TABLE anamneses (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  nome_original TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  enviado_em TEXT NOT NULL
);
CREATE INDEX idx_anamneses_paciente ON anamneses(paciente_id);

-- F4.5: agenda
CREATE TABLE agendamentos (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  data TEXT NOT NULL,                 -- ISO AAAA-MM-DD
  hora_inicio TEXT NOT NULL,          -- HH:MM
  duracao_min INTEGER NOT NULL DEFAULT 50,
  observacao TEXT CHECK (length(observacao) <= 200),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_agendamentos_data ON agendamentos(data, hora_inicio);

-- F9: financeiro
CREATE TABLE lancamentos_financeiros (
  id TEXT PRIMARY KEY,
  paciente_id TEXT REFERENCES pacientes(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','gasto')),
  data TEXT NOT NULL,                 -- ISO AAAA-MM-DD
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  descricao TEXT NOT NULL CHECK (length(descricao) <= 200),
  forma_pagamento TEXT CHECK (forma_pagamento IN ('pix','dinheiro','cartao','transferencia','convenio')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_lancamentos_data ON lancamentos_financeiros(data DESC);
CREATE INDEX idx_lancamentos_paciente ON lancamentos_financeiros(paciente_id);

-- F9: grade semanal de horários fixos
CREATE TABLE horarios_semanais (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  hora_inicio TEXT NOT NULL,          -- HH:MM
  duracao_min INTEGER NOT NULL DEFAULT 50,
  observacao TEXT CHECK (length(observacao) <= 200),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_horarios_semanais_dia ON horarios_semanais(dia_semana, hora_inicio);
CREATE INDEX idx_horarios_semanais_paciente ON horarios_semanais(paciente_id);

CREATE TABLE schema_migrations (versao INTEGER PRIMARY KEY, aplicado_em TEXT NOT NULL);
```

**Observações:**
- `PRAGMA foreign_keys = ON;` em toda conexão.
- Datas e horários em ISO 8601, no horário local.

---

## 7. Modelo de segurança e criptografia

```
Senha ──Argon2id(salt, m=64MiB, t=3, p=1)──► KEK_senha ──┐
Chave de recuperação ──Argon2id(salt2)──► KEK_rec ───────┤ cada KEK "embrulha" (XChaCha20-Poly1305)
                                                          ▼
                                       DEK (32 bytes aleatórios, gerada 1x)
                                         ├─► chave do SQLCipher (banco)
                                         └─► chave dos arquivos de documentos
```

- **Arquivo `vault.json`** (fora do banco, não sensível). Contém:
  - `versao`
  - parâmetros e salts do Argon2
  - `dek_por_senha` (DEK cifrada + nonce)
  - `dek_por_recuperacao`
  - estado do rate-limit do login
- **Validação da senha:** é o próprio desembrulhar da DEK. Se a autenticação AEAD falhar, a senha está errada. Não se guarda hash separado.
- **Trocar a senha:** apenas re-embrulha a DEK. Os dados **não** são re-cifrados.
- **Na memória:**
  - DEK/KEK com `zeroize`.
  - Ao bloquear (RN05/RN06), a DEK é apagada e a conexão com o banco é fechada.
- **Arquivos de documentos:**
  - `docs/<uuid>.bin` = nonce (24B) + ciphertext.
  - Arquivos grandes em blocos (STREAM) para não estourar a memória.
- **Backup `.lcbackup`:**
  - Cabeçalho com magic bytes e versão, mais cópia do `vault.json`.
  - Payload: tar/zip (banco + docs) cifrado com a DEK.
- **Pasta de dados:**
  - Windows: `%APPDATA%\LC Pacientes\`
  - Linux: `~/.local/share/lc-pacientes/`
- **Temporários de "Abrir documento":** em subpasta própria, limpos ao bloquear, ao sair e ao iniciar.
- **Proibido:**
  - Senha, DEK ou dados de paciente em logs.
  - `console.log` com dados no frontend.
  - Guardar senha em localStorage.

---

## 8. Telas (Fases 1 e 2)

| # | Tela | Conteúdo principal |
|---|---|---|
| T01 | Primeiro acesso | Boas-vindas → criar senha → exibir/imprimir chave de recuperação → confirmar |
| T02 | Login / Bloqueado | Logo, campo de senha, "Entrar", "Esqueci a senha", aviso de bloqueio temporário |
| T03 | Recuperar acesso | Chave de recuperação → nova senha |
| T04 | Início (painel) | Saudação + mensagem de boas-vindas rotativa (RN60); sessões de hoje (RN75); aniversariantes do dia + próximos 7 dias; atalhos (Novo paciente, Registrar sessão, Buscar paciente, Documentos); total de ativos; último backup + botão |
| T05 | Pacientes (lista) | Busca, filtro de status, botão "Novo paciente"; colunas: nome, idade, telefone, última sessão |
| T06 | Paciente (form) | Criar/editar, com campos agrupados: Dados pessoais · Contato · Família/Responsável · Atendimento · Observações |
| T07 | Paciente (perfil) | Cabeçalho (nome, idade, status, contato, próximo agendamento, horários semanais fixos — RN95); **seção Anamnese** (RN65); "Nova sessão" em destaque; histórico compacto; abas/seção de dados cadastrais; Mais opções (inativar/reativar/excluir) |
| T08 | Sessão (modal) | Data + resumo com contador 0/600; salvar/cancelar |
| T09 | Documentos | Categorias (abas ou lateral), busca, botão "Enviar documento" (também arrastar e soltar), lista com ações |
| T11 | Agenda | Visão semana/mês/grade fixa (RN92), "Hoje", navegação, "Novo agendamento", "Aplicar grade na semana" (RN94); modais de agendamento e horário fixo (RN70–RN77, RN90–RN95) |
| T12 | Financeiro | Resumo mensal (entradas, gastos, saldo), seletor de mês/ano, filtro por tipo e busca, lista de lançamentos e modal de novo/editar lançamento (RN80–RN86) |
| T10 | Configurações | Trocar senha · Backup/Restaurar · Mensagem de aniversário · Gerenciar categorias · Sobre/segurança |

"Registrar sessão" no painel abre uma busca rápida de paciente e depois o modal T08.

---

## 9. Requisitos não funcionais
- Abrir o app e logar em < 3 s. Buscar paciente em < 200 ms com até 5.000 pacientes.
- Funciona 100% offline. Zero requisições de rede (verificável).
- Nenhuma perda de dados em caso de queda de energia: SQLite com WAL e transações.
- Instalador único, sem exigir que a usuária instale dependências.
- Código com testes nos pontos críticos: cripto, regras de data, rate-limit, backup/restauração.
- LGPD: coletar só os campos listados. Todos opcionais, exceto o nome.

## 10. Convenções de código
- **Rust:**
  - Módulos `crypto`, `db`, `vault`, `commands/*`, `files`, `backup`.
  - Erros com `thiserror`. Mensagens ao frontend genéricas, em português.
- **Frontend:**
  - `src/pages`, `src/components`, `src/lib/api.ts` (wrappers tipados de `invoke`), `src/lib/format.ts`.
  - TypeScript estrito.
- **Nomes:** de domínio em português (paciente, sessao, documento); termos técnicos em inglês quando forem padrão.
- **Commits:** pequenos, um por tarefa do roadmap (ex.: `feat(pacientes): busca sem acento [F3-T2]`).

## 11. Definição de Pronto (para toda tarefa)
1. Atende às regras de negócio citadas na tarefa (RNxx).
2. Compila sem warnings relevantes. `cargo clippy` e `tsc` limpos.
3. Testes da tarefa passando.
4. Nenhuma chamada de rede, nenhum dado sensível em log.
5. Textos da interface em pt-BR, revisados.
6. Checklist da tarefa marcado em `03_ROADMAP.md`.

## 12. Registro de Decisões
| Data | Decisão | Motivo |
|---|---|---|
| 01/11/2026 | App desktop offline | Resposta 1.1 do formulário |
| 01/11/2026 | Bloqueio após 30 min | Resposta 5.1 |
| 01/11/2026 | Chave de recuperação em papel | Resposta 5.2 |
| 01/11/2026 | Backup manual por botão + lembrete após 7 dias | Respostas 6.1/6.2 |
| 01/11/2026 | Categorias simples em documentos | Resposta 4.2 |
| 01/11/2026 | Sessão = data + resumo, editável | Respostas 3.1/3.2 |
| 01/11/2026 | Aniversariantes inclui inativos | Campo livre 2.2 |
| 01/11/2026 | Financeiro e agenda ficam para a Fase 2 | Campo livre 7.2 + prioridade 7.1 |
| 01/11/2026 | Stack Tauri 2 + React + SQLCipher | Offline, leve, segura, instalador único |
| 01/11/2026 | Resumo com limite de 600 caracteres | Tradução de "4–5 linhas" |
| 02/11/2026 | Mensagens de boas-vindas rotativas a cada login, incluindo "Eu te amo, mãe" (RN60–RN62) | Pedido do desenvolvedor |
| 02/11/2026 | Anexo de anamnese ao paciente entra no escopo (só arquivo, sem formulário), seção entre o nome e o histórico (RN65–RN69) | Pedido da usuária; revoga a exclusão anterior. Fica na F6 (reaproveita a criptografia de arquivos) |
| 02/11/2026 | Agenda (data + horário das sessões) antecipada da Fase 2 para a F4.5 (RN70–RN77) | Pedido da usuária |
| 03/11/2026 | Atualização das mensagens rotativas de boas-vindas: fixadas 9 mensagens personalizadas e remoção das não listadas (RN61) | Pedido da usuária |
| 03/11/2026 | Ciclo embaralhado de boas-vindas: consome toda a lista de frases antes de repetir, e novo ciclo garante que a 1ª frase seja diferente da última do ciclo passado (RN60, RN62) | Pedido do usuário |
| 06/11/2026 | Alterar/mudar logo do app na barra de tarefas e na janela incluído no escopo da fase F8 (F8-T4) | Pedido do usuário |
| 06/11/2026 | Geração do instalador Windows final e instalação movidos para o final da Fase 9 (F9-T4 e F9-T5) | Pedido do usuário: gerar apenas quando tudo estiver pronto |
| 06/11/2026 | Financeiro (F9-T1/F9-T2): modelo simples e direto (Data, Tipo Entrada/Gasto, Valor em centavos, Descrição, Forma de pagamento opcional e Paciente opcional para entradas, já quitados no ato) + resumo mensal consolidado (RN80–RN86) | Levantamento da Fase 2 (F9-T1) |
| 06/11/2026 | Grade Semanal Fixa (F9-T1/F9-T3): aba "Grade Fixa" dentro da Agenda (T11) + exibição no perfil do paciente (T07) + botão "Aplicar grade na semana" para gerar agendamentos da semana sem duplicar (RN90–RN95) | Levantamento da Fase 2 (F9-T1) |
| 06/11/2026 | Sistema operacional da usuária confirmado como Windows 10/11 64-bit para geração de artefatos e roteiro de instalação final (F9-T4 e F9-T5) | Levantamento da Fase 2 (F9-T1) |
