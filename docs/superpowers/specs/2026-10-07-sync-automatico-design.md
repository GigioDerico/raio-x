# Fatia 5 (5.0) — Sync automático

Data: 2026-10-07 · Branch `fatia-5-sync-automatico` · Plano técnico:
"Sincronização e consentimento", rotas `/api/cron/sync` e `/api/webhook/pluggy`,
categoria 2 da auditoria ("rotas que se defendem sozinhas").

## 1. Decisões do brainstorming

- **Construir agora, testar no Mac** chamando as rotas no `localhost` com os
  segredos; cron e webhook só rodam sozinhos depois do deploy (próximo passo).
- **Faixa no topo do app** quando uma conexão precisa do dono.
- Lançamento que o Pluggy apaga (`transactions/deleted`) **não** é apagado
  aqui: pendência.

Fatos do Pluggy (docs.pluggy.ai/docs/webhooks, 2026-10-07): o webhook não é
assinado — a proteção é um cabeçalho que nós definimos no cadastro (`headers`);
a resposta tem de sair em até 10 s (2xx), senão há nova tentativa (15 min,
2 h); 400/401/403/404/405 não são repetidos; cada evento tem `eventId`;
eventos de lançamento trazem `itemId` e `accountId`; eventos de item trazem
`itemId`.

## 2. Um caminho só de sincronização

`src/lib/pluggy/sync-auto.ts` (`server-only`):

- `sincronizarCartao(userId, accountId, janela: 'inicial' | 'atualizar')` —
  o miolo de hoje de `POST /api/accounts/[id]/sync` (faturas + lançamentos da
  janela, `sincronizarConta`, `categorizarPendentes`, `ultimo_sync_em`), que a
  rota passa a chamar. Erro de chave sem Pluggy continua `SemChavePluggy`.
- `sincronizarConexao(userId, conexaoId)` — `pluggy().item()` →
  `registrarItem`; se o estado ficou `ativa` (ou o item está `OUTDATED`),
  `sincronizarCartao(..., 'atualizar')` para cada cartão de
  `cartoesDaConexao`, um de cada vez. Estado que pede o dono (senha,
  consentimento) só é gravado, sem sync. Devolve
  `{ estado, cartoes: n, inseridos }` para o log.
- O cliente HTTP do Pluggy já repete erro passageiro (4 tentativas, 1/2/4 s).
  Se ainda assim falhar, a conexão fica como estava e a próxima rodada tenta de
  novo; nada vira faixa.
- Toda consulta segue com `user_id` no `where`; nas rotas sem sessão o
  `userId` vem **da linha da conexão** achada pelo item (nunca do corpo).

## 3. Cron — `GET /api/cron/sync`

- `Authorization: Bearer <CRON_SECRET>`, comparado em tempo constante
  (`segredoConfere`, puro, com `timingSafeEqual` sobre hashes de mesmo
  tamanho). `CRON_SECRET` vazio → **404** (a rota não existe sem segredo;
  fecha o A-02 da auditoria para o cron). Segredo errado → 401.
- Percorre as conexões com status `ativa` ou `erro` de todos os usuários, mais
  antigas primeiro (`ultimo_sync_em` nulo primeiro); pula as sincronizadas há
  menos de 12 h (`precisaSincronizar(ultimoSyncEm, agora)`, puro).
- Orçamento de 50 s (`maxDuration = 60`): antes de cada conexão confere o
  tempo; o que sobrar fica para o dia seguinte. Uma conexão que falha não para
  as outras (log e segue).
- Resposta: `{ ok: true, sincronizadas, puladas, falharam, restantes }` — sem
  nome de banco nem id.
- `vercel.json` já agenda `0 9 * * *` (6h de Brasília).

## 4. Webhook — `POST /api/webhook/pluggy`

- Cabeçalho `x-raio-x-segredo` comparado com `PLUGGY_WEBHOOK_SECRET` por
  `segredoConfere`, **antes de ler o corpo**. Segredo vazio → 404; errado →
  401 (não repetido pelo Pluggy).
