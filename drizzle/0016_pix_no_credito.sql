-- Fatia 6.0, conferência com dado real.
--
-- Pix pago com o cartão de crédito aparece na conta como duas linhas: o crédito
-- que o banco libera ("Crédito liberado para Pix") e o Pix que sai ("Pix
-- enviado com cartão"). A compra de verdade já está na fatura do cartão; as
-- duas linhas da conta só passam o dinheiro adiante. O mapeamento passou a
-- marcá-las 'fora', mas o sync não regrava papel de linha existente: esta
-- migração corrige as que já entraram. Só as automáticas — a escolha do dono
-- (papel_fonte = 'manual') não é tocada.
update txn set papel = 'fora'
 where papel_fonte = 'auto'
   and papel in ('gasto', 'entrada')
   and account_id in (select id from account where kind = 'conta_corrente')
   and (desc_origem ~* '\mpix\M.*\mcom\s+cart[aã]o\M'
        or desc_origem ~* 'cr[eé]dito\s+liberado\s+para\s+pix');
