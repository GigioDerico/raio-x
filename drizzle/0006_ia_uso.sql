-- Uma linha por chamada de modelo, só com números: é daqui que sai o gasto do
-- mês em Ajustes. ai_output não serve para isso — é cache por prompt, e
-- reimportar o mesmo PDF contaria uma chamada só.
create table if not exists ai_uso (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references app_user(id) on delete cascade,
  kind       text not null,
  modelo     text not null,
  tokens_in  integer not null default 0,
  tokens_out integer not null default 0,
  custo_usd  numeric(10,6),
  criado_em  timestamptz not null default now()
);
create index if not exists ai_uso_mes on ai_uso (user_id, criado_em);

-- teto mensal de IA em dólar; nulo = AI_BUDGET_USD_MONTH do .env, 0 = sem teto
alter table user_setting add column if not exists teto_ia_usd numeric(8,2);
