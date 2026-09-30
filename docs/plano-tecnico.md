# Raio-X — plano técnico

29 de setembro de 2026 · @Giorgio Derico

O app sai do artifact e vira um Next.js na Vercel com Postgres no Neon: o Pluggy traz conta e cartão ao vivo, o upload de PDF continua para o histórico anterior à conexão, e a IA passa a rodar pelo OpenRouter com o modelo que você escolher. A mudança estrutural é uma só — o lançamento deixa de morar dentro de um documento de fatura e passa a ser a tabela central; a fatura vira uma visão sobre ele.

## Decisões fechadas

Nada aqui está em aberto — é o que já foi decidido nas conversas anteriores, junto num lugar só.

| Camada | Escolha | Por quê |
| --- | --- | --- |
| Hospedagem | Vercel | Next.js com rotas de API e cron no mesmo projeto; plano free cobre um usuário |
| Banco | Neon (Postgres serverless) | Postgres de verdade, escala a zero, branch de dados para testar migração |
| Open Finance | Pluggy (Meu Pluggy) | Cobre os bancos da sua lista; você conecta pelo Meu Pluggy e o app lê |
| IA | OpenRouter, com o modelo escolhido por você | Troca de modelo sem trocar código; você paga o que usar |
| Ingestão de PDF | pdf.js no navegador + extração por IA | Continua funcionando para o que a API não traz (histórico antigo, banco não conectado) |
| Licença | AGPL-3.0 | Código aberto e quem hospedar modificado tem de abrir também |
| Escopo de usuário | uma instalação por pessoa | Sem multi-tenant, sem login social, sem LGPD de terceiros |
| Distribuição | repositório público no GitHub | Serve de vitrine e de instruções de auto-hospedagem |

O que isso implica de imediato: **não existe servidor multiusuário**, então cada instalação tem suas próprias chaves de Pluggy e OpenRouter e seu próprio banco. Todo `user_id` no esquema abaixo existe por higiene de modelagem, não porque haja dois usuários.

## Modelo de dados

Hoje o documento é a fatura e os lançamentos são um array dentro dela. Isso inverte: **`txn` passa a ser a tabela central e a fatura vira uma linha leve mais uma visão**. Quatro coisas dependem dessa inversão:

- O Open Finance entrega lançamento avulso a todo momento, inclusive de fatura que ainda não fechou e de conta corrente, que não tem fatura nenhuma.
- Deduplicar é um `unique` numa coluna, não uma varredura de arrays.
- Filtrar por mês e cartão vira `where`, e não recalcular tudo em memória a cada clique.
- Excluir e editar deixa de mexer em objeto congelado — o bug de `structuredClone` simplesmente não existe num `update`.

Exclusão é lógica (`excluido_em`), não `delete`: o lançamento que você tirou tem de continuar reconhecível para a sincronização não reinseri-lo amanhã.

