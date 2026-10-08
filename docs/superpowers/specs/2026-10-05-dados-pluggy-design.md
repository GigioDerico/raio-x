# Tarefa 4.2a — Dados do Pluggy limpos

Data: 2026-10-05 · Base: 4.1/4.1b/4.1c (sync por cartão, categorização por IA) · Branch `tarefa-4.2a-dados-pluggy`

## 1. Ponto de partida (dados reais, leitura em 2026-10-05)

- `description` e `descriptionRaw` do Pluggy vêm iguais, com cidade e país
  colados ("SUPERMERCADO CANDIO OLNAZARE PAULISBR", "50217721MichelATIBAIABR");
  `merchant` vem nulo. Regra fixa erra muito.
- Lançamentos da fatura aberta vêm sem `billId` e caem no mês da compra: no
  ••4444, 24 compras de 17–25/09 pertencem à fatura que vence em novembro e
  aparecem em setembro. A bill traz `billClosingDate`, que o app não grava.
- `financeCharges` vem vazio; IOF e juros já chegam como lançamentos.
- A 4.2 foi dividida: **4.2a** (esta), 4.2b (PDF × Pluggy: aviso de mês coberto,
  tela de suspeitos), 4.2c (dia contra dia, projeção do mês corrente).

## 2. Decisões do brainstorming

- **Nome limpo pela IA, na mesma chamada da categoria** (dado novo, regra 9).
- `financeCharges` sai do escopo (vazio; encargos já são lançamentos).

## 3. Nome limpo

### Banco — `drizzle/0009_desc_limpa.sql`

```sql
-- Nome do estabelecimento sem cidade, país nem código, dado pela IA para o que vem
-- do Pluggy ("SUPERMERCADO CANDIO OLNAZARE PAULISBR" → "Supermercado Candio"). O
-- desc_origem fica como veio: dedupe e regras aprendidas continuam presos a ele.
alter table txn add column if not exists desc_limpa text;
```

`schema.ts`: `descLimpa: text('desc_limpa')`. Aplicada só com autorização do dono.

### Pedido e leitura — `src/lib/ia.ts`

- `promptCategorizar` passa a pedir `{"categorias": [{"i": 0, "categoria": "…",
  "nome": "…"}]}`, com a regra: "nome: o estabelecimento, sem cidade, país,
  códigos nem número de parcela, até 40 caracteres, com maiúsculas normais".
- O item do pedido passa a levar `semDocumentos(desc_origem)` em vez de
  `desc_norm`: a normalização tira maiúsculas e minúsculas, e é por elas que se
  separa "AgenaPastel" de "ATIBAIA"; `semDocumentos` (7.1) tira CPF e números
  longos antes (regra 4). Vale também para a categoria (melhor sinal).
- `lerCategorias(dados, n)` passa a devolver `{ categoria: string | null; nome:
  string | null }[]`; `nome` só se for string, aparado, 1–40 caracteres (corta em
  40), sem quebra de linha.

### Gravação — `categorizar-repo.ts`

- Vão à IA os lançamentos **recém-inseridos** da conta (os ids que o sync
  devolve) que estão **sem categoria ou sem `desc_limpa`** — inclusive os que a
  regra aprendida já categorizou, só para ganhar o nome.
- Dois `update`s por lote, cada um com as próprias travas:
  - categoria: só onde `category_id` é nulo e `category_fonte = 'ia'` (regra 7,
    como hoje);
  - nome: só onde `desc_limpa` é nulo (a IA nunca troca um nome já dado).

### Exibição — `nomeExibido` e afins

Ordem: `apelido` → `desc_limpa` → `desc_origem`. Pontos:
- `src/lib/txn-repo.ts` (lista de Lançamentos) e `dados-repo.ts` (CSV, coluna
  "meu nome"): selecionar `descLimpa`;
- `src/components/Lancamentos.tsx` `nomeNaTela`;
- `src/lib/painel-repo.ts` / `adaptador.ts`: `Lanc.desc` continua sendo o
  `desc_origem` — os apelidos aprendidos são achados por ele — e o nome limpo
  vai à parte, em `Lanc.limpa`, **só para mostrar**: `nomeExibido` o usa no fim
  da ordem, e com isso painel, maiores lançamentos e os pedidos de
  resumo/diagnóstico/conversa saem com o nome limpo (para a IA, passado por
  `semDocumentos`, como a descrição crua).
