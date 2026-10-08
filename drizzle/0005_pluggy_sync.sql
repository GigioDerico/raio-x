-- Lançamento do Pluggy que o passe aproximado não soube casar com um do PDF
-- (mais de um candidato): entra marcado e fica fora das contas até o dono
-- decidir, para não contar em dobro.
alter table txn add column if not exists suspeito_duplicado boolean not null default false;

-- OUTDATED do Pluggy: o item parou de atualizar por um motivo que não é senha
-- nem consentimento. Valor novo, não usado nesta transação.
alter type connection_status add value if not exists 'erro';
