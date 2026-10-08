-- Fatia 6.0 (conta corrente).
--
-- papel: se o lançamento conta como gasto, como renda ou não conta. É outra
-- pergunta que `tipo` (a composição: fixo, parcela, encargo, escolha): misturar
-- as duas faria os cálculos portados do app antigo errarem sem avisar. Tudo o
-- que já existe é cartão e vira 'gasto', então nada muda no que já está gravado.
--   gasto   débito da conta ou lançamento do cartão
--   entrada crédito da conta que o dono ainda não marcou
--   renda   crédito que o dono marcou como renda (ou aprendido da origem)
--   fora    pagamento de fatura, transferência própria, aplicação, resgate
alter table txn add column if not exists papel text not null default 'gasto'
  check (papel in ('gasto', 'entrada', 'renda', 'fora'));

-- papel_fonte: 'manual' é a escolha do dono e nenhum sync a desfaz, como a
-- category_fonte (regra 7). O update do sync nunca toca em papel; o insert
-- grava 'auto'.
alter table txn add column if not exists papel_fonte text not null default 'auto'
  check (papel_fonte in ('auto', 'manual'));

-- O papel aprendido pela origem (desc_norm): marcar "É renda" uma vez faz os
-- próximos créditos da mesma origem chegarem como renda.
alter table learned_label add column if not exists papel text
  check (papel in ('entrada', 'renda', 'fora'));
