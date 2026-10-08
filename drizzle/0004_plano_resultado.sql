-- A saída inteira de ajustarPlano (ações, alvos, fixos, nota, avisos): a tela
-- mostra o plano como foi montado, sem recalcular com as faturas de hoje.
-- plan_target segue como a forma consultável das metas.
alter table plan add column if not exists resultado jsonb;
