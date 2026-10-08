-- Raio-X · esquema inicial
-- Postgres 16 (Neon). gen_random_uuid() é nativo.
--
-- Princípio do modelo: txn é a tabela central. A fatura (statement) é um
-- registro leve mais a view v_fatura; o total nunca é guardado, é somado.

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
  user_id           uuid primary key references app_user(id) on delete cascade,
  meta_poupanca     numeric(5,2)  not null default 20,   -- % da renda
  renda_declarada   numeric(14,2),                       -- fallback sem Open Finance
  gasto_fora_cartao numeric(14,2) not null default 0,    -- idem
  modelo_ia         text not null default 'anthropic/claude-sonnet-4.5',
  tz                text not null default 'America/Sao_Paulo'
);

-- Preenchida a partir do conector do Pluggy na primeira conexão com o banco.
-- Nunca semeada à mão: são ~270 instituições e a lista muda sozinha.
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
  consent_expira_em timestamptz,          -- null = consentimento sem prazo (o padrão no Pluggy)
  ultimo_sync_em    timestamptz,
  proximo_sync_em   timestamptz,          -- espelha nextAutoSyncAt do item
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
  apelido           text,          -- 'Itaú - Azul', dado pelo usuário; o sync nunca sobrescreve
  nome_origem       text,          -- como a instituição escreve, que muda entre meses
  limite            numeric(14,2),
  saldo             numeric(14,2),
  saldo_em          timestamptz,
  dia_fechamento    smallint,
  dia_vencimento    smallint,
  ativo             boolean not null default true
);

-- CPF (taxNumber) e nome do titular (owner) vêm de graça do Pluggy e NÃO são
-- gravados: o app identifica o cartão por last4 + apelido. Decisão de segurança.

-- um cartão é UM registro mesmo que o banco mude de nome no PDF
create unique index account_chave
  on account (user_id, kind, coalesce(last4, institution_id::text));

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
  primeira_ref   date not null,        -- data da COMPRA, não da parcela
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
  apelido        text,                     -- nome que o usuário deu a este lançamento
  category_id    bigint references category(id),
  category_fonte text not null default 'ia',  -- 'ia'|'regra'|'manual'|'pluggy'
  tipo           txn_kind not null default 'escolha',
  installment_id uuid references installment_plan(id) on delete set null,
  parcela_n      smallint,
  fonte          txn_source not null,
  pluggy_txn_id  text unique,
  dedupe_key     text not null,            -- chave natural; ver lib/dedupe.ts
  pendente       boolean not null default false,  -- status PENDING no Pluggy
  excluido_em    timestamptz,              -- exclusão lógica: o sync não ressuscita
  criado_em      timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index txn_mes   on txn (user_id, data desc) where excluido_em is null;
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
  ritmo         text not null,           -- 'suave' | 'equilibrado' | 'firme'
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
  tokens_in  integer,
  tokens_out integer,
  custo_usd  numeric(10,6),
  criado_em  timestamptz not null default now(),
  unique (user_id, kind, escopo, input_hash)
);

create table sync_run (
  id            bigint generated always as identity primary key,
  connection_id uuid references connection(id) on delete cascade,
  iniciado_em   timestamptz not null default now(),
  terminado_em  timestamptz,
  resultado     text,        -- 'ok' | 'parcial' | 'erro'
  novos       integer not null default 0,
  atualizados integer not null default 0,
  duplicados  integer not null default 0,
  detalhe       jsonb
);

-- a fatura como VISÃO: o total é sempre somado do txn, nunca guardado
create view v_fatura as
select s.id, s.account_id, s.mes_ref, s.fechamento, s.vencimento, s.status,
       s.total_informado,
       coalesce(sum(t.valor), 0) as total_calculado,
       count(t.id)               as lancamentos
from statement s
left join txn t on t.statement_id = s.id and t.excluido_em is null
group by s.id;
