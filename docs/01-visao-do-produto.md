# 01 — Visão do Produto

**Projeto:** Sistema de Pacientes e Documentos (LC Consultório)  
**Versão:** 1.1 — 02/11/2026  
**Usuária Principal:** Psicóloga Clínica (CRP 00/00000)  
**Desenvolvedor:** André Felipe  

---

## 1. O Problema e a Proposta de Valor

Psicólogos clínicos lidam diariamente com informações estritamente confidenciais: notas de evolução,
dados familiares, histórico de sessões e documentos de pacientes de todas as faixas etárias.

As soluções tradicionais de mercado apresentam barreiras críticas:
1. **Cobrança recorrente:** mensalidades caras que pesam no orçamento de profissionais autônomos.
2. **Dependência de internet:** lentidão ou impossibilidade de consultar prontuários caso haja queda de conexão.
3. **Privacidade comprometida:** armazenamento em servidores de terceiros ou nuvens sujeitas a vazamentos e termos invasivos.

O **LC Consultório** resolve esse problema sendo uma aplicação desktop **100% offline, local e criptografada**.
O software pertence à usuária, não gera custos mensais, funciona instantaneamente no computador do consultório
e garante sigilo profissional absoluto por meio de criptografia forte em repouso.

---

## 2. A Usuária e o Ambiente de Uso

- **Perfil:** Psicóloga clínica com atendimento presencial a crianças, adolescentes e adultos.
- **Hardware:** Computador pessoal dedicado no consultório (Windows 10/11).
- **Rotina Clínica:** Registro conciso ao final de cada atendimento (data + 4 a 5 linhas de resumo), consulta rápida ao
  histórico anterior antes do início da sessão e envio ocasional de mensagens de felicitações a aniversariantes.
- **Princípios de Ergonomia:**
  - Tipografia ampla (base mínima de 16px, botões grandes e legíveis).
  - Alto contraste WCAG AA com a paleta corporativa (malva `#633947`, rosa `#E599A6`, off-white `#FBF8F5`).
  - Navegação ágil: no máximo 2 cliques para acessar qualquer função central.

---

## 3. Limites de Escopo

### 3.1 No Escopo do MVP (Fase 1 + F4.5)
- Autenticação por senha mestra com bloqueio por inatividade (30 minutos) e chave física de recuperação impressa.
- Painel inicial com aniversariantes do dia, mensagens rotativas de boas-vindas e atalhos rápidos.
- Cadastro de pacientes com cálculo automático de idade e status Ativo/Inativo.
- Registro, edição e exclusão de sessões clínicas.
- Agenda semanal e mensal com detecção de conflitos de horário.
- Repositório de documentos gerais por categorias e anexos criptografados de ficha de anamnese no perfil.
- Backup e restauração criptografados com verificação de integridade pós-gravação.

### 3.2 Fora de Escopo (Não Implementar)
- Nenhuma chamada de rede, sincronização em nuvem ou login multiusuário.
- Preenchimento de formulário de anamnese dentro do sistema (permitido apenas o anexo do arquivo digitalizado/PDF).
- Envio automático não supervisionado de mensagens (o sistema apenas gera o link `wa.me` para abertura no WhatsApp com 1 clique).