```sql
-- Postgres 16 no Neon. gen_random_uuid() é nativo.

create type account_kind      as enum ('cartao_credito','conta_corrente','conta_pagamento','poupanca');
create type connection_status as enum ('ativa','atualizando','erro_login','consentimento_expirado','desconectada');
create type statement_status  as enum ('aberta','fechada','paga');
create type txn_kind          as enum ('fixo','parcela','encargo','escolha');
create type txn_source        as enum ('pluggy','pdf','manual');

create table app_user (
  id          uuid primary key default gen_random_uuid(),
  nome        text,
  criado_em   timestamptz not null default now()
);

create table user_setting (
  user_id          uuid primary key references app_user(id) on delete cascade,
  meta_poupanca    numeric(5,2)  not null default 20,   -- % da renda
  renda_declarada  numeric(14,2),                       -- fallback sem Open Finance
  gasto_fora_cartao numeric(14,2) not null default 0,   -- idem
  modelo_ia        text not null default 'anthropic/claude-sonnet-4.5',
  tz               text not null default 'America/Sao_Paulo'
);

create table institution (
  id                  bigint generated always as identity primary key,
  slug                text not null unique,   -- 'itau', 'nubank', 'sicredi'
  nome                text not null,
  pluggy_connector_id integer,
  cor                 text,
  logo_url            text
);

create table connection (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid   not null references app_user(id) on delete cascade,
  institution_id    bigint not null references institution(id),
  pluggy_item_id    text   not null unique,
  status            connection_status not null default 'ativa',
  consent_expira_em timestamptz,
  ultimo_sync_em    timestamptz,
  ultimo_erro       text,
  criado_em         timestamptz not null default now()
);

create table account (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid   not null references app_user(id) on delete cascade,
  connection_id     uuid   references connection(id) on delete set null, -- null = só PDF
  institution_id    bigint not null references institution(id),
  kind              account_kind not null,
  pluggy_account_id text unique,
  last4             text,          -- chave humana do cartão; manda sobre o nome do banco
  apelido           text,          -- 'Itaú - Azul', dado por você
  nome_origem       text,          -- como a instituição escreve, que muda entre meses
  limite            numeric(14,2),
  saldo             numeric(14,2),
  saldo_em          timestamptz,
  dia_fechamento    smallint,
  dia_vencimento    smallint,
  ativo             boolean not null default true
);
-- um cartão é UM registro mesmo que o banco mude de nome no PDF:
create unique index account_chave on account (user_id, kind, coalesce(last4, institution_id::text));

create table statement (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references account(id) on delete cascade,
  mes_ref         date not null,        -- sempre dia 1
  fechamento      date,
  vencimento      date,
  total_informado numeric(14,2),        -- o que o PDF ou a API diz que é o total
  status          statement_status not null default 'aberta',
  pluggy_bill_id  text unique,
  unique (account_id, mes_ref)
);

create table category (
  id      bigint generated always as identity primary key,
  nome    text not null unique,
  grupo   text not null,   -- 'essencial' | 'flexivel' | 'encargo'
  ordem   smallint not null default 100,
  builtin boolean not null default true
);

create table installment_plan (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references account(id) on delete cascade,
  desc_norm      text not null,
  total_parcelas smallint not null,
  valor_parcela  numeric(14,2) not null,
  primeira_ref   date not null,
  ativo          boolean not null default true
);

create table txn (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  account_id     uuid not null references account(id) on delete cascade,
  statement_id   uuid references statement(id) on delete set null, -- null em conta corrente
  data           date not null,
  valor          numeric(14,2) not null,   -- positivo = saída; negativo = estorno/crédito
  desc_origem    text not null,
  desc_norm      text not null,            -- chave de aprendizado de categoria e apelido
  apelido        text,                     -- nome que VOCÊ deu a este lançamento
  category_id    bigint references category(id),
  category_fonte text not null default 'ia',  -- 'ia'|'regra'|'manual'|'pluggy'
  tipo           txn_kind not null default 'escolha',
  installment_id uuid references installment_plan(id) on delete set null,
  parcela_n      smallint,
  fonte          txn_source not null,
  pluggy_txn_id  text unique,
  dedupe_key     text not null,
  excluido_em    timestamptz,              -- exclusão lógica
  criado_em      timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index txn_mes  on txn (user_id, data desc) where excluido_em is null;
create index txn_conta on txn (account_id, data desc) where excluido_em is null;
create index txn_norm  on txn (user_id, desc_norm);

create table learned_label (
  user_id       uuid not null references app_user(id) on delete cascade,
  desc_norm     text not null,
  category_id   bigint references category(id),
  apelido       text,
  hits          integer not null default 1,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, desc_norm)
);

create table plan (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_user(id) on delete cascade,
  ritmo         text not null,          -- 'suave' | 'equilibrado' | 'firme'
  objetivo      text,
  renda_base    numeric(14,2) not null,  -- teto duro: o plano nunca passa disso
  meta_poupanca numeric(5,2)  not null,
  prefs         jsonb not null,          -- intocáveis, cortar fundo, respostas do questionário
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table plan_target (
  plan_id     uuid   not null references plan(id) on delete cascade,
  mes_ref     date   not null,
  category_id bigint not null references category(id),
  alvo        numeric(14,2) not null,
  primary key (plan_id, mes_ref, category_id)
);

create table ai_output (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user(id) on delete cascade,
  kind       text not null,   -- 'resumo_mes'|'diagnostico'|'plano'|'chat'|'extracao'
  escopo     text not null,   -- '2026-09' | '2026-09|acc:<uuid>' | 'TODOS'
  modelo     text not null,
  input_hash text not null,   -- sha256 dos números que entraram no prompt
  conteudo   jsonb not null,
  tokens_in  integer, tokens_out integer, custo_usd numeric(10,6),
  criado_em  timestamptz not null default now(),
  unique (user_id, kind, escopo, input_hash)
);

create table sync_run (
  id            bigint generated always as identity primary key,
  connection_id uuid references connection(id) on delete cascade,
  iniciado_em   timestamptz not null default now(),
  terminado_em  timestamptz,
  resultado     text,        -- 'ok' | 'parcial' | 'erro'
  novos integer default 0, atualizados integer default 0, duplicados integer default 0,
  detalhe       jsonb
);

-- a fatura como VISÃO: o total nunca é guardado, é sempre somado do txn
create view v_fatura as
select s.id, s.account_id, s.mes_ref, s.fechamento, s.vencimento, s.status,
       s.total_informado,
       coalesce(sum(t.valor), 0) as total_calculado,
       count(t.id)               as lancamentos
from statement s
left join txn t on t.statement_id = s.id and t.excluido_em is null
group by s.id;
```

O `input_hash` de `ai_output` é o que evita reprocessar: se os números do mês não mudaram, o resumo já está em cache e não custa nada. É também o que resolve a queixa antiga de "diagnóstico velho apresentado como atual" — mudou o hash, o texto em tela é marcado como desatualizado.

