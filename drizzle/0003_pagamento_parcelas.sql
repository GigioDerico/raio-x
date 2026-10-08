-- Pagamento de fatura precisa de tipo próprio: o app exclui pagamento de todo
-- total, e gravado como 'escolha' com valor negativo ele descontava o mês.
alter type txn_kind add value if not exists 'pagamento';

-- A mesma compra parcelada aparece em várias faturas; o índice deixa a
-- importação reaproveitar o plano em vez de criar um por fatura.
create unique index if not exists installment_plan_chave
  on installment_plan (account_id, desc_norm, total_parcelas, valor_parcela, primeira_ref);
