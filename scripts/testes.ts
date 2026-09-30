/**
 * Testes das partes que não dependem do banco: senha e cookie de sessão.
 *
 *   npm test
 *
 * Sem framework de propósito — são as duas peças de segurança da fatia 1 e
 * precisam rodar em qualquer lugar, inclusive no CI, sem instalar nada a mais.
 */
import { randomBytes } from 'node:crypto';
import { FORMATO, gerarHash, conferirSenha } from '../src/lib/senha';
import { assinar, verificar, DURACAO_S } from '../src/lib/session';
import {
  chaveAprendizado,
  lerParcela,
  mesmoEstabelecimento,
  normalizarDescricao,
  parecido,
  parseValor,
  LIMIAR_PARECIDO,
  somarMeses,
} from '../src/lib/descricao';
import { chaveDedupe, comOrdinais } from '../src/lib/dedupe';
import { limparLanc, mesDeReferencia, pedacos, tirarRepetidosDaLeitura } from '../src/lib/extracao';
import { normalizarCategoria, ehCompromisso } from '../src/lib/categorias';

let falhas = 0;

function checar(nome: string, ok: boolean) {
  process.stdout.write(`${ok ? '  ok  ' : ' FALHA'}  ${nome}\n`);
  if (!ok) falhas++;
}

