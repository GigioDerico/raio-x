-- Nome do estabelecimento sem cidade, país nem código, dado pela IA para o que vem
-- do Pluggy ("SUPERMERCADO CANDIO OLNAZARE PAULISBR" → "Supermercado Candio"). O
-- desc_origem fica como veio: dedupe e regras aprendidas continuam presos a ele.
alter table txn add column if not exists desc_limpa text;