## Rotas da API

Next.js App Router, um arquivo `route.ts` por linha. Toda rota exige o cookie de sessão, exceto o cron e o webhook, que têm segredo próprio.

| Rota | Método | O que faz |
| --- | --- | --- |
| `/api/auth/login` | POST | Senha única do `.env` → cookie httpOnly assinado. Não há cadastro |
| `/api/connect/token` | POST | Pede um connect token ao Pluggy para abrir o widget no navegador |
| `/api/connect/callback` | POST | Recebe o `itemId` do widget, cria a `connection` e descobre as `account` dela |
| `/api/connections` | GET | Lista as conexões com status, validade do consentimento e último sync |
| `/api/connections/[id]` | DELETE | Revoga o item no Pluggy e marca `desconectada`; os `txn` ficam |
| `/api/connections/[id]/renew` | POST | Abre o widget em modo de atualização de consentimento |
| `/api/sync` | POST | Sincronização sob demanda (o botão "atualizar agora") |
| `/api/cron/sync` | GET | Alvo do cron da Vercel; exige `Authorization: Bearer $CRON_SECRET` |
| `/api/webhook/pluggy` | POST | `item/updated`, `transactions/created` → puxa delta na hora |
| `/api/txn` | GET | Lista com filtros `mes`, `account`, `categoria`, `busca` |
| `/api/txn/[id]` | PATCH | Valor, categoria, apelido. Grava `learned_label` e propaga aos parecidos |
| `/api/txn/[id]` | DELETE | Exclusão lógica, com resposta pronta para o desfazer |
| `/api/txn/bulk` | PATCH | Multi-seleção: uma categoria para vários lançamentos numa transação só |
| `/api/import/pdf` | POST | Recebe o **texto** já extraído, chama a IA, grava `txn` deduplicados |
| `/api/accounts/[id]` | PATCH | Apelido do cartão ("Itaú - Azul"), dia de fechamento e vencimento |
| `/api/overview` | GET | KPIs, composição compromisso × escolha, por categoria, projeção |
| `/api/ai/summary` | POST | Resumo do mês; devolve do cache se o `input_hash` bater |
| `/api/ai/diagnosis` | POST | Diagnóstico longo, em stream |
| `/api/ai/chat` | POST | Chat do diagnóstico, em stream, com os números do mês no contexto |
| `/api/plan` | GET, POST | Lê o plano ativo; POST refaz com as respostas do questionário |
| `/api/export/csv` | GET | Mesmo CSV de hoje, agora direto do banco |

Duas decisões embutidas aí:

- **O PDF nunca sobe.** O `pdf.js` continua rodando no navegador e só o texto vai para `/api/import/pdf`. Isso mantém o arquivo fora do servidor e foge do limite de payload da Vercel. A divisão em pedaços de \~11 mil caracteres continua igual, só muda quem chama o modelo.
- **A chave da IA nunca vai para o cliente.** Toda chamada de modelo sai de uma rota de servidor; o navegador só recebe o stream. É o que torna possível publicar o repositório sem publicar suas chaves.

## Pluggy → modelo

Quatro objetos do Pluggy alimentam o banco: `Item`, `Account`, `Transaction` e `Bill`. O mapeamento é quase um-para-um, com três achados que mudam o desenho.

