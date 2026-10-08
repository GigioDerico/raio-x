-- Fatia 6.3: a conta corrente já traz Pix, boleto e débito nos totais, então a
-- estimativa digitada de "gasto fora do cartão" saiu de Ajustes na 6.2 e nada
-- mais a lê. `renda_declarada` fica: a renda é digitada pelo dono.
alter table user_setting drop column if exists gasto_fora_cartao;
