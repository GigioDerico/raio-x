-- Tarefa 4.4 (auditoria 4.3, A-07 e A-10).
--
-- ia_chamada: cada chamada de IA, gravada ANTES de chamar o modelo. A ai_uso só
-- registra depois, com o custo, e perderia a chamada que falhou — e é a
-- contagem que segura um laço gastando a chave.
create table if not exists ia_chamada (
  id bigint generated always as identity primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  origem text not null,
  em timestamptz not null default now()
);
create index if not exists ia_chamada_user_em on ia_chamada (user_id, em);

-- login_falha: falhas de login de todos os IPs, para o teto global suave.
-- Por IP não basta: muitos IPs têm cada um as suas tentativas livres.
create table if not exists login_falha (
  id bigint generated always as identity primary key,
  em timestamptz not null default now()
);
create index if not exists login_falha_em on login_falha (em);
