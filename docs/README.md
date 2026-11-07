# Documentação Viva — LotusPsi (Sistema de Pacientes e Documentos)

Bem-vindo à pasta de documentação do **LotusPsi (Sistema de Pacientes e Documentos — LC Consultório)**.

> [!IMPORTANT]
> **Hierarquia da Verdade:**
> O arquivo central e definitivo de especificação é **[`Planejamento/01_FONTE_DA_VERDADE.md`](../Planejamento/01_FONTE_DA_VERDADE.md)**.
> Toda e qualquer decisão sobre telas, regras de negócio ou limites de escopo descrita na Fonte da Verdade
> é soberana. Os documentos nesta pasta `docs/` organizam a visão, os requisitos catalogados, as ADRs e a gestão
> de riscos de forma modular e auditável.

---

## Mapa da Documentação

| Documento | Conteúdo |
|---|---|
| [`01-visao-do-produto.md`](01-visao-do-produto.md) | Problema, usuária atendida, premissas 100% offline e limites de escopo. |
| [`02-requisitos.md`](02-requisitos.md) | Requisitos funcionais (RF), não funcionais (RNF) e índice das regras de negócio (RN01–RN95). |
| [`03-arquitetura.md`](03-arquitetura.md) | Diagrama de camadas, fluxo de dados e Registros de Decisões de Arquitetura (ADR-001 a ADR-006). |
| [`04-riscos-e-seguranca.md`](04-riscos-e-seguranca.md) | Matriz de riscos do projeto (R1 a R6), impactos, mitigações e desfechos medidos. |
| [`05-revisao-ux-guiada.md`](05-revisao-ux-guiada.md) | Relatório da sessão de revisão de UX guiada com a usuária e ajustes aplicados. |
| [`06-auditoria-seguranca.md`](06-auditoria-seguranca.md) | Relatório de auditoria de segurança (zero rede, logs limpos, `cargo audit` e `npm audit`). |
| [`07-entrega-e-instalacao-final.md`](07-entrega-e-instalacao-final.md) | Roteiro e checklist de instalação final, criação assistida de senha, impressão da chave e primeiro backup. |
| [`guia-backup.md`](guia-backup.md) / [`guia-backup.pdf`](guia-backup.pdf) | Guia rápido de 1 página para a usuária: "Como fazer backup e restaurar". |
| [`medicoes/`](medicoes/) | Evidências e relatórios técnicos gerados por script (`registro-commits.md`). |
| [`exemplos/`](exemplos/) | Dados de referência sintéticos e transcrições de questionário para testes. |
