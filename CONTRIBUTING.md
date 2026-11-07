# Como Contribuir

Guia de desenvolvimento para o **LotusPsi (Sistema de Pacientes e Documentos — LC Consultório)**.

> **Antes do primeiro commit, leia atentamente o [`AGENTS.md`](AGENTS.md).**
> Ele contém as regras inegociáveis do repositório, o mapa de responsabilidades, as convenções e
> as armadilhas já mapeadas.

---

## 1. Ramos (Branches)

O ramo `master` (ou `main`) é protegido. Toda alteração deve passar por um ramo de tópico:

| Prefixo | Uso | Exemplo |
|---|---|---|
| `feat/` | Nova funcionalidade ou tarefa do Roadmap | `feat/f4.5-agenda` |
| `fix/` | Correção de defeito | `fix/bloqueio-inatividade` |
| `docs/` | Somente documentação | `docs/atualiza-adrs` |
| `test/` | Criação ou expansão de testes | `test/valida-backups` |
| `spike/` | Investigação ou prova de conceito técnica | `spike/sqlcipher-wal` |
| `chore/` | Manutenção, dependências e configurações | `chore/atualiza-ci` |

---

## 2. Padrão de Commits

Formato: `<tipo>(<escopo opcional>): <descrição clara>`

Tipos permitidos: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `build`

### Diretrizes:
1. Mensagens em português.
2. Explique o **porquê** no corpo da mensagem quando a motivação não for óbvia (o "o quê" já está no diff).
3. Cite as tarefas do roadmap ou regras de negócio relacionadas (ex.: `[F4.5-T3]`, `(RN71)`).
4. **Sem trailers de IA:** Nunca inclua `Co-authored-by: ...` ou `Generated with ...` de assistentes de IA.

Exemplo de commit bem formatado:
```
feat(agenda): tela T11 (semana/mes) e item Agenda no menu [F4.5-T3]

Permite visualizar agendamentos em grade semanal ou mensal, navegar entre
periodos e alternar visualizacoes conforme RN71.
```

---

## 3. Pull Requests

1. Crie o PR a partir do ramo da funcionalidade.
2. Siga o modelo de Pull Request em [`.github/pull_request_template.md`](.github/pull_request_template.md).
3. Descreva o que mudou, o que não mudou e como testar.
4. Para fechar automaticamente uma issue no GitHub, utilize a palavra-chave em inglês:
   `Closes #12` (evite "fecha #12", pois o GitHub não reconhece em português).
5. Certifique-se de que a CI e todos os testes locais estejam verdes antes de mesclar.

---

## 4. Definition of Done (Critérios de Conclusão)

Uma tarefa só é considerada concluída quando:

- [ ] Critérios de aceite especificados no Roadmap (`Planejamento/03_ROADMAP.md`) forem atendidos.
- [ ] Testes unitários do frontend executados e aprovados (`npm test -- --run`).
- [ ] Testes unitários do backend Rust executados e aprovados (`cargo test`).
- [ ] Nenhuma chamada externa de rede ou dependência de nuvem adicionada.
- [ ] Nenhum dado real de paciente incluído em código ou arquivos de teste.
- [ ] Documentação e Fonte da Verdade (`Planejamento/01_FONTE_DA_VERDADE.md`) atualizadas quando houver nova decisão.
- [ ] Checklist do Roadmap atualizado com a marcação `[x]` e o hash do commit.
