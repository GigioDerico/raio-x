# Tarefa 7.2 — Diagnóstico por IA

Data: 2026-10-03 · Guia: [`docs/guia-de-construcao.md`](../../guia-de-construcao.md) ("Diagnóstico e conversa") · Plano técnico: rotas de IA, "IA: automático × sob demanda", segurança item 6
Legado: `docs/legado/app-antigo.html` — `resumoParaIA`, `mdLeve`, `btn-ai` (:2780-2943)

## 1. Decisões do brainstorming

- **Diagnóstico e Conversa separados.** 7.2 é o diagnóstico; a Conversa (7.3)
  reaproveita os mesmos dados.
- **Quanto opina (pergunta 3 do guia): como o legado.** As cinco seções do app
  antigo, inclusive "O que cortar primeiro" com economia em R$. Sem conselho de
  investimento nem moralismo — o pedido do legado já não pede isso.
- **Em stream**, com botão "Parar".
- **Só por botão** (regra 9); guardado em `ai_output` e marcado "desatualizado"
  quando o hash do pedido muda — mesmo mecanismo do resumo (7.1).

## 2. Dados e pedido — `src/lib/ia.ts`

### `dadosDiagnostico(ctx)` — porta de `resumoParaIA` (`app-antigo.html:2781-2827`)

Função pura que devolve o texto do bloco de dados (cortado em 12000
caracteres), sobre o `Contexto` já filtrado. Linhas, na ordem do legado:

1. Recorte analisado (`rotuloMes(mesAtual)` ou "todos os meses carregados").
2. Renda mensal informada (`cfg.renda` — valor digitado pelo dono, não saldo).
3. Total por mês de fatura (`porMes`).
4. Cartões considerados: `cartoesInfo().nome` **sem** `••last4`, mais o aviso de
   filtro quando houver.
5. Categorias do mês com valor, % e variação contra o mês anterior ("novo").
6. Encargos do mês; composição (fixos, parcelas, encargos, escolha, já
   contratado); previsão (`projecao`); plano em vigor (quando existe);
   teto saudável (`planoSaudavel`).
7. Fixas (até 14) e soma; recorrentes variáveis (até 10); parcelas em aberto
   (até 10), total a vencer, parcelas por mês (até 6).
8. 12 maiores lançamentos do mês por `nomeParaIA` (apelido intacto; descrição
   crua por `semDocumentos`), com a parcela quando houver.

Diferenças em relação ao legado: sem last4, `semDocumentos` na descrição crua.
Assinatura: `dadosDiagnostico(ctx, filtrado, plano)` — `filtrado` indica
cartões no filtro (o aviso da linha 4); `plano` é o resumo do plano em vigor
(`{ meses: {mes, alvo}[], cats: {cat, alvo}[] } | null`), lido de
`planoAtivo` (`plano-repo`) pela rota e pela página — o `Contexto` não o traz.
Renda, meta de poupança e fora do cartão vêm do `Contexto`.

### `promptDiagnostico(dados)`

Texto do legado (`app-antigo.html:2920-2934`) sem "(dados de exemplo)": as cinco
seções com `###`, máximo 400 palavras, sem tabelas, "se algo parecer errado
diga em uma linha", seguido de `DADOS:` e o bloco acima. Resposta em markdown
leve (não JSON).

Não vai: id, last4, saldo, limite, nome de titular, CPF.

## 3. Stream — `src/lib/openrouter.ts`

`pedirTextoEmStream(prompt, { modelo?, sinal? })`:

- `stream: true`, `usage: { include: true }`, sem `response_format`,
  `temperature` 0.3 (texto corrido).
- Lê o SSE do OpenRouter (`data: {...}` / `data: [DONE]`, ignora comentários
  `: OPENROUTER PROCESSING`) e devolve um `AsyncGenerator` de eventos
  `{ tipo: 'texto', t }` e, no fim, `{ tipo: 'fim', modelo, uso }` (o uso vem no
  último pedaço).
- Reserva: só se o modelo principal falhar **antes** do primeiro texto
  (`!r.ok` ou erro no primeiro pedaço). Depois do primeiro texto, erro sobe.
- Sem chave → `SemChaveIA`.
- A interpretação de cada linha SSE é uma função pura exportada
  (`lerLinhaSse(linha)`) — `openrouter.ts` é `server-only`, então a função pura
  mora em `src/lib/sse.ts`.

`registrarUso` aceita `kind = 'diagnostico'`.

## 4. Rota — `POST /api/diagnostico?{filtro}`