| Pluggy | Campo | Vai para | Observação |
| --- | --- | --- | --- |
| [Item](https://docs.pluggy.ai/en/docs/connections/item.md) | `id` | `connection.pluggy_item_id` | É você que guarda: o Pluggy não lista seus itens |
| Item | `status` | `connection.status` | `UPDATED`→ativa, `UPDATING`→atualizando, `LOGIN_ERROR`/`WAITING_USER_INPUT`→erro\_login, `OUTDATED`→erro |
| Item | `nextAutoSyncAt` | agenda do cron | Evita sincronizar antes do próprio Pluggy ter dado novo |
| [Consent](https://docs.pluggy.ai/en/docs/connections/consents.md) | `expiresAt`, `revokedAt` | `connection.consent_expira_em` | `null` = não expira; virar `consentimento_expirado` só quando houver data |
| [Account](https://docs.pluggy.ai/en/docs/products/accounts.md) | `id` | `account.pluggy_account_id` |  |
| Account | `type` + `subtype` | `account.kind` | `CREDIT`/`CREDIT_CARD`→cartao\_credito; `BANK`/`CHECKING_ACCOUNT`→conta\_corrente |
| Account | `number` | `account.last4` | Em cartão já vem só os quatro dígitos — exatamente a chave que você usa hoje |
| Account | `name`, `marketingName` | `account.nome_origem` | O apelido ("Itaú - Azul") continua seu, nunca sobrescrito pelo sync |
| Account | `balance` | `account.saldo` | Em cartão é o saldo da fatura aberta, não dinheiro em conta |
| Account | `creditData.creditLimit` | `account.limite` | Alimenta a barra de limite usado do painel |
| Account | `creditData.balanceCloseDate` / `balanceDueDate` | `statement.fechamento` / `.vencimento` | Também derivam `dia_fechamento` e `dia_vencimento` |
| [Transaction](https://docs.pluggy.ai/en/docs/products/transactions.md) | `id` | `txn.pluggy_txn_id` |  |
| Transaction | `date` | `txn.data` | ISO8601 em UTC — converter para America/Sao\_Paulo antes de decidir o mês |
| Transaction | `amount` | `txn.valor` | Em cartão, positivo = gasto e negativo = estorno; conta corrente usa `type` `DEBIT`/`CREDIT` |
| Transaction | `descriptionRaw` ↓ `description` | `txn.desc_origem` | `desc_norm` sai da normalização que o app já faz |
| Transaction | `status` | — | `PENDING` entra, mas com marcação: o valor ainda pode mudar |
| Transaction | `creditCardMetadata.installmentNumber` / `totalInstallments` | `txn.parcela_n` / `installment_plan.total_parcelas` | **Fim da adivinhação de parcelas** |
| Transaction | `creditCardMetadata.purchaseDate` | `installment_plan.primeira_ref` | Data da compra, não da parcela |
| Transaction | `creditCardMetadata.billId` | `txn.statement_id` | **É o elo transação → fatura**, sem inferir por período |
| Transaction | `providerId` | parte da `dedupe_key` | Só em conectores Open Finance; é o id do próprio banco |
| Transaction | `merchant.name`, `.cnpj`, `.category` | `txn.desc_norm`, dica de categoria | Requer plano Pro; melhora muito o agrupamento por estabelecimento |
| [Bill](https://docs.pluggy.ai/en/docs/products/credit-card-bills.md) | `id` | `statement.pluggy_bill_id` |  |
| Bill | `totalAmount`, `dueDate` | `statement.total_informado`, `.vencimento` | Comparar com `v_fatura.total_calculado` é o teste de integridade da importação |
| Bill | `financeCharges[]` | `txn` com `tipo = 'encargo'` | IOF, juros e multa viram lançamentos da categoria Encargos do cartão |
| Bill | `payments[]` | `statement.status = 'paga'` |  |

Os três achados que mudam decisões:

1. **`creditCardMetadata` mata a heurística de parcelas.** A regressão que você viu ("parcelas a vencer com valor errado") vinha de deduzir `3/10` do texto da descrição. A API entrega número da parcela, total e data da compra. A heurística fica só para o caminho do PDF.
2. **O consentimento normalmente não expira.** O Pluggy pede consentimento sem prazo por padrão; `expiresAt` vem `null` na maioria dos conectores. A prancha "Conexões" mostra "vence em 38 dias" como se fosse a regra — na prática esse cartão é exceção. O estado continua no código, mas a tela deve escondê-lo quando `expiresAt` for nulo, em vez de inventar prazo.
3. **São 12 meses de histórico, no máximo.** Para ir mais atrás, só PDF — o que confirma manter o importador em vez de aposentá-lo.

## Cobertura de bancos

Santander, Sicredi, Itaú, Nubank e Mercado Pago estão todos na [cobertura de Open Finance do Pluggy](https://docs.pluggy.ai/en/docs/open-finance/institutions-coverage.md), nos três produtos que o app usa: contas, transações e cartão de crédito. São cerca de 270 instituições no total. Um detalhe que decide arquitetura: **o Nubank existe só via Open Finance**, sem conector direto — o mesmo vale para Sicoob e Next ([visão geral dos conectores](https://docs.pluggy.ai/en/docs/open-finance/overview.md)).

Como o repositório é público, isso deixa de ser uma checagem pontual e vira um requisito: a lista muda sozinha, e lista escrita à mão no README envelhece em semanas. Quatro consequências no código:

1. **A tela de conexão lista ao vivo.** `GET /connectors?countries=BR&types=PERSONAL_BANK&isOpenFinance=true&healthDetails=true` — o usuário vê o que existe hoje, com nome, logo e cor vindos do próprio conector, e não um menu que alguém esqueceu de atualizar.
2. **`institution` é preenchida a partir do conector**, na primeira conexão com aquele banco. Nada de seed com 270 linhas: `id`, `name`, `imageUrl` e `primaryColor` do conector viram a linha. A tabela ganha uma coluna `logo_url` por causa disso.
3. **O README tem uma seção gerada, nunca digitada.** Um script em `scripts/atualizar-conectores.ts` chama o mesmo endpoint, escreve `docs/conectores.md` com a lista completa e injeta um resumo no README entre marcadores `<!-- conectores:inicio -->` e `<!-- conectores:fim -->`, com a data da última geração. Uma action semanal roda o script e abre PR se algo mudou.
4. **`health` do conector vira mensagem honesta.** O campo vem no mesmo retorno; com ele, a tela de Conexões diz "instabilidade no Santander" em vez de deixar o usuário achar que o app quebrou. O endpoint de incidentes complementa isso.

Uma limitação a registrar: `GET /connectors` exige `X-API-KEY`, então a action precisa de um segredo do repositório e **forks não conseguem regerar a lista** — leem o snapshot commitado. Por isso a data de geração fica visível no README, e o texto aponta a tela do app como fonte ao vivo.

No README, o tom certo não é "suportamos 270 bancos": é "o app conecta qualquer instituição do Open Finance brasileiro que o Pluggy alcance; a lista de hoje está em `docs/conectores.md` e a lista real aparece na tela de conexão". Promessa que envelhece é promessa quebrada.

## Deduplicação

O problema é concreto: você já subiu PDFs de vários meses e o Pluggy vai trazer até 12 meses dos mesmos cartões. Sem chave, tudo dobra.

`dedupe_key` é uma **chave natural que as duas fontes conseguem calcular igual** — nada de id do Pluggy nela, senão o PDF nunca colide:

```ts
// chave natural: a mesma compra, vinda de qualquer lugar, dá a mesma string
function dedupeKey(accountId: string, data: string, valor: number, descNorm: string, ordinal: number) {
  const v = Math.round(Math.abs(valor) * 100);            // centavos, sem sinal
  const d = sha1(descNorm).slice(0, 10);                  // desc_norm = a normalização que o app já faz
  return `${accountId}|${data}|${v}|${d}|${ordinal}`;
}
```

O `ordinal` começa em 0 e sobe quando a mesma conta tem, no mesmo dia, o mesmo valor e a mesma descrição — dois cafezinhos de R$ 12 na mesma padaria são dois lançamentos legítimos. Como as duas fontes listam ambos, os ordinais se alinham naturalmente.

A importação é um upsert de três passos, nesta ordem:

1. **Id do Pluggy.** Se `pluggy_txn_id` já existe, só atualiza valor e status (`PENDING` → `POSTED` muda valor com frequência).
2. **Chave natural exata.** Achou uma linha com a mesma `dedupe_key`? É a mesma compra. Se a existente veio de PDF e a nova vem da API, **promove**: grava `pluggy_txn_id`, `statement_id`, dados de parcela, e troca `fonte` para `pluggy` — mantendo o que é seu (`apelido`, e `category_id` quando `category_fonte = 'manual'`).
3. **Passe aproximado.** Não achou? Procura candidato na mesma conta com `abs(valor)` igual, data dentro de ±3 dias e `desc_norm` parecida pela mesma função `parecido()` do app. Achou um único candidato → promove. Achou mais de um → **não decide**: insere marcado e mostra numa tela de "possíveis duplicados" para você confirmar.

O passe aproximado existe porque a fatura em PDF costuma trazer a **data da compra** e a API traz a **data de lançamento**; quando `creditCardMetadata.purchaseDate` vem preenchido, usa-se ele no passo 2 e o passo 3 quase nunca dispara.

```sql
insert into txn (user_id, account_id, data, valor, desc_origem, desc_norm,
                 fonte, pluggy_txn_id, dedupe_key, statement_id)
values (...)
on conflict (user_id, dedupe_key) do update set
  valor         = excluded.valor,
  statement_id  = coalesce(excluded.statement_id, txn.statement_id),
  pluggy_txn_id = coalesce(excluded.pluggy_txn_id, txn.pluggy_txn_id),
  fonte         = case when excluded.fonte = 'pluggy' then 'pluggy' else txn.fonte end,
  category_id   = case when txn.category_fonte = 'manual'
                       then txn.category_id else excluded.category_id end
where txn.excluido_em is null;   -- o que você excluiu NÃO volta
```

Duas garantias que essa cláusula final entrega: lançamento que você apagou não ressuscita no sync da madrugada, e categoria que você corrigiu à mão nunca é desfeita pela IA nem pelo categorizador do Pluggy.

No nível do mês vale um aviso antes do trabalho: se você subir o PDF de um mês que a conexão já cobre, a tela pergunta em vez de importar — "setembro deste cartão já vem pelo Open Finance; importar de novo?".

## Sincronização e consentimento

O Pluggy avisa quando há lançamento novo, então o normal é o app estar em dia sem ninguém pedir nada. O cron existe para o dia em que o aviso não chega.

&#91;embedded content: fluxo do sync · 3 gatilhos, 3 estados, 4 passos\]

O que o desenho não mostra e vale decidir agora:

- **Erro transitório não é assunto seu.** `SITE_NOT_AVAILABLE` e `CONNECTION_ERROR` são instáveis por natureza: três tentativas com espera crescente e, se ainda falhar, deixa para o cron do dia seguinte. A tela só mostra erro quando precisa de você — senha, MFA ou consentimento.
- **`nextAutoSyncAt` do item manda no cron.** Sincronizar antes dessa hora gasta chamada sem trazer dado novo.
- **O webhook exige URL pública**, então só funciona depois do primeiro deploy. Em desenvolvimento, o botão "atualizar agora" faz o mesmo caminho.
- **A fatura aberta muda de valor todo dia.** É o que faz o mês corrente passar a existir no painel — e por isso a comparação com o mês anterior precisa ser "dia 24 contra dia 24", não mês fechado contra mês fechado.

## IA: automático × sob demanda

A regra que resolve o custo é uma só: **nenhuma chamada de modelo dispara por navegação.** Só dado novo ou botão. Hoje, no artifact, abrir a aba já gastava — com OpenRouter isso sairia do seu bolso.

| Chamada | Quando | Gatilho | Cache |
| --- | --- | --- | --- |
| Extração de PDF | Automático | Upload, um pedaço de \~11 mil caracteres por vez | Não cabe: cada arquivo é único |
| Categorização de novos | Automático | Só os lançamentos que `learned_label` não cobre, em lote de até 100 | A regra aprendida substitui a chamada no mês seguinte |
| Resumo do mês | Automático | Só quando o `input_hash` do mês muda | `ai_output`, por mês e recorte de cartão |
| Anomalia ("143% acima da média") | Automático | **Sem IA**: comparação em SQL contra a média de 3 meses | — |
| Diagnóstico | Sob demanda | Botão, em stream | Guardado; marcado como desatualizado se o hash mudar |
| Chat do diagnóstico | Sob demanda | Cada turno. Contexto = números do mês + 6 turnos | — |
| Plano de 3 meses | Sob demanda | "Refazer" com o questionário | `plan` + `plan_target` |

A peça que barateia mais é a terceira coluna da linha de anomalia: comparar contra a média dos três meses é conta, não texto. A IA só entra quando o resultado vira frase.

Três proteções no código:

- `user_setting.modelo_ia` guarda o slug do OpenRouter e vale para tudo; um modelo de reserva atende se o escolhido devolver erro.
- Todo retorno grava `tokens_in`, `tokens_out` e `custo_usd` em `ai_output`. A tela de ajustes mostra o gasto do mês em dólar — sem isso você descobre o custo na fatura do OpenRouter.
- Teto mensal opcional: passado o limite, as chamadas automáticas param e as de botão continuam, com aviso. O painel nunca deixa de funcionar por falta de IA, só fica sem os textos.

## Ambiente e segredos

Nenhuma variável leva `NEXT_PUBLIC_`. O navegador só recebe um *connect token* do Pluggy, que é curto e descartável; nem a chave do Pluggy nem a do OpenRouter saem do servidor. É o que permite o repositório ser público.

```bash
# .env.example — vai para o repositório; .env.local nunca
DATABASE_URL=            # Neon, string com pooler (rotas)
DATABASE_URL_UNPOOLED=   # Neon, direta (migrações)

PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
PLUGGY_WEBHOOK_SECRET=   # valida o POST de /api/webhook/pluggy

OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5   # padrão; você troca na tela de ajustes
OPENROUTER_MODEL_FALLBACK=openai/gpt-4.1-mini
AI_BUDGET_USD_MONTH=10   # 0 = sem teto

APP_PASSWORD_HASH=       # argon2 da sua senha
SESSION_SECRET=          # assina o cookie
CRON_SECRET=             # a Vercel injeta no header do cron
```

O cron vive no `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/sync", "schedule": "0 9 * * *" }] }
```

Duas notas práticas sobre isso:

- **O agendamento da Vercel é em UTC.** `0 9 * * *` é 6h de Brasília. E no plano Hobby o cron roda **uma vez por dia** — o resto da atualidade vem do webhook do Pluggy, que avisa quando há lançamento novo. Na prática o webhook é o mecanismo principal e o cron é a rede de segurança.
- **Acesso ao banco pelo driver HTTP** (`@neondatabase/serverless`) em vez de TCP: funciona em função serverless sem esgotar conexão. Migração com Drizzle usando a string não-pooled.

No repositório vão `LICENSE` (AGPL-3.0), `.env.example`, as migrações e um README com o passo a passo de auto-hospedagem. Dado seu, nenhum — nem seed de exemplo com número real.

## Ordem de construção

Sete fatias, cada uma utilizável no fim. Nada de "faz tudo e liga no final".

1. **Esqueleto.** Next.js na Vercel, Neon com as migrações acima, login de senha única. Sem IA, sem Pluggy. No fim: um app vazio que sobe e autentica.
2. **Paridade com hoje.** O importador de PDF (o `pdf.js`, a divisão em pedaços e os prompts vindos quase inteiros do artifact), `txn`, categorias, `learned_label`, e as telas de detalhe, edição, exclusão e multi-seleção. **É a maior fatia e a que mais reaproveita código.** No fim: tudo o que você já usa, com dado que não depende de artifact.
3. **Painel do banco.** `/api/overview`, filtros de mês e cartão em SQL, composição compromisso × escolha, projeção, plano de 3 meses. As contas de `fecharMes` e `metasDoPlano` migram como estão — já estão corretas, só mudam de casa.
4. **Pluggy, leitura manual.** Widget de conexão, `connection`, `account`, botão "atualizar agora". Ainda sem cron. No fim: um cartão ao vivo convivendo com os PDFs — é aqui que a deduplicação prova que funciona, com um mês que existe nas duas fontes.
5. **Sync automático.** Webhook, cron, estados de consentimento, tela de Conexões.
6. **Conta corrente.** Saldo, entrada real, sobra até o fim do mês. O campo de renda digitada sai e o gasto fora do cartão deixa de ser estimativa. No fim o app deixa de ser "dos cartões" e passa a ser do dinheiro.
7. **Acabamento.** As pranchas de Open Finance viram tela de verdade, e os alertas passam a avisar em vez de esperar você abrir o app.

Dá para parar de forma útil em qualquer número. Parar na 3 já vale a migração: o mesmo app de hoje, sem o risco de perder dado.

## Decisões tomadas

Você aceitou as seis recomendações em 29 de setembro. Ficam registradas porque cada uma muda código, e em três meses ninguém lembra do porquê.

| Decisão | Opções | Decidido |
| --- | --- | --- |
| Autenticação | Senha única no `.env` × OAuth do GitHub | Senha única. É uma instalação por pessoa; OAuth só adiciona dependência |
| Plano do Pluggy | Gratuito × pago com `merchant` e categoria enriquecida | Começar no gratuito: sua `learned_label` já acerta mais que categorizador genérico, porque aprendeu com você |
| Conta corrente | Na fatia 4, junto do cartão × na fatia 6 | Na 6. Cartão e dedupe primeiro; conta corrente muda o conceito do app e merece atenção inteira |
| Modelo padrão e teto | Qual slug do OpenRouter, e teto em dólar | Um modelo médio para resumo e categorização, o melhor para diagnóstico e plano, teto de US$ 10 |
| Destino do artifact | Aposentar depois da fatia 3 × manter como rascunho | Manter até a 4 passar com dado real, aí congelar |
| Nome do projeto | `raio-x-fatura` × outro | Encurtar para \`raio-x\`. O que envelhecia era o "da Fatura", não o Raio-X |

O nome ficou **`raio-x`**. Era só o "da Fatura" que envelhecia: da fatia 6 em diante o app olha também a conta corrente, mas continua fazendo a mesma coisa — mostrar por dentro o que você não vê de fora. O repositório sai como `raio-x`.

Uma única coisa aqui é irreversível de fato: a licença. AGPL-3.0 está decidida e, publicada, não volta atrás sem o consentimento de quem contribuir.

## Segurança dos dados

O que esse banco guarda é mais sensível do que parece: cada compra sua, com data, valor e estabelecimento, por até 12 meses, mais saldo e limite. Isso reconstrói rotina, endereço, saúde e hábito de quem quiser ler. E o repositório vai ser **público**, o que estreita a margem de erro: chave commitada não é sustinho, é incidente.

O modelo de ameaça cabe em cinco linhas:

| O que vaza | Por onde | O que barra |
| --- | --- | --- |
| Chaves de Pluggy e OpenRouter | Commit no repositório público, bundle do front, log de erro | Zero `NEXT_PUBLIC_`, validação de env no boot, varredura de segredo no CI |
| O banco inteiro | `DATABASE_URL` vazada | Senha rotacionada, projeto do Neon sem IP público aberto, branch de dev com dado falso |
| A sessão | Cookie roubado | `httpOnly`, `Secure`, `SameSite=Lax`, expiração de 7 dias, rotação no login |
| Seus gastos, para terceiros | O que o app manda no prompt da IA | Minimização no código (abaixo) + política de dados do OpenRouter |
| CPF e nome do titular | Vem de graça do Pluggy e fica no banco sem necessidade | **Não gravar** |

Essa última linha é uma decisão de desenho, não um controle: o objeto `Account` do Pluggy traz `taxNumber` (CPF formatado) e `owner`. O app não precisa de nenhum dos dois para nada — o cartão é identificado por `last4` e pelo apelido que você dá. Descartar no mapeamento é uma linha de código e tira a informação mais regulada do sistema de dentro do banco.

O ponto mais delicado é o segundo mais abaixo da tabela: **a IA é o único lugar onde o dado sai da sua infraestrutura.** Pluggy e Neon são fornecedores contratados para isso; o OpenRouter roteia para um provedor de modelo que você nem sempre escolhe. A defesa é mandar o mínimo, numa função única que todo prompt tem de atravessar:

```ts
// tudo que vai para qualquer modelo passa por aqui. Nada de objeto cru.
function paraIA(t: Txn) {
  return {
    data: t.data,          // sem hora
    valor: t.valor,
    desc: t.desc_norm,     // normalizada, sem código de autorização
    categoria: t.categoria,
    cartao: t.apelido_conta // 'Itaú - Azul', nunca o last4, nunca o id
  };
}
// fora: id, account_id, pluggy_txn_id, saldo, limite, CPF, nome do titular
```

Na conta do OpenRouter, desligar o uso de prompts para treinamento nas configurações de dados, e preferir modelos de provedores que honram `zero data retention`. Isso vai no README como instrução de quem auto-hospedar — não dá para impor por código.

Sete regras que valem como padrão de código, não como boa intenção:

1. **`user_id` sempre da sessão, nunca do request.** Mesmo com um único usuário. É o hábito que evita o furo se um dia houver dois.
2. **Posse dentro do `where`, nunca num `if`.** `update txn set ... where id = $1 and user_id = $2` — um `select` seguido de checagem é o formato onde o IDOR nasce.
3. **Env validado no boot.** Um schema zod que derruba o processo se faltar chave ou se encontrar valor de exemplo; nada de `process.env.X ?? 'dev-secret'`.
4. **Nenhum segredo com default.** O padrão `${VAR:-valor}` é exatamente como segredo de exemplo vira segredo de produção.
5. **Log sem corpo.** Resposta do Pluggy nunca vai inteira para o log; só contagem e código de erro.
6. **Markdown da IA sanitizado antes de renderizar.** O diagnóstico e o chat voltam como texto de modelo e viram HTML na tela — é entrada não confiável como qualquer outra.
7. **Rota de apagar tudo.** Revoga o item no Pluggy e limpa o banco. Direito básico sobre o próprio dado, e serve de teste de que nada ficou órfão.

Criptografia de coluna no Postgres fica de fora de propósito: o Neon já cifra em repouso, e uma chave de aplicação guardada no mesmo servidor que lê os dados não protege contra nada realista — só dá sensação de proteger.

## Revisão de segurança antes de publicar

A auditoria das cinco categorias entra duas vezes: no fim da fatia 4, quando já existe dado real de banco passando pelo código, e outra vez imediatamente antes de o repositório virar público. Hoje ela não tem o que ler — não há código — então o que segue é o mapeamento das categorias para esta stack, que é justamente a parte que a auditoria pede para definir antes de começar.

| Categoria | Como se manifesta aqui | Onde olhar |
| --- | --- | --- |
| 1 · Banco sem tranca | Não há Supabase nem RLS: o isolamento é **filtro manual por `user_id` da sessão**. Falha = qualquer listagem, agregação ou export que esqueça o filtro | `lib/db/queries/*`, `/api/txn`, `/api/overview`, `/api/export/csv` |
| 2 · Permissão no navegador | Sem papéis (um usuário). A categoria vira **rotas que se defendem sozinhas**: cron e webhook não têm cookie e dependem de segredo próprio | `/api/cron/sync` (comparação em tempo constante do `CRON_SECRET`), `/api/webhook/pluggy` (assinatura conferida antes de ler o corpo) |
| 3 · IDOR | Toda rota `[id]`. Um `select` seguido de `if (row.user_id !== me)` é o formato errado | `/api/txn/[id]`, `/api/accounts/[id]`, `/api/connections/[id]` — todos os handlers, não amostra |
| 4 · Chaves expostas | Repositório público: a categoria mais cara aqui. Inclui **histórico do git**, não só o estado atual | `.env.example`, `vercel.json`, README, `next.config`, bundle do front, `git log -p` |
| 5 · Inputs sem tratamento | Um vetor domina: **o markdown que a IA devolve** vira HTML no diagnóstico, no chat e no resumo do mês | Componentes que renderizam resposta de modelo; `dangerouslySetInnerHTML` em qualquer lugar |

Duas categorias que a lista padrão não cobre e que este projeto precisa:

- **Força bruta no login.** Senha única em app exposto na internet pede limite de tentativa por IP e espera crescente. Sem isso, a única barreira do sistema é testável à vontade.
- **Replay de webhook.** `/api/webhook/pluggy` aceita POST sem sessão. Além da assinatura, guardar o id do evento e ignorar repetido.

O prompt da auditoria vai para `docs/security-audit/prompt-auditoria.md` no repositório, e o relatório gerado para `docs/security-audit/relatorio-auditoria-seguranca.pdf`, junto com o script que o regera. Assim a revisão é repetível a cada fatia, em vez de um evento único antes de publicar — e quem clonar o projeto herda o mesmo padrão.

Uma coisa a fazer antes de tudo isso, e que não custa nada: ligar **varredura de segredo no CI** (`gitleaks` numa action do GitHub) já no primeiro commit da fatia 1. É a única das cinco categorias em que o estrago é irreversível — chave publicada num repositório público deve ser considerada queimada, mesmo apagada minutos depois.
