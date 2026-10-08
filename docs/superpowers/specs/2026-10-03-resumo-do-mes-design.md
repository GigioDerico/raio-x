# Tarefa 7.1 — Resumo do mês por IA

Data: 2026-10-03 · Guia: [`docs/guia-de-construcao.md`](../../guia-de-construcao.md) (Painel: "Resumo — três ou quatro frases escritas pela IA — fatia 7") · Plano técnico: seção "IA: automático × sob demanda"
Legado: `docs/legado/app-antigo.html` — `dadosResumo`, `promptResumo`, `garantirResumo`, `renderResumo` (:1128-1244)

## 1. Decisões do brainstorming

- **Só por botão.** Nada gera resumo sozinho (regra 9 do CLAUDE.md). O legado
  gerava ao abrir o painel; isso sai.
- **Vale para o recorte da tela** (mês × cartões × obra).
- **O cartão vai ao prompt como apelido ou banco, sem os quatro dígitos**
  (regra 4; o legado mandava "Nubank ••1234").
- **Resposta pedida em JSON** (`{"texto": "…"}`) para reusar `pedirJson`, com
  o modelo escolhido, o fallback e o registro de custo em `ai_uso` da 3.7.
- **A assinatura é o hash do próprio prompt.** O legado usava
  `total|nº de lançamentos|nº de cartões`, que não muda quando se corrige uma
  categoria; o hash do prompt muda com qualquer dado que a IA veria.

## 2. Dados e prompt

### `dadosResumo(ctx)` — puro, `src/lib/calculos/resumo.ts`

Porta de `dadosResumo` do legado sobre o `Contexto` já filtrado (cartões e obra
vêm do adaptador): `m = mesAtual(ctx)`, `linhas = lancsDoMes(ctx, m)`, `total`,
`cats` (de `porCategoria`, só positivas, em ordem decrescente), `prevM =
mesAnterior(ctx, m)`, `prevCats`, `prevTot` (de `porMes`), `porCartao` (de
`cartoesInfo`, total do mês por cartão, sem zero, maior primeiro). O nome do
cartão é `nomeCartao` **sem** o sufixo `••last4`.

### `promptResumo(d, ctx)` — `src/lib/ia.ts`

Texto do legado (`app-antigo.html:1150-1180`), com `moeda`/`rotuloMes`/`pct` no
lugar de `money`/`mesLabel`/`pct` e as linhas: mês; cartões com total; total e
comparação com o mês anterior; até 7 categorias com variação ("novo" quando não
havia); encargos (`encargosDoMes`) quando > 0; já contratado × decidido no mês
(`composicaoMes`); "próximo mês já começa em" (`projecao`, quando ainda não há o
mês seguinte); parcelas a vencer (`parcelasInfo`); fixos (`recorrentesFixas`);
6 maiores lançamentos por `nomeExibido`. O fim do pedido muda para:

> Responda SOMENTE com JSON: {"texto": "<o resumo>"}

Não vai: id, last4, saldo, limite, nome de titular.

### Chave e assinatura

- `chaveRecorte(filtro, mes)` (puro): `${mes ?? 'todos'}|${cartões em ordem,
  separados por "," ou 'todos'}|${obra ? 1 : 0}` — vai em `ai_output.escopo`.
- `input_hash` = sha-256 do prompt.

### Leitura da resposta — `lerResumo(dados)` (puro)

`{ texto: string }` não vazio depois de aparado → texto cortado em 600
caracteres; qualquer outra coisa → `null`.

## 3. Rota — `POST /api/resumo?{filtro}`

Em `comUsuario`. Corpo opcional `{ forcar?: boolean }`.

1. `lerFiltro` da query; contexto pelo mesmo `carregarContexto` do painel.
2. `dadosResumo`; sem lançamentos → `ErroDeUso('sem_lancamentos', 'Não há
   lançamentos neste recorte', 400)`.
3. `prompt = promptResumo(...)`, `hash = sha256(prompt)`,
   `escopo = chaveRecorte(...)`.
4. Sem `forcar` e já existe `ai_output` (`user_id`, `kind = 'resumo'`,
   `escopo`, `input_hash = hash`) → devolve o texto guardado, **sem chamar a IA**.
5. Senão `pedirJson(prompt, { modelo: cfg.modeloIa })` → `registrarUso(userId,
   'resumo', …)` → `lerResumo`; nulo → `ErroDeUso('ia_invalida', 'A IA não
   respondeu direito; tente de novo', 502)` → grava `ai_output` com `conteudo =
   { texto }`, tokens e custo (`on conflict (user_id, kind, escopo, input_hash)
   do update`) → `{ texto }`.
6. `SemChaveIA` → `ErroDeUso('sem_chave', 'Configure OPENROUTER_API_KEY')`;
   `RespostaNaoJson` → registra o uso e devolve `ia_invalida`.

`registrarUso` aceita `kind = 'resumo'` (o tipo da função passa a incluí-lo).

## 4. Painel

- `src/lib/resumo-repo.ts` (`server-only`): `resumoGuardado(userId, escopo)` →
  o `ai_output` mais recente desse escopo (`texto`, `inputHash`) ou `null`.
- A página do painel calcula o prompt e o hash do recorte atual e compara com o
  guardado: `atual` (mesmo hash), `desatualizado` (hash diferente) ou `nenhum`.
  Calcular o prompt é só conta, sem chamada.
- Cartão logo abaixo do hero (`src/components/painel/ResumoMes.tsx`, cliente):
  - título "Resumo de set/26" (ou "de todos os meses");
  - `atual`: o texto e um botão discreto "↻" (envia `forcar: true`);
  - `desatualizado`: o texto, a nota "os dados mudaram desde este resumo" e o
    botão "Refazer";
  - `nenhum`: "Resumir o mês";
  - pedindo: "Resumindo o mês…", botão desabilitado; erro em linha com o
    `detalhe` da rota; sucesso → `router.refresh()`.
- Recorte sem lançamentos: o cartão não aparece (o painel já mostra o vazio).

## 5. Segurança

- `user_id` só da sessão; leitura e gravação de `ai_output` com `user_id` no
  `where`.
- Prompt só por `ia.ts`, sem last4, id, saldo ou limite (teste de vazamento).
- IA só no clique (regra 9).
- Resposta da IA: só `texto` string, aparado e cortado em 600; o React escapa.

## 6. Testes (`scripts/testes.ts`)

- `dadosResumo` sobre a fixture: mês, total igual a `porMes`, categorias
  positivas em ordem, comparação com o mês anterior, cartões sem last4.
- `promptResumo`: contém mês, total, categorias e o pedido de JSON; não contém
  `1111`, `2222`, `••` nem ids da fixture.
- `chaveRecorte`: mês, cartões em ordem e obra; `TODOS`/sem mês → `todos`.
- `lerResumo`: válido, aparado, vazio → `null`, não-string → `null`, corte em
  600.

## 7. Conferência

Com `OPENROUTER_API_KEY`: resumir um mês; ver o gasto subir em Ajustes; editar a
categoria de um lançamento e ver "desatualizado"; refazer; trocar o filtro de
cartão e resumir o recorte; 390px e desktop; claro e escuro.
