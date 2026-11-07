#!/usr/bin/env python3
import os
import struct
import zlib
import zipfile

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "documentos_teste")

def criar_pdf_simples(caminho, titulo, subtitulo, paragrafos):
    """Gera um arquivo PDF 1.4 válido e bem formatado usando apenas a biblioteca padrão."""
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    
    stream_lines = [
        "BT",
        "/F2 18 Tf",
        "50 780 Td",
        f"({titulo}) Tj",
        "0 -26 Td",
        "/F1 12 Tf",
        f"({subtitulo}) Tj",
        "0 -36 Td",
    ]
    
    for p in paragrafos:
        # Divide parágrafos longos em linhas de no máximo 80 caracteres
        palavras = p.split()
        linhas = []
        linha_atual = []
        for pal in palavras:
            if sum(len(x) + 1 for x in linha_atual) + len(pal) <= 75:
                linha_atual.append(pal)
            else:
                linhas.append(" ".join(linha_atual))
                linha_atual = [pal]
        if linha_atual:
            linhas.append(" ".join(linha_atual))
            
        for l in linhas:
            # Escapa parênteses
            l_esc = l.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            stream_lines.append(f"({l_esc}) Tj")
            stream_lines.append("0 -16 Td")
        stream_lines.append("0 -10 Td")
        
    stream_lines.append("ET")
    content_stream = "\n".join(stream_lines).encode("latin-1", "replace")
    
    objs = []
    # 1: Catalog
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    # 2: Pages
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    # 3: Page
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>")
    # 4: Font F1 (Helvetica)
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    # 5: Font F2 (Helvetica-Bold)
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    # 6: Contents
    objs.append(f"<< /Length {len(content_stream)} >>\nstream\n".encode("ascii") + content_stream + b"\nendstream")
    
    offsets = []
    pdf_out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    
    for i, obj in enumerate(objs, 1):
        offsets.append(len(pdf_out))
        pdf_out.extend(f"{i} 0 obj\n".encode("ascii"))
        pdf_out.extend(obj)
        pdf_out.extend(b"\nendobj\n")
        
    xref_pos = len(pdf_out)
    pdf_out.extend(f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode("ascii"))
    for off in offsets:
        pdf_out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        
    pdf_out.extend(f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
    
    with open(caminho, "wb") as f:
        f.write(pdf_out)

def criar_docx_simples(caminho, titulo, subtitulo, paragrafos):
    """Gera um arquivo DOCX (OpenXML) válido usando zipfile da stdlib."""
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    body_xml = f"""<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>{titulo}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="24"/><w:color w:val="666666"/></w:rPr><w:t>{subtitulo}</w:t></w:r></w:p>
<w:p/>"""

    for p in paragrafos:
        body_xml += f"""<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>{p}</w:t></w:r></w:p>"""

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {body_xml}
    <w:sectPr/>
  </w:body>
</w:document>"""

    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types)
        docx.writestr("_rels/.rels", rels)
        docx.writestr("word/document.xml", document_xml)

def criar_png_simples(caminho, largura=240, altura=160):
    """Gera um arquivo de imagem PNG válido com paleta da identidade visual (malva e rosa)."""
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    
    # Cor de fundo: malva (#AC6E87 -> 172, 110, 135)
    r_bg, g_bg, b_bg = 172, 110, 135
    # Cor do miolo: rosa claro (#E9BFD5 -> 233, 191, 213)
    r_fg, g_fg, b_fg = 233, 191, 213
    
    raw_data = bytearray()
    for y in range(altura):
        raw_data.append(0) # Filtro None
        for x in range(largura):
            # Desenha uma borda e um retângulo interno
            if 15 <= x <= largura - 15 and 15 <= y <= altura - 15:
                raw_data.extend((r_fg, g_fg, b_fg))
            else:
                raw_data.extend((r_bg, g_bg, b_bg))
                
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(bytes(raw_data)))
    iend = chunk(b"IEND", b"")
    
    with open(caminho, "wb") as f:
        f.write(header + ihdr + idat + iend)

def main():
    print(f"Gerando documentos de teste em: {BASE_DIR}")
    
    # 1. MODELOS DE DOCUMENTOS GERAIS
    criar_pdf_simples(
        os.path.join(BASE_DIR, "01_Modelos", "Contrato_Prestacao_Servicos_Psicologia.pdf"),
        "CONTRATO DE PRESTACAO DE SERVICOS PSICOLOGICOS",
        "LC Consultorio de Psicologia - CRP 03/29434",
        [
            "1. DO OBJETO: O presente instrumento tem por objeto a prestacao de servicos de atendimento psicologico clinico individualizado.",
            "2. DO SIGILO PROFISSIONAL: Os atendimentos sao estritamente confidenciais, resguardados pelo Codigo de Etica Profissional do Psicologo (Resolucao CFP no 010/05).",
            "3. DAS SESSOES: As sessoes tem duracao padrao de 50 minutos, com frequencia acordada entre as partes.",
            "4. DOS CANCELAMENTOS: Desmarcacoes e remar his devem ser comunicadas com antecedencia minima de 24 horas.",
            "Local e data: Salvador/BA, 2026."
        ]
    )

    criar_docx_simples(
        os.path.join(BASE_DIR, "01_Modelos", "Ficha_de_Anamnese_Adulto_Modelo.docx"),
        "FICHA DE ANAMNESE CLINICA (ADULTO)",
        "Modelo Padrao para Avaliacao Inicial",
        [
            "DADOS DE IDENTIFICACAO: Nome, Idade, Profissao, Estado Civil, Contatos.",
            "QUEIXA PRINCIPAL: Motivo da procura pelo atendimento, sintomas relatados e tempo de evolucao.",
            "HISTORICO PESSOAL: Desenvolvimento, dinamica familiar, historico medico e tratamentos anteriores.",
            "ROTINA E ESTILO DE VIDA: Padrao de sono, alimentacao, atividades laborais e rede de apoio social.",
            "IMPRESSOES CLINICAS INICIAIS: Objetivos terapeuticos e direcionamento da intervencao."
        ]
    )

    # 2. DOCUMENTOS ADMINISTRATIVOS
    criar_pdf_simples(
        os.path.join(BASE_DIR, "02_Administrativo", "Recibo_Consulta_Psicologica.pdf"),
        "RECIBO DE HONORARIOS PROFISSIONAIS",
        "LC Consultorio de Psicologia Clinica",
        [
            "Declaramos para os devidos fins de comprovacao que recebemos de Paciente Teste a quantia referente aos atendimentos psicologicos clinicos prestados.",
            "Valor total: R$ 200,00 (duzentos reais).",
            "Data de emissao: 02 de novembro de 2026.",
            "Louriedna Costa Pereira - Psicologa Clinica - CRP 03/29434."
        ]
    )

    caminho_decl = os.path.join(BASE_DIR, "02_Administrativo", "Declaracao_de_Comparecimento.txt")
    os.makedirs(os.path.dirname(caminho_decl), exist_ok=True)
    with open(caminho_decl, "w", encoding="utf-8") as f:
        f.write(
            "DECLARAÇÃO DE COMPARECIMENTO\n\n"
            "Declaro para os devidos fins que o(a) paciente compareceu a este consultório de psicologia "
            "no dia 02/11/2026, no período das 14:00 às 14:50, para atendimento psicoterápico.\n\n"
            "Salvador/BA, 02 de novembro de 2026.\n\n"
            "Louriedna Costa Pereira\n"
            "Psicóloga Clínica - CRP 03/29434\n"
        )

    # 3. ANAMNESES PARA ANEXAR AO PERFIL DO PACIENTE (RN65–RN69)
    criar_pdf_simples(
        os.path.join(BASE_DIR, "03_Anamneses_Para_Pacientes", "Anamnese_Clinica_Mariana_Costa.pdf"),
        "ANAMNESE CLINICA COMPLETA - MARIANA COSTA",
        "Prontuario Clinico - Primeira Entrevista",
        [
            "Paciente: Mariana Costa, 32 anos. Escolaridade: Superior Completo.",
            "Queixa Inicial: Sintomatologia ansiosa associada a sobrecarga de trabalho e insonia intermediaria.",
            "Historico Familiar: Relacionamento saudavel com a mae, perda do pai ha tres anos.",
            "Encaminhamentos e Plano de Acao: Introducao de tecnicas de autorregulacao e monitoramento de pensamentos automaticos."
        ]
    )

    criar_docx_simples(
        os.path.join(BASE_DIR, "03_Anamneses_Para_Pacientes", "Relatorio_Escolar_Anamnese_Lucas.docx"),
        "HISTORICO ESCOLAR E DESENVOLVIMENTO INFANTIL - LUCAS",
        "Anexo de Avaliacao e Anamnese",
        [
            "Paciente: Lucas Bissexto (Atendimento Infantil / 10 anos).",
            "Relato da Escola: Bom rendimento pedagogico, com episodios pontuais de dispersao em atividades em grupo.",
            "Observacoes dos Pais: Rotina estruturada em casa, bom convivio com os irmaos.",
            "Estrategia Terapeutica: Ludoterapia e atividades graficas estruturadas."
        ]
    )

    # 4. IMAGEM (PNG)
    criar_png_simples(os.path.join(BASE_DIR, "04_Imagens", "Logo_Consultorio_LC_Cores.png"))

    # 5. ARQUIVOS PARA TESTE DE SEGURANÇA E VALIDAÇÃO (RN42, RN43)
    caminho_exe_fake = os.path.join(BASE_DIR, "05_Testes_de_Seguranca", "Tentativa_Arquivo_Executavel_Disfarcado.pdf")
    os.makedirs(os.path.dirname(caminho_exe_fake), exist_ok=True)
    with open(caminho_exe_fake, "wb") as f:
        # Cabeçalho executável PE/DOS (MZ) renomeado como .pdf para testar a rejeição de magic bytes
        f.write(b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00PE\x00\x00")

    caminho_vazio = os.path.join(BASE_DIR, "05_Testes_de_Seguranca", "Arquivo_Vazio_Teste.pdf")
    with open(caminho_vazio, "wb") as f:
        pass # 0 bytes

    # README GUIA DE TESTES
    readme_path = os.path.join(BASE_DIR, "README.md")
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write("""# Documentos Sintéticos para Testes Manuais

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
- **`Anamnese_Clinica_Mariana_Costa.pdf`**: Vá até o perfil de qualquer paciente cadastrado e anexe este arquivo na seção **Anamnese** (usando o botão "Anexar anamnese" ou arrastando e soltando). Teste as ações **Abrir**, **Baixar** e **Excluir**.
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
""")

    print("Documentos de teste gerados com sucesso!")

if __name__ == "__main__":
    main()