- Corpo: JSON até 64 KB; inválido → 400. `lerEventoPluggy(corpo)` (puro)
  devolve `{ eventId, acao: 'sincronizar' | 'estado' | 'ignorar', itemId }`:
  - `transactions/created`, `transactions/updated`, `item/updated` →
    `sincronizar`;
  - `item/error`, `item/waiting_user_input`, `item/waiting_user_action`,
    `item/login_succeeded` → `estado`;
  - `transactions/deleted`, `item/created`, `item/deleted`,
    `connector/status_updated` e o resto → `ignorar`;
  - sem `eventId` ou sem `itemId` quando a ação precisa → `ignorar`.
- Replay: `insert into webhook_evento (event_id) ... on conflict do nothing
  returning` — já visto → 200 sem fazer nada.
- Responde **200 na hora** e processa em `after()` (`next/server`): acha a
  conexão pelo `pluggy_item_id` (não desconectada); sem conexão → log e fim.
  `sincronizar` → `sincronizarConexao`; `estado` → `item()` + `registrarItem`.
- Limpeza: o mesmo insert apaga `webhook_evento` com mais de 30 dias.
- Cadastro: `scripts/webhook.ts` (`npm run webhook -- https://<domínio>`)
  cria (ou substitui) no Pluggy o webhook `event: 'all'` para
  `<url>/api/webhook/pluggy` com `headers: { 'x-raio-x-segredo': … }`, lendo
  os segredos do `.env.local`. Não imprime segredo. Roda depois do deploy.

### Migração `drizzle/0012_webhook_evento.sql`

```sql
create table if not exists webhook_evento (
  event_id text primary key,
  recebido_em timestamptz not null default now()
);
```

Aplicar no Neon só com autorização do dono.

## 5. Consentimento e faixa

- `estadoDaConexao` (`estado.ts`) ganha a chave `consentimento_perto`: com
  `consentExpiraEm` no futuro e a até 14 dias, "A autorização vence em N dias."
  (1 → "amanhã"; hoje → "hoje"), ação `renovar`. Vencido continua
  `consentimento`. Sem data (`null`), nada — o Pluggy normalmente não expira.
- `avisoDasConexoes(conexoes, agora)` (puro): a primeira conexão cujo estado é
  `erro_login`, `consentimento` ou `consentimento_perto` → `{ texto, href:
  '/conexoes' }`; senão `null`. `instavel`, `erro` e `atualizando` não geram
  faixa.
- Layout `(app)`: lê `listarConexoes` (mesma requisição; `cache`) e passa o
  aviso à `Casca`, que mostra a faixa no topo de todas as telas: "{banco}:
  {texto} — Resolver" (link para Conexões). Some sozinha quando o estado muda.

## 6. Testes (`scripts/testes.ts`)

- `segredoConfere`: igual → true; diferente, vazio esperado, tamanhos
  diferentes → false.
- `precisaSincronizar`: nulo → true; 11 h → false; 13 h → true.
- `lerEventoPluggy`: um caso por grupo de evento; sem `eventId`; sem `itemId`.
- `estadoDaConexao`: vence em 10 dias, amanhã, hoje; 20 dias → ativa; vencido
  → consentimento.
- `avisoDasConexoes`: prioridade da primeira que precisa; instável não gera.

## 7. Conferência (no Mac)

Com o `next dev` e a 0012 aplicada:
- `curl` no cron sem segredo → 401; com → resumo; de novo → tudo pulado (12 h).
- `curl` no webhook sem cabeçalho → 401; com um `item/updated` do item do dono
  → 200 na hora e sync no log; o mesmo `eventId` de novo → nada.
- Conexões e faixa: forçar um `consent_expira_em` próximo não é possível sem
  mexer no banco — a faixa é conferida pelos testes; a tela, só se o dono
  quiser simular.

## 8. Fora

`transactions/deleted`; conta corrente (fatia 6); cadastro do webhook (depois
do deploy).
