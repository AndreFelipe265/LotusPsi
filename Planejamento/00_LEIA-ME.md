# Planejamento — Como usar esta pasta

| Arquivo | Papel |
|---|---|
| **`01_FONTE_DA_VERDADE.md`** | ⭐ **Verdade absoluta.** Requisitos, regras de negócio (RNxx), stack, modelo de dados, segurança e telas. |
| `02_ARQUITETURA.md` | Estrutura de pastas, comandos Tauri e fluxos técnicos. Detalha a Fonte da Verdade sem contradizê-la. |
| `03_ROADMAP.md` | Fases e tarefas (Fx-Ty) com checklist e critérios de aceite. É o que guia a execução. |
| `04_PROMPTS_IA.md` | Prompts prontos para pedir cada fase/tarefa a uma IA. |
| `05_PENDENCIAS.md` | Perguntas ainda abertas para a usuária. |

## Hierarquia (em caso de conflito)
1. `01_FONTE_DA_VERDADE.md`
2. `02_ARQUITETURA.md`
3. `03_ROADMAP.md`
4. Qualquer outra coisa (código existente, questionários, conversas)

## Fluxo de trabalho com IA
1. Abra uma conversa nova por tarefa (ou por fase pequena).
2. Use o prompt de `04_PROMPTS_IA.md`, que manda a IA ler a Fonte da Verdade primeiro.
3. A IA implementa **somente** a tarefa pedida, roda os testes e marca o checklist no Roadmap.
4. Se surgir uma decisão nova: você aprova → ela entra na seção 12 da Fonte da Verdade.

O arquivo `AGENTS.md`, na raiz do projeto, faz qualquer agente de IA carregar essa regra automaticamente.