- As chaves de recorrente, de fixo e de parcela repetida (`normDesc(nome)` em
  `recorrentes`, `classeLanc` e `parcelasInfo`) **não** usam o nome limpo
  (`nomeExibido(ctx, l, false)`): é texto da IA e varia entre lotes ("Netflix" ×
  "Netflix.com"), o que dividiria uma recorrência e mudaria a regra portada. O
  rótulo das recorrentes sai do mesmo nome, porque os fixos são achados por
  `normDesc(r.desc)`.

### Os 219 já gravados — `scripts/limpar-nomes.ts`

Script único (`npm run limpar-nomes`), roda por usuário: lançamentos `fonte =
'pluggy'` com `desc_limpa` nula, em lotes de 60, mesmo pedido; só grava
`desc_limpa` (categoria fica como está); registra o custo em `ai_uso` com
`kind = 'categorizar'`. Roda **só com autorização do dono** (reprocessa dado
antigo).

## 4. Fatura aberta no mês certo

- `faturaDaBill` passa a devolver `fechamento` (`billClosingDate`, dia de
  calendário, sem fuso); `gravarFaturas` grava `statement.fechamento`.
- `mesDaFaturaAberta(faturas, dataLancamento)` (puro, `mapear.ts`): com as
  faturas mapeadas da conta, a última por vencimento; se `dataLancamento` >
  fechamento dela (ou, sem fechamento, > vencimento − 7 dias), o lançamento é da
  fatura seguinte: `mesRef` = mês da última + 1, `vencimento` estimado = mesmo
  dia no mês seguinte; senão `null` (fica como hoje).
- **No máximo um ciclo**: mais de 35 dias depois do corte também dá `null` — a
  lista de faturas está incompleta, e sem o limite meses de compras cairiam
  todos num mês só.
- **Pela data do lançamento, não da compra**: na parcela, `data` é a compra
  original (`purchaseDate`), que nunca passa do corte. `Recebido` ganha
  `dataLancamento` (`date` do Pluggy no fuso de São Paulo; sem ela, `data`), e
  só a decisão da fatura aberta a usa (`faturasAbertasDosRecebidos`); dedupe e
  planejador continuam em `data`.
- `sincronizarConta`: para recebidos sem `billId` cuja fatura aberta é
  determinada, garante uma `statement` `status = 'aberta'`, sem
  `pluggy_bill_id`, naquele `mes_ref` (upsert por `(account_id, mes_ref)`, sem
  sobrescrever uma existente) e liga o lançamento a ela.
- Quando o Pluggy fechar a fatura, o upsert de `gravarFaturas` (conflito em
  `(account_id, mes_ref)`) passa a gravar também `status = 'fechada'` e o
  `fechamento`; o `pluggy_bill_id` entra pelo `coalesce` que já existe. O
  conflito só atualiza a linha sem `pluggy_bill_id` ou com o mesmo (`setWhere`):
  se o mês já é de outra bill, nada é sobrescrito, fica um aviso no log e os
  lançamentos dessa bill ficam sem statement.
- Fatura em PDF importada para o mês de uma `'aberta'` a fecha (`status =
  'fechada'` no conflito de `faturaDoPdf`).

## 5. Duas faturas no mesmo mês

`mesesDasFaturas(faturas)` (puro): ordena por vencimento; se duas caem no mesmo
`mesRef`, a de vencimento mais tarde passa para o mês seguinte (e assim em
cadeia). `gravarFaturas` usa o `mesRef` ajustado.

## 6. Segurança

- IA só recebe índice, data, valor e a descrição original sem documentos (`semDocumentos`, regra 4); `desc_limpa` vem dela
  e é texto não confiável: só exibido como texto (React escapa), limitado a 40.
- Posse no `where` em toda escrita; categoria manual intacta (regra 7).
- Script de limpeza: lê e grava de todos os usuários da instalação (posse no
  `where` de cada `update`), com autorização.

## 7. Testes (`scripts/testes.ts`)

- `promptCategorizar` pede `nome`; `lerCategorias` com nome válido, longo (corta
  em 40), vazio, não-string, com quebra de linha.
- `mesDaFaturaAberta`: compra depois do fechamento → mês seguinte; antes → `null`;
  sem fechamento → regra do vencimento − 7; virada de ano; 30 dias depois do
  corte → mês seguinte, 36 → `null`.
- `faturasAbertasDosRecebidos` decide pela `dataLancamento` (parcela antiga
  lançada agora cai na aberta).
- `mesesDasFaturas`: sem colisão; duas no mesmo mês; três em cadeia.
- `faturaDaBill` com `fechamento`.

## 8. Conferência

Migração 0009 aplicada; rodar `limpar-nomes` (autorizado); Lançamentos com
nomes limpos; as compras pendentes do ••4444 em nov/26; "Atualizar agora" sem
duplicar; maiores lançamentos do painel com nome limpo.
