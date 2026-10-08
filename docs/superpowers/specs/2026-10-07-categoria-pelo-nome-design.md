# Tarefa 3.8 — Categoria pelo nome

Data: 2026-10-07 · Branch `tarefa-3.8-categoria-pelo-nome`

## 1. Decisões do brainstorming

- Trocar a categoria de um lançamento troca a de **todos os outros com o mesmo
  nome na tela**, em todos os meses e cartões, PDF ou Pluggy.
- "Mesmo nome" = o nome que a lista mostra (`apelido || desc_limpa ||
  desc_origem`), sem diferença de maiúscula nem de espaço sobrando. Não a chave
  da regra aprendida (3 primeiras palavras), que juntaria nomes diferentes.
- **Muda todos**, inclusive os que você já tinha escolhido à mão: vale a última
  escolha.
- **Muda direto e avisa**: "Também mudei 12 lançamentos de "Alane Ferreira"
  para Padaria". Sem outros, sem aviso.
- Fora: trocar o **apelido** não se espalha.

## 2. Regra

Ao mudar a categoria (um lançamento, ou vários pela seleção):

- alvo: os lançamentos do mesmo usuário (`user_id` da sessão), não excluídos
  (`excluido_em is null`), que não são pagamento de fatura (`tipo <>
  'pagamento'`), cujo `chave(nome na tela)` é igual ao de algum lançamento
  alterado;
- `chave(nome) = lower(regexp_replace(btrim(nome), '\s+', ' ', 'g'))`, com
  `nome = coalesce(nullif(apelido, ''), nullif(desc_limpa, ''), desc_origem)`
  — o `nullif` repete o `||` da tela, onde string vazia passa adiante;
- recebem a mesma categoria e `category_fonte = 'manual'` (nem IA nem sync
  desfazem — regra 7);
- o lançamento alterado e os outros mudam no mesmo `db.batch` (uma transação):
  ou muda tudo, ou nada;
- cada `desc_norm` distinto dos outros também ensina a regra aprendida
  (`aprender`), para as variações do nome seguirem nas próximas importações.

A posse vai no `where` dos dois updates (regra 2).

## 3. Rotas e tela

- `PATCH /api/txn/[id]` com `categoria`: responde `{ ok: true, outros: n }`
  (n = quantos além do próprio). Sem `categoria`, `outros: 0`.
- `PATCH /api/txn/bulk`: responde `{ ok: true, alterados, outros }` (outros =
  os que mudaram fora da seleção).
- `Lancamentos.tsx`: depois de salvar, se `outros > 0`, mostra no bloco
  `.aviso` o texto de `textoMudouJunto(outros, nome, categoria)` com um botão
  "OK" que fecha. Na seleção em lote, o nome é omitido: "Também mudei 12
  lançamentos com os mesmos nomes para Padaria".

## 4. Puro e testes

`src/lib/nome-na-tela.ts` (puro): `nomeNaTela(l)` (sai de `Lancamentos.tsx`),
`chaveDoNome(s)` (espelho em TS da chave do SQL) e `textoMudouJunto(n, nome |
null, categoria)`.

Testes em `scripts/testes.ts`:
- `nomeNaTela`: apelido manda; apelido vazio passa ao nome limpo; sem os dois,
  o original.
- `chaveDoNome`: `'  Alane   FERREIRA '` = `'alane ferreira'`.
- `textoMudouJunto`: 0 → null; 1 → singular; 12 → plural; sem nome → "com os
  mesmos nomes".

O SQL não tem teste automático (precisa do banco); a conferência cobre.

## 5. Conferência

Trocar "Alane Ferreira" (ou outro nome recorrente) para Padaria em um mês:
aviso com a contagem; nos outros meses, todos em Padaria; o painel e
Categorias refletem. Pagamento de fatura e excluídos intactos.
