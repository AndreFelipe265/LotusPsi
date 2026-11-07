# Roteiro e Registro de Revisão de UX (F8-T2)

> **Documento de validação de usabilidade com a usuária:** Louriedna Costa Pereira (CRP 03/29434)  
> **Condução:** Felipe (Desenvolvedor)  
> **Referência:** `Planejamento/01_FONTE_DA_VERDADE.md` (Seção 4) e `Planejamento/03_ROADMAP.md` (Fase F8)

---

## 1. Objetivos da Sessão de Teste Guiada

1. Avaliar a facilidade e velocidade no uso diário do consultório (cadastro, consulta, agendamento e anotação).
2. Garantir legibilidade máxima e conforto visual para a usuária:
   - Texto base mínimo de **16px** em toda a aplicação (sem textos miúdos `text-xs` ou `text-sm`).
   - Contraste visual compatível com WCAG AA (texto branco restrito a botões ou fundos `malva`/escuros).
   - Botões com rótulos descritivos e claros (evitando botões apenas com ícones enigmáticos).
3. Validar a regra dos **máximo 2 cliques** para alcançar qualquer tela ou operação principal.
4. Garantir que nenhuma ação destrutiva ocorra por engano e sem confirmação explícita.
5. Assegurar que o bloqueio por inatividade de 30 minutos **nunca** apague rascunhos em digitação (Armadilha A3).

---

## 2. Cenários Clínicos Testados

| # | Cenário Clínico | Ações Executadas | Resultado Observado | Status |
|---|---|---|---|:---:|
| **C1** | Primeiro acesso e Login | Abertura do app, digitação de senha mestra, geração/impressão da chave de recuperação de 24 caracteres e login subsequente. | Mensagem de boas-vindas rotativa exibida com carinho; saudação adequada por horário ("Boa tarde, Louriedna"); navegação imediata. | **Aprovado** |
| **C2** | Consulta e Cadastro de Pacientes | Busca instantânea por paciente digitando sem acento ("joao" para "João"), visualização de telefone e idade calculada; abertura do form T06. | Encontro imediato em < 100 ms; campos agrupados com clareza; menores de 18 anos recebem destaque nos campos de responsável legal. | **Aprovado** |
| **C3** | Registro rápido de Sessão | Clique em "Registrar sessão" no painel, seleção rápida do paciente, preenchimento do resumo de até 600 caracteres com contador dinâmico. | Contador visual 0/600 claro; bloqueio temporário por inatividade preserva o texto digitado intacto após desbloqueio. | **Aprovado** |
| **C4** | Agenda Semanal e Conflitos | Navegação para Agenda (T11), visualização da semana, criação de agendamento e teste de conflito de horários. | Aviso amigável de conflito sem travar o agendamento; integração imediata com "Sessões de hoje" no Painel Inicial. | **Aprovado** |
| **C5** | Documentos e Anamnese | Envio de PDF de ficha de anamnese no perfil do paciente (T07) e documentos gerais organizados por categorias em T09. | Envio rápido por botão ou arrastar-e-soltar; arquivos cifrados no disco; abertura no visualizador padrão sem falhas. | **Aprovado** |
| **C6** | Aniversariantes e WhatsApp | Verificação dos aniversariantes do dia (incluindo inativos) e dos próximos 7 dias no painel; clique para parabenizar. | Abertura do WhatsApp no navegador apenas ao clicar no botão, com mensagem personalizada preenchida com o primeiro nome. | **Aprovado** |
| **C7** | Cópia de Segurança (Backup) e Configurações | Geração de backup manual `.lcbackup`, conferência de lembrete de 7 dias, teste de inspeção de arquivo e troca de senha em T10. | Arquivo verificado com sucesso; inspeção exibe contagens corretas; troca de senha exige senha atual e valida 8 caracteres. | **Aprovado** |

---

## 3. Ajustes de UX Refinados e Consolidados

1. **Tipografia e Legibilidade:**
   - Todos os elementos de interface seguem texto base $\ge$ 16px.
   - Textos de ajuda e legendas mantêm contraste alto sobre fundos claros (`#3A2E36` e `#92798F`).
2. **Prevenção de Perda de Dados:**
   - O modal de sessão e formulários preservam os dados digitados se a tela bloquear por 30 minutos de inatividade.
   - Diálogos de confirmação (`ConfirmDialog`) com descrição detalhada antes de qualquer exclusão (pacientes, sessões, categorias, anamneses e restauração de backup).
3. **Navegação em até 2 cliques:**
   - Menu lateral fixo (`Início`, `Pacientes`, `Agenda`, `Documentos`, `Configurações`, `Sair`).
   - Atalhos no painel inicial para "Novo paciente", "Registrar sessão", "Buscar paciente" e "Documentos".
4. **Mensagens Humanizadas:**
   - Substituição de termos técnicos ou códigos de erro por explicações amigáveis em português ("Senha incorreta", "A nova senha deve ter no mínimo 8 caracteres", etc.).

---

## 4. Parecer de Aceite

A experiência de uso atende rigorosamente a todos os princípios definidos na Seção 4 da `01_FONTE_DA_VERDADE.md`. A usuária navega com autonomia, segurança e sem atritos visuais ou operacionais.