`runtime = 'nodejs'`, `maxDuration = 60`. Em `comUsuario` até abrir o stream.
Corpo opcional `{ forcar?: boolean }`.

1. `lerFiltro`, `carregarContexto`; sem lançamentos no recorte →
   `ErroDeUso('sem_lancamentos', …, 400)`.
2. `prompt`, `hash = hashDoPrompt(prompt)`, `escopo = chaveRecorte(filtro, m)`.
3. Sem `forcar` e com guardado de mesmo hash → JSON `{ texto }` (sem IA).
4. Sem chave → `ErroDeUso('sem_chave', 'Configure OPENROUTER_API_KEY')`.
5. Senão, resposta `application/x-ndjson`: uma linha `{"t":"…"}` por pedaço,
   depois `{"fim":true}`; erro no meio → `{"erro":"A IA não terminou o
   diagnóstico; tente de novo"}` (detalhe só no log).
6. No fim: `registrarUso(userId, 'diagnostico', modelo, uso)` e grava
   `ai_output` (`kind 'diagnostico'`, `escopo`, `input_hash`, `conteudo =
   { texto }` cortado em 6000, tokens, custo; `on conflict do update`).
7. Cliente abortou (`req.signal`) → o pedido ao OpenRouter é abortado; nada é
   guardado; o uso não é registrado (o OpenRouter não informa uso de chamada
   cortada — pendência anotada).

Repositório: `resumo-repo.ts` generaliza para `saidaGuardada(userId, kind,
escopo, hash)` e `guardarSaida(userId, kind, …)`, mantendo o comportamento do
resumo (preferir o hash igual, senão a mais recente do escopo).

## 5. Tela — `/diagnostico`

- Menu: grupo "Por que aconteceu", antes de Categorias. Respeita o filtro global.
- Server component: calcula o pedido e o hash (só conta, regra 9), lê o
  guardado → `atual` | `desatualizado` | `nenhum`. Recorte vazio → estado vazio
  do app.
- Cliente `Diagnostico.tsx`:
  - `nenhum`: "Gerar diagnóstico";
  - `atual`: o texto e "↻" (envia `forcar: true`);
  - `desatualizado`: o texto, a nota "os números mudaram desde este
    diagnóstico" e "Refazer";
  - gerando: texto aparecendo, botão "Parar" (aborta o `fetch`), `aria-busy`;
    parado → "Interrompido." e o texto parcial fica na tela, sem ser guardado;
  - erro em linha com o detalhe da rota; sucesso → `router.refresh()` em
    `useTransition`, com chave `filtro|hash` como no resumo.
- Leitura do NDJSON: função pura `lerNdjson(buffer)` → `{ eventos, resto }` em
  `src/lib/ndjson.ts`.

### Markdown — `src/lib/markdown-leve.ts` (puro)

Porta de `mdLeve`, mas devolvendo blocos em vez de HTML:
`{ tipo: 'titulo' | 'paragrafo', partes } | { tipo: 'lista', itens: partes[] }`,
`partes` = `{ texto, forte?, dinheiro? }`. Títulos `##`–`####`, listas `-`, `*`,
`•`, `1.`; `**negrito**`; `R$ …` como dinheiro. O componente renderiza como
elementos React — sem `dangerouslySetInnerHTML`; o React escapa o texto.

## 6. Segurança

- `user_id` da sessão; `ai_output` com `user_id` no `where`.
- Pedido só por `ia.ts`, sem last4, id, CPF, saldo, limite.
- IA só no clique.
- Markdown da IA nunca vira HTML cru.

## 7. Testes (`scripts/testes.ts`)

- `dadosDiagnostico` na fixture: contém mês, total, categorias, maiores
  lançamentos; não contém `1111`, `2222`, `••`, ids da fixture nem CPF.
- `promptDiagnostico`: as cinco seções e `DADOS:`.
- `lerLinhaSse`: pedaço de texto, pedaço com `usage`, `[DONE]`, comentário,
  linha vazia, JSON quebrado.
- `lerNdjson`: linhas completas, linha partida entre dois pedaços.
- `markdownLeve`: título, lista, negrito, dinheiro, `<script>` sai como texto.

## 8. Conferência

Gerar o diagnóstico vendo o texto aparecer; ver o gasto subir em Ajustes;
recarregar e ver o texto guardado sem nova chamada; editar uma categoria e ver
"desatualizado"; refazer; parar no meio; filtrar um cartão; 390px e desktop;
claro e escuro.
