-- Força bruta: a senha única é a única barreira do app, então tentativa
-- errada custa espera crescente. Guardado no banco (e não em memória) porque
-- em serverless cada instância teria o seu próprio contador.
create table login_attempt (
  ip            text primary key,
  tentativas    integer not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
