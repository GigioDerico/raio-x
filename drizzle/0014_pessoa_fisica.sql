-- Fatia 6.0, revisão (C1).
--
-- pessoa_fisica: a outra ponta deste lançamento é uma pessoa (Pix ou TED para
-- CPF, ou transferência sem documento). Quem decide é o mapeamento do Pluggy,
-- olhando o `paymentData` — que só existe durante o sync e não é gravado
-- (regra 5). Depois do sync, só esta coluna diz que a descrição traz o nome de
-- alguém e não pode sair para a IA (regra 4): nem na categorização, nem nos
-- prompts agregados (resumo, diagnóstico, conversa, plano). A tela continua
-- mostrando o nome ao dono; quem mascara é `contextoParaIA` em src/lib/ia.ts.
alter table txn add column if not exists pessoa_fisica boolean not null default false;

-- A conta corrente sincronizada antes desta coluna não tem mais o `paymentData`
-- para decidir, e o sync não regrava linha existente. Vale então a regra
-- conservadora do mapeamento sem documento: Pix, TED, DOC ou transferência na
-- descrição conta como pessoa física. Marcar a mais só tira o nome do prompt;
-- marcar a menos mandaria o nome de alguém para fora.
update txn set pessoa_fisica = true
 where pessoa_fisica = false
   and desc_origem ~* '\m(pix|ted|doc|transf\w*)\M'
   and account_id in (select id from account where kind = 'conta_corrente');
