-- Categorias iniciais.
--
-- São exatamente as do app atual, e não um conjunto "melhor": suas regras
-- aprendidas, seus PDFs já importados e sua memória de onde cada coisa entra
-- estão presos a estes nomes. Trocar o vocabulário aqui jogaria fora o
-- aprendizado de meses para ganhar estética.
--
-- 'grupo' separa compromisso de escolha — a divisão que o painel usa para dizer
-- quanto do mês já estava decidido antes de começar.
insert into category (nome, grupo, ordem, builtin) values
  ('Mercado & Padaria',       'essencial',  10, true),
  ('Casa & Contas',           'essencial',  20, true),
  ('Transporte',              'essencial',  30, true),
  ('Saúde & Farmácia',        'essencial',  40, true),
  ('Educação',                'essencial',  50, true),
  ('Assinaturas & Apps',      'essencial',  60, true),
  ('Restaurantes & Delivery', 'flexivel',   70, true),
  ('Compras & Vestuário',     'flexivel',   80, true),
  ('Lazer & Viagem',          'flexivel',   90, true),
  ('Construção / Obras',      'flexivel',  100, true),
  ('Serviços & Profissional', 'flexivel',  110, true),
  ('Encargos do cartão',      'encargo',   120, true),
  ('Outros',                  'flexivel',  999, true)
on conflict (nome) do nothing;