async function main() {
  const SENHA = 'senha-de-teste-123';
  const SEGREDO = randomBytes(32).toString('base64url');

  // ---- senha ----------------------------------------------------------------
  const hash = await gerarHash(SENHA);

  checar('hash bate com o formato exigido em src/env.ts', FORMATO.test(hash));
  checar('hash não contém "$" (não expande em arquivo .env)', !hash.includes('$'));
  checar('senha correta confere', await conferirSenha(SENHA, hash));
  checar('senha errada não confere', !(await conferirSenha('senha-de-teste-124', hash)));
  checar('hash truncado não confere', !(await conferirSenha(SENHA, hash.slice(0, -4))));
  checar('hash malformado não confere', !(await conferirSenha(SENHA, 'bobagem')));
  checar('custo absurdo não derruba o processo', !(await conferirSenha(SENHA, 'scrypt:1:1:1:AAAA:AAAA')));
  checar('sal aleatório: dois hashes da mesma senha diferem', hash !== (await gerarHash(SENHA)));
  checar('senha normalizada (NFKC) confere', await conferirSenha(SENHA.normalize('NFD'), hash));

  // ---- sessão ---------------------------------------------------------------
  const exp = Math.floor(Date.now() / 1000) + DURACAO_S;
  const token = await assinar({ sub: 'u-1', exp }, SEGREDO);
  const [corpo, mac] = token.split('.') as [string, string];

  checar('token válido é aceito', (await verificar(token, SEGREDO))?.sub === 'u-1');
  checar(
    'token com outro segredo é rejeitado',
    (await verificar(token, randomBytes(32).toString('base64url'))) === null,
  );

  const forjado = Buffer.from(JSON.stringify({ sub: 'invasor', exp }), 'utf8').toString('base64url');
  checar('corpo trocado com MAC antigo é rejeitado', (await verificar(`${forjado}.${mac}`, SEGREDO)) === null);
  checar('assinatura adulterada é rejeitada', (await verificar(`${corpo}.${mac.slice(0, -2)}xy`, SEGREDO)) === null);
  checar('token sem ponto é rejeitado', (await verificar('semponto', SEGREDO)) === null);
  checar(
    'base64 inválido é rejeitado sem estourar',
    (await verificar('!!!!.@@@@', SEGREDO)) === null,
  );
  checar(
    'token bem assinado mas sem dono é rejeitado',
    (await verificar(await assinar({ sub: '', exp }, SEGREDO), SEGREDO)) === null,
  );
  checar('cookie ausente é rejeitado', (await verificar(undefined, SEGREDO)) === null);

  const vencido = await assinar({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) - 60 }, SEGREDO);
  checar('token expirado é rejeitado', (await verificar(vencido, SEGREDO)) === null);

  // ---- descrição e chaves -------------------------------------------------
  process.stdout.write('\n');

  checar(
    'normalização tira acento, código de autorização e parcela',
    normalizarDescricao('Compra PÃO DE AÇÚCAR 03/10 AUT 998877') === 'PAO DE ACUCAR',
  );
  checar(
    'mesma loja em meses diferentes dá a mesma chave',
    chaveAprendizado('ASSAI ATACADISTA SAO PAULO 4471') ===
      chaveAprendizado('Assaí Atacadista São Paulo 9912'),
  );
  checar('chave de aprendizado tem no máximo 3 palavras', chaveAprendizado('A B C D E F').split(' ').length <= 3);
  checar(
    'PIX e transferência para a mesma pessoa são o mesmo estabelecimento',
    mesmoEstabelecimento('TRANSFERENCIA PARA ADRIANA MARTINS', 'PIX ADRIANA MARTINS'),
  );
  checar(
    'lugares diferentes não se confundem',
    !mesmoEstabelecimento('PADARIA CENTRAL', 'POSTO IPIRANGA'),
  );
  checar(
    'erro de leitura ainda passa do limiar',
    parecido('NETFLIX COM', 'NETFLIX C0M') >= LIMIAR_PARECIDO,
  );
  checar(
    'estabelecimentos distintos ficam abaixo do limiar',
    parecido('PADARIA CENTRAL', 'POSTO IPIRANGA') < LIMIAR_PARECIDO,
  );
  checar(
    'nomes que só compartilham o começo não passam',
    parecido('SUPERMERCADO SAO JOSE', 'SUPERMERCADO SANTA RITA') < LIMIAR_PARECIDO,
  );

  checar('valor "1.234,56" vira 1234.56', parseValor('R$ 1.234,56') === 1234.56);
  checar('valor "1234.56" vira 1234.56', parseValor('1234.56') === 1234.56);
  checar('valor vazio não vira número', Number.isNaN(parseValor('')));
  checar('soma de meses vira o ano', somarMeses('2026-11', 3) === '2027-02');
  checar('parcela "3/10" é lida', lerParcela('3/10')?.total === 10);
  checar('parcela "10/10" não é parcela futura válida', lerParcela('11/10') === null);
  checar('parcela "1/1" é ignorada', lerParcela('1/1') === null);

  const k1 = chaveDedupe('conta-1', '2026-09-03', 12.5, 'PADARIA', 0);
  checar('mesma compra dá a mesma chave', k1 === chaveDedupe('conta-1', '2026-09-03', 12.5, 'PADARIA', 0));
  checar('sinal não muda a chave', k1 === chaveDedupe('conta-1', '2026-09-03', -12.5, 'PADARIA', 0));
  checar('ordinal diferente dá chave diferente', k1 !== chaveDedupe('conta-1', '2026-09-03', 12.5, 'PADARIA', 1));
  checar('outra conta dá chave diferente', k1 !== chaveDedupe('conta-2', '2026-09-03', 12.5, 'PADARIA', 0));

  const doisCafes = comOrdinais([
    { data: '2026-09-03', valor: 12, descNorm: 'PADARIA' },
    { data: '2026-09-03', valor: 12, descNorm: 'PADARIA' },
    { data: '2026-09-03', valor: 30, descNorm: 'PADARIA' },
  ]);
  checar('dois cafés iguais no mesmo dia ganham ordinais 0 e 1', doisCafes[0]?.ordinal === 0 && doisCafes[1]?.ordinal === 1);
  checar('valor diferente recomeça o ordinal', doisCafes[2]?.ordinal === 0);

  // ---- extração -----------------------------------------------------------
  checar('categoria fora da lista vira Outros', normalizarCategoria('Viagem Espacial') === 'Outros');
  checar('categoria renomeada é migrada', normalizarCategoria('Mercado') === 'Mercado & Padaria');
  checar('restaurante é escolha, não compromisso', !ehCompromisso('Restaurantes & Delivery'));
  checar('mercado é compromisso', ehCompromisso('Mercado & Padaria'));

  checar('linha sem valor é descartada', limparLanc({ d: '2026-09-01', desc: 'X', val: '0' }) === null);
  checar(
    'estorno mantém o sinal negativo',
    limparLanc({ d: '2026-09-01', desc: 'X', val: -10, tipo: 'estorno' })?.val === -10,
  );
  checar(
    'data fora do formato vira vazia',
    limparLanc({ d: '01/09/2026', desc: 'X', val: 10 })?.d === '',
  );
  checar(
    'parcela mal formada some',
    limparLanc({ d: '2026-09-01', desc: 'X', val: 10, parc: 'x/y' })?.parc === null,
  );

  const texto = Array.from({ length: 200 }, (_, i) => `LINHA ${i} ALGUM ESTABELECIMENTO 12,34`).join('\n');
  const partes = pedacos(texto, 500);
  checar('divisão respeita o tamanho pedido', partes.every((p) => p.length <= 560));
  checar('divisão não perde linha', partes.join('').split('\n').filter(Boolean).length === 200);

  const repetidos = tirarRepetidosDaLeitura([
    { d: '2026-09-01', desc: 'A', val: 10, cat: 'Outros', parc: null, tipo: 'compra' },
    { d: '2026-09-01', desc: 'A', val: 10, cat: 'Outros', parc: null, tipo: 'compra' },
  ]);
  checar('linha repetida entre pedaços é removida', repetidos.length === 1);

  checar(
    'mês de referência vem do vencimento',
    mesDeReferencia({ banco: 'X', cartao: '1', vencimento: '2026-09-10', total: 0 }, []) === '2026-09',
  );
  checar(
    'sem vencimento, compra de agosto cai na fatura de setembro',
    mesDeReferencia({ banco: 'X', cartao: '1', vencimento: '', total: 0 }, [
      { d: '2026-08-20', desc: 'A', val: 10, cat: 'Outros', parc: null, tipo: 'compra' },
    ]) === '2026-09',
  );

  process.stdout.write(falhas === 0 ? '\nTodos os testes passaram.\n' : `\n${falhas} falha(s).\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
