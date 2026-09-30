# Raio-X — instruções para o Claude Code

App pessoal de finanças: Open Finance (Pluggy) + faturas em PDF, uma instalação
por pessoa, repositório público sob AGPL-3.0.

**Leia `docs/plano-tecnico.md` antes de mudanças estruturais.** Ele tem o esquema
do banco, as rotas, o mapeamento do Pluggy, a regra de deduplicação, as decisões
de segurança e a ordem das sete fatias. O que está aqui é o resumo operacional.

## Comandos

```bash
npm run dev        # http://localhost:3000
npm test           # lógica pura: senha, sessão, descrição, dedupe, extração
npm run typecheck
npm run build      # SKIP_ENV_VALIDATION=1 quando não houver .env.local
npm run db:migrate # aplica drizzle/*.sql na ordem
npm run hash-senha # gera APP_PASSWORD_HASH e SESSION_SECRET
npm run conectores # regenera a lista de bancos no README (precisa da chave do Pluggy)
```

Antes de dar qualquer tarefa por concluída: `npm run typecheck && npm test && npm run build`.

## Estado

Fatias 1 e 2 prontas (esqueleto, banco, login; importação de PDF, categorias
aprendidas, lista editável). Fatia 3 é o painel em SQL; 4 é o Pluggy.

## Regras que não se negociam

Estas saíram de decisões tomadas com o dono do projeto. Se alguma atrapalhar,
discuta antes de contornar.

1. **`user_id` vem sempre da sessão** (`exigirUsuario()`), nunca de parâmetro,
   query ou corpo — mesmo com um usuário só.
2. **Posse dentro do `where`, nunca num `if`.** `update ... where id = $1 and
   user_id = $2`. Um `select` seguido de checagem é onde o IDOR nasce.
3. **Nenhuma variável `NEXT_PUBLIC_`.** Chave de Pluggy e de OpenRouter só no
   servidor. O repositório é público.
4. **Tudo que vai para a IA passa por `src/lib/ia.ts`.** Sem id, saldo, limite,
   CPF ou nome de titular. É o único ponto onde dado sai da infraestrutura.
5. **CPF e nome do titular não são gravados**, mesmo o Pluggy entregando.
6. **Exclusão é lógica** (`excluido_em`). O sync não pode ressuscitar o que o
   usuário apagou; por isso o upsert tem `where txn.excluido_em is null`.
7. **Categoria com `category_fonte = 'manual'` nunca é sobrescrita** pela IA nem
   pelo sync.
8. **O PDF não sobe.** `pdf.js` roda no navegador; só o texto vai ao servidor.
9. **Nenhuma chamada de modelo dispara por navegação** — só dado novo ou botão.

## Convenções

- Código, comentários, nomes de variável e mensagens de commit em **português**.
- Comentário explica **por quê**, não o quê. Se não há porquê, não há comentário.
- Nomes de coluna em `snake_case`; propriedades em TypeScript em `camelCase`
  (o Drizzle faz a ponte em `src/db/schema.ts`).
- Migração nova = arquivo novo em `drizzle/`, numerado. Nunca editar migração já
  aplicada.
- Teste novo entra em `scripts/testes.ts` (sem framework, roda em qualquer lugar).
- Erro que o usuário causou → `ErroDeUso` (vira 400/404). Qualquer outro → 503
  com o detalhe só no log, nunca na resposta.

## Armadilhas já pagas

- **`$` em arquivo `.env`**: o Next expande `$VAR`. Por isso `APP_PASSWORD_HASH`
  usa `:` como separador. Não "arrume" isso de volta.
- **scrypt truncado**: a saída com `dkLen` menor é prefixo da maior, então o
  comprimento derivado é fixo em 32 bytes — não pode vir do valor guardado.
- **Cliente do Neon é preguiçoso**: conecta na primeira consulta, não na
  importação do módulo, senão o `next build` quebra em CI sem banco.
- **`@neondatabase/serverless` 1.x exige drizzle-orm ≥ 0.45.** Versões antigas
  chamam `neon()` como função e estouram.
- **Limite de tempo da Vercel**: a importação lê um pedaço por requisição
  (`/api/import/trecho`), não os oito de uma vez.
- **Não marque com `server-only`** módulos que são só funções puras — isso
  impede os testes de importá-los sem proteger nada.

## Categorias

A lista em `src/lib/categorias.ts` e `drizzle/0001_categorias.sql` é a do app
antigo, de propósito: as regras aprendidas e os PDFs já importados estão presos a
esses nomes. Não "melhore" o vocabulário.

## Segurança

`docs/security-audit/prompt-auditoria.md` tem o roteiro de auditoria das cinco
categorias, mapeado para esta stack. Rodar no fim da fatia 4 e antes de tornar o
repositório público.
