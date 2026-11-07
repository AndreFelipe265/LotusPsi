# Guia Rápido (1 página) — Como Fazer Backup e Restaurar

**Sistema de Pacientes e Documentos — LC Consultório**  
**Usuária:** Louriedna Costa Pereira (CRP 03/29434)

---

## 1. O que é o arquivo de Backup (`.lcbackup`)?

O **Backup** é uma cópia de segurança única (arquivo `.lcbackup`) que guarda **tudo o que está no seu programa**:
- Todos os **pacientes** (ativos e inativos) e seus dados cadastrais;
- Todo o **histórico de sessões** e os horários da **Agenda**;
- Todos os **documentos gerais** e as **fichas de anamnese** anexadas;
- Suas **configurações** e a mensagem padrão de aniversário.

> **Segurança total:** O arquivo `.lcbackup` é totalmente criptografado. Mesmo que alguém encontre o seu pendrive, ninguém conseguirá abrir os dados sem a sua **Senha Mestra** ou a sua **Chave de Recuperação** impressa em papel.

---

## 2. Como fazer um Backup (passo a passo)

Recomendamos fazer um backup **pelo menos 1 vez por semana** (o programa mostrará um lembrete amigável no painel quando passarem mais de 7 dias).

1. **Clique em "Fazer backup agora":**  
   O botão está disponível logo na tela de **Início** (Painel Inicial) e também em **Configurações**.
2. **Escolha onde salvar:**  
   - O sistema já sugere automaticamente o nome com a data e a hora do dia:  
     `backup-pacientes-AAAA-MM-DD-HHmm.lcbackup`
   - Conecte o seu **pendrive** (ou escolha uma pasta segura, como a pasta do Google Drive no computador) e informe o caminho, ou mantenha o nome sugerido para salvar na sua pasta **Downloads** e depois copie o arquivo para o pendrive.
3. **Clique em "Salvar backup":**  
   O programa criará o arquivo e fará automaticamente uma **verificação de integridade** para garantir que a cópia abre perfeitamente. Ao final, aparecerá a mensagem verde confirmando onde o arquivo foi salvo.

---

## 3. Como Restaurar um Backup (em caso de troca de computador ou imprevisto)

Se você trocar de computador ou precisar recuperar seus dados a partir de um arquivo `.lcbackup`:

1. Abra o menu lateral **Configurações** e role até **"Restaurar cópia de segurança"**.
2. Clique em **"Escolher arquivo .lcbackup"** e selecione o arquivo de backup salvo no seu pendrive ou computador.
3. No campo **"Senha ou chave de recuperação do backup"**, digite:
   - A **Senha Mestra** que você usava quando fez aquele backup; **OU**
   - A sua **Chave de Recuperação de 24 caracteres** (aquela impressa em papel, no formato `ABCD-EFGH-...`).
4. Clique em **"Verificar arquivo de backup"**:  
   O sistema mostrará um quadro com a **data do backup** e a quantidade exata de **pacientes**, **documentos**, **fichas de anamnese** e **agendamentos** contidos nele.
5. Clique em **"Restaurar este backup"** e depois em **"Sim, substituir dados e restaurar"**:  
   - **Proteção automática:** Antes de substituir qualquer informação, o sistema cria sozinho uma cópia de segurança dos dados atuais na pasta `backups_automaticos`.
   - Em poucos segundos, todos os seus pacientes, sessões, agenda e documentos estarão de volta!

---

## 4. Três dicas de ouro

1. **Guarde o backup fora do computador:** Salve sempre uma cópia do arquivo `.lcbackup` em um **pendrive** guardado em local seguro.
2. **Cuide do papel da Chave de Recuperação:** Se você esquecer a senha mestra, a folha impressa com os 24 caracteres abre tanto o programa quanto qualquer backup antigo.
3. **Nunca apague backups antigos imediatamente:** Mantenha pelo menos os últimos 2 ou 3 arquivos `.lcbackup` no pendrive.
