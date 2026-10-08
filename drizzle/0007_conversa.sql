-- Uma linha por fala da conversa sobre um recorte. dados_hash é o hash dos
-- números que a IA tinha na hora: a tela compara com o atual para avisar que
-- respostas antigas falam de números que mudaram.
create table if not exists conversa_turno (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references app_user(id) on delete cascade,
  escopo     text not null,
  papel      text not null check (papel in ('pessoa', 'ia')),
  texto      text not null,
  dados_hash text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists conversa_turno_escopo on conversa_turno (user_id, escopo, criado_em, id);
