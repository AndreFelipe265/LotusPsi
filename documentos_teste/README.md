# Documentos Sintéticos para Testes Manuais

Esta pasta contém arquivos fictícios e sintéticos preparados especialmente para você testar todas as funcionalidades das telas **Documentos (T09)** e **Perfil do Paciente (T07 — Seção Anamnese)**.

> **Importante:** Nenhum arquivo contém dados reais de pacientes ou terceiros, respeitando a LGPD e o Código de Ética Profissional (CFP).

---

## Estrutura das Pastas e Casos de Teste

### 📁 `01_Modelos/`
- **`Contrato_Prestacao_Servicos_Psicologia.pdf`**: Teste de envio de PDF na categoria *Modelos*.
- **`Ficha_de_Anamnese_Adulto_Modelo.docx`**: Teste de envio de DOCX (Word) na categoria *Modelos*.

### 📁 `02_Administrativo/`
- **`Recibo_Consulta_Psicologica.pdf`**: Teste de envio de recibo na categoria *Administrativo*.
- **`Declaracao_de_Comparecimento.txt`**: Teste de envio de documento em texto puro (`.txt`).

### 📁 `03_Anamneses_Para_Pacientes/`
- **`Anamnese_Clinica_Mariana_Oliveira.pdf`**: Vá até o perfil de qualquer paciente cadastrado e anexe este arquivo na seção **Anamnese** (usando o botão "Anexar anamnese" ou arrastando e soltando). Teste as ações **Abrir**, **Baixar** e **Excluir**.
- **`Relatorio_Escolar_Anamnese_Lucas.docx`**: Teste de anexo de documento Word (`.docx`) no perfil de paciente infantil.

### 📁 `04_Imagens/`
- **`Logo_Consultorio_LC_Cores.png`**: Teste de envio de imagem PNG com as cores da identidade visual (malva e rosa).

### 📁 `05_Testes_de_Seguranca/`
- **`Tentativa_Arquivo_Executavel_Disfarcado.pdf`**: Arquivo executável (`.exe`) renomeado para `.pdf`.
  - **Resultado esperado ao tentar enviar:** O sistema deve **recusar** o envio e informar com mensagem amigável que o conteúdo do arquivo não corresponde a um formato `.pdf` válido (validação de *magic bytes* — RN42).
- **`Arquivo_Vazio_Teste.pdf`**: Arquivo com 0 bytes.
  - **Resultado esperado ao tentar enviar:** O sistema deve **recusar** com o aviso: *"O arquivo selecionado está vazio."*

---

## O que testar no app:

1. **Arrastar e Soltar (Drag & Drop):**
   - Arraste qualquer um dos arquivos acima para a área pontilhada na tela **Documentos** ou na seção **Anamnese** do perfil.
2. **Abertura Segura:**
   - Clique em **Abrir** em um documento enviado: o arquivo abrirá no leitor padrão (ex.: Leitor de PDF do sistema ou Word) através de uma cópia temporária descriptografada.
3. **Download com Verificação de Integridade:**
   - Clique em **Baixar** e salve em qualquer pasta do computador (ou na pasta Downloads).
4. **Gerenciamento de Categorias:**
   - Na tela Documentos, clique em **Gerenciar categorias**, crie uma nova categoria (ex.: *Declarações*), renomeie ou tente excluir uma categoria que contenha documentos (o sistema impedirá a exclusão de categoria não vazia).
