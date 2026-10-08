# Acompanhamento de tarefas

Toda tarefa nova ganha um documento aqui **antes de começar**, e ele é atualizado
enquanto o trabalho anda — não só no fim. O objetivo é que qualquer sessão (sua ou
do Claude Code) saiba, lendo um arquivo só, o que já foi feito, o que falta e por
que algo foi decidido do jeito que foi.

## Arquivos

- `fatia-N.md` — visão da fatia inteira: subfatias, estado de cada uma, link para
  a spec e para o documento de cada tarefa.
- `N.M-nome-curto.md` — uma tarefa (uma subfatia, ou uma correção avulsa).
  Ex.: `3.0-arrumacao-e-dados.md`.

## Regras

1. Criar o documento da tarefa no momento em que ela começa, a partir do modelo
   abaixo, e marcar a tarefa como "em andamento" no `fatia-N.md`.
2. Atualizar o checklist a cada passo concluído, não em lote no fim.
3. Decisão tomada no meio do caminho vai para **Decisões**, com o porquê.
4. Algo que ficou para depois vai para **Pendências**, nunca some em silêncio.
5. A tarefa só é marcada "concluída" depois de `npm run typecheck && npm test &&
   npm run build` passarem e do commit feito — o hash do commit vai no documento.

## Modelo

```markdown
# N.M — título

Início: AAAA-MM-DD · Estado: em andamento | concluída | bloqueada
Spec: docs/superpowers/specs/<arquivo>.md (seção X)
Plano: docs/superpowers/plans/<arquivo>.md

## Objetivo
Uma ou duas frases: o que existe ao fim desta tarefa que não existia antes.

## Checklist
- [ ] passo
- [ ] typecheck, test e build passando
- [ ] commit

## Feito
- AAAA-MM-DD — o que foi feito (arquivos principais)

## Decisões
- decisão — por quê

## Pendências
- o que ficou para depois, e para quando

## Verificação
Comandos rodados e resultado; commit: `<hash>`
```

## Dados pessoais nunca entram no repositório

O repositório é público. Em doc, spec, plano, teste ou comentário use só dados
fictícios: finais de cartão como ••1234, valores redondos, sem nome de titular,
CPF, número de conta ou agência. Dado real fica no banco e no `.env.local`, nunca
no git. PDFs são ignorados (`*.pdf` no `.gitignore`), inclusive relatórios.
