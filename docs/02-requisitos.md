# 02 — Requisitos e Regras de Negócio

**Projeto:** Sistema de Pacientes e Documentos (LC Consultório)  
**Versão:** 1.1 — 02/11/2026  
**Documento Soberano:** [`Planejamento/01_FONTE_DA_VERDADE.md`](../Planejamento/01_FONTE_DA_VERDADE.md) (Seções 2 e 5)

---

## 1. Requisitos Funcionais (RF)

| ID | Requisito Funcional | Módulo | Prioridade |
|---|---|---|---|
| **RF01** | Autenticar a usuária por senha mestra e recuperar acesso via chave impressa em papel | Autenticação | Alta |
| **RF02** | Bloquear a aplicação após 30 minutos de inatividade sem perder dados digitados em formulários | Autenticação / Sessão | Alta |
| **RF03** | Apresentar no painel inicial os aniversariantes do dia (ativos e inativos) com atalho de WhatsApp | Painel | Média |
| **RF04** | Exibir saudações e mensagens rotativas de boas-vindas sem repetição consecutiva | Painel | Média |
| **RF05** | Cadastrar, listar, buscar sem acento, editar e inativar pacientes de todas as faixas etárias | Pacientes | Alta |
| **RF06** | Registrar, editar, visualizar e excluir evoluções/sessões clínicas com data e resumo | Sessões | Alta |
| **RF07** | Agendar sessões em grade semanal e mensal com aviso visual de horários conflitantes | Agenda | Alta |
| **RF08** | Anexar arquivos de ficha de anamnese cifrados diretamente no perfil do paciente | Anamnese / Arquivos | Alta |
| **RF09** | Armazenar e organizar documentos gerais em categorias com abertura segura | Documentos | Média |
| **RF10** | Gerar arquivo de backup `.lcbackup` criptografado e restaurar dados com salvaguarda prévia | Backup | Alta |

---

## 2. Requisitos Não Funcionais (RNF)

| ID | Requisito Não Funcional | Métrica Verificável |
|---|---|---|
| **RNF01** | **Privacidade e Desconexão Total** | 0 chamadas de rede externas; capabilities do Tauri sem permissão de HTTP. |
| **RNF02** | **Criptografia do Banco de Dados** | Base SQLite 100% ilegível sem chave SQLCipher (cabeçalho não padrão). |
| **RNF03** | **Criptografia de Arquivos em Disco** | Documentos armazenados com XChaCha20-Poly1305; bytes em disco ilegíveis. |
| **RNF04** | **Resistência a Ataques de Senha** | KDF Argon2id com parâmetros seguros (64 MB de memória, 3 iterações, 4 lanes). |
| **RNF05** | **Tempo de Resposta Local** | Respostas de comandos IPC locais em menos de 100 ms para consultas rotineiras. |
| **RNF06** | **Acessibilidade e Ergonomia Visual** | Contraste mínimo WCAG AA (>= 4.5:1); fontes base com tamanho mínimo de 16px. |
| **RNF07** | **Segurança de Memória** | Buffers com senhas e chaves criptográficas zerados após descarte via trait `Zeroize`. |
| **RNF08** | **Integridade de Backup** | Verificação SHA-256 e teste de abertura do arquivo `.lcbackup` logo após a gravação. |

---

## 3. Índice das Regras de Negócio (RN01 a RN77)

As regras de negócio detalhadas, seus critérios de precedência e exceções encontram-se na
**Seção 5 de [`Planejamento/01_FONTE_DA_VERDADE.md`](../Planejamento/01_FONTE_DA_VERDADE.md)**:

- **RN01 a RN05:** Acesso, sessão, inatividade e chave de segurança em papel.
- **RN10 a RN19:** Cadastro, busca sem acento, status ativo/inativo e perfil de pacientes.
- **RN20 a RN26:** Registro, edição, exclusão e visualização de sessões clínicas.
- **RN30 a RN34:** Lógica de aniversariantes (hoje + 7 dias, tratamento de 29/02 e atalho WhatsApp).
- **RN40 a RN47:** Gestão de categorias, upload, armazenamento e visualização de documentos.
- **RN50 a RN56:** Formato `.lcbackup`, salvaguarda prévia na restauração e integridade de backups.
- **RN60 a RN62:** Mensagens rotativas de boas-vindas a cada login.
- **RN65 a RN69:** Anexo e consulta de arquivos de anamnese no perfil.
- **RN70 a RN77:** Agendamento de sessões, visualização semanal/mensal e detecção de conflitos de horários.
