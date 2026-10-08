-- Fatia 6.0, segunda revisão (I4).
--
-- Decisão do dono: Pix, TED e transferência para pessoa física não levam o nome
-- à IA também quando pagos no cartão ou lidos de uma fatura em PDF. A 0014 só
-- marcou a conta corrente; o sync do cartão e a importação do PDF passam a
-- gravar a coluna (`pareceTransferenciaParaPessoa`, src/lib/descricao.ts), mas
-- o que já está gravado não volta por eles.
--
-- Nenhuma das duas fontes guarda o documento de quem recebeu, então vale a
-- regra conservadora sem documento, a mesma da 0014, agora em qualquer conta:
-- marcar a mais só tira o nome do prompt; marcar a menos mandaria o nome de
-- alguém para fora (regra 4).
update txn set pessoa_fisica = true
 where pessoa_fisica = false
   and desc_origem ~* '\m(pix|ted|doc|transf\w*)\M';
