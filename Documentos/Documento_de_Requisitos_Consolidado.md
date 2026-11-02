# Documento de Requisitos Consolidado — Sistema de Gerenciamento de Pacientes

> **Status:** Requisitos Aprovados e Validados com a Usuária Final  
> **Data:** Novembro de 2026  
> **Usuária do Sistema:** Exclusivo para uso pessoal e profissional da mãe do desenvolvedor  
> **Tipo de Aplicação:** Sistema Desktop Local (100% offline, seguro e privativo)

---

## 1. Visão Geral e Decisões Fundamentais

Com base nas respostas fornecidas pela usuária no questionário, o sistema foi desenhado exatamente para o seu fluxo diário de trabalho clínico:

1. **Ambiente 100% Local / Desktop:** Não dependerá de internet, não terá custos mensais de servidores e garante privacidade total dos dados sensíveis.
2. **Computador de Uso Pessoal:** Ela é a única usuária do computador e do sistema.
3. **Público Atendido:** Atendimento abrangente a **todas as faixas etárias** (crianças, adolescentes e adultos).
4. **Foco Imediato (Fase 1 - MVP):** Cadastro de pacientes, registro ágil de sessões diárias, alerta de aniversariantes e repositório de documentos gerais.
5. **Evolução Planejada (Fase 2):** Controle financeiro simples (entradas e gastos) e grade de horários semanais (agenda).

---

## 2. Destaques Especiais (Ideias e Pedidos da Usuária)

* 🎂 **Alerta de Aniversariantes do Dia:**  
  *Aparecer na tela inicial os pacientes do dia que fazem aniversário (incluindo os que já passaram por ela / inativos)*, permitindo enviar uma mensagem de felicitações (ex.: atalho com botão "Mandar WhatsApp").
* 🔄 **Status Ativo / Inativo:**  
  Pacientes que tiveram alta ou interromperam o atendimento ficam marcados como "Inativos", despoluindo a tela de trabalho diária, mas preservando 100% do histórico e reativando facilmente caso retornem.
* 💾 **Backup por Botão Direto:**  
  Um botão simples de "Fazer Backup Agora" na tela, gerando uma cópia criptografada que pode ir para um pendrive ou pasta sincronizada da nuvem pessoal.

---

## 3. Funcionalidades Detalhadas (Fase 1 — MVP)

### 3.1 Tela de Acesso e Segurança
- Autenticação por senha master.
- **Bloqueio automático por inatividade:** após **30 minutos** sem movimentação, o sistema bloqueia a tela pedindo a senha novamente.
- Proteção dos dados por criptografia em repouso (banco de dados criptografado).
- **Chave de emergência física:** na criação da conta, o sistema gera uma chave mestra para ela imprimir/guardar em papel caso esqueça a senha.

### 3.2 Painel Inicial (Dashboard)
- **Card de Aniversariantes do Dia:** lista de pacientes ativos e inativos com data de aniversário hoje, com botão direto para WhatsApp.
- **Atalhos rápidos:** "Novo Paciente", "Registrar Sessão", "Buscar Paciente".
- **Resumo do dia:** quantidade de pacientes ativos cadastrados.
- **Botão de Backup rápido:** status do último backup e botão para gerar nova cópia.

### 3.3 Módulo de Pacientes
- **Cadastro Completo (Adequado para adultos e crianças):**
  - Nome completo
  - Data de nascimento (com cálculo automático da idade)
  - Telefone principal / WhatsApp
  - Contato de emergência (outro telefone e grau de parentesco)
  - E-mail
  - Endereço completo
  - Nome da mãe / Responsável legal
  - Nome do pai
  - CPF ou RG (do paciente ou responsável)
  - Profissão / Ocupação (ou Escola / Série para menores)
  - Motivo da procura / Queixa principal
  - Convênio ou Particular (com valor da sessão acordado)
  - Observações / anotações livres gerais
  - Status: **Ativo** ou **Inativo**
- **Listagem e Busca:**
  - Busca instantânea por nome ou telefone.
  - Filtro rápido: "Apenas Ativos" (padrão) e "Inativos / Histórico".
- **Ficha do Paciente (Perfil):**
  - Dados cadastrais editáveis.
  - Linha do tempo cronológica com o histórico de atendimentos.

### 3.4 Histórico de Sessões (Atendimentos)
- Formulário rápido e sem burocracia:
  - **Data da sessão** (padrão: hoje, com opção de selecionar datas anteriores).
  - **Resumo da sessão:** campo de texto livre para 4 a 5 linhas.
- **Regras:**
  - Histórico organizado cronologicamente (da sessão mais recente para a mais antiga).
  - **Permissão para editar:** o resumo pode ser corrigido e atualizado caso haja erro de digitação.
  - Exclusão permitida com confirmação.
  - *(Exportação em PDF ficou para segundo plano conforme resposta dela)*.

### 3.5 Módulo de Documentos Gerais
- Repositório independente para arquivos de uso geral:
  - Modelos de relatórios padrão, declarações, contratos de atendimento.
  - Planilhas e comprovantes administrativos.
- **Organização por Categorias:**
  - Categorias pré-definidas (ex.: "Modelos", "Administrativo", "Gerais").
- **Ações:**
  - Fazer upload de arquivos (PDF, DOCX, XLSX, etc.).
  - Baixar / abrir o arquivo.
  - Renomear ou excluir.

### 3.6 Cópia de Segurança (Backup)
- Botão "Gerar Cópia de Segurança" em Configurações e na Tela Inicial.
- Exportação compactada e criptografada com data e hora.
- Opção para restaurar dados caso ela mude de computador.

---

## 4. Próxima Etapa (Fase 2 — Roadmap Futuro Solicitado)

Conforme informado no campo livre do formulário, as próximas funcionalidades a serem adicionadas após o MVP inicial serão:
1. **Controle Financeiro Clínico:**
   - Registro de entradas (pagamentos de sessões por paciente).
   - Registro de saídas/gastos do consultório.
   - Resumo mensal de faturamento.
2. **Organizador de Horários Semanais (Grade de Atendimento):**
   - Visualização dos horários fixos de cada paciente durante a semana (ex.: Segunda às 14h, Quarta às 10h).

---

## 5. Próximos Passos de Desenvolvimento

1. Definir a stack tecnológica desktop (ex: **Tauri + React/Vite + SQLite com SQLCipher** ou **Python + Electron/Flet/CustomTkinter**).
2. Criar a modelagem do banco de dados SQLite local.
3. Desenvolver a interface limpa e intuitiva focada em legibilidade e botões claros.
