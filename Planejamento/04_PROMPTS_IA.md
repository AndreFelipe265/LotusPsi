# Prompts prontos para IA

## Prompt padrão (por tarefa)
```
Leia integralmente Planejamento/01_FONTE_DA_VERDADE.md — ele é a verdade absoluta deste projeto.
Depois leia Planejamento/02_ARQUITETURA.md e a tarefa [F?-T?] em Planejamento/03_ROADMAP.md.

Implemente SOMENTE a tarefa [F?-T?]. Regras:
- Não contradiga a Fonte da Verdade. Se algo não estiver definido, pare e me pergunte.
- Cumpra a "Definição de Pronto" (seção 11).
- Escreva/atualize os testes indicados e rode-os.
- Ao final, marque a tarefa como [x] no 03_ROADMAP.md e resuma o que foi feito
  e qualquer decisão que precise entrar na seção 12 da Fonte da Verdade.
```

## Prompt para uma fase inteira
```
Leia Planejamento/01_FONTE_DA_VERDADE.md (verdade absoluta), 02_ARQUITETURA.md e a fase [F?] do 03_ROADMAP.md. Leia tudo caso necessario.
Execute as tarefas da fase [F?] em ordem, uma de cada vez, rodando testes ao final de cada uma
e marcando o checklist. Pare ao final da fase e me mostre os critérios de aceite verificados.
```

## Prompt de revisão
```
Leia Planejamento/01_FONTE_DA_VERDADE.md. Revise o código atual e liste toda divergência
em relação às regras de negócio (RNxx), ao modelo de segurança (seção 7) e às proibições.
Não altere nada; apenas relate com arquivo e linha.
```

## Prompt para mudança de requisito
```
A usuária pediu: "<pedido>". Analise o impacto na Planejamento/01_FONTE_DA_VERDADE.md,
proponha a alteração exata do texto (regras, modelo de dados, telas, roadmap) e aguarde minha aprovação
antes de editar qualquer arquivo ou código.
```
