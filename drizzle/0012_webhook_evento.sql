-- Tarefa 5.0 (sync automático).
--
-- webhook_evento: o eventId de cada aviso do Pluggy já recebido. O corpo do
-- webhook não é assinado e o Pluggy reenvia o que não teve 2xx a tempo; sem
-- esta trava, o mesmo evento (ou um capturado e repetido) dispararia o sync
-- de novo. A rota apaga as linhas com mais de 30 dias no mesmo comando do
-- insert: ninguém reenvia um evento tão velho, e a tabela não cresce sem fim.
create table if not exists webhook_evento (
  event_id text primary key,
  recebido_em timestamptz not null default now()
);

-- ultima_tentativa_em: quando um sync automático (cron ou webhook) começou
-- nesta conexão, deu certo ou não. Serve de trava — os três avisos de um mesmo
-- refresh do Pluggy (item/updated, transactions/created e /updated) chegam
-- juntos, e só o primeiro a reservar sincroniza — e de fila do cron: a
-- conexão que travou ontem vai para o fim, em vez de comer o orçamento de novo.
alter table connection add column if not exists ultima_tentativa_em timestamptz;
