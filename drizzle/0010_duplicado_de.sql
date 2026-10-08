-- O lançamento do PDF que o dono declarou ser a mesma compra de um do Pluggy
-- ("É este"): fica excluído e ligado a ele. Sem o vínculo, o PDF excluído
-- continuaria candidato no passe aproximado do sync e engoliria, em silêncio,
-- outra compra de mesmo valor e data próxima; e o "desfazer" não saberia qual
-- PDF restaurar.
alter table txn add column if not exists duplicado_de uuid references txn(id) on delete set null;
