# 04 — Registro de Riscos e Segurança

**Projeto:** LotusPsi (Sistema de Pacientes e Documentos — LC Consultório)  
**Versão:** 1.1 — 02/11/2026  

---

## 1. Registro de Riscos do Projeto

Abaixo estão catalogados os principais riscos técnicos, operacionais e de segurança do projeto,
suas estratégias de mitigação e a situação final medida.

| ID | Risco | Impacto | Mitigação | Situação Final |
|---|---|---|---|---|
| **R1** | **Esquecimento da senha mestra pela usuária** | Crítico | Geração no primeiro acesso de uma Chave de Recuperação física em papel, permitindo restaurar a DEK sem precisar da senha antiga. | **Mitigado:** Testes unitários em `crypto.rs` e tela T03 validam o fluxo de recuperação com sucesso. |
| **R2** | **Corrupção do banco de dados SQLite por desligamento repentino** | Alto | Utilização do modo WAL no SQLite/SQLCipher com transações estritas (`BEGIN TRANSACTION`) e verificação de integridade no startup. | **Mitigado:** Implementado em `db.rs` com `PRAGMA synchronous = NORMAL` e testes de carga. |
| **R3** | **Perda de anotações no meio da digitação por bloqueio de tela** | Médio | Preservação do rascunho de texto no modal T08 durante o bloqueio de 30 minutos por inatividade. A usuária destranca e continua de onde parou. | **Encerrado:** Coberto no teste `src/Inicio.test.tsx` garantindo retenção do texto. |
| **R4** | **Inconsistência entre desenvolvimento (Linux) e produção (Windows)** | Alto | Compilação com caminhos relativos normalizados via `PathBuf`, fim de linha LF fixado no `.gitattributes` e testes do build Windows em VM/Wine. | **Mitigado:** Instalador provisório validado com sucesso em 02/11/2026 na máquina de teste. |
| **R5** | **Vazamento acidental de dados de pacientes no controle de versão (Git)** | Crítico | `.gitignore` estrito bloqueando extensões `.sqlite`, `.db`, `.lotusbackup`, `.lcbackup`, `.csv`, `.xlsx` e job de higiene no GitHub Actions. | **Encerrado:** Auditoria e CI garantem zero dados sensíveis versionados no repositório. |
| **R6** | **Conflito de horários de atendimento na agenda** | Médio | Detecção proativa de sobreposição de intervalos em `agendamentos.rs` com aviso amigável na interface (sem bloqueio coercitivo). | **Encerrado:** Implementado e coberto em `agendamentos.rs` (F4.5-T2). |

---

## 2. Princípios de Defesa em Profundidade

1. **Privacidade por Desenho:** Sistema sem módulos de rede compilados no binário.
2. **Criptografia Autenticada:** Não apenas confidencialidade, mas autenticação dos dados com Poly1305.
3. **Backup Seguro:** Cópia cifrada que pode ser guardada em nuvem pessoal ou pendrive sem expor os dados a quem tiver posse física do arquivo.
