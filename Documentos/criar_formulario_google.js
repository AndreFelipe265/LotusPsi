/**
 * COMO USAR ESTE SCRIPT PARA CRIAR O GOOGLE FORMS AUTOMATICAMENTE:
 * 
 * 1. No seu navegador, acesse: https://script.new (faça login na sua conta Google).
 * 2. Apague o código que estiver lá e cole todo o conteúdo deste arquivo.
 * 3. Clique no botão "Executar" (ícone de play ▶️) no menu superior.
 * 4. O Google pedirá uma autorização rápida na primeira vez (clique em "Revisar permissões" -> escolha sua conta -> "Avançado" -> "Acessar (não seguro)").
 * 5. Pronto! O formulário será criado automaticamente no seu Google Drive.
 * 6. Na aba "Registro de execução" (parte inferior da tela), aparecerão dois links:
 *    - Link para editar o formulário
 *    - Link para enviar para sua mãe responder (pelo WhatsApp ou e-mail)!
 */

function criarFormularioRequisitos() {
  var form = FormApp.create('Questionário — Sistema de Pacientes e Documentos');
  
  form.setDescription(
    'Olá! Este questionário tem o objetivo de entender sua rotina e preferências práticas para ajustarmos o sistema exatamente ao que você precisa no dia a dia, sem complicações técnicas.\n\n' +
    'Não há respostas certas ou erradas: marque as opções que melhor refletem o seu trabalho.'
  );
  
  // ==========================================
  // SEÇÃO 1
  // ==========================================
  form.addPageBreakItem()
      .setTitle('1. Onde e Como Você Usará o Sistema');
  
  form.addMultipleChoiceItem()
      .setTitle('1.1 Em qual ambiente você prefere utilizar o sistema no dia a dia?')
      .setChoiceValues([
        'Apenas no meu computador principal (funciona 100% offline sem internet, mais seguro, rápido e privativo)',
        'Pela internet (para conseguir acessar de outro computador ou celular/tablet quando estiver fora)',
        'Não tenho certeza ainda, podemos conversar e decidir juntos a melhor alternativa'
      ])
      .setRequired(true);
  
  form.addMultipleChoiceItem()
      .setTitle('1.2 Outras pessoas têm acesso ao computador onde você usará o sistema?')
      .setChoiceValues([
        'Não, o computador é de uso exclusivo meu',
        'Sim, familiares ou colegas de trabalho também utilizam o computador'
      ])
      .setRequired(true);
  
  // ==========================================
  // SEÇÃO 2
  // ==========================================
  form.addPageBreakItem()
      .setTitle('2. Cadastro dos Pacientes')
      .setHelpText('Campos básicos já previstos: Nome completo, Telefone, Endereço, Data de Nascimento e Nome do Pai.');
  
  form.addMultipleChoiceItem()
      .setTitle('2.1 Qual é o perfil principal do seu público atendido?')
      .setChoiceValues([
        'Apenas adultos',
        'Crianças / Adolescentes',
        'Todas as faixas etárias'
      ])
      .setRequired(true);
  
  form.addCheckboxItem()
      .setTitle('2.2 Quais outras informações você realmente precisa anotar no cadastro?')
      .setHelpText('Marque todas as opções que forem úteis na sua rotina.')
      .setChoiceValues([
        'Nome da mãe / Responsável legal',
        'Contato de emergência (outro telefone)',
        'WhatsApp ou E-mail para recados',
        'CPF ou RG do paciente / responsável',
        'Profissão / Ocupação (ou Escola / Série para crianças)',
        'Motivo da procura / Queixa principal',
        'Convênio ou Particular (ou valor da sessão)',
        'Anotações / Observações livres'
      ])
      .showOtherOption(true);
  
  form.addMultipleChoiceItem()
      .setTitle('2.3 Quando um paciente encerra os atendimentos (alta ou desistência), o que prefere?')
      .setChoiceValues([
        'Ficar marcado como "Inativo" (sai da lista do dia a dia, mas mantém todo o histórico guardado para consulta)',
        'Continuar na lista normal junto com os pacientes em atendimento'
      ])
      .showOtherOption(true)
      .setRequired(true);
  
  // ==========================================
  // SEÇÃO 3
  // ==========================================
  form.addPageBreakItem()
      .setTitle('3. Histórico das Sessões (Atendimentos)')
      .setHelpText('Regra combinada: cada atendimento terá um registro rápido com Data + Resumo curto de 4 a 5 linhas.');
  
  form.addCheckboxItem()
      .setTitle('3.1 Além da data e do resumo, você precisa anotar algum destes dados em cada atendimento?')
      .setChoiceValues([
        'Horário de início / término da sessão',
        'Status de presença (ex: compareceu, faltou justificado, desmarcou)',
        'Apenas a Data e o Resumo curto já atendem perfeitamente minha rotina'
      ]);
  
  form.addMultipleChoiceItem()
      .setTitle('3.2 Se cometer um erro de digitação ao salvar o resumo, deve ser permitido editar depois?')
      .setChoiceValues([
        'Sim, quero poder corrigir o texto quando necessário',
        'Não, o registro deve ficar travado após salvar'
      ])
      .setRequired(true);
  
  form.addMultipleChoiceItem()
      .setTitle('3.3 Você precisa gerar um arquivo PDF ou imprimir o histórico de sessões de um paciente?')
      .setChoiceValues([
        'Sim, é importante poder gerar um relatório ou resumo impresso/PDF quando solicitado',
        'Raramente ou não vejo necessidade disso'
      ])
      .setRequired(true);
  
  // ==========================================
  // SEÇÃO 4
  // ==========================================
  form.addPageBreakItem()
      .setTitle('4. Documentos Gerais de Trabalho')
      .setHelpText('Área independente para guardar arquivos de uso frequente (não vinculados a um paciente específico).');
  
  form.addCheckboxItem()
      .setTitle('4.1 Que tipos de documentos você pretende armazenar nessa área?')
      .setChoiceValues([
        'Modelos de documentos (relatórios padrão, declarações, contratos de atendimento)',
        'Artigos, textos científicos e materiais de estudo / leitura',
        'Planilhas de controle ou comprovantes administrativos'
      ])
      .showOtherOption(true);
  
  form.addMultipleChoiceItem()
      .setTitle('4.2 Como prefere que esses documentos fiquem organizados na tela?')
      .setChoiceValues([
        'Categorias simples (ex: "Modelos", "Estudos", "Administrativo")',
        'Pastas personalizadas (como as pastas normais do computador)',
        'Apenas uma lista direta com campo de busca pelo nome do arquivo'
      ])
      .setRequired(true);
  
  // ==========================================
  // SEÇÃO 5
  // ==========================================
  form.addPageBreakItem()
      .setTitle('5. Segurança, Senha e Bloqueio de Tela');
  
  form.addMultipleChoiceItem()
      .setTitle('5.1 Se você se afastar do computador, após quanto tempo de inatividade o sistema deve bloquear?')
      .setChoiceValues([
        '10 minutos',
        '15 minutos',
        '30 minutos',
        'Não precisa bloquear sozinho'
      ])
      .setRequired(true);
  
  form.addMultipleChoiceItem()
      .setTitle('5.2 Guarda da Chave de Segurança em Papel:')
      .setHelpText('Como todos os dados estarão protegidos e criptografados, se a senha for esquecida não haverá como redefini-la sem uma chave de segurança.')
      .setChoiceValues([
        'Concordo em guardar uma "chave de emergência" impressa em papel em local seguro e confidencial',
        'Gostaria de entender melhor como isso funciona antes de decidir'
      ])
      .setRequired(true);
  
  // ==========================================
  // SEÇÃO 6
  // ==========================================
  form.addPageBreakItem()
      .setTitle('6. Cópias de Segurança (Backup)');
  
  form.addMultipleChoiceItem()
      .setTitle('6.1 Onde prefere salvar as cópias de segurança automáticas?')
      .setChoiceValues([
        'Cópia automática em um Pendrive ou HD externo conectado ao computador',
        'Cópia criptografada em uma pasta pessoal na nuvem (Google Drive, OneDrive ou Dropbox)',
        'Prefiro que você me ajude a configurar a opção mais prática e automática'
      ])
      .setRequired(true);
  
  form.addMultipleChoiceItem()
      .setTitle('6.2 Com que frequência gostaria que essas cópias fossem salvas?')
      .setChoiceValues([
        'Automaticamente ao fechar o sistema todos os dias',
        'Semanalmente (com um lembrete do sistema)',
        'Através de um botão simples na tela para eu fazer quando achar necessário'
      ])
      .setRequired(true);
  
  // ==========================================
  // SEÇÃO 7
  // ==========================================
  form.addPageBreakItem()
      .setTitle('7. Primeiros Passos e Prioridades');
  
  form.addMultipleChoiceItem()
      .setTitle('7.1 Se liberarmos o sistema aos poucos para teste, qual funcionalidade é mais urgente para você?')
      .setChoiceValues([
        'Cadastro dos pacientes e registro das sessões diárias',
        'Organização e armazenamento dos documentos gerais'
      ])
      .setRequired(true);
  
  form.addParagraphTextItem()
      .setTitle('7.2 Tem algum detalhe importante da sua rotina clínica que não foi mencionado?')
      .setHelpText('Espaço livre para anotações, sugestões ou dúvidas.');
  
  console.log('----------------------------------------------------');
  console.log('✅ FORMULÁRIO CRIADO COM SUCESSO!');
  console.log('👉 LINK PARA ENVIAR PARA SUA MÃE RESPONDER:');
  console.log(form.getPublishedUrl());
  console.log('👉 LINK PARA VOCÊ VER AS RESPOSTAS / EDITAR:');
  console.log(form.getEditUrl());
  console.log('----------------------------------------------------');
}
