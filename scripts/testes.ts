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
  pareceTransferenciaParaPessoa,
  podeAprender,
  LIMIAR_PARECIDO,
  somarMeses,
} from '../src/lib/descricao';
import { chaveDedupe, comOrdinais, prefixoDedupe } from '../src/lib/dedupe';
import { limparLanc, mesDeReferencia, pedacos, tirarRepetidosDaLeitura } from '../src/lib/extracao';
import { NOMES, normalizarCategoria, ehCompromisso } from '../src/lib/categorias';
import { planoDaParcela, tipoDoTxn } from '../src/lib/importacao';
import { completarComCookie, deParametros, ehUuid, filtroParaLembrar, lerFiltro, mesPorExtenso, paraQuery, resolverMes, rotuloMes } from '../src/lib/filtro';
import { candidatosDoSuspeito, validarDecisao, type LinhaDup } from '../src/lib/duplicados';
import { avisoIgnorados, ErroLocal, FalhaHttp, FalhaRede, mensagemDeFalha, textoDoErro } from '../src/lib/falha';
import { fraseDoVazio, linksDoVazio, nomesDosCartoes, queryDoVazio } from '../src/lib/vazio';
import { formatarCampo, linhaDoCartao, validarConfig, validarConta, type CartaoAjuste } from '../src/lib/ajustes';
import { resumoGasto } from '../src/lib/ia-gasto';
import { limiteDeIA, POR_10_MIN, POR_DIA, textoLimiteIA } from '../src/lib/ia-limite';
import { ipDaRequisicao, SEM_IP } from '../src/lib/ip';
import { esperaSegundos } from '../src/lib/tentativas';
import { montarCsv, type LinhaCsv } from '../src/lib/csv';
import { confirmouApagar, FRASE_APAGAR } from '../src/lib/dados';
import { paridadeBase, paridadeMeses, paridadeComposicao, paridadeVisual, paridadeProjecao, paridadePlano, contexto } from './paridade';
import { configDoUsuario, montarFaturas, separarObra, type LinhaPainel } from '../src/lib/calculos/adaptador';
import { faturasDeTeste } from './fixture-legado';
import { ateDia, compararCiclo, hojeEmSaoPaulo, inicioDoCiclo, projetarFechamento } from '../src/lib/calculos/ciclo';
import { moeda, moeda0, pct } from '../src/lib/formato';
import { resumoDoPainel } from '../src/lib/calculos/painel';
import { porMes } from '../src/lib/calculos/meses';
import { addMonths, CATS, CONFIG_PADRAO, nomeExibido, normDesc, type Contexto, type Fatura, type Lanc } from '../src/lib/calculos/base';
import { resumoDasCategorias, hrefDaCategoria } from '../src/lib/calculos/categorias';
import type { Projecao } from '../src/lib/calculos/parcelas';
import { montarPrevisto, previsto } from '../src/lib/calculos/previsto';
import { limparFixos, respostaTemCategorias, validarPrefs } from '../src/lib/plano-prefs';
import { fraseSemPlano, subtituloPlano, notasDoPlano, feitoPara, planoTerminou } from '../src/lib/plano-texto';
import { contextoParaIA, rotuloDaPessoa, dadosDiagnostico, lerCategorias, mensagensConversa, PESSOA_FISICA_PARA_IA, promptCategorizar, promptDeExtracaoParaIA, promptDiagnostico, promptPlano, promptResumo, semDocumentos, textoDaFaturaParaIA } from '../src/lib/ia';
import { chaveRecorte, dadosResumo, lerResumo, lerTexto } from '../src/lib/calculos/resumo';
import { markdownLeve } from '../src/lib/markdown-leve';
import { consumirNdjson, lerNdjson, linhaNdjson, type EventoLido } from '../src/lib/ndjson';
import { divisoriaEm, LIMITE_PERGUNTA, SUGESTOES, validarPergunta, type FalaGuardada } from '../src/lib/conversa';
import { lerLinhaSse } from '../src/lib/sse';
import { categoriaHerdada, chaveDoNome, nomeNaTela, textoMudouJunto, textoRenomeado, validarNovoNome } from '../src/lib/nome-na-tela';
import { blocosDeEntradas, chaveDaRegraDePapel, chavePapel, origensDoPapel, papelAceito, PREFIXO_PAPEL, regraDoPapel, textoDoPapel, type LinhaEntrada } from '../src/lib/papel';
import { PREFS_PADRAO, metasDoPlano, ajustarPlano, type ResultadoPlano } from '../src/lib/calculos/plano';
import { composicaoMes, recorrentesFixas } from '../src/lib/calculos/composicao';
import { bancoDoCodigo, casarConta, contaDoPluggy, destinoNoSync, ehPessoaFisica, escolherInstituicao, faturaDaBill, faturasAbertasDosRecebidos, lancamentoDaConta, lancamentoDoPluggy, mesDaFaturaAberta, mesesDasFaturas, normalizarNomeBanco, papelDaConta, statusDoItem, type ContaExistente, type Recebido } from '../src/lib/pluggy/mapear';
import { janelaAtualizar, janelaInicial, precisaSincronizar } from '../src/lib/pluggy/janela';
import { avisoDasConexoes, conexoesOrfas, estadoDaConexao, haQuanto } from '../src/lib/pluggy/estado';
import { lerEventoPluggy } from '../src/lib/pluggy/webhook';
import { segredoConfere, segredoOpcional } from '../src/lib/segredo';
import { resumoDoErro } from '../src/lib/log';
import { camposDaAcao, planejarSync, type Acao, type Existente } from '../src/lib/pluggy/planejar';
import { criarClientePluggy, SemChavePluggy } from '../src/lib/pluggy/http';
import { BILL, CNPJ_LOJA, CONTA_CARTAO, CONTA_CORRENTE, CPF_TITULAR, NOME_TITULAR, tx } from './fixture-pluggy';

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
  // troca o PRIMEIRO caractere: o último de um MAC de 32 bytes em base64url só carrega
  // 4 bits, e trocá-lo pode decodificar nos mesmos bytes (o teste falhava às vezes)
  const adulterado = (mac.startsWith('A') ? 'B' : 'A') + mac.slice(1);
  checar('assinatura adulterada é rejeitada', (await verificar(`${corpo}.${adulterado}`, SEGREDO)) === null);
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
  // 6.0, I1: o Pix para a pessoa e o Pix para a empresa caem na mesma chave;
  // o apelido dado à pessoa voltaria pela regra no lançamento da empresa
  checar('Pix para pessoa e para empresa têm a mesma chave de regra', chaveAprendizado('PIX ENVIADO CP MARIA SILVA') === chaveAprendizado('PIX ENVIADO CP PADARIA PAO QUENTE'));
  checar('transferência para pessoa pela descrição', ['PIX TRANSF MARIA', 'TED 001 FULANO', 'DOC FULANO DE TAL', 'TRANSFERÊNCIA ENVIADA', 'Transf p/ Maria', 'pix enviado'].every(pareceTransferenciaParaPessoa));
  checar('compra comum não parece transferência', !['DOCERIA DA ANA', 'TEDDY BAR', 'PIXEL STORE', 'MERCADO LIVRE', 'PAGTO BOLETO ESCOLA'].some(pareceTransferenciaParaPessoa));
  checar('pessoa física não ensina regra', !podeAprender({ pessoaFisica: true }) && podeAprender({ pessoaFisica: false }));
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

  // ---- importação ---------------------------------------------------------
  process.stdout.write('\n');

  checar('pagamento vira tipo pagamento', tipoDoTxn('pagamento', null) === 'pagamento');
  checar('encargo vira tipo encargo', tipoDoTxn('encargo', null) === 'encargo');
  checar('compra parcelada vira parcela', tipoDoTxn('compra', { n: 3, total: 10 }) === 'parcela');
  checar('compra à vista vira escolha', tipoDoTxn('compra', null) === 'escolha');
  checar('estorno vira escolha (valor negativo carrega o sentido)', tipoDoTxn('estorno', null) === 'escolha');
  checar('encargo parcelado continua encargo', tipoDoTxn('encargo', { n: 1, total: 3 }) === 'encargo');

  const pp = planoDaParcela('2026-09', { n: 3, total: 10 }, 300);
  checar('plano da parcela guarda o total', pp.totalParcelas === 10);
  checar('plano da parcela guarda o valor com 2 casas', pp.valorParcela === '300.00');
  checar('primeira parcela de 3/10 em set/26 foi em jul/26', pp.primeiraRef === '2026-07-01');
  checar(
    'primeira parcela atravessa o ano',
    planoDaParcela('2026-02', { n: 5, total: 12 }, 99.9).primeiraRef === '2025-10-01',
  );
  checar(
    'valor negativo vira valor absoluto no plano',
    planoDaParcela('2026-09', { n: 1, total: 2 }, -50).valorParcela === '50.00',
  );

  // ---- filtro global --------------------------------------------------------
  process.stdout.write('\n');

  const U1 = '11111111-1111-4111-8111-111111111111';
  const U2 = '22222222-2222-4222-8222-222222222222';

  const f1 = lerFiltro(new URLSearchParams(`mes=2026-09&cartoes=${U1},${U2}&obra=1`));
  checar('filtro lê mês', f1.mes === '2026-09');
  checar('filtro lê cartões', f1.cartoes.length === 2 && f1.cartoes[0] === U1);
  checar('filtro lê obra', f1.obra === true);
  checar('filtro aceita TODOS', lerFiltro(new URLSearchParams('mes=TODOS')).mes === 'TODOS');
  checar('mês inválido vira nulo', lerFiltro(new URLSearchParams('mes=2026-13')).mes === null);
  checar('mês com lixo vira nulo', lerFiltro(new URLSearchParams("mes=2026-09';drop")).mes === null);
  checar(
    'cartão que não é uuid é descartado',
    lerFiltro(new URLSearchParams(`cartoes=${U1},abc`)).cartoes.join() === U1,
  );
  checar('sem parâmetros: padrão', JSON.stringify(lerFiltro(new URLSearchParams(''))) === '{"mes":null,"cartoes":[],"obra":false}');
  checar(
    'no máximo 20 cartões',
    lerFiltro(new URLSearchParams(`cartoes=${Array(30).fill(U1).join(',')}`)).cartoes.length === 20,
  );

  checar('query ida e volta', paraQuery(f1) === `mes=2026-09&cartoes=${U1}%2C${U2}&obra=1`);
  checar('query vazia para o padrão', paraQuery({ mes: null, cartoes: [], obra: false }) === '');

  const ms = ['2026-09', '2026-08', '2026-07'];
  checar('sem mês escolhido: o mais recente', resolverMes(null, ms) === '2026-09');
  checar('mês existente é mantido', resolverMes('2026-08', ms) === '2026-08');
  checar('mês sem dado cai no mais recente', resolverMes('2025-01', ms) === '2026-09');
  checar('lembrar: mês mais recente vira sem mês', filtroParaLembrar(new URLSearchParams(`mes=2026-09&cartoes=${U1}`), '2026-09') === `cartoes=${U1}`);
  checar('lembrar: link de categoria não grava', filtroParaLembrar(new URLSearchParams('mes=2026-09&cat=Mercado'), '2026-09') === null && filtroParaLembrar(new URLSearchParams('mes=2026-07&cat=Mercado'), '2026-09') === null);
  checar('lembrar: outros casos = paraQuery', filtroParaLembrar(new URLSearchParams('mes=2026-07&obra=1'), '2026-09') === 'mes=2026-07&obra=1' && filtroParaLembrar(new URLSearchParams('mes=TODOS'), '2026-09') === 'mes=TODOS' && filtroParaLembrar(new URLSearchParams(''), '2026-09') === '' && filtroParaLembrar(new URLSearchParams('mes=2026-09'), undefined) === 'mes=2026-09');
  checar('TODOS vira sem filtro de mês', resolverMes('TODOS', ms) === null);
  checar('sem nenhum mês: nulo', resolverMes(null, []) === null);

  checar('URL sem filtro ganha o cookie', completarComCookie('', 'mes=2026-08') === '?mes=2026-08');
  checar('URL com filtro fica como está', completarComCookie('?mes=2026-09', 'mes=2026-08') === null);
  checar(
    'outros parâmetros são mantidos',
    completarComCookie('?cat=Outros', 'mes=2026-08') === '?cat=Outros&mes=2026-08',
  );
  checar('sem cookie não redireciona', completarComCookie('', undefined) === null);
  checar('cookie inválido não redireciona', completarComCookie('', 'mes=lixo') === null);

  checar('rótulo do mês', rotuloMes('2026-09') === 'set/26');

  // ---- paridade com o app antigo -------------------------------------------
  process.stdout.write('\n');
  paridadeBase(checar);
  paridadeMeses(checar);
  paridadeComposicao(checar);
  paridadeVisual(checar);
  paridadeProjecao(checar);
  paridadePlano(checar);

  // ---- adaptador ------------------------------------------------------------
  process.stdout.write('\n');

  const linha = (x: Partial<LinhaPainel>): LinhaPainel => ({
    statementId: 's1', accountId: 'c1', mes: '2026-07', banco: 'Sicredi', last4: '2222', apelidoConta: null,
    desc: 'LOJA', limpa: null, apelido: null, valor: '10.00', categoria: 'Outros', tipo: 'escolha', parcelaN: null,
    totalParcelas: null, vencimento: null, data: '2026-07-01', aberta: false, fechamento: null, privado: false, ...x,
  });
  const mf = montarFaturas([
    linha({ desc: 'RENNER', valor: '149.90', tipo: 'parcela', parcelaN: 3, totalParcelas: 3, categoria: 'Compras & Vestuário' }),
    linha({ desc: 'PAGAMENTO', valor: '-500.00', tipo: 'pagamento' }),
    linha({ desc: 'ESTORNO LOJA', valor: '-20.00', tipo: 'escolha' }),
    linha({ desc: 'PARCELAMENTO DE FAT', valor: '838.52', tipo: 'encargo', parcelaN: 2, totalParcelas: 10, categoria: 'Encargos do cartão' }),
    linha({ desc: 'SEM CATEGORIA', categoria: null }),
    linha({ statementId: 's2', mes: '2026-08', desc: 'AGOSTO', apelidoConta: 'Sicredi - Black' }),
    linha({ statementId: null, accountId: 'c9', mes: '2026-08', banco: 'Itaú', last4: '1234', desc: 'SEM FATURA' }),
  ]);
  const f0 = mf.faturas[0]!;
  checar('uma fatura por statement, na ordem em que aparecem', mf.faturas.length === 3 && f0.id === 's1');
  checar('mês da fatura vem da linha', f0.mesRef === '2026-07' && mf.faturas[1]!.mesRef === '2026-08');
  checar('parcela vira "n/N"', f0.lancamentos[0]!.parc === '3/3' && f0.lancamentos[0]!.tipo === 'compra');
  checar('pagamento vira tipo pagamento', f0.lancamentos[1]!.tipo === 'pagamento' && f0.lancamentos[1]!.val === -500);
  checar('valor negativo que não é pagamento vira estorno', f0.lancamentos[2]!.tipo === 'estorno');
  checar('encargo parcelado continua encargo e mantém a parcela', f0.lancamentos[3]!.tipo === 'encargo' && f0.lancamentos[3]!.parc === '2/10');
  checar('sem categoria vira Outros', f0.lancamentos[4]!.cat === 'Outros');
  checar('lançamento sem fatura ganha fatura por conta e mês', mf.faturas[2]!.id === 'c9|2026-08');
  // O LEFT JOIN rejeita uma referência de fatura de outra conta e devolve
  // statement.id nulo. O adaptador deve então separar por conta e mês.
  const semStatementValido = montarFaturas([
    linha({ statementId: null, accountId: 'c1', mes: '2026-05', desc: 'MAIO', valor: '15.00' }),
    linha({ statementId: null, accountId: 'c1', mes: '2026-06', desc: 'JUNHO', valor: '25.00' }),
  ]);
  checar('statement rejeitado usa fallback por conta e mês',
    semStatementValido.faturas.length === 2 &&
    semStatementValido.faturas[0]!.id === 'c1|2026-05' &&
    semStatementValido.faturas[1]!.id === 'c1|2026-06');
  const junhoSemStatement = resumoDasCategorias({
    faturas: semStatementValido.faturas, apelidos: {}, nomesCartao: {}, ...CONFIG_PADRAO, mesFiltro: '2026-06',
  });
  checar('consulta de junho sem statement não inclui maio',
    junhoSemStatement.mes === '2026-06' && junhoSemStatement.total === 25);
  checar('apelido da conta vira nome do cartão', mf.nomesCartao['n2222'] === 'Sicredi - Black');
  checar('valor sai como número', typeof f0.lancamentos[0]!.val === 'number');

  // estorno de uma compra parcelada não tem plano de parcelamento (valor
  // negativo, sem installmentPlan), mas o legado o classificava como parcela
  const mfEstorno = montarFaturas([
    linha({ desc: 'ESTORNO PARCELA', tipo: 'parcela', valor: '-50.00', parcelaN: 2, totalParcelas: null }),
  ]);
  const lancEstorno = mfEstorno.faturas[0]!.lancamentos[0]!;
  checar(
    'estorno parcelado mantém a parcela sem total, que o regex de parcelas futuras rejeita',
    lancEstorno.tipo === 'estorno' && lancEstorno.parc === '2/?',
  );

  const so = separarObra(faturasDeTeste());
  checar(
    'separar obra tira Construção / Obras das faturas',
    so.faturas.every((f) => f.lancamentos.every((x) => x.cat !== 'Construção / Obras')),
  );
  checar('separar obra soma a obra por mês', Math.abs((so.obraPorMes['2026-06'] ?? 0) - 1045.5) < 1e-9);
  checar('separar obra não mexe no resto', so.faturas.length === faturasDeTeste().length);
  checar(
    'separar obra não conta pagamento',
    separarObra([{ id: 'x', mesRef: '2026-01', banco: 'B', cartao: '1', lancamentos: [
      { desc: 'P', apelido: null, val: -100, cat: 'Construção / Obras', parc: null, tipo: 'pagamento' },
    ] }]).obraPorMes['2026-01'] === undefined,
  );

  // ---- painel ---------------------------------------------------------------
  process.stdout.write('\n');

  const sp = (s: string) => s.replace(/\s/g, ' '); // Intl usa espaço não separável
  checar('moeda com centavos', sp(moeda(1234.5)) === 'R$ 1.234,50');
  checar('moeda0 arredonda', sp(moeda0(6239.87)) === 'R$ 6.240');
  checar('pct com sinal', pct(0.43) === '+43%' && pct(-0.1) === '-10%' && pct(0) === '0%');
  checar('pct arredonda antes do sinal (sem "-0%")', pct(-0.004) === '0%');

  checar(
    'deParametros ignora valores repetidos e vazios',
    deParametros({ mes: '2026-09', x: ['a', 'b'], y: undefined }).toString() === 'mes=2026-09',
  );

  const rp = resumoDoPainel(contexto(null), {}, false, 0);
  const junho = porMes(contexto(null)).find((x) => x[0] === '2026-06')![1];
  checar('painel abre no mês mais recente', rp.mes === '2026-06');
  checar('hero.cur é o porMes', rp.hero.cur === junho);
  checar('hero compara com o mês anterior', rp.hero.prevMes === '2026-05' && rp.hero.delta !== null);
  checar('pctRenda nulo sem renda', rp.hero.pctRenda === null);
  checar(
    'ranking do maior para o menor',
    rp.rank.length > 0 && rp.rank.every((c, i, a) => i === 0 || a[i - 1]!.valor >= c.valor),
  );
  checar('sem separar obra, obra é nula', rp.obra === null);
  checar('mês com gasto não está vazio', rp.vazio === false);

  checar(
    'pctRenda calculado quando há renda',
    resumoDoPainel(contexto(null), {}, false, 10000).hero.pctRenda !== null,
  );

  const so2 = separarObra(faturasDeTeste());
  const rs = resumoDoPainel(contexto(null, so2.faturas), so2.obraPorMes, true, 0);
  checar('separar obra mostra a obra do mês', rs.obra === 1045.5);
  checar('separar obra tira a obra do total', Math.abs(rp.hero.cur - rs.hero.cur - 1045.5) < 1e-9);
  checar('separar obra tira a categoria do ranking', rs.rank.every((c) => c.cat !== 'Construção / Obras'));

  const rt = resumoDoPainel(contexto('TODOS'), {}, false, 0);
  checar(
    'todos os meses: sem mês e sem comparação',
    rt.mes === null && rt.hero.prevMes === null && rt.hero.delta === null,
  );
  checar(
    'todos os meses: hero.cur é a soma',
    Math.abs(rt.hero.cur - porMes(contexto('TODOS')).reduce((s, x) => s + x[1], 0)) < 1e-9,
  );
  const rv = resumoDoPainel({ faturas: [], apelidos: {}, mesFiltro: null, nomesCartao: {}, ...CONFIG_PADRAO }, {}, false, 0);
  checar('sem fatura no recorte: vazio', rv.vazio === true && rv.mes === null);

  // um mês só de obra some das faturas com separarObra, mas com a obra à
  // parte ainda há o que mostrar — não é "nada neste mês"
  const faturasSoObra = [
    { id: 'x', mesRef: '2026-07', banco: 'B', cartao: '1', lancamentos: [
      { desc: 'OBRA', apelido: null, val: 500, cat: 'Construção / Obras', parc: null, tipo: 'compra' as const },
    ] },
  ];
  const soObra = separarObra(faturasSoObra);
  const rObra = resumoDoPainel(
    { faturas: soObra.faturas, apelidos: {}, mesFiltro: null, nomesCartao: {}, ...CONFIG_PADRAO },
    soObra.obraPorMes,
    true,
    0,
  );
  checar('mês só de obra não é vazio quando separado', rObra.vazio === false && (rObra.obra ?? 0) > 0);

  // delta nulo quando o mês anterior teve total zero (só pagamento, sem gasto)
  const ctxPrevZero = {
    faturas: [
      { id: 'p1', mesRef: '2026-01', banco: 'B', cartao: '1', lancamentos: [
        { desc: 'PAGAMENTO', apelido: null, val: -50, cat: 'Outros', parc: null, tipo: 'pagamento' as const },
      ] },
      { id: 'p2', mesRef: '2026-02', banco: 'B', cartao: '1', lancamentos: [
        { desc: 'COMPRA', apelido: null, val: 80, cat: 'Outros', parc: null, tipo: 'compra' as const },
      ] },
    ],
    apelidos: {},
    mesFiltro: '2026-02',
    nomesCartao: {},
    ...CONFIG_PADRAO,
  };
  const rZero = resumoDoPainel(ctxPrevZero, {}, false, 0);
  checar(
    'delta nulo quando o mês anterior teve total zero',
    rZero.hero.prevMes === '2026-01' && rZero.hero.delta === null,
  );

  // hero.cartoes corta em 4, mesmo com mais cartões no recorte
  const ctxMuitosCartoes = {
    faturas: Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      mesRef: '2026-01',
      banco: `Banco${i}`,
      cartao: String(1000 + i),
      lancamentos: [{ desc: 'X', apelido: null, val: 10, cat: 'Outros', parc: null, tipo: 'compra' as const }],
    })),
    apelidos: {},
    mesFiltro: null,
    nomesCartao: {},
    ...CONFIG_PADRAO,
  };
  checar(
    'hero mostra no máximo 4 cartões',
    resumoDoPainel(ctxMuitosCartoes, {}, false, 0).hero.cartoes.length === 4,
  );

  // o ranking inclui categoria de total negativo, como o legado (|v| > 0.009)
  const ctxRankNegativo = {
    faturas: [
      { id: 'n1', mesRef: '2026-01', banco: 'B', cartao: '1', lancamentos: [
        { desc: 'GRANDE COMPRA', apelido: null, val: 500, cat: 'Mercado & Padaria', parc: null, tipo: 'compra' as const },
        { desc: 'ESTORNO GRANDE', apelido: null, val: -50, cat: 'Restaurantes & Delivery', parc: null, tipo: 'estorno' as const },
      ] },
    ],
    apelidos: {},
    mesFiltro: null,
    nomesCartao: {},
    ...CONFIG_PADRAO,
  };
  checar(
    'rank inclui categoria com total negativo',
    resumoDoPainel(ctxRankNegativo, {}, false, 0).rank.some((x) => x.cat === 'Restaurantes & Delivery' && x.valor < 0),
  );

  // hero.venc pega o vencimento mais cedo do mês, em ordem crescente — o
  // cartão B (vence dia 05) vem antes do A (vence dia 10) em jun/26
  checar(
    'hero.venc é o vencimento mais cedo do mês',
    resumoDoPainel(contexto(null), {}, false, 0).hero.venc === '2026-06-05',
  );

  // em mar/26 só o cartão A tem fatura (o B começa em abr/26) — cs filtrado
  // pelo mês tem de achar 1 cartão, não os 2 do recorte inteiro
  checar(
    'hero.cartoes só conta cartão com fatura no mês',
    resumoDoPainel(contexto('2026-03'), {}, false, 0).hero.cartoes.length === 1,
  );

  // em jun/26 há 3 meses de histórico pra trás (mar, abr, mai)
  checar(
    'rank usa "média de N meses" com histórico de 3 meses',
    resumoDoPainel(contexto(null), {}, false, 0).rank.some((x) => x.varTxt.endsWith('média de 3 meses')),
  );
  // em abr/26 só há mar/26 de histórico (1 mês, abaixo do limiar) — cai no "vs <mês>"
  checar(
    'rank usa "vs <mês>" com menos de 2 meses de histórico',
    resumoDoPainel(contexto('2026-04'), {}, false, 0).rank.some((x) => x.varTxt.includes('vs ')),
  );
  // em mai/26 há exatamente 2 meses de histórico (mar, abr) — é o caso que
  // prova o limiar "b.n >= 2" (trocar para >= 3 esconderia isso)
  checar(
    'rank usa "média de 2 meses" no limiar exato',
    resumoDoPainel(contexto('2026-05'), {}, false, 0).rank.some((x) => x.varTxt.endsWith('média de 2 meses')),
  );

  // ---- configuração do usuário ---------------------------------------------
  process.stdout.write('\n');

  const cfgSemLinha = configDoUsuario(undefined);
  checar('config sem linha usa defaults das colunas', cfgSemLinha.renda === 0 && cfgSemLinha.metaPoupanca === 20 && cfgSemLinha.foraCartao === 0);
  const cfgRendaNula = configDoUsuario({ renda: null, meta: '15.00', fora: '350.50' });
  checar('config com renda nula', cfgRendaNula.renda === 0 && cfgRendaNula.metaPoupanca === 15 && cfgRendaNula.foraCartao === 350.5);
  const cfgCheia = configDoUsuario({ renda: '8000.00', meta: '20.00', fora: '0' });
  checar('config converte numeric em número', cfgCheia.renda === 8000 && cfgCheia.metaPoupanca === 20 && cfgCheia.foraCartao === 0);
  checar('CONFIG_PADRAO bate com os defaults', JSON.stringify(cfgSemLinha) === JSON.stringify(CONFIG_PADRAO));

  // ---- categorias ----------------------------------------------------------
  process.stdout.write('\n');

  const lancCat = (cat: string, val: number, tipo: Lanc['tipo'] = val < 0 ? 'estorno' : 'compra'): Lanc => ({
    desc: cat,
    apelido: null,
    val,
    cat,
    parc: null,
    tipo,
  });
  const faturaCat = (mesRef: string, lancamentos: Lanc[]): Fatura => ({
    id: `fat-${mesRef}`,
    mesRef,
    banco: 'Banco teste',
    cartao: '1234',
    lancamentos,
  });
  const ctxCategorias: Contexto = {
    faturas: ['2026-01', '2026-03', '2026-04', '2026-05', '2026-06'].map((mes, i) =>
      faturaCat(mes, [lancCat('Mercado & Padaria', [900, 100, 200, 300, 450][i]!)])),
    apelidos: {},
    mesFiltro: '2026-06',
    nomesCartao: {},
    ...CONFIG_PADRAO,
  };
  const rc = resumoDasCategorias(ctxCategorias);
  const mercadoC = rc.linhas.find((x) => x.cat === 'Mercado & Padaria')!;
  checar('categorias inclui as 13, mesmo zeradas', rc.linhas.length === 13 && CATS.every((cat) => rc.linhas.some((x) => x.cat === cat)));
  checar('categorias compara só os 3 anteriores disponíveis', mercadoC.varTxt === '+125% · média de 3 meses' && mercadoC.sev.k === 'crit');
  checar('categorias ordena valor decrescente e empates em CATS', rc.linhas[0]!.cat === 'Mercado & Padaria' && rc.linhas[1]!.cat === 'Restaurantes & Delivery');
  checar('categorias barra máxima e zero', mercadoC.largura === 100 && rc.linhas[1]!.largura === 0);
  const rMarC = resumoDasCategorias({ ...ctxCategorias, mesFiltro: '2026-03' });
  checar('categorias usa último mês disponível como base', rMarC.linhas[0]!.varTxt === `-89% · vs ${rotuloMes('2026-01')}`);
  const rAbrC = resumoDasCategorias({ ...ctxCategorias, mesFiltro: '2026-04' });
  checar('categorias média usa dois meses anteriores', rAbrC.linhas[0]!.varTxt === '-60% · média de 2 meses');
  const rJanC = resumoDasCategorias({ ...ctxCategorias, mesFiltro: '2026-01' });
  checar('categorias sem base mostra selo sem comparação', rJanC.linhas[0]!.varTxt === '' && rJanC.linhas[0]!.sev.t === 'sem comparação');
  const ctxMesZeroC = { ...ctxCategorias, faturas: ctxCategorias.faturas.map((f) => f.mesRef === '2026-04' ? { ...f, lancamentos: [] } : f).map((f) => f.mesRef === '2026-06' ? { ...f, lancamentos: [lancCat('Mercado & Padaria', 400)] } : f) };
  checar('categorias média inclui mês disponível zerado', resumoDasCategorias(ctxMesZeroC).linhas[0]!.varTxt === '+200% · média de 3 meses');
  const rTodosC = resumoDasCategorias({ ...ctxCategorias, mesFiltro: 'TODOS' });
  checar('categorias todos os meses não compara', rTodosC.total === 1950 && rTodosC.linhas[0]!.valor === 1950 && rTodosC.linhas[0]!.sev.t === 'sem comparação' && rTodosC.linhas[0]!.varTxt === '');
  checar('categorias null escolhe junho', resumoDasCategorias({ ...ctxCategorias, mesFiltro: null }).mes === '2026-06');
  checar('categorias mês inexistente escolhe junho', resumoDasCategorias({ ...ctxCategorias, mesFiltro: '2026-02' }).mes === '2026-06');
  const ctxVazioC: Contexto = { faturas: [], apelidos: {}, mesFiltro: null, nomesCartao: {}, ...CONFIG_PADRAO };
  const rVazioC = resumoDasCategorias(ctxVazioC);
  checar('categorias vazio sem faturas mantém 13 linhas zeradas', rVazioC.vazio && rVazioC.linhas.length === 13 && rVazioC.linhas.every((x) => x.valor === 0));
  const ctxCompraEstornoC: Contexto = { ...ctxVazioC, mesFiltro: '2026-06', faturas: [faturaCat('2026-06', [lancCat('Mercado & Padaria', 100), lancCat('Mercado & Padaria', -100)])] };
  const rCompraEstornoC = resumoDasCategorias(ctxCompraEstornoC);
  checar('categorias compra e estorno zerados não é vazio', !rCompraEstornoC.vazio && rCompraEstornoC.total === 0 && rCompraEstornoC.linhas.every((x) => Number.isFinite(x.share)));
  const rEstornoC = resumoDasCategorias({ ...ctxVazioC, mesFiltro: '2026-06', faturas: [faturaCat('2026-06', [lancCat('Mercado & Padaria', -80)])] });
  const mercadoEstornoC = rEstornoC.linhas.find((x) => x.cat === 'Mercado & Padaria')!;
  checar('categorias estorno isolado mantém valor e barra zero', mercadoEstornoC.valor === -80 && mercadoEstornoC.largura === 0 && !rEstornoC.vazio);
  const rPagamentoC = resumoDasCategorias({ ...ctxVazioC, mesFiltro: '2026-06', faturas: [faturaCat('2026-06', [{ ...lancCat('Outros', -100), tipo: 'pagamento' }])] });
  checar('categorias pagamento não conta como lançamento de gasto', rPagamentoC.total === 0 && rPagamentoC.vazio);
  const rSemMercadoC = resumoDasCategorias({ ...ctxCategorias, mesFiltro: '2026-05', faturas: ctxCategorias.faturas.map((f) => f.mesRef === '2026-05' ? { ...f, lancamentos: [] } : f) });
  checar('categorias gasto atual zero com base positiva cai 100%', rSemMercadoC.linhas.find((x) => x.cat === 'Mercado & Padaria')!.varTxt === '-100% · média de 3 meses');
  const rNovaC = resumoDasCategorias({ ...ctxCategorias, mesFiltro: '2026-06', faturas: ctxCategorias.faturas.map((f) => f.mesRef === '2026-06' ? { ...f, lancamentos: [lancCat('Restaurantes & Delivery', 80)] } : f) });
  checar('categorias novas com base zero mostra selo novo', rNovaC.linhas.find((x) => x.cat === 'Restaurantes & Delivery')!.sev.t === 'novo neste mês' && rNovaC.linhas.find((x) => x.cat === 'Restaurantes & Delivery')!.varTxt === '');
  const rEncargoC = resumoDasCategorias({ ...ctxCategorias, mesFiltro: '2026-06', faturas: [...ctxCategorias.faturas, faturaCat('2026-06', [lancCat('Encargos do cartão', 20, 'encargo')])] });
  checar('categorias encargos positivos mantém selo juros pagos', rEncargoC.linhas.find((x) => x.cat === 'Encargos do cartão')!.sev.t === 'juros pagos');

  const obraFaturasC: Fatura[] = [
    faturaCat('2026-05', [lancCat('Mercado & Padaria', 100), lancCat('Construção / Obras', 500)]),
    faturaCat('2026-06', [lancCat('Mercado & Padaria', 150), lancCat('Construção / Obras', -50)]),
  ];
  const obraSeparadaC = separarObra(obraFaturasC);
  const ctxObraC: Contexto = { faturas: obraSeparadaC.faturas, apelidos: {}, mesFiltro: '2026-06', nomesCartao: {}, ...CONFIG_PADRAO };
  const rObraC = resumoDasCategorias(ctxObraC);
  checar('categorias obra separada neutra e crédito preservado', rObraC.total === 150 && rObraC.linhas.find((x) => x.cat === 'Mercado & Padaria')!.share === 1 && rObraC.linhas.find((x) => x.cat === 'Mercado & Padaria')!.varTxt === '+50% · vs mai/26' && rObraC.linhas.find((x) => x.cat === 'Mercado & Padaria')!.sev.k === 'crit' && rObraC.linhas.find((x) => x.cat === 'Construção / Obras')!.valor === 0 && rObraC.linhas.find((x) => x.cat === 'Construção / Obras')!.varTxt === '' && obraSeparadaC.obraPorMes['2026-06'] === -50);
  const obraPositivaC = separarObra([obraFaturasC[0]!, faturaCat('2026-06', [lancCat('Mercado & Padaria', 150), lancCat('Construção / Obras', 50)])]);
  checar('categorias resumo independe do sinal da obra separada', JSON.stringify(resumoDasCategorias({ ...ctxObraC, faturas: obraPositivaC.faturas }).linhas) === JSON.stringify(rObraC.linhas) && obraPositivaC.obraPorMes['2026-06'] === 50);
  const soObraC = separarObra([faturaCat('2026-06', [lancCat('Construção / Obras', 50)])]);
  const rSoObraC = resumoDasCategorias({ ...ctxObraC, faturas: soObraC.faturas });
  checar('categorias mês só de obra fica vazio com mês resolvido', rSoObraC.mes === '2026-06' && rSoObraC.vazio && rSoObraC.total === 0 && soObraC.obraPorMes['2026-06'] === 50);

  const filtroCat = { mes: null, cartoes: [U1], obra: true };
  const urlCat = new URL(hrefDaCategoria(filtroCat, '2026-06', 'Restaurantes & Delivery'), 'http://localhost');
  checar('link de categoria preserva recorte global', urlCat.pathname === '/lancamentos' && urlCat.searchParams.get('cat') === 'Restaurantes & Delivery' && urlCat.searchParams.get('mes') === '2026-06' && urlCat.searchParams.get('cartoes') === U1 && urlCat.searchParams.get('obra') === '1');
  const urlObraCat = new URL(hrefDaCategoria(filtroCat, null, 'Construção / Obras'), 'http://localhost');
  checar('link de obra fixa TODOS quando não há mês resolvido', urlObraCat.pathname === '/lancamentos' && urlObraCat.searchParams.get('cat') === 'Construção / Obras' && urlObraCat.searchParams.get('mes') === 'TODOS' && urlObraCat.searchParams.get('cartoes') === U1 && urlObraCat.searchParams.get('obra') === '1');

  const checarLargurasC = (ctx: Contexto, total: number, shares: [number, number], larguras: [number, number]) => {
    const r = resumoDasCategorias(ctx);
    const m = r.linhas.find((x) => x.cat === 'Mercado & Padaria')!;
    const t = r.linhas.find((x) => x.cat === 'Transporte')!;
    return r.total === total && m.share === shares[0] && t.share === shares[1] && m.largura === larguras[0] && t.largura === larguras[1] && r.linhas.every((x) => Number.isFinite(x.largura) && x.largura >= 0 && x.largura <= 100);
  };
  checar('categorias largura proporcional entre valores positivos', checarLargurasC({ ...ctxVazioC, mesFiltro: '2026-06', faturas: [faturaCat('2026-06', [lancCat('Mercado & Padaria', 100), lancCat('Transporte', 50)])] }, 150, [100 / 150, 50 / 150], [100, 50]));
  checar('categorias proporção assinada com total negativo', checarLargurasC({ ...ctxVazioC, mesFiltro: '2026-06', faturas: [faturaCat('2026-06', [lancCat('Mercado & Padaria', 100), lancCat('Transporte', -200)])] }, -100, [-1, 2], [100, 0]));
  checar('categorias proporção zero quando total líquido é zero', checarLargurasC({ ...ctxVazioC, mesFiltro: '2026-06', faturas: [faturaCat('2026-06', [lancCat('Mercado & Padaria', 100), lancCat('Transporte', -100)])] }, 0, [0, 0], [100, 0]));
  const painelCatsC = resumoDoPainel(ctxCategorias, {}, false, 0).rank;
  checar('categorias não zeradas têm paridade campo a campo com painel', JSON.stringify(rc.linhas.filter((x) => x.valor !== 0).map(({ cat, valor, share, sev, varTxt }) => ({ cat, valor, share, sev, varTxt }))) === JSON.stringify(painelCatsC.map(({ cat, valor, share, sev, varTxt }) => ({ cat, valor, share, sev, varTxt }))));

  // ---- previsto ------------------------------------------------------------
  process.stdout.write('\n');

  const pjP: Projecao = { prox: '2026-07', parcelas: 500, fixos: 300, variavel: 1200, total: 2000, real: null, meses: 3 };
  const cfgP = (renda: number, foraCartao = 0) => ({ renda, metaPoupanca: 20, foraCartao });
  const perto = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 1e-9;
  const somaOk = (xs: number[]) => xs.every((x) => Number.isFinite(x) && x >= 0) && xs.reduce((s, x) => s + x, 0) <= 100 + 1e-9;

  checar('previsto nulo sem projeção', montarPrevisto(null, cfgP(0)) === null);
  checar('previsto nulo com total zero', montarPrevisto({ ...pjP, parcelas: 0, fixos: 0, variavel: 0, total: 0 }, cfgP(5000)) === null);

  const pSem = montarPrevisto(pjP, cfgP(0))!;
  checar('previsto sem renda: coluna da renda nula e pctRenda nulo', pSem.renda === null && pSem.pctRenda === null);
  checar('previsto sem renda: barra do padrão ocupa tudo', perto(pSem.padrao.parcelas, 25) && perto(pSem.padrao.fixos, 15) && perto(pSem.padrao.variavel, 60) && perto(pSem.padrao.vazio, 0));

  const pCabe = montarPrevisto(pjP, cfgP(5000))!;
  // teto sai de renda * 0.8: compara com tolerância, não com ===
  checar('previsto cabe: teto, sobra e veredito', perto(pCabe.renda!.teto, 4000) && perto(pCabe.renda!.sobra, 2000) && pCabe.renda!.estado === 'ok' && pCabe.renda!.veredito === 'cabe');
  checar('previsto cabe: escala pelo teto', perto(pCabe.padrao.parcelas, 12.5) && perto(pCabe.padrao.vazio, 50) && perto(pCabe.renda!.larguras.contratado, 20) && perto(pCabe.renda!.larguras.paraEscolhas, 80) && perto(pCabe.renda!.larguras.vazio, 0));
  checar('previsto cabe: por semana, por dia, guardado e % da renda', perto(pCabe.renda!.porSemana, 3200 / 4.3) && perto(pCabe.renda!.porDia, 3200 / 30) && perto(pCabe.renda!.poupanca, 1000) && perto(pCabe.pctRenda, 0.4));

  const pAlerta = montarPrevisto(pjP, cfgP(2375))!;
  checar('previsto até 10% acima do teto é alerta e pede corte', perto(pAlerta.renda!.teto, 1900) && pAlerta.renda!.estado === 'alerta' && pAlerta.renda!.veredito === 'cortar' && perto(pAlerta.renda!.corte, 100) && perto(pAlerta.renda!.pctCorte, 100 / 1200));

  const pRuim = montarPrevisto(pjP, cfgP(2000))!;
  checar('previsto mais de 10% acima do teto é ruim', perto(pRuim.renda!.teto, 1600) && pRuim.renda!.estado === 'ruim' && pRuim.renda!.veredito === 'cortar' && perto(pRuim.renda!.corte, 400) && perto(pRuim.renda!.paraEscolhas, 800));

  const pAcima = montarPrevisto(pjP, cfgP(500))!;
  checar('previsto compromissos acima do teto vence os outros ramos', perto(pAcima.renda!.disponivel, -400) && pAcima.renda!.estado === 'ruim' && pAcima.renda!.veredito === 'compromissos-acima' && pAcima.renda!.paraEscolhas === 0 && pAcima.renda!.porSemana === null && pAcima.renda!.porDia === null);
  checar('previsto compromissos acima: barra contratada limitada ao teto', perto(pAcima.renda!.larguras.contratado, 20) && pAcima.renda!.larguras.paraEscolhas === 0);

  const pFora = montarPrevisto(pjP, cfgP(5000, 1000))!;
  checar('previsto tira o gasto fora do cartão do teto', perto(pFora.renda!.teto, 3000));
  checar('previsto teto nunca negativo', montarPrevisto(pjP, cfgP(2000, 5000))!.renda!.teto === 0);

  checar('previsto larguras finitas e somando no máximo 100', [pSem, pCabe, pAlerta, pRuim, pAcima, pFora].every((p) =>
    somaOk([p.padrao.parcelas, p.padrao.fixos, p.padrao.variavel, p.padrao.vazio]) &&
    (p.renda === null || somaOk([p.renda.larguras.contratado, p.renda.larguras.paraEscolhas, p.renda.larguras.vazio]))));

  const pReal = montarPrevisto({ ...pjP, real: 2200 }, cfgP(0))!;
  checar('previsto com real calcula a diferença', pReal.real === 2200 && perto(pReal.dif, 0.1));
  checar('previsto sem real não calcula a diferença', pSem.real === null && pSem.dif === null);

  const ultimoP = porMes(contexto(null)).at(-1)![0];
  checar('previsto em TODOS projeta a partir do último mês', previsto(contexto('TODOS'))?.prox === addMonths(ultimoP, 1));
  const comObraP = faturasDeTeste().map((f) => f.mesRef === ultimoP && f.banco === 'Itaú'
    ? { ...f, lancamentos: [...f.lancamentos, { desc: 'DEPOSITO DE MATERIAL', apelido: null, val: 900, cat: 'Construção / Obras', parc: null, tipo: 'compra' as const }] }
    : f);
  const baseP = previsto(contexto(null))!;
  checar('previsto conta a obra quando ela não é separada', previsto(contexto(null, comObraP))!.variavel > baseP.variavel);
  const baseSemObraP = previsto(contexto(null, separarObra(faturasDeTeste()).faturas))!;
  checar('previsto com obra separada ignora a obra', perto(previsto(contexto(null, separarObra(comObraP).faturas))!.variavel, baseSemObraP.variavel));

  // ---- ajustes -------------------------------------------------------------
  process.stdout.write('\n');

  const okC = (c: unknown) => { const v = validarConfig(c); return v.ok ? v.mudanca : null; };
  const erroC = (c: unknown) => { const v = validarConfig(c); return v.ok ? null : v.codigo; };
  checar('ajustes renda com milhar e centavos', okC({ renda: '8.000,00' })?.renda === 8000);
  checar('ajustes renda com ponto de milhar sem vírgula', okC({ renda: '8.000' })?.renda === 8000 && okC({ renda: 'R$ 12.500' })?.renda === 12500 && okC({ renda: '1.234.567' })?.renda === 1234567);
  checar('ajustes renda com ponto decimal arredonda a 2 casas', okC({ renda: '1234.567' })?.renda === 1234.57);
  checar('ajustes renda com vírgula decimal', okC({ renda: '1,5' })?.renda === 1.5);
  checar('ajustes renda vazia ou nula vira sem renda', okC({ renda: '' })?.renda === null && okC({ renda: null })?.renda === null && okC({ renda: '   ' })?.renda === null);
  checar('ajustes renda negativa é erro', erroC({ renda: '-1' }) === 'renda_negativa');
  checar('ajustes texto que não é número é erro', erroC({ renda: 'abc' }) === 'valor_invalido' && erroC({ renda: '12abc' }) === 'valor_invalido' && erroC({ metaPoupanca: '' }) === 'valor_invalido');
  checar('ajustes meta entre 0 e 80', okC({ metaPoupanca: '0' })?.metaPoupanca === 0 && okC({ metaPoupanca: '80' })?.metaPoupanca === 80 && erroC({ metaPoupanca: '-1' }) === 'meta_fora' && erroC({ metaPoupanca: '81' }) === 'meta_fora');
  checar('ajustes fora do cartão vazio vira zero e negativo é erro', okC({ foraCartao: '' })?.foraCartao === 0 && erroC({ foraCartao: '-1' }) === 'fora_negativo');
  checar('ajustes config só leva campos presentes', JSON.stringify(okC({ metaPoupanca: 15 })) === JSON.stringify({ metaPoupanca: 15 }));
  checar('ajustes config ignora campo estranho', JSON.stringify(okC({ renda: '100', user_id: 'x' })) === JSON.stringify({ renda: 100 }));
  checar('ajustes config sem campo conhecido é erro', erroC({}) === 'sem_mudanca' && erroC({ user_id: 'x' }) === 'sem_mudanca' && erroC(null) === 'sem_mudanca' && erroC('8000') === 'sem_mudanca');
  checar('ajustes milhar com decimal e decimal só com separador', okC({ renda: '8.000,5' })?.renda === 8000.5 && okC({ renda: '1.000.000,00' })?.renda === 1000000 && okC({ renda: ',5' })?.renda === 0.5 && okC({ renda: '8 000' })?.renda === 8000);
  checar('ajustes número mal formado é erro, não prefixo', ['1,234.56', '1.5.6', '1,2,3', '-', '.', '1e3'].every((r) => erroC({ renda: r }) === 'valor_invalido'));
  checar('ajustes valor que não cabe na coluna é erro de uso', erroC({ renda: '1000000000000' }) === 'valor_grande' && erroC({ foraCartao: 1e20 }) === 'valor_grande' && okC({ renda: '999.999.999.999' })?.renda === 999999999999);

  const okA = (c: unknown) => { const v = validarConta(c); return v.ok ? v.mudanca : null; };
  const erroA = (c: unknown) => { const v = validarConta(c); return v.ok ? null : v.codigo; };
  checar('ajustes apelido aparado', okA({ apelido: '  Itaú Azul  ' })?.apelido === 'Itaú Azul');
  checar('ajustes apelido vazio ou nulo volta ao nome do banco', okA({ apelido: '' })?.apelido === null && okA({ apelido: '   ' })?.apelido === null && okA({ apelido: null })?.apelido === null);
  checar('ajustes apelido até 40 caracteres', okA({ apelido: 'a'.repeat(40) })?.apelido?.length === 40 && erroA({ apelido: 'a'.repeat(41) }) === 'apelido_longo');
  checar('ajustes apelido precisa ser texto', erroA({ apelido: 5 }) === 'apelido_invalido');
  checar('ajustes dia válido', okA({ diaFechamento: '10' })?.diaFechamento === 10 && okA({ diaVencimento: 31 })?.diaVencimento === 31 && okA({ diaVencimento: 1 })?.diaVencimento === 1);
  checar('ajustes dia vazio ou nulo limpa', okA({ diaFechamento: '' })?.diaFechamento === null && okA({ diaVencimento: null })?.diaVencimento === null);
  checar('ajustes dia fora de 1 a 31 é erro', ['0', '32', 1.5, 'abc', '1.5', -3, [7], true].every((d) => erroA({ diaFechamento: d }) === 'dia_invalido'));
  checar('ajustes conta ignora campos estranhos', JSON.stringify(okA({ apelido: 'X', user_id: 'u', limite: '9999', kind: 'conta_corrente' })) === JSON.stringify({ apelido: 'X' }));
  checar('ajustes conta só com campos estranhos é erro', erroA({ limite: '1', ativo: false }) === 'sem_mudanca' && erroA(null) === 'sem_mudanca');

  checar('ajustes formata dinheiro em pt-BR e esconde zero', formatarCampo('dinheiro', 8000) === '8.000,00' && formatarCampo('dinheiro', 0) === '' && formatarCampo('dinheiro', null) === '');
  checar('ajustes formata percentual, dia e texto', formatarCampo('percentual', 20) === '20' && formatarCampo('percentual', 12.5) === '12,5' && formatarCampo('dia', 10) === '10' && formatarCampo('dia', null) === '' && formatarCampo('texto', null) === '' && formatarCampo('texto', 'Nubank') === 'Nubank');
  checar('ajustes percentual zero aparece e não número some', formatarCampo('percentual', 0) === '0' && formatarCampo('percentual', 'abc') === '' && formatarCampo('dinheiro', 'abc') === '');

  const cartaoA: CartaoAjuste = { id: U1, banco: 'Itaú', last4: '1111', apelido: null, nomeOrigem: 'ITAU UNICLASS', diaFechamento: null, diaVencimento: null, faturas: 3, primeiroMes: '2026-07-01', ultimoMes: '2026-09-01' };
  checar('ajustes linha do cartão com faturas', linhaDoCartao(cartaoA) === 'na fatura: ITAU UNICLASS · 3 faturas · jul/26 a set/26');
  checar('ajustes linha do cartão com uma fatura', linhaDoCartao({ ...cartaoA, nomeOrigem: null, faturas: 1, primeiroMes: '2026-09-01', ultimoMes: '2026-09-01' }) === 'na fatura: Itaú · 1 fatura · set/26');
  checar('ajustes linha do cartão sem fatura', linhaDoCartao({ ...cartaoA, faturas: 0, primeiroMes: null, ultimoMes: null }) === 'nenhuma fatura importada');
  checar('ehUuid aceita uuid e recusa o resto', ehUuid(U1) && !ehUuid('abc') && !ehUuid('') && !ehUuid(`${U1}x`));

  // ---- plano ---------------------------------------------------------------
  process.stdout.write('\n');

  const okP = (c: unknown) => { const v = validarPrefs(c); return v.ok ? v.mudanca : null; };
  const erroP = (c: unknown) => { const v = validarPrefs(c); return v.ok ? null : v.codigo; };
  checar('plano prefs padrão é válido', JSON.stringify(okP({ prefs: PREFS_PADRAO })) === JSON.stringify(PREFS_PADRAO));
  checar('plano prefs fora da lista é erro', erroP({ prefs: { ...PREFS_PADRAO, objetivo: 'ficar_rico' } }) === 'objetivo_invalido' && erroP({ prefs: { ...PREFS_PADRAO, ritmo: 'turbo' } }) === 'ritmo_invalido' && erroP({ prefs: { ...PREFS_PADRAO, comida: 'jejum' } }) === 'comida_invalida' && erroP({ prefs: { ...PREFS_PADRAO, assinaturas: 'x' } }) === 'assinaturas_invalidas');
  checar('plano prefs não aceita chave herdada do protótipo', erroP({ prefs: { ...PREFS_PADRAO, objetivo: 'toString' } }) === 'objetivo_invalido');
  checar('plano prefs categoria inventada é erro', erroP({ prefs: { ...PREFS_PADRAO, intocaveis: ['Cassino'] } }) === 'categoria_invalida' && erroP({ prefs: { ...PREFS_PADRAO, cortar: [5] } }) === 'categoria_invalida' && erroP({ prefs: { ...PREFS_PADRAO, cortar: 'Transporte' } }) === 'categoria_invalida');
  checar('plano prefs remove repetição e tira de cortar o que é intocável', JSON.stringify(okP({ prefs: { ...PREFS_PADRAO, intocaveis: ['Transporte', 'Transporte'], cortar: ['Transporte', 'Educação'] } })?.intocaveis) === JSON.stringify(['Transporte']) && JSON.stringify(okP({ prefs: { ...PREFS_PADRAO, intocaveis: ['Transporte'], cortar: ['Transporte', 'Educação'] } })?.cortar) === JSON.stringify(['Educação']));
  checar('plano prefs evento aparado e limitado a 120', okP({ prefs: { ...PREFS_PADRAO, evento: '  IPVA  ' } })?.evento === 'IPVA' && erroP({ prefs: { ...PREFS_PADRAO, evento: 'x'.repeat(121) } }) === 'evento_longo' && erroP({ prefs: { ...PREFS_PADRAO, evento: 5 } }) === 'evento_invalido');
  checar('plano prefs ausentes é erro', erroP({}) === 'prefs_ausente' && erroP(null) === 'prefs_ausente' && erroP({ prefs: 'x' }) === 'prefs_ausente');
  checar('plano prefs ignora campo estranho', JSON.stringify(okP({ prefs: { ...PREFS_PADRAO, user_id: 'x' } })) === JSON.stringify(PREFS_PADRAO));
  checar('plano resposta da IA sem lista de categorias não vale', [null, {}, [], 'texto', 5, { categorias: 'x' }, { categorias: {} }].every((d) => !respostaTemCategorias(d)) && respostaTemCategorias({ categorias: [] }));
  const fixosIA = [
    { desc: 'NETFLIX', acao: 'cancelar', economia: 55.9 },
    { desc: '', acao: 'sem nome', economia: 10 },
    { desc: 'CARO', acao: 'x', economia: 1e30 },
    { desc: 'NEGATIVO', acao: 'x', economia: -50 },
    { desc: 'INFINITO', acao: 'x', economia: Infinity },
    { desc: 'ZERO', acao: 'x', economia: 0 },
  ];
  checar('plano fixos da IA sem nome, sem economia ou absurdos saem; o resto fica no teto', JSON.stringify(limparFixos(fixosIA, 3000)) === JSON.stringify([{ desc: 'NETFLIX', acao: 'cancelar', economia: 55.9 }, { desc: 'CARO', acao: 'x', economia: 3000 }]));

  const ctxPlano = contexto(null, faturasDeTeste(), { renda: 2000, metaPoupanca: 20, foraCartao: 0 });
  const mtPlano = metasDoPlano(ctxPlano, PREFS_PADRAO)!;
  const prompt = promptPlano(mtPlano, PREFS_PADRAO, ctxPlano);
  checar('promptPlano traz categorias, tetos e preferências', mtPlano.cats.slice(0, 8).every((c) => prompt.includes(c.cat)) && mtPlano.meses.every((m) => prompt.includes(rotuloMes(m.mes))) && prompt.includes('Em três passos (recomendado)') && prompt.includes('NETFLIX COM'));
  checar('promptPlano não vaza cartão, banco nem id', ['1111', '2222', 'Itaú', 'Nubank', 'Azul', 'a-2026', 'b-2026'].every((s) => !prompt.includes(s)));

  const resP: ResultadoPlano = ajustarPlano(PREFS_PADRAO, null, mtPlano)!;
  checar('plano subtítulo', subtituloPlano(resP) === `Variável de ${moeda0(resP.variavelHoje)}/mês até caber em ${moeda0(resP.meses[2]!.alvo)}, dentro do teto de ${moeda0(resP.teto)}.`);
  checar('plano frase sem plano cobre os três casos',
    fraseSemPlano({ ...mtPlano, impossivel: true }).startsWith('Seus compromissos já passam do teto') &&
    fraseSemPlano({ ...mtPlano, impossivel: false, precisa: true }).startsWith('Hoje o variável está em') &&
    fraseSemPlano({ ...mtPlano, impossivel: false, precisa: false }) === 'Seu padrão já cabe no teto. Ainda assim posso montar um plano para acelerar a poupança.');
  const resNotas: ResultadoPlano = { ...resP, metaPoupancaValor: 400, meses: [{ mes: '2026-07', alvo: 900, poupanca: 100, disp: 0 }, { mes: '2026-08', alvo: 800, poupanca: 450, disp: 0 }, { mes: '2026-09', alvo: 700, poupanca: 500, disp: 0 }], avisos: [{ mes: '2026-07', falta: 120 }] };
  // o esperado usa moeda0 porque o Intl põe espaço não separável depois de "R$"
  checar('plano notas de transição e de falta', notasDoPlano(resNotas) === `Tudo cabe dentro da renda nos três meses. Nos primeiros dias você guarda menos do que a meta (jul/26 ${moeda0(100)}) e chega à meta cheia em set/26. Em jul/26 faltam ${moeda0(120)} para fechar sem mexer no que você travou — aqui só reduzindo fixos, adiando parcelas ou liberando uma categoria travada.`);
  checar('plano sem notas quando bate a meta e fecha', notasDoPlano({ ...resNotas, metaPoupancaValor: 0, avisos: [] }) === '');
  checar('plano feito para', feitoPara({ ...PREFS_PADRAO, intocaveis: ['Transporte'], evento: 'IPVA' }) === 'Feito para: Guardar mais todo mês · em três passos (recomendado) · sem mexer em Transporte · reservando espaço para IPVA');
  checar('plano terminou só depois do terceiro mês', planoTerminou(resNotas, '2026-09') === null && planoTerminou(resNotas, '2026-10') === 'set/26' && planoTerminou(resNotas, null) === null);

  // ---- pluggy: mapeadores --------------------------------------------------
  process.stdout.write('\n');

  checar('pluggy status do item', statusDoItem('UPDATED') === 'ativa' && statusDoItem('UPDATING') === 'atualizando' && statusDoItem('LOGIN_ERROR') === 'erro_login' && statusDoItem('WAITING_USER_INPUT') === 'erro_login' && statusDoItem('OUTDATED') === 'erro' && statusDoItem('QUALQUER') === 'erro');

  const cCartao = contaDoPluggy(CONTA_CARTAO);
  checar('pluggy conta de cartão', JSON.stringify(cCartao) === JSON.stringify({ pluggyAccountId: 'pa-cartao', kind: 'cartao_credito', last4: '1111', nomeOrigem: 'Itaú Uniclass Visa', limite: 8000 }));
  const cCorrente = contaDoPluggy(CONTA_CORRENTE);
  checar('pluggy conta corrente e poupança', cCorrente.kind === 'conta_corrente' && cCorrente.last4 === '3456' && cCorrente.nomeOrigem === null && cCorrente.limite === null && contaDoPluggy({ ...CONTA_CORRENTE, subtype: 'SAVINGS_ACCOUNT' }).kind === 'poupanca' && contaDoPluggy({ ...CONTA_CORRENTE, subtype: 'PAYMENT_ACCOUNT' }).kind === 'conta_pagamento');
  checar('pluggy conta corrente leva o banco do código COMPE, não o name', contaDoPluggy({ ...CONTA_CORRENTE, bankData: { transferNumber: '341/0001/00012345-6' } }).nomeOrigem === 'Itaú' && contaDoPluggy({ ...CONTA_CORRENTE, name: NOME_TITULAR, bankData: { transferNumber: '999/0001/1' } }).nomeOrigem === null && bancoDoCodigo('033/0001/1') === 'Santander' && bancoDoCodigo(null) === null);
  const vazou = (x: unknown) => [NOME_TITULAR, CPF_TITULAR, CNPJ_LOJA, '1234.5', '9876.54', 'documentNumber'].some((s) => JSON.stringify(x).includes(s));
  checar('pluggy conta não leva nome, CPF nem saldo', !vazou(cCartao) && !vazou(cCorrente));

  const l1 = lancamentoDoPluggy(tx())!;
  // 6.0, I4: no cartão também, pela mesma regra; com CNPJ, não
  checar('cartão: Pix para pessoa é pessoa física', lancamentoDoPluggy(tx({ description: 'PIX FULANO DE TAL', descriptionRaw: 'PIX FULANO DE TAL' }))!.pessoaFisica === true && lancamentoDoPluggy(tx())!.pessoaFisica === false);
  checar('cartão: Pix com CNPJ não é pessoa física', lancamentoDoPluggy(tx({ description: 'PIX PADARIA', descriptionRaw: 'PIX PADARIA', paymentData: { receiver: { documentNumber: { type: 'CNPJ', value: CNPJ_LOJA } } } }))!.pessoaFisica === false);
  checar('cartão: papel continua indefinido e Pix para pessoa fica em Outros', (() => { const r = lancamentoDoPluggy(tx({ description: 'PIX FULANO', descriptionRaw: 'PIX FULANO' }))!; const d = destinoNoSync(r, null); return r.papel === undefined && d.papel === 'gasto' && !d.vaiParaIA && d.outros; })());
  checar('pluggy lançamento simples', l1.pluggyTxnId === 'pt-1' && l1.data === '2026-04-10' && l1.valor === 120 && l1.descOrigem === 'IFOOD *RESTAURANTE' && l1.descNorm === normalizarDescricao('IFOOD *RESTAURANTE') && l1.tipo === 'escolha' && l1.parcela === null && l1.billId === 'bill-05' && l1.pendente === false);
  checar('pluggy lançamento não leva pagador nem estabelecimento', !vazou(l1));
  checar('pluggy data em São Paulo', lancamentoDoPluggy(tx({ date: '2026-09-05T23:30:00Z', creditCardMetadata: null }))!.data === '2026-09-05' && lancamentoDoPluggy(tx({ date: '2026-09-06T02:00:00Z', creditCardMetadata: null }))!.data === '2026-09-05');
  checar('pluggy meia-noite UTC é data de calendário', lancamentoDoPluggy(tx({ date: '2026-09-01T00:00:00.000Z', creditCardMetadata: null }))!.data === '2026-09-01' && lancamentoDoPluggy(tx({ date: '2026-09-01T00:00:00Z', creditCardMetadata: null }))!.data === '2026-09-01');
  checar('pluggy data da compra vence a data de lançamento', lancamentoDoPluggy(tx({ date: '2026-09-20T12:00:00Z', creditCardMetadata: { purchaseDate: '2026-09-02', billId: 'b' } }))!.data === '2026-09-02');
  checar('pluggy pagamento pela descrição', ['PAGAMENTO COM SALDO', 'PAGAMENTO DEBITO AUTOMATICO'].every((d) => lancamentoDoPluggy(tx({ amount: -500, description: d, descriptionRaw: d }))!.tipo === 'pagamento') && lancamentoDoPluggy(tx({ amount: -500, category: 'Credit card payment', description: 'X', descriptionRaw: 'X' }))!.tipo === 'pagamento');
  checar('pluggy compra com "pagamento" e valor positivo não vira pagamento', lancamentoDoPluggy(tx({ amount: 50, description: 'PAGAMENTO LOJA X', descriptionRaw: 'PAGAMENTO LOJA X' }))!.tipo === 'escolha');
  checar('pluggy estorno continua negativo e escolha', lancamentoDoPluggy(tx({ amount: -19.3, description: 'CANCELAMENTO PARCIAL DE COMPRA', descriptionRaw: 'CANCELAMENTO PARCIAL DE COMPRA' }))!.tipo === 'escolha');
  checar('pluggy encargos', ['IOF', 'JUROS DE MORA', 'ENCARGOS REFINANCIAMENTO', 'ANUIDADE DIFERENCIADA'].every((d) => lancamentoDoPluggy(tx({ amount: 3.72, description: d, descriptionRaw: d }))!.tipo === 'encargo') && lancamentoDoPluggy(tx({ amount: 30, description: 'MULTIMARCAS LTDA', descriptionRaw: 'MULTIMARCAS LTDA' }))!.tipo === 'escolha');
  const lParc = lancamentoDoPluggy(tx({ amount: 300, creditCardMetadata: { installmentNumber: 3, totalInstallments: 10, purchaseDate: '2026-02-15', billId: 'b' } }))!;
  checar('pluggy parcela', lParc.tipo === 'parcela' && JSON.stringify(lParc.parcela) === JSON.stringify({ n: 3, total: 10 }) && lParc.data === '2026-02-15');
  const lParcRecente = lancamentoDoPluggy(tx({ amount: 300, date: '2026-09-28T12:00:00Z', creditCardMetadata: { installmentNumber: 8, totalInstallments: 10, purchaseDate: '2026-02-15' } }))!;
  checar('pluggy parcela guarda a data do lançamento à parte', lParcRecente.data === '2026-02-15' && lParcRecente.dataLancamento === '2026-09-28');
  checar('pluggy sem data de lançamento usa a da compra', lancamentoDoPluggy(tx({ date: undefined, creditCardMetadata: { purchaseDate: '2026-02-15' } }))!.dataLancamento === '2026-02-15');
  checar('pluggy parcela 1 de 1 não é parcela', lancamentoDoPluggy(tx({ creditCardMetadata: { installmentNumber: 1, totalInstallments: 1 } }))!.parcela === null);
  checar('pluggy estorno mantém o sinal e é escolha', lancamentoDoPluggy(tx({ amount: -30 }))!.valor === -30 && lancamentoDoPluggy(tx({ amount: -30 }))!.tipo === 'escolha');
  checar('pluggy pagamento de fatura', lancamentoDoPluggy(tx({ amount: -2000, operationType: 'PAGAMENTO_FATURA' }))!.tipo === 'pagamento' && lancamentoDoPluggy(tx({ amount: -2000, description: 'PAGAMENTO_FATURA', descriptionRaw: null }))!.tipo === 'pagamento');
  checar('pluggy pendente', lancamentoDoPluggy(tx({ status: 'PENDING' }))!.pendente === true);
  checar('pluggy descrição sem raw usa a limpa', lancamentoDoPluggy(tx({ descriptionRaw: null }))!.descOrigem === 'IFOOD RESTAURANTE');
  checar('pluggy lançamento malformado é descartado', lancamentoDoPluggy(tx({ id: '' })) === null && lancamentoDoPluggy(tx({ amount: '120' as unknown as number })) === null && lancamentoDoPluggy(tx({ amount: Number.NaN })) === null && lancamentoDoPluggy(tx({ date: 'ontem', creditCardMetadata: null })) === null && lancamentoDoPluggy(tx({ creditCardMetadata: { purchaseDate: '2026-02-30' } })) === null);
  // ---- pluggy: conta corrente (6.0) ----------------------------------------
  process.stdout.write('\n');

  // lançamento de conta: sem metadado de cartão, sem merchant, sem pagamento por padrão
  const txc = (o: Partial<Parameters<typeof lancamentoDaConta>[0]> = {}) =>
    tx({ creditCardMetadata: null, merchant: null, paymentData: null, type: 'DEBIT', amount: -80, description: 'CONTA LUZ', descriptionRaw: 'CONTA LUZ', ...o });
  const doc = (tipo: 'CPF' | 'CNPJ', valor: string) => ({ documentNumber: { type: tipo, value: valor } });
  const CPF_OUTRA_PESSOA = '987.654.321-00';

  const cDeb = lancamentoDaConta(txc())!;
  checar('conta débito vira gasto positivo', cDeb.valor === 80 && cDeb.papel === 'gasto' && cDeb.tipo === 'escolha' && cDeb.pessoaFisica === false && cDeb.parcela === null && cDeb.billId === null && cDeb.data === '2026-04-10' && cDeb.dataLancamento === '2026-04-10');
  checar('conta débito com amount positivo continua positivo', lancamentoDaConta(txc({ amount: 80 }))!.valor === 80);
  const cCred = lancamentoDaConta(txc({ type: 'CREDIT', amount: 5000, description: 'SALARIO EMPRESA X', descriptionRaw: 'SALARIO EMPRESA X' }))!;
  checar('conta crédito vira entrada negativa', cCred.valor === -5000 && cCred.papel === 'entrada');
  checar('conta sem type usa o sinal do Pluggy invertido', lancamentoDaConta(txc({ type: undefined, amount: -30 }))!.valor === 30 && lancamentoDaConta(txc({ type: undefined, amount: 30 }))!.valor === -30);

  const papelDe = (d: string, o: Partial<Parameters<typeof lancamentoDaConta>[0]> = {}) => lancamentoDaConta(txc({ amount: -1500, description: d, descriptionRaw: d, ...o }))!.papel;
  // "PAG FATURA ITAU" saiu daqui: sem a palavra cartão é ambíguo, e conta de consumo também é "fatura"
  checar('conta pagamento de fatura não conta',
    ['PAGAMENTO FATURA CARTAO', 'PAG FATURA CARTAO ITAU', 'PGTO CARTAO CREDITO', 'PAGTO CARTAO CREDITO', 'DEB AUT CARTAO CREDITO', 'PG CARTÃO', 'Pagamento de fatura cartão'].every((d) => papelDe(d) === 'fora') &&
    lancamentoDaConta(txc({ category: 'Credit card payment', description: 'X', descriptionRaw: 'X' }))!.papel === 'fora' &&
    lancamentoDaConta(txc({ operationType: 'PAGAMENTO_FATURA' }))!.papel === 'fora');
  checar('conta transferência própria não conta',
    lancamentoDaConta(txc({ description: 'PIX TRANSF', descriptionRaw: 'PIX TRANSF', paymentData: { payer: doc('CPF', CPF_TITULAR), receiver: doc('CPF', '12345678900') } }))!.papel === 'fora' &&
    lancamentoDaConta(txc({ type: 'CREDIT', amount: 300, category: 'Same person transfer' }))!.papel === 'fora');
  checar('conta de consumo com "fatura" continua gasto', ['DEB AUTOMATICO FATURA VIVO', 'PAGTO FATURA CLARO', 'FATURA ENERGIA', 'COMPRA CARTAO DEB MERCADO'].every((d) => papelDe(d) === 'gasto'));
  checar('transferência própria pela categoria com sufixo', papelDe('PIX ENVIADO', { category: 'Same person transfer - PIX' }) === 'fora' && papelDe('TED', { type: 'CREDIT', category: 'Same person transfer - TED' }) === 'fora' && papelDe('PIX ENVIADO', { category: 'Transfer - PIX' }) === 'gasto');
  checar('transferência própria pela descrição', ['TRANSF ENTRE CONTAS', 'TRANSFERENCIA MESMA TITULARIDADE', 'PIX RECEBIDO MESMA TITULARIDADE', 'Transferência entre contas'].every((d) => papelDe(d) === 'fora'));
  checar('conta Pix no crédito não conta (o gasto está na fatura)',
    lancamentoDaConta(txc({ description: 'Pix enviado com cartão MARIA SILVA', descriptionRaw: 'Pix enviado com cartão MARIA SILVA' }))!.papel === 'fora' &&
    lancamentoDaConta(txc({ type: 'CREDIT', amount: 200, description: 'Crédito liberado para Pix CARTAO X', descriptionRaw: 'Crédito liberado para Pix CARTAO X' }))!.papel === 'fora' &&
    lancamentoDaConta(txc({ description: 'Pix enviado MARIA SILVA', descriptionRaw: 'Pix enviado MARIA SILVA' }))!.papel === 'gasto');
  checar('conta aplicação e resgate não contam',
    lancamentoDaConta(txc({ description: 'APLICACAO CDB', descriptionRaw: 'APLICACAO CDB' }))!.papel === 'fora' &&
    lancamentoDaConta(txc({ type: 'CREDIT', amount: 1000, description: 'RESGATE CDB', descriptionRaw: 'RESGATE CDB' }))!.papel === 'fora' &&
    lancamentoDaConta(txc({ category: 'Fixed income' }))!.papel === 'fora');
  checar('conta estorno de loja é entrada, não fora', lancamentoDaConta(txc({ type: 'CREDIT', amount: 50, description: 'ESTORNO LOJA', descriptionRaw: 'ESTORNO LOJA' }))!.papel === 'entrada');

  checar('conta tarifa é encargo', lancamentoDaConta(txc({ amount: -45, description: 'TARIFA PACOTE SERVICOS', descriptionRaw: 'TARIFA PACOTE SERVICOS' }))!.tipo === 'encargo');

  const pix = (paymentData: unknown, d = 'PIX TRANSF MARIA') => txc({ description: d, descriptionRaw: d, paymentData });
  checar('pessoa física pelo CPF do recebedor', lancamentoDaConta(pix({ payer: doc('CPF', CPF_TITULAR), receiver: doc('CPF', CPF_OUTRA_PESSOA) }))!.pessoaFisica === true);
  checar('pessoa jurídica pelo CNPJ do recebedor', lancamentoDaConta(pix({ payer: doc('CPF', CPF_TITULAR), receiver: doc('CNPJ', CNPJ_LOJA) }, 'PIX QRS PADARIA'))!.pessoaFisica === false);
  checar('Pix sem documento é pessoa física (conservador)', lancamentoDaConta(pix(null, 'PIX TRANSF JOAO'))!.pessoaFisica === true && lancamentoDaConta(pix(null, 'TED 001 FULANO'))!.pessoaFisica === true);
  checar('boleto sem documento não é pessoa física', lancamentoDaConta(pix(null, 'PAGTO BOLETO ESCOLA'))!.pessoaFisica === false);
  checar('sem documento, categoria de transferência é pessoa física', ehPessoaFisica(txc({ category: 'Transfer - PIX' }), 100, 'MARIA SILVA') && ehPessoaFisica(txc({ category: 'Transfers' }), 100, 'FULANO DE TAL'));
  checar('categoria de transferência não vence o CNPJ nem pega a mesma pessoa', !ehPessoaFisica(txc({ category: 'Transfer - PIX', paymentData: { receiver: doc('CNPJ', CNPJ_LOJA) } }), 100, 'PADARIA') && !ehPessoaFisica(txc({ category: 'Same person transfer - PIX' }), 100, 'CONTA X') && !ehPessoaFisica(txc({ category: 'Groceries' }), 100, 'MERCADO'));
  checar('crédito olha o pagador', ehPessoaFisica(txc({ type: 'CREDIT', paymentData: { payer: doc('CPF', CPF_OUTRA_PESSOA), receiver: doc('CPF', CPF_TITULAR) } }), -100, 'PIX RECEBIDO') === true);

  const cPix = lancamentoDaConta(pix({ payer: { name: NOME_TITULAR, ...doc('CPF', CPF_TITULAR) }, receiver: { name: 'MARIA', ...doc('CNPJ', CNPJ_LOJA) } }))!;
  // o nome da outra ponta pode estar na descrição (é o que o banco escreve); o documento e o nome do titular nunca
  checar('conta não leva documento nem titular', !vazou(cPix));
  // o banco escreve o nome do titular na descrição; o paymentData diz quem ele é, e o nome sai antes de gravar
  const comTitular = lancamentoDaConta(pix({ payer: { name: NOME_TITULAR, ...doc('CPF', CPF_TITULAR) }, receiver: { name: 'BANCO X', ...doc('CNPJ', CNPJ_LOJA) } }, `PIX ENVIADO ${NOME_TITULAR} BANCO X`))!;
  checar('débito tira o nome do pagador (titular) da descrição', !vazou(comTitular) && comTitular.descOrigem === 'PIX ENVIADO BANCO X' && !comTitular.descNorm.includes('FULANO'));
  const credTitular = lancamentoDaConta(txc({ type: 'CREDIT', amount: 200, description: 'Pix recebido  fulano de tál da silva', descriptionRaw: 'Pix recebido  fulano de tál da silva', paymentData: { payer: { name: 'MARIA SILVA', ...doc('CPF', CPF_OUTRA_PESSOA) }, receiver: { name: NOME_TITULAR, ...doc('CPF', CPF_TITULAR) } } }))!;
  checar('crédito tira o nome do recebedor (titular), sem acento nem caixa', credTitular.descOrigem === 'Pix recebido' && !vazou(credTitular));
  const mesmoDoc = lancamentoDaConta(txc({ type: 'CREDIT', amount: 200, description: 'TED FULANO D TAL SILVA', descriptionRaw: 'TED FULANO D TAL SILVA', paymentData: { payer: { name: 'Fulano D Tal Silva', ...doc('CPF', CPF_TITULAR) }, receiver: { name: NOME_TITULAR, ...doc('CPF', CPF_TITULAR) } } }))!;
  checar('mesmo documento dos dois lados: os dois nomes saem', mesmoDoc.descOrigem === 'TED' && mesmoDoc.papel === 'fora');
  checar('o nome da outra ponta fica (é o que o dono reconhece)', lancamentoDaConta(pix({ payer: { name: NOME_TITULAR, ...doc('CPF', CPF_TITULAR) }, receiver: { name: 'MARIA SILVA', ...doc('CPF', CPF_OUTRA_PESSOA) } }, 'PIX TRANSF MARIA SILVA'))!.descOrigem === 'PIX TRANSF MARIA SILVA');
  checar('descrição sem o nome fica como veio', lancamentoDaConta(pix({ payer: { name: NOME_TITULAR, ...doc('CPF', CPF_TITULAR) } }, 'PIX  TRANSF   MARIA'))!.descOrigem === 'PIX  TRANSF   MARIA');
  checar('nome dentro de outra palavra não é cortado', lancamentoDaConta(pix({ payer: { name: 'ANA', ...doc('CPF', CPF_TITULAR) } }, 'PIX MARIANA'))!.descOrigem === 'PIX MARIANA');
  checar('conta malformada é descartada', lancamentoDaConta(txc({ id: '' })) === null && lancamentoDaConta(txc({ amount: Number.NaN })) === null && lancamentoDaConta(txc({ date: 'ontem' })) === null);
  checar('papelDaConta direto', papelDaConta(txc(), 80, 'CONTA LUZ') === 'gasto' && papelDaConta(txc(), -80, 'PIX RECEBIDO') === 'entrada');

  checar('destino: cartão continua indo à IA como gasto', JSON.stringify(destinoNoSync({}, null)) === JSON.stringify({ papel: 'gasto', vaiParaIA: true, outros: false }));
  checar('destino: gasto para pessoa física fica em Outros e não vai à IA', JSON.stringify(destinoNoSync({ papel: 'gasto', pessoaFisica: true }, null)) === JSON.stringify({ papel: 'gasto', vaiParaIA: false, outros: true }));
  checar('destino: entrada aprendida vira renda', destinoNoSync({ papel: 'entrada' }, 'renda').papel === 'renda' && destinoNoSync({ papel: 'entrada' }, null).papel === 'entrada');
  checar('destino: regra de renda não mexe em gasto nem em fora', destinoNoSync({ papel: 'gasto' }, 'renda').papel === 'gasto' && destinoNoSync({ papel: 'fora' }, 'renda').papel === 'fora');
  checar('destino: entrada, renda e fora não vão à IA', (['entrada', 'renda', 'fora'] as const).every((p) => !destinoNoSync({ papel: p }, null).vaiParaIA && !destinoNoSync({ papel: p }, null).outros));
  checar('destino: "não conta" aprendido tira gasto e entrada da conta', destinoNoSync({ papel: 'gasto' }, 'fora').papel === 'fora' && destinoNoSync({ papel: 'entrada' }, 'fora').papel === 'fora');
  checar('destino: regra aprendida não vale para o cartão (papel indefinido)', destinoNoSync({}, 'fora').papel === 'gasto' && destinoNoSync({}, 'renda').papel === 'gasto');
  checar('destino: "não conta" aprendido não vai à IA', !destinoNoSync({ papel: 'gasto' }, 'fora').vaiParaIA);
  // a descrição de um Pix a uma empresa pode coincidir com a de um Pix a uma pessoa
  checar('destino: pessoa física não recebe "não conta" aprendido', JSON.stringify(destinoNoSync({ papel: 'gasto', pessoaFisica: true }, 'fora')) === JSON.stringify({ papel: 'gasto', vaiParaIA: false, outros: true }));
  checar('destino: pessoa física não recebe renda aprendida', destinoNoSync({ papel: 'entrada', pessoaFisica: true }, 'renda').papel === 'entrada' && destinoNoSync({ papel: 'entrada', pessoaFisica: true }, 'fora').papel === 'entrada');

  // ---- papel: marcação do dono (6.1) ---------------------------------------
  process.stdout.write('\n');

  checar('papel aceito: débito só gasto ou fora', papelAceito(80, 'gasto') && papelAceito(80, 'fora') && !papelAceito(80, 'renda') && !papelAceito(80, 'entrada'));
  checar('papel aceito: crédito só entrada, renda ou fora', papelAceito(-80, 'entrada') && papelAceito(-80, 'renda') && papelAceito(-80, 'fora') && !papelAceito(-80, 'gasto'));
  checar('papel aceito: valor zero não aceita nada além de fora', papelAceito(0, 'fora') && !papelAceito(0, 'gasto') && !papelAceito(0, 'entrada'));
  checar('chave do papel: sem dígitos e com espaços colapsados', chavePapel('BOLETO  ITAU UNIBANCO 12345 ') === 'BOLETO ITAU UNIBANCO');
  checar('chave do papel: mesmo emissor com dígitos diferentes dá a mesma chave', chavePapel('PAGAMENTO DE BOLETO ITAU UNIBANCO 0001 2026') === chavePapel('PAGAMENTO DE BOLETO ITAU UNIBANCO 9876 2027'));
  // a chave de 3 palavras juntaria os dois emissores e tiraria todo boleto dos totais
  checar('chave do papel: emissores diferentes dão chaves diferentes', chavePapel('PAGAMENTO DE BOLETO ITAU UNIBANCO') !== chavePapel('PAGAMENTO DE BOLETO BANCO PAN'));
  checar('chave do papel: Pix para pessoa e para empresa não se misturam', chavePapel('PIX ENVIADO CP MARIA SILVA') !== chavePapel('PIX ENVIADO CP EMPRESA X'));
  checar('chave do papel: no máximo 120 caracteres', chavePapel('EMPRESA X '.repeat(30)).length <= 120 && !chavePapel('EMPRESA X '.repeat(30)).endsWith(' '));
  checar('chave do papel: só dígitos não ensina nada', chavePapel('12345 678') === '' && chaveDaRegraDePapel('12345') === '');
  // o prefixo impede que a regra de papel e a de categoria caiam na mesma linha
  checar('chave da regra de papel tem prefixo e nunca é chave de categoria', chaveDaRegraDePapel('PAGAMENTO DE BOLETO BANCO PAN').startsWith(PREFIXO_PAPEL) && !chaveAprendizado('papel: PAGAMENTO').startsWith(PREFIXO_PAPEL));
  checar('regra do papel: renda e fora ensinam; gasto e entrada desfazem', regraDoPapel('renda') === 'renda' && regraDoPapel('fora') === 'fora' && regraDoPapel('gasto') === null && regraDoPapel('entrada') === null);
  checar('origens: renda leva entradas; desmarcar devolve as renda e as fora automáticas',
    JSON.stringify(origensDoPapel('renda')) === JSON.stringify(['entrada']) && JSON.stringify(origensDoPapel('entrada')) === JSON.stringify(['renda', 'fora']));
  checar('origens: "não conta" leva gasto e entrada; voltar a gasto devolve as fora automáticas',
    JSON.stringify(origensDoPapel('fora')) === JSON.stringify(['gasto', 'entrada']) && JSON.stringify(origensDoPapel('gasto')) === JSON.stringify(['fora']));

  const ent = (id: string, valor: string, papel: LinhaEntrada['papel']): LinhaEntrada => ({ id, data: '2026-09-05', valor, nome: `ORIGEM ${id}`, conta: 'Banco conta ••1234', papel, pessoaFisica: false });
  const blocos = blocosDeEntradas([ent('a', '-100.00', 'entrada'), ent('b', '-5000.00', 'renda'), ent('c', '-900.00', 'entrada'), ent('d', '-300.00', 'fora'), ent('e', '-1000.00', 'renda')]);
  checar('entradas: três blocos e total da renda', blocos.renda.length === 2 && blocos.aMarcar.length === 2 && blocos.fora.length === 1 && blocos.totalRenda === 6000);
  checar('entradas: ordem por valor, o maior primeiro', blocos.renda[0]!.id === 'b' && blocos.aMarcar[0]!.id === 'c');
  checar('entradas: vazio', blocosDeEntradas([]).totalRenda === 0 && blocosDeEntradas([]).aMarcar.length === 0);

  checar('aviso: renda com outros da mesma origem', textoDoPapel('renda', 3) === 'Marcado como renda, com mais 3 da mesma origem. Os próximos já chegam marcados.');
  checar('aviso: renda sozinho', textoDoPapel('renda', 0) === 'Marcado como renda. Os próximos da mesma origem já chegam marcados.');
  checar('aviso: não conta', textoDoPapel('fora', 1) === 'Fora dos totais, com mais 1 da mesma origem. Os próximos também ficam fora.');
  checar('aviso: voltar a gasto com outros da mesma origem', textoDoPapel('gasto', 2) === 'Volta a contar como gasto, com mais 2 da mesma origem.');
  checar('aviso: voltar', textoDoPapel('gasto', 0) === 'Volta a contar como gasto.' && textoDoPapel('entrada', 2) === 'Desmarcado, com mais 2 da mesma origem. Os próximos chegam para você marcar.');
  // Pix para pessoa física é marcado mas não ensina regra: o aviso não promete os próximos
  checar('aviso: sem aprender não promete os próximos', textoDoPapel('renda', 0, false) === 'Marcado como renda.' && textoDoPapel('fora', 0, false) === 'Fora dos totais.' && textoDoPapel('entrada', 0, false) === 'Desmarcado.');
  checar('pluggy fatura pelo vencimento', JSON.stringify(faturaDaBill(BILL)) === JSON.stringify({ pluggyBillId: 'bill-05', mesRef: '2026-05', vencimento: '2026-05-10', fechamento: null, total: 2345.67 }));
  checar('pluggy fatura com fechamento', faturaDaBill({ ...BILL, billClosingDate: '2026-05-01T00:00:00.000Z' }).fechamento === '2026-05-01');

  const contasExistentes: ContaExistente[] = [
    { id: 'c-pdf-1111', kind: 'cartao_credito', last4: '1111', pluggyAccountId: null },
    { id: 'c-pdf-2222', kind: 'cartao_credito', last4: '2222', pluggyAccountId: null },
  ];
  checar('pluggy cartão casa com o do PDF pelo last4', JSON.stringify(casarConta(contasExistentes, cCartao)) === JSON.stringify({ usar: 'c-pdf-1111' }));
  checar('pluggy conta já ligada casa pelo id do Pluggy', JSON.stringify(casarConta([{ id: 'c-x', kind: 'cartao_credito', last4: '9999', pluggyAccountId: 'pa-cartao' }, ...contasExistentes], cCartao)) === JSON.stringify({ usar: 'c-x' }));
  checar('pluggy last4 repetido não casa', JSON.stringify(casarConta([...contasExistentes, { id: 'c-pdf-1111b', kind: 'cartao_credito', last4: '1111', pluggyAccountId: null }], cCartao)) === JSON.stringify({ criar: true }));
  checar('pluggy reconexão religa o cartão ligado a outro id do Pluggy', JSON.stringify(casarConta([{ id: 'c-pdf-1111', kind: 'cartao_credito', last4: '1111', pluggyAccountId: 'pa-outro' }, ...contasExistentes.slice(1)], cCartao)) === JSON.stringify({ usar: 'c-pdf-1111' }));
  checar('pluggy cartão sem last4 cria', JSON.stringify(casarConta(contasExistentes, { ...cCartao, last4: null })) === JSON.stringify({ criar: true }));
  checar('pluggy conta corrente sempre cria', JSON.stringify(casarConta(contasExistentes, cCorrente)) === JSON.stringify({ criar: true }));

  // ---- pluggy: deduplicação ------------------------------------------------
  process.stdout.write('\n');

  const CONTA = U1;
  const desc = 'IFOOD RESTAURANTE';
  const ex = (o: Partial<Existente> = {}): Existente => ({
    id: 'e1', data: '2026-04-10', valor: 120, descNorm: desc, fonte: 'pdf', pluggyTxnId: null,
    dedupeKey: chaveDedupe(CONTA, '2026-04-10', 120, desc, 0), excluido: false,
    tipo: 'escolha', pendente: false, parcelaN: null, statementId: null, installmentId: null, duplicadoDe: null, pessoaFisica: false, ...o,
  });
  const rec = (o: Partial<Recebido> = {}): Recebido => ({
    pluggyTxnId: 'pt-1', data: '2026-04-10', dataLancamento: '2026-04-10', valor: 120, descOrigem: 'IFOOD *RESTAURANTE', descNorm: desc,
    tipo: 'escolha', parcela: null, billId: null, pendente: false, ...o,
  });
  const semFatura = () => null;
  const resumo = (as: Acao[]) => as.map((a) => (a.tipo === 'inserir' ? `inserir${a.suspeitoDuplicado ? '!' : ''}` : `${a.tipo}:${a.existenteId}`)).join(',');

  checar('dedupe mesmo id do Pluggy atualiza', resumo(planejarSync(CONTA, [ex({ fonte: 'pluggy', pluggyTxnId: 'pt-1', dedupeKey: 'outra' })], [rec()], semFatura)) === 'atualizar:e1');
  checar('dedupe mesma chave natural do PDF promove', resumo(planejarSync(CONTA, [ex()], [rec()], semFatura)) === 'promover:e1');
  checar('dedupe mesma chave de linha do Pluggy atualiza', resumo(planejarSync(CONTA, [ex({ fonte: 'pluggy', pluggyTxnId: 'pt-antigo' })], [rec()], semFatura)) === 'atualizar:e1');
  checar('dedupe aproximado com um candidato promove', resumo(planejarSync(CONTA, [ex({ data: '2026-04-08', descNorm: 'IFOOD RESTAURANTE SP', dedupeKey: 'pdf-x' })], [rec()], semFatura)) === 'promover:e1');
  checar('dedupe aproximado com dois candidatos entra suspeito', resumo(planejarSync(CONTA, [ex({ id: 'e1', data: '2026-04-08', dedupeKey: 'a' }), ex({ id: 'e2', data: '2026-04-12', dedupeKey: 'b' })], [rec()], semFatura)) === 'inserir!');
  checar('dedupe fora da janela de 3 dias insere', resumo(planejarSync(CONTA, [ex({ data: '2026-04-05', dedupeKey: 'a' })], [rec()], semFatura)) === 'inserir');
  checar('dedupe valor diferente insere', resumo(planejarSync(CONTA, [ex({ valor: 121, dedupeKey: 'a' })], [rec()], semFatura)) === 'inserir');
  checar('dedupe aproximado não pega linha que já é do Pluggy', resumo(planejarSync(CONTA, [ex({ fonte: 'pluggy', pluggyTxnId: 'pt-9', data: '2026-04-09', dedupeKey: 'a' })], [rec()], semFatura)) === 'inserir');
  checar('dedupe excluído pela chave não volta', resumo(planejarSync(CONTA, [ex({ excluido: true })], [rec()], semFatura)) === 'ignorar:e1');
  checar('dedupe excluído pelo aproximado não volta', resumo(planejarSync(CONTA, [ex({ excluido: true, data: '2026-04-09', dedupeKey: 'a' })], [rec()], semFatura)) === 'ignorar:e1');
  checar('dedupe excluído pelo id do Pluggy não volta', resumo(planejarSync(CONTA, [ex({ excluido: true, fonte: 'pluggy', pluggyTxnId: 'pt-1', dedupeKey: 'a' })], [rec()], semFatura)) === 'ignorar:e1');
  checar('dedupe candidato usado uma vez por lote', resumo(planejarSync(CONTA, [ex({ data: '2026-04-09', dedupeKey: 'a' })], [rec({ pluggyTxnId: 'pt-1', data: '2026-04-10' }), rec({ pluggyTxnId: 'pt-2', data: '2026-04-11' })], semFatura)) === 'promover:e1,inserir');
  const cafe = 'PADARIA CENTRAL';
  checar('dedupe dois cafés iguais casam com os dois do PDF',
    resumo(planejarSync(CONTA, [
      ex({ id: 'c0', descNorm: cafe, valor: 12, dedupeKey: chaveDedupe(CONTA, '2026-04-10', 12, cafe, 0) }),
      ex({ id: 'c1', descNorm: cafe, valor: 12, dedupeKey: chaveDedupe(CONTA, '2026-04-10', 12, cafe, 1) }),
    ], [rec({ pluggyTxnId: 'pa', descNorm: cafe, valor: 12 }), rec({ pluggyTxnId: 'pb', descNorm: cafe, valor: 12 })], semFatura)) === 'promover:c0,promover:c1');
  const novo = planejarSync(CONTA, [], [rec()], semFatura)[0]!;
  checar('dedupe inserir leva a chave natural com ordinal', novo.tipo === 'inserir' && novo.dedupeKey === chaveDedupe(CONTA, '2026-04-10', 120, desc, 0) && novo.recebido.ordinal === 0);
  checar('dedupe estorno compara valor absoluto', resumo(planejarSync(CONTA, [ex({ valor: -30, data: '2026-04-09', dedupeKey: 'a' })], [rec({ valor: -30 })], semFatura)) === 'promover:e1');

  checar('dedupe prefixo da chave', chaveDedupe(CONTA, '2026-04-10', 120, desc, 7).startsWith(prefixoDedupe(CONTA, '2026-04-10', 120, desc)) && !chaveDedupe(CONTA, '2026-04-10', 121, desc, 7).startsWith(prefixoDedupe(CONTA, '2026-04-10', 120, desc)));

  const kA0 = chaveDedupe(CONTA, '2026-04-10', 120, desc, 0);
  const kA1 = chaveDedupe(CONTA, '2026-04-10', 120, desc, 1);
  const bA = planejarSync(CONTA, [ex({ id: 'eA', fonte: 'pluggy', pluggyTxnId: 'pt-A', dedupeKey: kA0 })], [rec({ pluggyTxnId: 'pt-B' }), rec({ pluggyTxnId: 'pt-A' })], semFatura);
  const bNovo = bA[0]!;
  checar('dedupe [B, A]: A casa pelo id e B não reaproveita a linha de A', resumo(bA) === 'inserir,atualizar:eA' && bNovo.tipo === 'inserir' && bNovo.dedupeKey !== kA0 && bNovo.recebido.pluggyTxnId === 'pt-B');

  const parc = (n: number, o: Partial<Recebido> = {}) => rec({ pluggyTxnId: `p${n}`, tipo: 'parcela', parcela: { n, total: 10 }, ...o });
  const exP = [
    ex({ id: 'P3', fonte: 'pluggy', pluggyTxnId: 'p3', dedupeKey: kA0, tipo: 'parcela', parcelaN: 3 }),
    ex({ id: 'P4', fonte: 'pluggy', pluggyTxnId: 'p4', dedupeKey: kA1, tipo: 'parcela', parcelaN: 4 }),
  ];
  const ppl = planejarSync(CONTA, exP, [parc(4), parc(5)], semFatura);
  const pl5 = ppl[1]!;
  checar('dedupe parcela do mês seguinte ganha chave livre', resumo(ppl) === 'atualizar:P4,inserir' && pl5.tipo === 'inserir' && pl5.dedupeKey !== kA0 && pl5.dedupeKey !== kA1 && pl5.dedupeKey === chaveDedupe(CONTA, '2026-04-10', 120, desc, pl5.recebido.ordinal));
  checar('dedupe parcela sozinha não toma a linha de outro número pela chave', resumo(planejarSync(CONTA, exP, [parc(5)], semFatura)) === 'inserir');

  checar('dedupe id repetido no lote vira uma ação só', planejarSync(CONTA, [], [rec(), rec()], semFatura).length === 1);

  const ifoodPdf = normalizarDescricao('iFood');
  const ifoodApi = 'IFOOD *RESTAURANTE SAO PAULO BR';
  checar('dedupe aproximado de candidata única promove sem texto parecido',
    resumo(planejarSync(CONTA, [ex({ descNorm: ifoodPdf, data: '2026-04-09', dedupeKey: 'a' })], [rec({ descOrigem: ifoodApi, descNorm: normalizarDescricao(ifoodApi) })], semFatura)) === 'promover:e1');
  const uber = 'UBER *TRIP HELP.UBER.COM';
  checar('dedupe aproximado desempata pelo texto relacionado',
    resumo(planejarSync(CONTA, [
      ex({ id: 'pad', descNorm: normalizarDescricao('PADARIA'), data: '2026-04-09', dedupeKey: 'a' }),
      ex({ id: 'ub', descNorm: normalizarDescricao('UBER'), data: '2026-04-11', dedupeKey: 'b' }),
    ], [rec({ descOrigem: uber, descNorm: normalizarDescricao(uber) })], semFatura)) === 'promover:ub');
  checar('dedupe aproximado sem texto relacionado entra suspeito',
    resumo(planejarSync(CONTA, [
      ex({ id: 'pad', descNorm: normalizarDescricao('PADARIA'), data: '2026-04-09', dedupeKey: 'a' }),
      ex({ id: 'far', descNorm: normalizarDescricao('FARMACIA'), data: '2026-04-11', dedupeKey: 'b' }),
    ], [rec({ descOrigem: uber, descNorm: normalizarDescricao(uber) })], semFatura)) === 'inserir!');

  const daFatura = (b: string | null) => (b === 'bill-1' ? 'st-1' : null);
  checar('dedupe parcela casa pelo número e pela fatura',
    resumo(planejarSync(CONTA, [
      ex({ id: 'pdf4', dedupeKey: kA0, tipo: 'parcela', parcelaN: 4, statementId: 'st-0' }),
      ex({ id: 'pdf3', dedupeKey: kA1, tipo: 'parcela', parcelaN: 3, statementId: 'st-m' }),
      ex({ id: 'pdf5', dedupeKey: 'pdf-5', tipo: 'parcela', parcelaN: 5, statementId: 'st-1' }),
    ], [parc(5, { billId: 'bill-1' })], daFatura)) === 'promover:pdf5');
  checar('dedupe parcela com número diferente não casa no aproximado',
    resumo(planejarSync(CONTA, [ex({ data: '2026-04-09', dedupeKey: 'a', tipo: 'parcela', parcelaN: 4 })], [parc(5)], semFatura)) === 'inserir');

  const ub = (o: Partial<Recebido>) => rec({ descOrigem: uber, descNorm: normalizarDescricao(uber), valor: 15.9, ...o });
  const exUb = (o: Partial<Existente>) => ex({ descNorm: normalizarDescricao('Uber'), valor: 15.9, ...o });
  checar('dedupe aproximado prefere o recebido de data mais próxima',
    resumo(planejarSync(CONTA, [exUb({ id: 'P10', dedupeKey: 'a' })], [ub({ pluggyTxnId: 'q11', data: '2026-04-11' }), ub({ pluggyTxnId: 'q10', data: '2026-04-10' })], semFatura)) === 'inserir,promover:P10');
  checar('dedupe aproximado casa cada um com o do mesmo dia',
    resumo(planejarSync(CONTA, [exUb({ id: 'P10', dedupeKey: 'a' }), exUb({ id: 'P11', data: '2026-04-11', dedupeKey: 'b' })], [ub({ pluggyTxnId: 'q10', data: '2026-04-10' }), ub({ pluggyTxnId: 'q11', data: '2026-04-11' })], semFatura)) === 'promover:P10,promover:P11');
  checar('dedupe aproximado com empate de distância entra suspeito',
    resumo(planejarSync(CONTA, [exUb({ id: 'P10', dedupeKey: 'a' })], [ub({ pluggyTxnId: 'q09', data: '2026-04-09' }), ub({ pluggyTxnId: 'q11', data: '2026-04-11' })], semFatura)) === 'inserir!,inserir!');
  checar('dedupe aproximado não casa faturas conhecidas e diferentes',
    resumo(planejarSync(CONTA, [ex({ data: '2026-04-09', dedupeKey: 'a', statementId: 'st-0' })], [rec({ billId: 'bill-1' })], daFatura)) === 'inserir');

  // X é o PDF que o "É este" ligou a S; Y é outra compra de mesmo valor no dia seguinte
  const ligadoX = ex({ id: 'X', excluido: true, duplicadoDe: 'S', dedupeKey: 'x' });
  const jaDoS = ex({ id: 'S', fonte: 'pluggy', pluggyTxnId: 'pt-S', dedupeKey: 's' });
  checar('dedupe PDF ligado pelo É este não engole outra compra no aproximado',
    resumo(planejarSync(CONTA, [ligadoX, jaDoS], [rec({ pluggyTxnId: 'pt-Y', data: '2026-04-11' })], semFatura)) === 'inserir');
  checar('dedupe PDF ligado pelo É este não engole outra compra pela chave',
    resumo(planejarSync(CONTA, [{ ...ligadoX, dedupeKey: kA0 }, jaDoS], [rec({ pluggyTxnId: 'pt-Y' })], semFatura)) === 'inserir');

  const acaoDe = (tipo: 'atualizar' | 'promover', r: Recebido): Acao => ({ tipo, existenteId: 'e1', recebido: { ...r, ordinal: 0 } });
  const cPostada = camposDaAcao(acaoDe('atualizar', rec({ valor: 130 })), ex({ fonte: 'pluggy', pluggyTxnId: 'pt-1' }));
  const cPendente = camposDaAcao(acaoDe('atualizar', rec({ valor: 130 })), ex({ fonte: 'pluggy', pluggyTxnId: 'pt-1', pendente: true }));
  checar('camposDaAcao valor só muda se a linha estava pendente', !('valor' in cPostada) && cPendente.valor === '130.00' && cPostada.pendente === false);
  const cPag = camposDaAcao(acaoDe('atualizar', rec()), ex({ tipo: 'pagamento' }));
  const cParc = camposDaAcao(acaoDe('atualizar', parc(5)), ex({ tipo: 'escolha' }));
  checar('camposDaAcao tipo escolha não rebaixa e parcela sobrescreve', !('tipo' in cPag) && !('parcelaN' in cPag) && cParc.tipo === 'parcela' && cParc.parcelaN === 5);
  const cEncargo = camposDaAcao(acaoDe('promover', parc(5)), ex({ tipo: 'encargo' }));
  const cFixo = camposDaAcao(acaoDe('atualizar', rec({ tipo: 'pagamento' })), ex({ tipo: 'fixo' }));
  checar('camposDaAcao parcela não rebaixa encargo e pagamento não troca fixo', !('tipo' in cEncargo) && !('tipo' in cFixo));
  const cProm = camposDaAcao(acaoDe('promover', rec({ pendente: true, valor: 130 })), ex());
  checar('camposDaAcao promover leva id e fonte', cProm.pluggyTxnId === 'pt-1' && cProm.fonte === 'pluggy' && !('pluggyTxnId' in cPostada) && !('fonte' in cPostada));
  checar('camposDaAcao linha postada não volta a pendente', cProm.pendente === false && !('valor' in cProm));
  // 6.0, I2: o PDF não sabe quem recebeu o Pix; o Pluggy que sabe só marca, nunca desmarca
  const cPfSobe = camposDaAcao(acaoDe('promover', rec({ pessoaFisica: true })), ex());
  const cPfFica = camposDaAcao(acaoDe('atualizar', rec({ pessoaFisica: false })), ex({ pessoaFisica: true }));
  const cPfJa = camposDaAcao(acaoDe('atualizar', rec({ pessoaFisica: true })), ex({ pessoaFisica: true }));
  checar('camposDaAcao pessoa física só sobe', cPfSobe.pessoaFisica === true && !('pessoaFisica' in cPfFica) && !('pessoaFisica' in cPfJa) && !('pessoaFisica' in cPostada));
  const cTudo = camposDaAcao(acaoDe('promover', parc(5, { pendente: true, pessoaFisica: true })), ex({ pendente: true }));
  const permitidas = ['valor', 'tipo', 'parcelaN', 'pendente', 'pluggyTxnId', 'fonte', 'pessoaFisica'];
  checar('camposDaAcao só mexe nos campos permitidos',
    permitidas.every((k) => k in cTudo) &&
    [cPostada, cPendente, cPag, cParc, cEncargo, cFixo, cProm, cTudo, cPfSobe].every((c) => Object.keys(c).every((k) => permitidas.includes(k))));

  // ---- pluggy: cliente -----------------------------------------------------
  process.stdout.write('\n');

  type Passo = { status: number; corpo?: unknown } | 'rede';
  const roteiro = (passos: Passo[]) => {
    const chamadas: { url: string; chave: string | null; metodo: string }[] = [];
    let i = 0;
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      chamadas.push({ url: String(url), chave: h['X-API-KEY'] ?? null, metodo: init?.method ?? 'GET' });
      const p = passos[i++];
      if (!p) throw new Error('roteiro acabou');
      if (p === 'rede') throw new Error('rede caiu');
      return new Response(JSON.stringify(p.corpo ?? {}), { status: p.status });
    }) as typeof fetch;
    return { f, chamadas };
  };
  const esperas: number[] = [];
  const esperar = async (ms: number) => { esperas.push(ms); };
  const cred = { clientId: 'id-teste', clientSecret: 'segredo-teste' };

  const r1 = roteiro([
    { status: 200, corpo: { apiKey: 'k1' } },
    { status: 200, corpo: { results: [{ id: 'a' }], next: '?accountId=acc-1&after=CUR1' } },
    { status: 200, corpo: { results: [{ id: 'b' }], next: null } },
  ]);
  const ts = await criarClientePluggy({ ...cred, fetch: r1.f, esperar }).transacoes('acc-1', '2026-01-01', '2026-03-31');
  checar('pluggy cliente pagina pelo cursor do v2', ts.map((t) => t.id).join(',') === 'a,b' && r1.chamadas[0]!.url.endsWith('/auth') && r1.chamadas[0]!.metodo === 'POST' && r1.chamadas[1]!.url.includes('/v2/transactions?') && r1.chamadas[1]!.url.includes('dateFrom=2026-01-01') && r1.chamadas[1]!.url.includes('dateTo=2026-03-31') && r1.chamadas[2]!.url.endsWith('/v2/transactions?accountId=acc-1&after=CUR1') && r1.chamadas.length === 3 && r1.chamadas.slice(1).every((c) => c.chave === 'k1'));

  const r2 = roteiro([
    { status: 200, corpo: { apiKey: 'k1' } },
    { status: 401, corpo: { message: 'expirada' } },
    { status: 200, corpo: { apiKey: 'k2' } },
    { status: 200, corpo: { results: [{ id: 'x' }] } },
  ]);
  const contas = await criarClientePluggy({ ...cred, fetch: r2.f, esperar }).contasDoItem('item-1');
  checar('pluggy cliente renova a apiKey depois de 401', contas.length === 1 && r2.chamadas[3]!.chave === 'k2' && r2.chamadas[3]!.url.includes('itemId=item-1'));

  esperas.length = 0;
  const r3 = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 503 }, 'rede', { status: 200, corpo: { results: [] } }]);
  const bills = await criarClientePluggy({ ...cred, fetch: r3.f, esperar }).faturas('acc-1');
  checar('pluggy cliente tenta de novo em 5xx e rede', bills.length === 0 && esperas.join(',') === '1000,2000' && r3.chamadas[3]!.url.includes('/bills?accountId=acc-1'));

  esperas.length = 0;
  const r4 = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }]);
  let desistiu = false;
  try { await criarClientePluggy({ ...cred, fetch: r4.f, esperar }).faturas('acc-1'); } catch { desistiu = true; }
  checar('pluggy cliente desiste depois de 3 novas tentativas', desistiu && esperas.join(',') === '1000,2000,4000' && r4.chamadas.length === 5);

  const r5 = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 404 }]);
  let msg = '';
  try { await criarClientePluggy({ ...cred, fetch: r5.f, esperar }).contasDoItem('x'); } catch (e) { msg = e instanceof Error ? e.message : ''; }
  checar('pluggy cliente não tenta de novo em 4xx e não vaza credencial', msg.includes('404') && !msg.includes('segredo-teste') && !msg.includes('k1') && r5.chamadas.length === 2);

  const r6 = roteiro([]);
  let semChave = false;
  try { await criarClientePluggy({ fetch: r6.f, esperar }).contasDoItem('x'); } catch (e) { semChave = e instanceof SemChavePluggy; }
  checar('pluggy cliente sem credenciais não chama a rede', semChave && r6.chamadas.length === 0);

  const corposCt: unknown[] = [];
  const rCt = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 200, corpo: { accessToken: 'tok-1' } }]);
  const fCt = (async (url: string | URL | Request, init?: RequestInit) => {
    corposCt.push(init?.body ? JSON.parse(String(init.body)) : null);
    return rCt.f(url, init);
  }) as typeof fetch;
  const tok = await criarClientePluggy({ ...cred, fetch: fCt, esperar }).connectToken('user-1');
  const corpoCt = corposCt[1] as { itemId?: string; options?: { clientUserId?: string; avoidDuplicates?: boolean } };
  checar('pluggy connect token', tok === 'tok-1' && rCt.chamadas[1]!.url.endsWith('/connect_token') && rCt.chamadas[1]!.metodo === 'POST' && rCt.chamadas[1]!.chave === 'k1' && corpoCt.options?.clientUserId === 'user-1' && corpoCt.options?.avoidDuplicates === undefined && !('itemId' in corpoCt));
  const rCt2 = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 200, corpo: {} }]);
  let semToken = '';
  try { await criarClientePluggy({ ...cred, fetch: rCt2.f, esperar }).connectToken('user-1'); } catch (e) { semToken = e instanceof Error ? e.message : ''; }
  checar('pluggy connect token sem accessToken falha sem vazar credencial', semToken.includes('accessToken') && !semToken.includes('segredo-teste') && !semToken.includes('k1'));

  const r7 = roteiro([
    { status: 200, corpo: { apiKey: 'k1' } },
    { status: 200, corpo: { results: [] } },
    { status: 200, corpo: { results: [] } },
  ]);
  const cli = criarClientePluggy({ ...cred, fetch: r7.f, esperar });
  await cli.faturas('a');
  await cli.faturas('b');
  checar('pluggy cliente reaproveita a apiKey', r7.chamadas.filter((c) => c.url.endsWith('/auth')).length === 1);

  esperas.length = 0;
  const r8 = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 429 }, { status: 200, corpo: { results: [] } }]);
  const b8 = await criarClientePluggy({ ...cred, fetch: r8.f, esperar }).faturas('acc-1');
  checar('pluggy cliente tenta de novo em 429', b8.length === 0 && esperas.join(',') === '1000' && r8.chamadas.length === 3);

  esperas.length = 0;
  let pedidos = 0;
  const comSinal: boolean[] = [];
  const pendura = (async (url: string | URL | Request, init?: RequestInit) => {
    pedidos++;
    comSinal.push(init?.signal instanceof AbortSignal);
    if (String(url).endsWith('/auth')) return new Response(JSON.stringify({ apiKey: 'k1' }), { status: 200 });
    if (pedidos === 2)
      return new Promise<Response>((_, falhou) => init?.signal?.addEventListener('abort', () => falhou(init.signal!.reason)));
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }) as typeof fetch;
  // sem o relógio, um fetch pendurado esvaziaria o event loop e o teste sumiria calado
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const b9 = await Promise.race([
    criarClientePluggy({ ...cred, fetch: pendura, esperar, timeoutMs: 5 }).faturas('acc-1'),
    new Promise<null>((ok) => { relogio = setTimeout(() => ok(null), 2000); }),
  ]);
  clearTimeout(relogio);
  checar('pluggy cliente desiste de fetch pendurado e tenta de novo', b9 !== null && b9.length === 0 &&esperas.join(',') === '1000' && pedidos === 3 && comSinal.every(Boolean));

  // ---- ajustes: ia ---------------------------------------------------------
  process.stdout.write('\n');

  const okI = (c: unknown) => { const v = validarConfig(c); return v.ok ? v.mudanca : null; };
  const erroI = (c: unknown) => { const v = validarConfig(c); return v.ok ? null : v.codigo; };
  checar('ia modelo válido', okI({ modeloIa: ' anthropic/claude-sonnet-4.5 ' })?.modeloIa === 'anthropic/claude-sonnet-4.5' && okI({ modeloIa: 'openai/gpt-4.1-mini' })?.modeloIa === 'openai/gpt-4.1-mini' && okI({ modeloIa: 'meta-llama/llama-3.1-8b-instruct:free' })?.modeloIa === 'meta-llama/llama-3.1-8b-instruct:free');
  checar('ia modelo vazio volta ao padrão', okI({ modeloIa: '' })?.modeloIa === null && okI({ modeloIa: null })?.modeloIa === null);
  checar('ia modelo fora do formato é erro', ['claude', 'anthropic claude/x', 'a/b c', `a/${'x'.repeat(99)}`, 5].every((m) => erroI({ modeloIa: m }) === 'modelo_invalido'));
  checar('ia teto', okI({ tetoIaUsd: '' })?.tetoIaUsd === null && okI({ tetoIaUsd: '0' })?.tetoIaUsd === 0 && okI({ tetoIaUsd: '12,5' })?.tetoIaUsd === 12.5 && okI({ tetoIaUsd: '9999,99' })?.tetoIaUsd === 9999.99 && erroI({ tetoIaUsd: '-1' }) === 'teto_fora' && erroI({ tetoIaUsd: '10000' }) === 'teto_fora' && erroI({ tetoIaUsd: 'abc' }) === 'valor_invalido');
  checar('ia campo número mostra zero', formatarCampo('numero', 0) === '0' && formatarCampo('numero', 12.5) === '12,5' && formatarCampo('numero', null) === '');

  const g1 = resumoGasto({ gasto: 3.42, chamadas: 12, semCusto: 0 }, 10);
  checar('ia gasto abaixo do teto', g1.gasto === 3.42 && g1.teto === 10 && g1.chamadas === 12 && Math.abs((g1.pct ?? 0) - 34.2) < 1e-9 && g1.acima === false);
  const g2 = resumoGasto({ gasto: 12, chamadas: 30, semCusto: 2 }, 10);
  checar('ia gasto acima do teto', g2.acima === true && g2.pct === 100 && g2.semCusto === 2);
  const g3 = resumoGasto({ gasto: 5, chamadas: 3, semCusto: 0 }, 0);
  checar('ia teto zero é sem teto', g3.teto === 0 && g3.pct === null && g3.acima === false);

  // ---- exportar csv --------------------------------------------------------
  process.stdout.write('\n');

  const linhaCsv = (o: Partial<LinhaCsv> = {}): LinhaCsv => ({
    mes: '2026-09', banco: 'Itaú', cartao: '1111', data: '2026-09-03', desc: 'IFOOD *RESTAURANTE', limpa: null, apelido: null,
    categoria: 'Restaurantes & Delivery', parcelaN: null, totalParcelas: null, tipo: 'escolha', valor: 120.5,
    cartaoApelido: 'Itaú - Azul', fonte: 'pdf', papel: 'gasto', ...o,
  });
  const csv = montarCsv([linhaCsv(), linhaCsv({ desc: 'Loja "Boa"', apelido: 'Presente', parcelaN: 3, totalParcelas: 10, tipo: 'parcela', valor: 300 }), linhaCsv({ desc: '=HYPERLINK("http://x")', valor: -30, fonte: 'pluggy' }), linhaCsv({ desc: 'PIX RECEBIDO', valor: -5000, fonte: 'pluggy', papel: 'renda', cartao: '3456', tipo: 'escolha' })]);
  const linhasCsv = csv.split('\r\n');
  checar('csv começa com BOM e cabeçalho do legado', csv.startsWith('﻿') && linhasCsv[0] === '﻿"mes_fatura";"banco";"cartao";"data";"estabelecimento_na_fatura";"meu_nome";"categoria";"parcela";"tipo";"valor";"cartao_apelido";"fonte";"papel"');
  checar('csv linha simples', linhasCsv[1] === '"2026-09";"Itaú";"1111";"2026-09-03";"IFOOD *RESTAURANTE";"IFOOD *RESTAURANTE";"Restaurantes & Delivery";"";"escolha";"120,50";"Itaú - Azul";"pdf";"gasto"');
  checar('csv leva o papel da conta corrente', linhasCsv[4]!.endsWith('"-5000,00";"Itaú - Azul";"pluggy";"renda"') && linhasCsv.length === 5);
  checar('csv aspas dobradas, apelido e parcela', linhasCsv[2]!.includes('"Loja ""Boa"""') && linhasCsv[2]!.includes('"Presente"') && linhasCsv[2]!.includes('"3/10"') && linhasCsv[2]!.includes('"300,00"'));
  checar('csv neutraliza fórmula em texto e não em valor', linhasCsv[3]!.includes(`"'=HYPERLINK(""http://x"")"`) && linhasCsv[3]!.includes('"-30,00"') && !linhasCsv[3]!.includes(`"'-30,00"`));
  checar('csv guarda também +, @, tab e CR no início', ['+1', '@x', '\tx', '\rx', '-x'].every((s) => montarCsv([linhaCsv({ desc: s })]).includes(`"'${s}`)));
  checar('csv meu nome: apelido, depois nome limpo, depois original', montarCsv([linhaCsv({ limpa: 'iFood' })]).includes('"IFOOD *RESTAURANTE";"iFood"') && montarCsv([linhaCsv({ limpa: 'iFood', apelido: 'Jantar' })]).includes('"IFOOD *RESTAURANTE";"Jantar"'));
  checar('csv sem linhas tem só o cabeçalho', montarCsv([]).split('\r\n').length === 1);

  // ---- apagar tudo ---------------------------------------------------------
  checar('apagar só com a frase exata', FRASE_APAGAR === 'APAGAR TUDO' && confirmouApagar('APAGAR TUDO') && ['apagar tudo', ' APAGAR TUDO', 'APAGAR TUDO ', 'APAGAR', '', null, undefined, 5].every((t) => !confirmouApagar(t)));

  // ---- resumo do mês -------------------------------------------------------
  process.stdout.write('\n');

  const ctxR = contexto(null);
  const dR = dadosResumo(ctxR);
  checar('resumo dados do mês mais recente', dR.m === '2026-06' && dR.prevM === '2026-05' && Math.abs(dR.total - porMes(ctxR).find((x) => x[0] === '2026-06')![1]) < 1e-9 && dR.cats.length > 0 && dR.cats.every((c, i, a) => c[1] > 0 && (i === 0 || a[i - 1]![1] >= c[1])));
  checar('resumo cartões sem os quatro dígitos', dR.porCartao.length === 2 && dR.porCartao.every((c) => c.total > 0 && !/\d{4}|••/.test(c.nome)));
  const pR = promptResumo(ctxR, dR);
  checar('resumo prompt traz mês, total, categorias e pede JSON', pR.includes(rotuloMes('2026-06')) && pR.includes(moeda(dR.total)) && pR.includes(dR.cats[0]![0]) && pR.includes('Responda SOMENTE com JSON') && pR.includes('"texto"'));
  checar('resumo prompt não vaza cartão nem id', ['1111', '2222', '••', 'a-2026', 'b-2026'].every((s) => !pR.includes(s)));
  checar('resumo prompt do mesmo recorte é igual', promptResumo(ctxR, dadosResumo(contexto(null))) === pR);
  // descrição crua do Pluggy traz CPF; o apelido, escrito pela pessoa, vai intacto
  const ctxD = contexto(null);
  const fJun = ctxD.faturas.find((f) => f.mesRef === '2026-06')!;
  fJun.lancamentos.push(
    { desc: 'PIX ENVIADO 123.456.789-00 FULANO', apelido: null, val: 99999, cat: 'Outros', parc: null, tipo: 'compra' },
    { desc: 'TED 12345678900', apelido: null, val: 88888, cat: 'Outros', parc: null, tipo: 'compra' },
    { desc: 'PIX 987.654.321-00 ALUGUEL', apelido: 'Aluguel 2026-07', val: 77777, cat: 'Outros', parc: null, tipo: 'compra' },
    { desc: 'PIX 111.222.333-44 BELTRANO', limpa: 'Pix Beltrano 111.222.333-44', apelido: null, val: 66666, cat: 'Outros', parc: null, tipo: 'compra' },
  );
  const pD = promptResumo(ctxD, dadosResumo(ctxD));
  checar('resumo prompt tira CPF da descrição crua', !pD.includes('123.456.789-00') && !pD.includes('12345678900') && pD.includes('PIX ENVIADO FULANO') && pD.includes(`TED ${moeda(88888)}`));
  checar('resumo prompt tira CPF também do nome limpo', !pD.includes('111.222.333-44') && pD.includes(`Pix Beltrano ${moeda(66666)}`));
  checar('resumo prompt mantém apelido e valores', pD.includes(`Aluguel 2026-07 ${moeda(77777)}`) && pD.includes(moeda(99999)) && !pD.includes('987.654'));
  checar('resumo semDocumentos', semDocumentos('12.345.678/0001-90') === 'lançamento' && semDocumentos('IFOOD 99') === 'IFOOD 99' && semDocumentos('  UBER   *TRIP ') === 'UBER *TRIP');
  checar('resumo chave do recorte', chaveRecorte({ mes: null, cartoes: [], obra: false }, '2026-06') === '2026-06|todos|0' && chaveRecorte({ mes: 'TODOS', cartoes: ['b', 'a'], obra: true }, null) === 'todos|a,b|1');
  checar('resumo leitura da resposta', lerResumo({ texto: '  oi  ' }) === 'oi' && lerResumo({ texto: '   ' }) === null && lerResumo({ texto: 5 }) === null && lerResumo(null) === null && lerResumo('x') === null && lerResumo({ texto: 'a'.repeat(700) })!.length === 600);

  // ---- diagnóstico: transporte e texto ------------------------------------
  process.stdout.write('\n');

  const md = markdownLeve('### O diagnóstico **forte** aqui\n- item R$ 1.234,56\n* outro\n\nTexto <script>alert(1)</script>\n1. numerado');
  checar('markdown título com negrito', md[0]?.tipo === 'titulo' && md[0].partes.length === 3 && md[0].partes[1]!.texto === 'forte' && md[0].partes[1]!.forte === true);
  checar('markdown lista com dinheiro', md[1]?.tipo === 'lista' && md[1].itens.length === 2 && md[1].itens[0]!.some((p) => p.dinheiro === true && p.texto === 'R$ 1.234,56'));
  checar('markdown HTML vira texto', md[2]?.tipo === 'paragrafo' && md[2].partes.map((p) => p.texto).join('') === 'Texto <script>alert(1)</script>');
  checar('markdown lista numerada', md[3]?.tipo === 'lista' && md[3].itens[0]![0]!.texto === 'numerado' && md.length === 4);
  checar('markdown dinheiro do moeda()', markdownLeve(`total ${moeda(1234.5)}`)[0]?.tipo === 'paragrafo' && (markdownLeve(`total ${moeda(1234.5)}`)[0] as { partes: { dinheiro?: boolean }[] }).partes.some((p) => p.dinheiro));
  checar('markdown vazio', markdownLeve('').length === 0 && markdownLeve('\n\n').length === 0);

  const nd1 = lerNdjson(linhaNdjson({ t: 'Olá' }) + linhaNdjson({ fim: true }) + '{"t":"me');
  checar('ndjson linhas completas e resto', nd1.eventos.length === 2 && nd1.eventos[0]!.t === 'Olá' && nd1.eventos[1]!.fim === true && nd1.resto === '{"t":"me');
  const nd2 = lerNdjson(nd1.resto + 'io"}\n\nlixo\n[1]\n');
  checar('ndjson linha partida, lixo e não-objeto ignorados', nd2.eventos.length === 1 && nd2.eventos[0]!.t === 'meio' && nd2.resto === '');

  const s1 = lerLinhaSse('data: {"choices":[{"delta":{"content":"oi"}}]}');
  checar('sse pedaço de texto', s1?.texto === 'oi' && s1.uso === null && !s1.fim && s1.erro === null);
  const s2 = lerLinhaSse('data: {"choices":[{"delta":{"content":""}}],"usage":{"prompt_tokens":10,"completion_tokens":20,"cost":0.0012}}');
  checar('sse pedaço com uso', s2?.texto === '' && s2.uso?.tokensIn === 10 && s2.uso.tokensOut === 20 && s2.uso.custoUsd === 0.0012);
  checar('sse uso sem custo', lerLinhaSse('data: {"usage":{"prompt_tokens":1}}')?.uso?.custoUsd === null);
  checar('sse [DONE]', lerLinhaSse('data: [DONE]')?.fim === true);
  checar('sse comentário, vazio e JSON quebrado', lerLinhaSse(': OPENROUTER PROCESSING') === null && lerLinhaSse('') === null && lerLinhaSse('data: {quebrado') === null);
  checar('sse erro no meio', lerLinhaSse('data: {"error":{"message":"caiu"}}')?.erro === 'caiu');

  checar('lerTexto com limite', lerTexto({ texto: ' a ' }, 10) === 'a' && lerTexto({ texto: 'x'.repeat(50) }, 10)!.length === 10 && lerTexto({ texto: 1 }, 10) === null && lerResumo({ texto: 'a'.repeat(700) })!.length === 600);

  // ---- diagnóstico: dados e pedido ----------------------------------------
  const ctxG = contexto(null);
  // sem isto os testes de "não vaza" passariam por vacuidade se a fixture perdesse os cartões
  checar('fixture tem os cartões 1111 e 2222', ['1111', '2222'].every((s) => JSON.stringify(contexto(null)).includes(s)));
  const dG =dadosDiagnostico(ctxG, false, null);
  checar('diagnóstico dados trazem recorte, totais e categorias', dG.startsWith(`Recorte analisado: fatura de ${rotuloMes('2026-06')}`) && dG.includes('Total por mês de fatura: ') && dG.includes(`Categorias em ${rotuloMes('2026-06')}`) && dG.includes('Maiores lançamentos do mês: '));
  checar('diagnóstico sem renda diz "não informada"', dG.includes('Renda mensal informada: não informada') && !dG.includes('Teto saudável'));
  checar('diagnóstico não vaza cartão nem id', ['1111', '2222', '••', 'a-2026', 'b-2026'].every((s) => !dG.includes(s)));
  checar('diagnóstico avisa filtro de cartão', dadosDiagnostico(ctxG, true, null).includes('(o painel está filtrado nesses cartões)') && !dG.includes('filtrado'));
  checar('diagnóstico com plano em vigor', dadosDiagnostico(ctxG, false, { meses: [{ mes: '2026-07', alvo: 1000, poupanca: 0, disp: 0 }], cats: [{ cat: 'Mercado & Padaria', atual: 900, acao: '', alvos: [800, 700, 600] }] }).includes(`Plano de 3 meses em vigor: ${rotuloMes('2026-07')} variável até ${moeda(1000)} · metas por categoria: Mercado & Padaria ${moeda(800)}`));
  checar('diagnóstico com renda traz teto', dadosDiagnostico({ ...ctxG, renda: 20000 }, false, null).includes('Teto saudável do cartão (renda '));
  checar('diagnóstico é determinístico', dadosDiagnostico(contexto(null), false, null) === dG);
  const ctxGD = contexto(null);
  ctxGD.faturas.find((f) => f.mesRef === '2026-06')!.lancamentos.push({ desc: 'PIX ENVIADO 123.456.789-00 FULANO', apelido: null, val: 99999, cat: 'Outros', parc: null, tipo: 'compra' });
  const dGD = dadosDiagnostico(ctxGD, false, null);
  checar('diagnóstico tira CPF da descrição crua', !dGD.includes('123.456.789-00') && dGD.includes(`PIX ENVIADO FULANO ${moeda(99999)}`));
  const pG = promptDiagnostico(dG);
  checar('diagnóstico pedido tem as cinco seções e os dados', ['### O diagnóstico', '### Onde está o problema', '### O que cortar primeiro', '### Cuidado com o fluxo', '### Próximos 30 dias'].every((s) => pG.includes(s)) && pG.endsWith(`DADOS:\n${dG}`) && !pG.includes('exemplo'));

  // ---- conversa -------------------------------------------------------------
  process.stdout.write('\n');

  const dC = dadosDiagnostico(contexto(null), false, null);
  const hist = (n: number) => Array.from({ length: n }, (_, i) => ({ papel: (i % 2 ? 'ia' : 'pessoa') as 'pessoa' | 'ia', texto: `fala ${i}` }));
  const mC = mensagensConversa(dC, null, hist(10), 'Onde eu mais gastei?');
  checar('conversa instrução e dados na primeira mensagem', mC[0]!.role === 'user' && mC[0]!.content.includes('até 120 palavras') && mC[0]!.content.includes(`DADOS DO RECORTE QUE A PESSOA ESTÁ VENDO:\n${dC}`) && !mC[0]!.content.includes('DIAGNÓSTICO'));
  checar('conversa resposta fixa depois da instrução', mC[1]!.role === 'assistant' && mC[1]!.content === 'Entendi os números. Pode perguntar.');
  checar('conversa histórico cortado nas 6 últimas', mC.length === 2 + 6 + 1 && mC[2]!.content === 'fala 4' && mC[7]!.content === 'fala 9');
  checar('conversa papéis alternam e pergunta por último', mC.every((m, i) => i === 0 || m.role !== mC[i - 1]!.role) && mC[mC.length - 1]!.content === 'Onde eu mais gastei?' && mC[mC.length - 1]!.role === 'user');
  const mC2 = mensagensConversa(dC, 'TEXTO DO DIAGNÓSTICO', [{ papel: 'ia', texto: 'sobra' }, ...hist(2)], 'e?');
  checar('conversa diagnóstico entra quando passado', mC2[0]!.content.endsWith('DIAGNÓSTICO QUE VOCÊ JÁ ESCREVEU SOBRE ESTE RECORTE:\nTEXTO DO DIAGNÓSTICO'));
  checar('conversa histórico não começa por fala da IA', mC2[2]!.content === 'fala 0' && mC2.every((m, i) => i === 0 || m.role !== mC2[i - 1]!.role));
  checar('conversa sem histórico', mensagensConversa(dC, null, [], 'oi').length === 3);
  checar('conversa não vaza cartão', mC.every((m) => ['1111', '2222', '••'].every((s) => !m.content.includes(s))));

  // ---- pessoa física nos prompts agregados (6.0, C1) -----------------------
  process.stdout.write('\n');

  // Pix para a mesma pessoa três meses seguidos, com o apelido no lançamento e
  // aprendido: vira fixa, entra nos maiores e no plano. Nada do nome pode sair.
  const ctxPF = (() => {
    const c = contexto(null, faturasDeTeste(), { renda: 20000, metaPoupanca: 20, foraCartao: 0 });
    c.apelidos = { ...c.apelidos, 'PIX TRANSF MARIA SILVA': 'Maria' };
    for (const f of c.faturas.filter((x) => x.banco === 'Itaú' && x.mesRef >= '2026-04')) {
      f.lancamentos.push(
        { desc: 'PIX TRANSF MARIA SILVA', apelido: f.mesRef === '2026-05' ? 'Maria' : null, val: 900, cat: 'Serviços & Profissional', parc: null, tipo: 'compra', privado: true },
        { desc: 'PADARIA PAO QUENTE', apelido: null, val: 850, cat: 'Mercado & Padaria', parc: null, tipo: 'compra' },
      );
    }
    return c;
  })();
  const semMaria = (s: string) => !s.includes('MARIA') && !s.includes('Maria');
  const mascarado = contextoParaIA(ctxPF);
  checar('contextoParaIA troca descrição e apelido do privado', semMaria(JSON.stringify(mascarado)) && mascarado.faturas.some((f) => f.lancamentos.some((l) => l.privado && l.desc === rotuloDaPessoa(0) && l.apelido === rotuloDaPessoa(0) && l.val === 900 && l.cat === 'Serviços & Profissional')));
  checar('contextoParaIA não mexe no contexto da tela', JSON.stringify(ctxPF).includes('PIX TRANSF MARIA SILVA') && ctxPF.apelidos['PIX TRANSF MARIA SILVA'] === 'Maria');
  checar('contextoParaIA sem privado devolve o mesmo contexto', contextoParaIA(ctxG) === ctxG);
  const pPF = promptResumo(ctxPF, dadosResumo(ctxPF));
  checar('resumo não leva o nome do Pix para pessoa física', semMaria(pPF) && pPF.includes(`${rotuloDaPessoa(0)} ${moeda(900)}`));
  checar('resumo mantém o nome do que não é privado', pPF.includes(`PADARIA PAO QUENTE ${moeda(850)}`));
  const dPF = dadosDiagnostico(ctxPF, false, null);
  checar('diagnóstico não leva o nome do Pix para pessoa física', semMaria(dPF) && dPF.includes(`${rotuloDaPessoa(0)} ${moeda(900)}`));
  checar('diagnóstico mantém o nome do que não é privado', dPF.includes('PADARIA PAO QUENTE'));
  checar('conversa não leva o nome do Pix para pessoa física', mensagensConversa(dPF, null, [], 'quem é a maior?').every((m) => semMaria(m.content)));
  // a fixa existe no contexto da tela com o nome: sem a máscara, o plano o levaria
  checar('fixa do Pix aparece com o nome na tela', recorrentesFixas(ctxPF).some((r) => r.desc === 'Maria' || r.desc.includes('MARIA')));
  const mtPF = metasDoPlano(ctxPF, PREFS_PADRAO)!;
  const plPF = promptPlano(mtPF, PREFS_PADRAO, ctxPF);
  checar('plano não leva o nome do Pix para pessoa física nas fixas', semMaria(plPF) && plPF.includes(`${normDesc(rotuloDaPessoa(0))}:`));

  // ---- uma letra por pessoa (6.0, I3) ---------------------------------------
  checar('rótulo da pessoa: letras, sem dígito', [0, 1, 25, 26, 27, 701, 702].map(rotuloDaPessoa).join('|') === 'Pix pessoa A|Pix pessoa B|Pix pessoa Z|Pix pessoa AA|Pix pessoa AB|Pix pessoa ZZ|Pix pessoa AAA');
  checar('rótulos diferentes já nas 3 palavras de normDesc', new Set(Array.from({ length: 60 }, (_, i) => normDesc(rotuloDaPessoa(i)))).size === 60);
  // duas pessoas todo mês (fixas) e uma de uma vez só: com um texto único para
  // todas, as duas fixas viravam uma e a IA via outra composição que a da tela
  const ctxPessoas = (() => {
    const c = contexto(null, faturasDeTeste(), { renda: 20000, metaPoupanca: 20, foraCartao: 0 });
    for (const f of c.faturas.filter((x) => x.banco === 'Itaú' && x.mesRef >= '2026-04')) {
      f.lancamentos.push(
        { desc: 'PIX TRANSF MARIA SILVA', apelido: null, val: 900, cat: 'Serviços & Profissional', parc: null, tipo: 'compra', privado: true },
        { desc: 'TED FULANO DE TAL', apelido: null, val: 700, cat: 'Casa & Contas', parc: null, tipo: 'compra', privado: true },
      );
      if (f.mesRef === '2026-05') f.lancamentos.push({ desc: 'PIX BELTRANO SOUZA', apelido: null, val: 500, cat: 'Outros', parc: null, tipo: 'compra', privado: true });
    }
    return c;
  })();
  const mascPessoas = contextoParaIA(ctxPessoas);
  const fixasTela = recorrentesFixas(ctxPessoas);
  const fixasIA = recorrentesFixas(mascPessoas);
  const pessoasNasFixas = fixasIA.filter((r) => r.desc.startsWith(PESSOA_FISICA_PARA_IA));
  checar('duas pessoas mensais são duas fixas no mascarado, a avulsa nenhuma', pessoasNasFixas.length === 2 && new Set(pessoasNasFixas.map((r) => r.desc)).size === 2 && pessoasNasFixas.every((r) => r.medio === 900 || r.medio === 700));
  checar('fixas do mascarado batem com as da tela', fixasIA.length === fixasTela.length && JSON.stringify(fixasIA.map((r) => [r.medio, r.meses, r.cat])) === JSON.stringify(fixasTela.map((r) => [r.medio, r.meses, r.cat])));
  checar('composição do mascarado bate com a da tela', ['2026-04', '2026-05', '2026-06', null].every((m) => JSON.stringify(composicaoMes(mascPessoas, m)) === JSON.stringify(composicaoMes(ctxPessoas, m))));
  checar('mascarado sem nome de ninguém', !/MARIA|FULANO|BELTRANO/i.test(JSON.stringify(mascPessoas)));
  checar('mesma tela, mesmo prompt (hash do cache estável)', promptResumo(ctxPessoas, dadosResumo(ctxPessoas)) === promptResumo(ctxPessoas, dadosResumo(ctxPessoas)) && JSON.stringify(contextoParaIA(ctxPessoas)) === JSON.stringify(mascPessoas));
  const pPessoas = promptResumo(ctxPessoas, dadosResumo(ctxPessoas));
  checar('resumo: maiores lançamentos com a letra da pessoa no contexto', !/MARIA|FULANO|BELTRANO/i.test(pPessoas) && mascPessoas.faturas.some((f) => f.lancamentos.some((l) => l.val === 900 && pPessoas.includes(`${l.desc} ${moeda(900)}`))));

  checar('pergunta aparada', validarPergunta('  oi  ') === 'oi' && validarPergunta('a'.repeat(LIMITE_PERGUNTA)) !== null);
  checar('pergunta inválida', [undefined, null, 5, '', '   ', 'a'.repeat(LIMITE_PERGUNTA + 1)].every((v) => validarPergunta(v) === null));
  checar('sugestões do legado', SUGESTOES.length === 5 && SUGESTOES[0] === 'Onde eu mais gastei?');

  const fg = (papel: 'pessoa' | 'ia', h: string): FalaGuardada => ({ papel, texto: 'x', dadosHash: h });
  checar('divisória sem falas ou todas iguais', divisoriaEm([], 'h') === null && divisoriaEm([fg('pessoa', 'h'), fg('ia', 'h')], 'h') === null);
  checar('divisória depois da última resposta antiga', divisoriaEm([fg('pessoa', 'a'), fg('ia', 'a'), fg('pessoa', 'h'), fg('ia', 'h')], 'h') === 2);
  checar('divisória no fim quando a última é antiga', divisoriaEm([fg('pessoa', 'a'), fg('ia', 'a')], 'h') === 2);
  checar('divisória ignora a pessoa', divisoriaEm([fg('pessoa', 'a'), fg('ia', 'h')], 'h') === null);

  const bytesC = new TextEncoder().encode(linhaNdjson({ t: 'pão' }) + linhaNdjson({ fim: true }));
  const meioC = bytesC.indexOf(0xc3) + 1; // parte o "ã" entre dois pedaços
  const corpoC = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytesC.slice(0, meioC));
      c.enqueue(bytesC.slice(meioC));
      c.close();
    },
  });
  const evC: EventoLido[] = [];
  await consumirNdjson(corpoC, (e) => evC.push(e));
  checar('consumirNdjson junta pedaços e caractere partido', evC.length === 2 && evC[0]!.t === 'pão' && evC[1]!.fim === true);

  // ---- estados das telas ----------------------------------------------------
  process.stdout.write('\n');

  checar('falha de rede offline', mensagemDeFalha({ status: 500, online: false }).tipo === 'rede');
  checar('falha de sessão', mensagemDeFalha({ status: 401 }).tipo === 'sessao' && mensagemDeFalha({ status: 401 }).texto.includes('sessão'));
  checar('falha de uso traz o detalhe', mensagemDeFalha({ status: 400, detalhe: 'Escreva uma pergunta' }).texto === 'Escreva uma pergunta' && mensagemDeFalha({ status: 404, detalhe: 'x' }).tipo === 'uso');
  checar('falha 400 sem detalhe é do servidor', mensagemDeFalha({ status: 400 }).tipo === 'servidor' && mensagemDeFalha({ status: 400, detalhe: '  ' }).tipo === 'servidor');
  checar('falha 500 é do servidor', mensagemDeFalha({ status: 500, detalhe: 'stack' }).tipo === 'servidor' && !mensagemDeFalha({ status: 500, detalhe: 'stack' }).texto.includes('stack'));
  checar('falha 429 traz o detalhe', mensagemDeFalha({ status: 429, detalhe: 'tente de novo em 3 minutos' }).tipo === 'uso');
  checar('falha 501/502 de ErroDeUso trazem o detalhe', mensagemDeFalha({ status: 501, detalhe: 'Configure a chave' }).texto === 'Configure a chave' && mensagemDeFalha({ status: 502, detalhe: 'A IA não respondeu direito' }).tipo === 'uso' && mensagemDeFalha({ status: 503 }).tipo === 'servidor');
  checar('falha detalhe cortado', mensagemDeFalha({ status: 400, detalhe: 'a'.repeat(300) }).texto.length === 200);
  checar('textoDoErro: FalhaHttp', textoDoErro(new FalhaHttp(401, null)).tipo === 'sessao' && textoDoErro(new FalhaHttp(400, 'Valor inválido')).texto === 'Valor inválido');
  checar('textoDoErro: FalhaHttp offline é rede', textoDoErro(new FalhaHttp(401, null), false).tipo === 'rede');
  checar('textoDoErro: FalhaRede é rede', textoDoErro(new FalhaRede(new TypeError('Failed to fetch'))).tipo === 'rede');
  checar('textoDoErro: ErroLocal mostra a mensagem', textoDoErro(new ErroLocal('Não achei texto nenhum neste PDF.')).texto === 'Não achei texto nenhum neste PDF.' && textoDoErro(new ErroLocal('x')).tipo === 'uso');
  checar('textoDoErro: bug não vira rede nem aparece cru', textoDoErro(new TypeError("Cannot read properties of undefined (reading 'x')")).tipo === 'servidor' && textoDoErro(new SyntaxError('Unexpected token <')).tipo === 'servidor' && textoDoErro(new Error('x')).tipo === 'servidor' && textoDoErro('?').tipo === 'servidor');
  checar('textoDoErro: offline não explica bug', textoDoErro(new Error('x'), false).tipo === 'servidor' && textoDoErro(new TypeError('x'), false).tipo === 'servidor');
  checar('aviso de trechos ignorados', avisoIgnorados(0) === null && avisoIgnorados(1) === '1 trecho não pôde ser lido e ficou de fora.' && avisoIgnorados(3) === '3 trechos não puderam ser lidos e ficaram de fora.');

  checar('vazio só mês', fraseDoVazio({ mes: '2026-07', nomesCartoes: [] }) === `Nada em ${rotuloMes('2026-07')}`);
  checar('vazio mês e cartões', fraseDoVazio({ mes: '2026-07', nomesCartoes: ['Itaú'] }) === `Nada em ${rotuloMes('2026-07')} no cartão Itaú` && fraseDoVazio({ mes: '2026-07', nomesCartoes: ['Itaú', 'Nubank'] }).endsWith('nos cartões Itaú e Nubank') && fraseDoVazio({ mes: '2026-07', nomesCartoes: ['Itaú', 'Nubank', 'Inter'] }).endsWith('nos cartões Itaú, Nubank e Inter') && fraseDoVazio({ mes: '2026-07', nomesCartoes: ['a', 'b', 'c', 'd'] }).endsWith('em 4 cartões'));
  checar('vazio sem mês', fraseDoVazio({ mes: null, nomesCartoes: ['Itaú'] }) === 'Nada no cartão Itaú' && fraseDoVazio({ mes: null, nomesCartoes: [] }) === 'Nada por aqui');

  const fV = { mes: '2026-05', cartoes: ['11111111-1111-4111-8111-111111111111'], obra: true };
  const qTodos = queryDoVazio(fV, 'todos-cartoes');
  const qRecente = queryDoVazio(fV, 'mes-recente');
  checar('vazio query tira cartões', lerFiltro(new URLSearchParams(qTodos)).cartoes.length === 0 && lerFiltro(new URLSearchParams(qTodos)).mes === '2026-05' && lerFiltro(new URLSearchParams(qTodos)).obra);
  checar('vazio query volta ao mês recente', lerFiltro(new URLSearchParams(qRecente)).mes === null && lerFiltro(new URLSearchParams(qRecente)).cartoes.length === 1);
  checar('vazio query nunca vazia', queryDoVazio({ mes: null, cartoes: ['11111111-1111-4111-8111-111111111111'], obra: false }, 'todos-cartoes') === 'mes=' && lerFiltro(new URLSearchParams('mes=')).mes === null);
  checar('vazio links', linksDoVazio(fV, '/x').length === 2 && linksDoVazio(fV, '/x')[0]!.href.startsWith('/x?') && linksDoVazio({ mes: 'TODOS', cartoes: [], obra: false }, '/x').length === 0 && linksDoVazio({ mes: null, cartoes: [], obra: false }, '/x').length === 0);
  checar('vazio sem "mais recente" quando o mês já é o mais recente', linksDoVazio(fV, '/x', '2026-05').length === 1 && linksDoVazio(fV, '/x', '2026-05')[0]!.rotulo === 'Ver todos os cartões' && linksDoVazio(fV, '/x', '2026-09').length === 2);
  checar('vazio sem "mais recente" quando o mês da tela não é o fixado', linksDoVazio(fV, '/x', '2026-09', null).length === 1 && linksDoVazio(fV, '/x', '2026-09', '2026-03').length === 1 && linksDoVazio(fV, '/x', '2026-09', '2026-05').length === 2);
  checar('vazio nomes dos cartões na ordem do filtro', nomesDosCartoes(['b', 'zz', 'a'], [{ id: 'a', nome: 'Itaú' }, { id: 'b', nome: 'Nubank' }]).join() === 'Nubank,Itaú');

  // ---- pluggy: conexão ------------------------------------------------------
  process.stdout.write('\n');

  checar('nome de banco normalizado', normalizarNomeBanco('Banco Itaú S.A.') === 'itau' && normalizarNomeBanco('  NUBANK ') === 'nubank' && normalizarNomeBanco('Banco do Brasil') === 'do brasil');
  const instEx = [
    { id: 1, nome: 'Nubank', pluggyConnectorId: null },
    { id: 2, nome: 'Itaú', pluggyConnectorId: 201 },
  ];
  checar('instituição pelo connector id', JSON.stringify(escolherInstituicao(instEx, { id: 201, name: 'Itaú Unibanco' })) === JSON.stringify({ usar: 2 }));
  checar('instituição pelo nome normalizado', JSON.stringify(escolherInstituicao(instEx, { id: 212, name: 'NUBANK' })) === JSON.stringify({ usar: 1 }));
  const novaInst = escolherInstituicao(instEx, { id: 0, name: 'Pluggy Bank', primaryColor: 'ef294b', imageUrl: 'https://cdn.pluggy.ai/x.svg' });
  checar('instituição nova com slug do conector', 'criar' in novaInst && novaInst.criar.slug === 'pluggy-0' && novaInst.criar.nome === 'Pluggy Bank' && novaInst.criar.cor === '#ef294b' && novaInst.criar.logoUrl === 'https://cdn.pluggy.ai/x.svg' && novaInst.criar.pluggyConnectorId === 0);

  checar('janela inicial de 3 meses', JSON.stringify(janelaInicial(new Date('2026-10-05T15:00:00Z'))) === JSON.stringify({ de: '2026-08-01', ate: '2026-10-05' }));
  checar('janela inicial na virada do ano', janelaInicial(new Date('2026-01-10T15:00:00Z')).de === '2025-11-01');
  checar('janela inicial no fuso de São Paulo', janelaInicial(new Date('2026-11-01T02:00:00Z')).ate === '2026-10-31' && janelaInicial(new Date('2026-11-01T02:00:00Z')).de === '2026-08-01');

  const pCat = promptCategorizar([{ data: '2026-09-01', valor: 42.5, desc: 'ifood' }, { data: '2026-09-02', valor: 300, desc: 'leroy merlin' }]);
  checar('pedido de categorias', NOMES.every((n) => pCat.includes(n)) && pCat.includes('"i":0') === false && pCat.includes('{"i": 0') === false && pCat.includes('0 | 2026-09-01 | 42,50 | ifood') && pCat.includes('"categorias"') && pCat.includes('Construção / Obras'));
  checar('pedido de categorias só com índice', !pCat.includes('"id"'));
  const lidas = lerCategorias({ categorias: [{ i: 0, categoria: 'Restaurantes & Delivery', nome: '  Agena Pastel ' }, { i: 1, categoria: 'Inventada', nome: 'x'.repeat(60) }, { i: 5, categoria: 'Outros', nome: 'Fora' }] }, 3);
  checar('leitura das categorias e nomes', JSON.stringify(lidas) === JSON.stringify([{ categoria: 'Restaurantes & Delivery', nome: 'Agena Pastel' }, { categoria: null, nome: 'x'.repeat(40) }, { categoria: null, nome: null }]));
  checar('leitura de nome inválido', JSON.stringify(lerCategorias({ categorias: [{ i: 0, categoria: 'Outros', nome: '' }, { i: 1, categoria: 'Outros', nome: 5 }, { i: 2, categoria: 'Outros', nome: 'linha\nquebrada' }] }, 3).map((c) => c.nome)) === JSON.stringify([null, null, null]));
  checar('leitura das categorias inválida', JSON.stringify(lerCategorias(null, 2)) === JSON.stringify([{ categoria: null, nome: null }, { categoria: null, nome: null }]) && JSON.stringify(lerCategorias({ categorias: 'x' }, 1)) === JSON.stringify([{ categoria: null, nome: null }]));
  checar('pedido de categorias pede o nome', pCat.includes('"nome"') && pCat.includes('sem cidade'));

  const rIt = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 200, corpo: { id: 'item-9', status: 'UPDATED', clientUserId: 'user-1', connector: { id: 0, name: 'Pluggy Bank' } } }]);
  const it = await criarClientePluggy({ ...cred, fetch: rIt.f, esperar }).item('item-9');
  checar('pluggy busca o item', it?.clientUserId === 'user-1' && rIt.chamadas[1]!.url.endsWith('/items/item-9') && rIt.chamadas[1]!.chave === 'k1');
  const rIt2 = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 404 }]);
  checar('pluggy item inexistente vira null', (await criarClientePluggy({ ...cred, fetch: rIt2.f, esperar }).item('nada')) === null);

  // ---- pluggy: conexões -----------------------------------------------------
  process.stdout.write('\n');

  const agoraE = new Date('2026-10-05T15:00:00Z');
  const base = { banco: 'Itaú', status: 'ativa' as const, saude: 'ONLINE', consentExpiraEm: null, ultimoSyncEm: new Date('2026-10-05T13:00:00Z'), agora: agoraE };
  checar('estado ativa com há quanto', JSON.stringify(estadoDaConexao(base)) === JSON.stringify({ chave: 'ativa', texto: 'Atualizado há 2 horas', acao: 'atualizar' }));
  checar('estado instável vence erro de login e o resto, menos o consentimento', estadoDaConexao({ ...base, status: 'erro_login', saude: 'UNSTABLE' }).chave === 'instavel' && estadoDaConexao({ ...base, saude: 'OFFLINE' }).texto === 'O Itaú está instável agora — é deles, não seu.' && estadoDaConexao({ ...base, saude: 'OFFLINE' }).acao === null);
  checar('estado consentimento vencido', estadoDaConexao({ ...base, status: 'consentimento_expirado' }).acao === 'renovar' && estadoDaConexao({ ...base, consentExpiraEm: new Date('2026-10-01T00:00:00Z') }).chave === 'consentimento');
  checar('estado erro de login', JSON.stringify(estadoDaConexao({ ...base, status: 'erro_login' })) === JSON.stringify({ chave: 'erro_login', texto: 'O banco pediu sua senha de novo.', acao: 'reconectar' }));
  checar('estado atualizando e erro', estadoDaConexao({ ...base, status: 'atualizando' }).acao === null && estadoDaConexao({ ...base, status: 'erro' }).acao === 'atualizar' && estadoDaConexao({ ...base, status: 'erro' }).texto === 'A última atualização falhou.');
  checar('estado sem sync', estadoDaConexao({ ...base, ultimoSyncEm: null }).texto === 'Ainda sem lançamentos');
  checar('há quanto', haQuanto(new Date('2026-10-05T14:59:40Z'), agoraE) === 'agora há pouco' && haQuanto(new Date('2026-10-05T14:59:00Z'), agoraE) === 'há 1 minuto' && haQuanto(new Date('2026-10-05T14:30:00Z'), agoraE) === 'há 30 minutos' && haQuanto(new Date('2026-10-05T14:00:00Z'), agoraE) === 'há 1 hora' && haQuanto(new Date('2026-10-03T15:00:00Z'), agoraE) === 'há 2 dias');

  checar('janela do atualizar', JSON.stringify(janelaAtualizar(new Date('2026-10-05T12:00:00Z'), agoraE)) === JSON.stringify({ de: '2026-09-01', ate: '2026-10-05' }) && janelaAtualizar(new Date('2026-01-03T12:00:00Z'), agoraE).de === '2025-12-01' && JSON.stringify(janelaAtualizar(null, agoraE)) === JSON.stringify(janelaInicial(agoraE)));

  checar('órfãs: só as sem conta, nunca a atual nem as desconectadas', JSON.stringify(conexoesOrfas(
    [{ id: 'a', status: 'ativa' }, { id: 'b', status: 'ativa' }, { id: 'c', status: 'desconectada' }, { id: 'd', status: 'erro' }],
    ['b'],
    'a',
  )) === JSON.stringify(['d']));

  // ---- sync automático (5.0) -------------------------------------------------
  process.stdout.write('\n');

  checar('segredo igual confere', segredoConfere('s3gr3do-longo', 's3gr3do-longo'));
  checar('segredo diferente não confere', !segredoConfere('s3gr3do-longx', 's3gr3do-longo'));
  checar('segredo esperado vazio nunca confere', !segredoConfere('', '') && !segredoConfere('qualquer', '') && !segredoConfere('qualquer', undefined));
  checar('segredo de tamanho diferente não confere', !segredoConfere('curto', 's3gr3do-longo') && !segredoConfere(null, 's3gr3do-longo'));

  const erroDrizzle = new Error('Failed query: update "connection" set ...\nparams: 1234-5678,Itaú');
  checar('resumo do erro: nome e primeira linha, sem os parâmetros', resumoDoErro(erroDrizzle) === 'Error: Failed query: update "connection" set ...' && resumoDoErro(new TypeError('x'.repeat(300))).length === 'TypeError: '.length + 200 && resumoDoErro('texto solto') === 'erro desconhecido');

  const agoraS = new Date('2026-10-07T09:00:00Z');
  checar('precisa sincronizar: nunca sincronizou', precisaSincronizar(null, agoraS));
  checar('precisa sincronizar: 11 h atrás não', !precisaSincronizar(new Date('2026-10-06T22:00:00Z'), agoraS));
  checar('precisa sincronizar: 13 h atrás sim', precisaSincronizar(new Date('2026-10-06T20:00:00Z'), agoraS));

  const ITEM = '5f1c6a2e-9b3d-4c7a-8e21-0d4f6b9a1c3e';
  const ev = (event: string, extra: Record<string, unknown> = {}) => lerEventoPluggy({ event, eventId: 'ev-1', itemId: ITEM, ...extra });
  checar('evento de lançamento sincroniza', JSON.stringify(ev('transactions/created', { accountId: 'acc-1' })) === JSON.stringify({ eventId: 'ev-1', acao: 'sincronizar', itemId: ITEM }) && ev('transactions/updated').acao === 'sincronizar' && ev('item/updated').acao === 'sincronizar');
  checar('evento com eventId longo demais é ignorado', ev('item/updated', { eventId: 'e'.repeat(129) }).acao === 'ignorar' && ev('item/updated', { eventId: 'e'.repeat(128) }).acao === 'sincronizar');
  checar('evento com eventId que não é texto é ignorado', ev('item/updated', { eventId: 42 }).acao === 'ignorar' && ev('item/updated', { eventId: ['ev'] }).acao === 'ignorar');
  checar('evento com itemId fora do formato é ignorado', ev('item/updated', { itemId: 'item-1' }).acao === 'ignorar' && ev('item/error', { itemId: `${ITEM}x` }).acao === 'ignorar' && ev('item/updated', { itemId: 7 }).acao === 'ignorar');
  checar('evento ignorado não devolve o que veio fora do limite', ev('item/updated', { eventId: 'e'.repeat(500) }).eventId === null && ev('item/updated', { itemId: 'nao-uuid' }).itemId === null);
  checar('evento de item grava estado', ['item/error', 'item/waiting_user_input', 'item/waiting_user_action', 'item/login_succeeded'].every((e) => ev(e).acao === 'estado'));
  checar('evento ignorado', ['transactions/deleted', 'item/created', 'item/deleted', 'connector/status_updated', 'outro/qualquer'].every((e) => ev(e).acao === 'ignorar'));
  checar('evento sem eventId é ignorado', lerEventoPluggy({ event: 'item/updated', itemId: ITEM }).acao === 'ignorar');
  checar('evento sem itemId é ignorado', lerEventoPluggy({ event: 'item/updated', eventId: 'ev-2' }).acao === 'ignorar' && lerEventoPluggy({ event: 'item/error', eventId: 'ev-3', itemId: '' }).acao === 'ignorar');
  checar('evento que não é objeto é ignorado', lerEventoPluggy(null).acao === 'ignorar' && lerEventoPluggy('x').acao === 'ignorar' && lerEventoPluggy({ event: 5, eventId: 'ev', itemId: 'i' }).acao === 'ignorar');

  const agoraC = new Date('2026-10-07T15:00:00Z'); // meio-dia em São Paulo
  const baseC = { ...base, agora: agoraC, ultimoSyncEm: new Date('2026-10-07T13:00:00Z') };
  checar('consentimento vence em 10 dias', JSON.stringify(estadoDaConexao({ ...baseC, consentExpiraEm: new Date('2026-10-17T15:00:00Z') })) === JSON.stringify({ chave: 'consentimento_perto', texto: 'A autorização vence em 10 dias.', acao: 'renovar' }));
  checar('consentimento vence amanhã', estadoDaConexao({ ...baseC, consentExpiraEm: new Date('2026-10-08T15:00:00Z') }).texto === 'A autorização vence amanhã.');
  checar('consentimento vence hoje', estadoDaConexao({ ...baseC, consentExpiraEm: new Date('2026-10-07T20:00:00Z') }).texto === 'A autorização vence hoje.' && estadoDaConexao({ ...baseC, consentExpiraEm: new Date('2026-10-07T20:00:00Z') }).chave === 'consentimento_perto');
  checar('consentimento a 20 dias fica ativa', estadoDaConexao({ ...baseC, consentExpiraEm: new Date('2026-10-27T15:00:00Z') }).chave === 'ativa');
  checar('consentimento vencido continua consentimento', estadoDaConexao({ ...baseC, consentExpiraEm: new Date('2026-10-07T14:00:00Z') }).chave === 'consentimento');

  const con = (banco: string, extra: Partial<{ status: 'ativa' | 'erro_login' | 'erro' | 'atualizando' | 'consentimento_expirado'; saudeConector: string | null; consentExpiraEm: Date | null }> = {}) => ({
    banco, status: 'ativa' as const, saudeConector: 'ONLINE', consentExpiraEm: null, ultimoSyncEm: baseC.ultimoSyncEm, ...extra,
  });
  checar('aviso: nenhuma precisa', avisoDasConexoes([con('Itaú'), con('Nubank', { status: 'erro' }), con('C6', { status: 'atualizando' })], agoraC) === null);
  checar('aviso: a primeira que precisa', JSON.stringify(avisoDasConexoes([con('Itaú'), con('Nubank', { status: 'erro_login' }), con('C6', { status: 'consentimento_expirado' })], agoraC)) === JSON.stringify({ texto: 'Nubank: O banco pediu sua senha de novo.', href: '/conexoes' }));
  checar('aviso: consentimento perto gera', avisoDasConexoes([con('Itaú', { consentExpiraEm: new Date('2026-10-08T15:00:00Z') })], agoraC)?.texto === 'Itaú: A autorização vence amanhã.');
  checar('aviso: instável não gera', avisoDasConexoes([con('Itaú', { status: 'erro_login', saudeConector: 'UNSTABLE' })], agoraC) === null);
  checar('consentimento vencido vem antes de instável', estadoDaConexao({ ...baseC, saude: 'UNSTABLE', status: 'consentimento_expirado' }).chave === 'consentimento' && estadoDaConexao({ ...baseC, saude: 'OFFLINE', consentExpiraEm: new Date('2026-10-07T14:00:00Z') }).chave === 'consentimento');
  checar('consentimento perto vem antes de instável', estadoDaConexao({ ...baseC, saude: 'UNSTABLE', consentExpiraEm: new Date('2026-10-08T15:00:00Z') }).chave === 'consentimento_perto');
  checar('erro de login sem instabilidade vem antes de consentimento perto', estadoDaConexao({ ...baseC, status: 'erro_login', consentExpiraEm: new Date('2026-10-08T15:00:00Z') }).chave === 'erro_login');
  checar('aviso: consentimento perto com banco instável gera', avisoDasConexoes([con('Itaú', { saudeConector: 'UNSTABLE', consentExpiraEm: new Date('2026-10-08T15:00:00Z') })], agoraC)?.texto === 'Itaú: A autorização vence amanhã.');

  const segredoEnv = segredoOpcional('CRON_SECRET');
  checar('segredo opcional: ausente ou vazio é não configurado', segredoEnv.safeParse(undefined).success && segredoEnv.safeParse(undefined).data === undefined && segredoEnv.safeParse('').success && segredoEnv.safeParse('').data === undefined);
  checar('segredo opcional: 1 a 31 caracteres derruba', !segredoEnv.safeParse('a').success && !segredoEnv.safeParse('x'.repeat(31)).success && segredoEnv.safeParse('x'.repeat(31)).error?.issues[0]?.message === 'CRON_SECRET precisa de 32+ caracteres');
  checar('segredo opcional: 32+ passa inteiro', segredoEnv.safeParse('x'.repeat(32)).data === 'x'.repeat(32) && segredoEnv.safeParse('f'.repeat(64)).success);

  const rAt = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 200, corpo: { id: 'item-9', status: 'UPDATING' } }]);
  const itAt = await criarClientePluggy({ ...cred, fetch: rAt.f, esperar }).atualizarItem('item-9');
  checar('pluggy atualizar item', itAt.status === 'UPDATING' && rAt.chamadas[1]!.metodo === 'PATCH' && rAt.chamadas[1]!.url.endsWith('/items/item-9'));
  const rAp = roteiro([{ status: 200, corpo: { apiKey: 'k1' } }, { status: 404 }]);
  let apagou = true;
  try { await criarClientePluggy({ ...cred, fetch: rAp.f, esperar }).apagarItem('item-x'); } catch { apagou = false; }
  checar('pluggy apagar item trata 404 como feito', apagou && rAp.chamadas[1]!.metodo === 'DELETE' && rAp.chamadas[1]!.url.endsWith('/items/item-x'));

  // ---- nome exibido com nome limpo --------------------------------------------
  const ctxN = { ...contexto(null), apelidos: { [normDesc('POSTO ATIBAIAATIBAIABR')]: 'Posto do bairro' } };
  checar('apelido aprendido vence o nome limpo', nomeExibido(ctxN, { desc: 'POSTO ATIBAIAATIBAIABR', limpa: 'Posto Atibaia', apelido: null, val: 1, cat: 'Outros', parc: null, tipo: 'compra' }) === 'Posto do bairro');
  checar('nome limpo vence o original', nomeExibido(ctxN, { desc: 'SUPERMERCADO CANDIO OLNAZARE PAULISBR', limpa: 'Supermercado Candio', apelido: null, val: 1, cat: 'Outros', parc: null, tipo: 'compra' }) === 'Supermercado Candio');
  checar('sem nome limpo fica o original', nomeExibido(ctxN, { desc: 'Sunset Arena', apelido: null, val: 1, cat: 'Outros', parc: null, tipo: 'compra' }) === 'Sunset Arena');
  checar('nome como chave ignora o nome limpo', nomeExibido(ctxN, { desc: 'SUPERMERCADO CANDIO OLNAZARE PAULISBR', limpa: 'Supermercado Candio', apelido: null, val: 1, cat: 'Outros', parc: null, tipo: 'compra' }, false) === 'SUPERMERCADO CANDIO OLNAZARE PAULISBR');
  // a IA nomeou a mesma assinatura de dois jeitos em lotes diferentes: continua uma recorrência só, e fixa
  const ctxL = { ...contexto(null), faturas: ['2026-04', '2026-05', '2026-06'].map((m, i): Fatura => ({
    id: `l-${m}`, mesRef: m, banco: 'Itaú', cartao: '1111',
    lancamentos: [{ desc: 'NETFLIX.COM SAO PAULO', limpa: i === 1 ? 'Netflix.com' : 'Netflix', apelido: null, val: 55.9, cat: 'Assinaturas & Apps', parc: null, tipo: 'compra' }],
  })) };
  const recL = recorrentesFixas(ctxL).filter((r) => normDesc(r.desc).startsWith('NETFLIX'));
  checar('recorrente não se divide pelo nome limpo', recL.length === 1 && recL[0]!.meses === 3);

  // ---- pluggy: faturas --------------------------------------------------------
  process.stdout.write('\n');

  const fat = (mesRef: string, vencimento: string, fechamento: string | null) => ({ pluggyBillId: `b-${mesRef}`, mesRef, vencimento, fechamento, total: 1 });
  const faturasA = [fat('2026-09', '2026-09-02', '2026-08-26'), fat('2026-10', '2026-10-02', '2026-09-25')];
  checar('fatura aberta depois do fechamento', JSON.stringify(mesDaFaturaAberta(faturasA, '2026-09-26')) === JSON.stringify({ mesRef: '2026-11', vencimento: '2026-11-02' }));
  checar('compra antes do fechamento não é da aberta', mesDaFaturaAberta(faturasA, '2026-09-25') === null && mesDaFaturaAberta(faturasA, '2026-09-10') === null);
  checar('fatura aberta sem fechamento usa vencimento menos 7', JSON.stringify(mesDaFaturaAberta([fat('2026-10', '2026-10-10', null)], '2026-10-04')) === JSON.stringify({ mesRef: '2026-11', vencimento: '2026-11-10' }) && mesDaFaturaAberta([fat('2026-10', '2026-10-10', null)], '2026-10-03') === null);
  checar('fatura aberta na virada do ano', mesDaFaturaAberta([fat('2026-12', '2026-12-10', '2026-12-03')], '2026-12-05')?.mesRef === '2027-01');
  checar('fatura aberta sem faturas', mesDaFaturaAberta([], '2026-10-01') === null);
  checar('fatura aberta com vencimento no dia 31', mesDaFaturaAberta([fat('2026-01', '2026-01-31', '2026-01-24')], '2026-01-25')?.vencimento === '2026-02-28');
  checar('fatura aberta até um ciclo depois do corte', mesDaFaturaAberta(faturasA, '2026-10-25')?.mesRef === '2026-11' && mesDaFaturaAberta(faturasA, '2026-10-30')?.mesRef === '2026-11');
  checar('fatura aberta não passa de 35 dias depois do corte', mesDaFaturaAberta(faturasA, '2026-10-31') === null);

  const recA = (o: Partial<Recebido>): Recebido => ({
    pluggyTxnId: 'pt', data: '2026-09-28', dataLancamento: '2026-09-28', valor: 10, descOrigem: 'X', descNorm: 'X',
    tipo: 'escolha', parcela: null, billId: null, pendente: false, ...o,
  });
  const abertas = faturasAbertasDosRecebidos(faturasA, [
    recA({ data: '2026-02-15', dataLancamento: '2026-09-28', tipo: 'parcela', parcela: { n: 8, total: 10 } }),
    recA({ data: '2026-09-28', dataLancamento: '2026-09-20' }),
    recA({ billId: 'b-2026-10' }),
  ]);
  checar('fatura aberta decide pela data do lançamento, não da compra', JSON.stringify([...abertas]) === JSON.stringify([[0, { mesRef: '2026-11', vencimento: '2026-11-02' }]]));

  checar('meses das faturas sem colisão', mesesDasFaturas(faturasA).map((f) => f.mesRef).join() === '2026-09,2026-10');
  checar('duas faturas no mesmo mês', mesesDasFaturas([fat('2026-03', '2026-03-31', null), fat('2026-03', '2026-03-01', null)]).map((f) => `${f.vencimento}>${f.mesRef}`).join() === '2026-03-01>2026-03,2026-03-31>2026-04');
  checar('três faturas em cadeia', mesesDasFaturas([fat('2026-03', '2026-03-01', null), fat('2026-03', '2026-03-31', null), fat('2026-04', '2026-04-02', null)]).map((f) => f.mesRef).join() === '2026-03,2026-04,2026-05');

  // ---- duplicados e mês coberto ---------------------------------------------
  process.stdout.write('\n');

  const dup = (id: string, o: Partial<LinhaDup> = {}): LinhaDup => ({ id, accountId: 'c1', data: '2026-09-10', valor: 100, fonte: 'pdf', excluido: false, ...o });
  const susp = dup('s', { fonte: 'pluggy' });
  const outrasD = [
    dup('perto', { data: '2026-09-11' }),
    dup('limite', { data: '2026-09-13' }),
    dup('longe', { data: '2026-09-14' }),
    dup('sinal', { data: '2026-09-09', valor: -100 }),
    dup('outraConta', { accountId: 'c2' }),
    dup('pluggy', { fonte: 'pluggy' }),
    dup('excluido', { excluido: true }),
    dup('valor', { valor: 100.01 }),
    dup('ligado', { duplicadoDe: 'outro' }),
    dup('s'),
  ];
  // estorno não é oferecido como a mesma compra; PDF já ligado a outra também não
  checar('candidatos do suspeito', candidatosDoSuspeito(susp, outrasD).map((c) => c.id).join() === 'perto,limite');
  checar('candidatos do estorno são estornos', candidatosDoSuspeito(dup('se', { fonte: 'pluggy', valor: -100 }), outrasD).map((c) => c.id).join() === 'sinal');

  checar('decisão mesmo', JSON.stringify(validarDecisao({ decisao: 'mesmo', candidatoId: '11111111-1111-4111-8111-111111111111' })) === JSON.stringify({ ok: true, decisao: { decisao: 'mesmo', candidatoId: '11111111-1111-4111-8111-111111111111' } }));
  checar('decisão diferente', JSON.stringify(validarDecisao({ decisao: 'diferente' })) === JSON.stringify({ ok: true, decisao: { decisao: 'diferente' } }));
  checar('decisão desfazer', validarDecisao({ decisao: 'desfazer', candidatoId: '11111111-1111-4111-8111-111111111111' }).ok);
  checar('decisão inválida', [null, 'x', {}, { decisao: 'talvez' }, { decisao: 'mesmo' }, { decisao: 'mesmo', candidatoId: 'abc' }, { decisao: 'desfazer', candidatoId: 5 }].every((v) => !validarDecisao(v).ok));

  checar('mês por extenso', mesPorExtenso('2026-09') === 'Setembro de 2026' && mesPorExtenso('2027-01') === 'Janeiro de 2027');

  // ---- ciclo da fatura aberta -----------------------------------------------
  process.stdout.write('\n');

  const lc = (val: number, data?: string): Lanc => ({ desc: 'x', apelido: null, val, cat: 'Outros', parc: null, tipo: 'compra', data });
  const fc = (mesRef: string, venc: string, fech: string | null, lancs: Lanc[], aberta = false, cartao = '1111'): Fatura => ({ id: `${cartao}-${mesRef}`, mesRef, banco: 'Itaú', cartao, lancamentos: lancs, vencimento: venc, fechamento: fech ?? undefined, aberta });
  checar('início do ciclo pelo fechamento', inicioDoCiclo(fc('2026-10', '2026-10-02', '2026-09-25', [])) === '2026-09-26');
  checar('início do ciclo sem fechamento', inicioDoCiclo(fc('2026-10', '2026-10-10', null, [])) === '2026-10-04');
  checar('início do ciclo sem anterior', inicioDoCiclo(undefined) === null);
  checar('até o dia', ateDia(fc('2026-11', '2026-11-02', null, [lc(10, '2026-09-27'), lc(20, '2026-10-05'), lc(5)]), '2026-09-30') === 15);

  const ago = fc('2026-09', '2026-09-02', '2026-08-26', [lc(100, '2026-08-01')]);
  const set = fc('2026-10', '2026-10-02', '2026-09-25', [lc(50, '2026-08-28'), lc(30, '2026-09-05'), lc(200, '2026-09-20')]);
  const out = fc('2026-11', '2026-11-02', null, [lc(70, '2026-09-27'), lc(40, '2026-10-05')], true);
  const ctxC: Contexto = { faturas: [ago, set, out], apelidos: {}, mesFiltro: null, nomesCartao: {}, ...CONFIG_PADRAO };
  // hoje 06/10: 10 dias desde 26/09; ciclo anterior começou 27/08 → mesmo ponto = 06/09
  const cmp = compararCiclo(ctxC, '2026-11', '2026-10-06');
  checar('ciclo: atual, mesmo ponto do anterior e dias', JSON.stringify(cmp) === JSON.stringify({ atual: 110, anterior: 80, dias: 10, cartoes: ['n1111'] }));
  checar('ciclo: mês sem fatura aberta', compararCiclo(ctxC, '2026-10', '2026-10-06') === null);
  // resto do ciclo anterior a partir do mesmo ponto = 280 − 80 = 200 → 110 + 200
  checar('projeção com um ciclo anterior', projetarFechamento(ctxC, '2026-11', '2026-10-06') === 310);
  const ctxSemAnt: Contexto = { ...ctxC, faturas: [out] };
  checar('projeção sem ciclo anterior', projetarFechamento(ctxSemAnt, '2026-11', '2026-10-06') === null && compararCiclo(ctxSemAnt, '2026-11', '2026-10-06') === null);
  // cartão 2222 com uma só fatura antes da aberta: sem o início do ciclo
  // anterior não há "mesmo ponto", então fica fora da comparação e da projeção
  const out2 = fc('2026-11', '2026-11-10', null, [lc(5, '2026-10-05')], true, '2222');
  const set2 = fc('2026-10', '2026-10-10', '2026-10-03', [lc(3, '2026-09-05'), lc(1, '2026-09-10')], false, '2222');
  const cmpUm = compararCiclo({ ...ctxC, faturas: [ago, set, out, set2, out2] }, '2026-11', '2026-10-06');
  checar('ciclo: cartão sem ciclo anterior fica de fora', JSON.stringify(cmpUm) === JSON.stringify({ atual: 110, anterior: 80, dias: 10, cartoes: ['n1111'] }));
  checar('projeção: cartão sem ciclo anterior fica de fora', projetarFechamento({ ...ctxC, faturas: [ago, set, out, set2, out2] }, '2026-11', '2026-10-06') === 310);
  // com ago2, o 2222 começa o ciclo em 04/10 (2 dias) e o anterior em 04/09 → mesmo ponto 06/09
  const ago2 = fc('2026-09', '2026-09-10', '2026-09-03', [lc(7, '2026-08-20')], false, '2222');
  const ctx2: Contexto = { ...ctxC, faturas: [ago, set, out, ago2, set2, out2] };
  const cmp2 = compararCiclo(ctx2, '2026-11', '2026-10-06');
  checar('ciclo: dois cartões com dias diferentes', JSON.stringify(cmp2) === JSON.stringify({ atual: 115, anterior: 83, dias: null, cartoes: ['n1111', 'n2222'] }));
  // 2222: resto = 4 − 3 = 1 → 5 + 1; somado ao 1111 (310)
  checar('projeção: dois cartões', projetarFechamento(ctx2, '2026-11', '2026-10-06') === 316);
  // três ciclos anteriores (o quarto, jun, fica de fora): restos 200 (set), 0 (ago), 40 (jul) → média 80
  const mai = fc('2026-06', '2026-06-02', '2026-05-26', []);
  const jun = fc('2026-07', '2026-07-02', '2026-06-26', [lc(999, '2026-06-20')]);
  const jul = fc('2026-08', '2026-08-02', '2026-07-26', [lc(20, '2026-07-01'), lc(40, '2026-07-20')]);
  const rCiclo = resumoDoPainel(ctxC, {}, false, 0, '2026-10-06');
  checar('hero com ciclo: mesmo ponto e projeção', rCiclo.mes === '2026-11' && rCiclo.hero.ciclo?.dias === 10 && rCiclo.hero.projecao === 310 && rCiclo.hero.cur === 110 && rCiclo.hero.prev === 80 && Math.abs(rCiclo.hero.delta! - 0.375) < 1e-9);
  const rSemHoje = resumoDoPainel(ctxC, {}, false, 0);
  checar('hero sem hoje fica como antes', rSemHoje.hero.ciclo === null && rSemHoje.hero.projecao === null && rSemHoje.hero.cur === 110 && rSemHoje.hero.prev === 280);
  const rFechado = resumoDoPainel({ ...ctxC, mesFiltro: '2026-10' }, {}, false, 0, '2026-10-06');
  checar('hero de mês fechado ignora o ciclo', rFechado.hero.ciclo === null && rFechado.hero.projecao === null && rFechado.hero.cur === 280 && rFechado.hero.prev === 100);
  checar('hoje em São Paulo', hojeEmSaoPaulo(new Date('2026-10-07T02:30:00Z')) === '2026-10-06' && hojeEmSaoPaulo(new Date('2026-10-07T03:30:00Z')) === '2026-10-07');
  checar('projeção com três ciclos anteriores', projetarFechamento({ ...ctxC, faturas: [mai, jun, jul, ago, set, out] }, '2026-11', '2026-10-06') === 190);
  const mfc = montarFaturas([
    linha({ data: '2026-07-03', aberta: false, fechamento: null }),
    linha({ data: '2026-07-04', aberta: true, fechamento: '2026-07-25' }),
  ]).faturas[0]!;
  checar('adaptador repassa data, aberta e fechamento', mfc.lancamentos[0]!.data === '2026-07-03' && mfc.aberta === true && mfc.fechamento === '2026-07-25');

  // cartão aberto sem ciclo anterior fica fora da comparação, mas não some do total
  // nem da projeção: 310 do 1111 + 5, o total da fatura do 2222, que ficou fora
  const rFora = resumoDoPainel({ ...ctxC, faturas: [ago, set, out, set2, out2] }, {}, false, 0, '2026-10-06');
  checar('hero: total do mês inteiro, comparação só do comparável', rFora.hero.cur === 115 && rFora.hero.prev === 80 && rFora.hero.ciclo?.atual === 110 && rFora.hero.ciclo.comparados === 1 && rFora.hero.ciclo.total === 2 && rFora.hero.projecao === 315);
  // lançamento de 20/10 já na fatura aberta: fica fora do "até hoje" e o resto médio
  // dos ciclos anteriores já cobre o que entra até o fechamento, então a projeção
  // segue 110 + 200 = 310; com `cur − atual` (135 − 110) ele contaria duas vezes → 335
  const outFuturo = { ...out, lancamentos: [...out.lancamentos, lc(25, '2026-10-20')] };
  const rFuturo = resumoDoPainel({ ...ctxC, faturas: [ago, set, outFuturo] }, {}, false, 0, '2026-10-06');
  checar('hero: projeção não conta duas vezes o lançamento futuro', rFuturo.hero.cur === 135 && rFuturo.hero.ciclo?.atual === 110 && rFuturo.hero.ciclo.comparados === 1 && rFuturo.hero.ciclo.total === 1 && rFuturo.hero.projecao === 310);

  // sem a fatura de set (2026-10) o "anterior" seria a de jul: o ciclo começaria
  // em 27/07, e 61 dias não são "o mesmo ponto" de nada
  checar('ciclo: buraco de mês deixa o cartão fora', compararCiclo({ ...ctxC, faturas: [jul, set, out] }, '2026-11', '2026-10-06') === null && compararCiclo({ ...ctxC, faturas: [jun, ago, out] }, '2026-11', '2026-10-06') === null);
  // jun (2026-07) e ago (2026-09) não são vizinhos: os ciclos anteriores param em
  // set, então a projeção é 110 + 200; sem parar, ago entraria com resto 100 → 260
  checar('projeção: ciclos anteriores param no buraco', projetarFechamento({ ...ctxC, faturas: [jun, ago, set, out] }, '2026-11', '2026-10-06') === 310);
  // a fatura de set dividida em duas: juntas, o mesmo ponto continua 50 + 30; sem
  // juntar, a segunda viraria o "ciclo anterior" e contaria 200
  const setA = { ...fc('2026-10', '2026-10-02', '2026-09-25', [lc(50, '2026-08-28'), lc(30, '2026-09-05')]), id: 'setA' };
  const setB = { ...fc('2026-10', '2026-10-02', null, [lc(200, '2026-09-20')]), id: 'setB' };
  const cmpDupla = compararCiclo({ ...ctxC, faturas: [ago, setA, setB, out] }, '2026-11', '2026-10-06');
  checar('ciclo: duas faturas no mesmo mês do cartão viram uma', cmpDupla?.atual === 110 && cmpDupla.anterior === 80 && cmpDupla.dias === 10 && projetarFechamento({ ...ctxC, faturas: [ago, setA, setB, out] }, '2026-11', '2026-10-06') === 310);
  // 25/11 está a 60 dias de 26/09, e o ciclo anterior durou 30 (27/08 a 26/09):
  // fatura "aberta" esquecida não vira "61º dia do ciclo"
  checar('ciclo: dias além do ciclo anterior deixam o cartão fora', compararCiclo(ctxC, '2026-11', '2026-11-25') === null && projetarFechamento(ctxC, '2026-11', '2026-11-25') === null);

  // ── 4.4 · A-09: o que sai do PDF para a IA ────────────────────────────────
  const cabecalhoPdf = [
    'FATURA DO CARTÃO',
    'Titular: MARIA DE TESTE SOUZA',
    'CPF 123.456.789-09',
    'Rua das Flores, 100 apto 12',
    'Jardim Teste São Paulo SP 01234-567',
    'Limite total R$ 10.000,00',
    'Saldo anterior 987,65',
    'Limite disponível R$ 3.000,00',
    'maria.teste@exemplo.com',
    '34191.79001 01043.510047 91020.150008 1 84650000123456',
    'Cartão 5502 XXXX XXXX 1234',
    'Vencimento 10/11/2026 Total 2.345,67',
  ];
  const lancsPdf = [
    '12/08 ASSAI ATACADISTA 612,40',
    '13/08 LOJA X PARC 03/10 1.234,56',
    '14/08 ESTORNO LOJA -45,90',
    '15/08 RESTAURANTE BOM NOME 88,00',
    '16/08 UBER *TRIP 23,10',
    '02/09 MERCADOLIVRE*LOJA 89,90',
    '03/09 IFD*IFOOD COM 45,00',
    '05/09 PG *SPOTIFY 21,90',
    '07/09 DROGASIL 2012 33,40',
    '08/09 ANUIDADE DIFERENCIADA 05/12 39,00',
    '09/09 IOF COMPRA INTERNACIONAL 1,23',
    '10/09 PAGAMENTO EFETUADO -2.345,67',
  ];
  const limpoPdf = textoDaFaturaParaIA([...cabecalhoPdf, ...lancsPdf].join('\n'));
  checar(
    'pdf→ia: some nome, CPF, endereço, CEP, limite, saldo, e-mail e linha digitável',
    ['MARIA', '123.456.789', 'Flores', '01234-567', '10.000,00', '987,65', '3.000,00', 'maria.teste', '34191'].every((s) => !limpoPdf.includes(s)),
  );
  checar('pdf→ia: cartão fica só com o final', limpoPdf.includes('•••• 1234') && !limpoPdf.includes('5502'));
  checar('pdf→ia: vencimento e total ficam', limpoPdf.includes('Vencimento 10/11/2026 Total 2.345,67'));
  checar('pdf→ia: lançamentos saem iguais', lancsPdf.every((l) => limpoPdf.includes(l)));
  // pdf de duas colunas: o pdf-cliente junta pela coordenada Y
  const juntas = textoDaFaturaParaIA('Limite total R$ 10.000,00 12/08 PADARIA 15,50\nTitular: JOAO TESTE 13/08 FARMACIA 30,00');
  checar('pdf→ia: linha juntada perde só o pedaço sensível', juntas.includes('12/08 PADARIA 15,50') && juntas.includes('13/08 FARMACIA 30,00') && !juntas.includes('10.000') && !juntas.includes('JOAO'));
  const promptPdf = promptDeExtracaoParaIA([...cabecalhoPdf, ...lancsPdf].join('\n'), true, 1, 1, '2026');
  checar('pdf→ia: o prompt leva o texto filtrado', promptPdf.includes('12/08 ASSAI ATACADISTA 612,40') && !promptPdf.includes('MARIA'));
  // limite/saldo só é rótulo quando vem seguido de valor ou fim de linha
  const palavraComum = ['12/08 SEM LIMITE ACADEMIA 99,90', '12/08 RECARGA SALDO VIVO 20,00', '12/08 SALDO CASHBACK 5,00'];
  checar('pdf→ia: limite e saldo como palavra comum não apagam o lançamento', palavraComum.every((l) => textoDaFaturaParaIA(l) === l));
  const valorAntes = textoDaFaturaParaIA('12/08 PADARIA 15,50 R$ 5.000,00 Limite total');
  checar('pdf→ia: valor antes do rótulo sai junto', valorAntes.includes('12/08 PADARIA 15,50') && !valorAntes.includes('5.000,00'));
  // número longo (pix, boleto) antes do valor: some o número, fica o lançamento
  const pixLongo = textoDaFaturaParaIA('12/08 PIX TRANSF 12345678901234567890 50,00');
  const boletoLongo = textoDaFaturaParaIA('12/08 BOLETO 34191.79001 01043.510047 120,00');
  checar(
    'pdf→ia: número longo vira [código] sem derrubar a linha',
    pixLongo.includes('12/08') && pixLongo.includes('50,00') && !pixLongo.includes('1234567890') &&
      boletoLongo.includes('12/08') && boletoLongo.includes('120,00') && !boletoLongo.includes('34191') && !boletoLongo.includes('01043'),
  );
  // cabeçalho de duas colunas: com valor ou data, só o pedaço sensível sai
  const duasColunas = textoDaFaturaParaIA('Total da fatura R$ 1.234,56 Limite total R$ 5.000,00');
  checar('pdf→ia: cabeçalho de duas colunas mantém o total', duasColunas.includes('Total da fatura R$ 1.234,56') && !duasColunas.includes('5.000,00'));
  checar('pdf→ia: vencimento ao lado de rótulo sem valor fica', textoDaFaturaParaIA('Vencimento: 10/11/2026 Limite disponível').includes('Vencimento: 10/11/2026'));
  checar(
    'pdf→ia: CPF sem pontos, só com hífen ou mascarado vira [CPF]',
    textoDaFaturaParaIA('CPF 123456789-09') === 'CPF [CPF]' &&
      textoDaFaturaParaIA('Documento 123.456.78909') === 'Documento [CPF]' &&
      textoDaFaturaParaIA('***.456.789-**') === '[CPF]',
  );
  const nomeNoMeio = textoDaFaturaParaIA('12/08 PG *CLIENTE FELIZ 30,00 Limite 5.000,00');
  checar('pdf→ia: "cliente" no meio do lançamento não é rótulo', nomeNoMeio.includes('PG *CLIENTE FELIZ 30,00') && !nomeNoMeio.includes('5.000,00'));
  checar('pdf→ia: cartão com máscara corrida fica só com o final', textoDaFaturaParaIA('Cartão 5502********1234') === 'Cartão •••• 1234');
  checar('pdf→ia: cartão Amex fica só com o final', textoDaFaturaParaIA('Cartão 3782 822463 10005') === 'Cartão •••• 0005');

  // ── 4.4 · A-10: limite de chamadas de IA ──────────────────────────────────
  const agoraIA = new Date('2026-10-07T12:00:00Z');
  const haSeg = (s: number) => new Date(agoraIA.getTime() - s * 1000);
  checar('limite ia: abaixo dos dois limites passa', limiteDeIA({ n10: POR_10_MIN - 1, antiga10: haSeg(500), n24: POR_DIA - 1, antiga24: haSeg(80000) }, agoraIA) === null);
  // 60 nos últimos 10 min, a mais antiga há 9 min: libera em 1 min
  checar('limite ia: 10 min cheios esperam a mais antiga sair', limiteDeIA({ n10: POR_10_MIN, antiga10: haSeg(540), n24: POR_10_MIN, antiga24: haSeg(540) }, agoraIA) === 60);
  checar('limite ia: dia cheio espera a mais antiga do dia', limiteDeIA({ n10: 5, antiga10: haSeg(100), n24: POR_DIA, antiga24: haSeg(86400 - 3600) }, agoraIA) === 3600);
  checar('limite ia: os dois cheios espera o maior', limiteDeIA({ n10: POR_10_MIN, antiga10: haSeg(540), n24: POR_DIA, antiga24: haSeg(86400 - 3600) }, agoraIA) === 3600);
  checar('limite ia: data inválida espera a janela inteira', limiteDeIA({ n10: POR_10_MIN, antiga10: new Date('x'), n24: 0, antiga24: null }, agoraIA) === 600);
  checar('limite ia: texto em minutos', textoLimiteIA(60) === 'Muitas chamadas de IA em pouco tempo; tente de novo em 1 minuto' && textoLimiteIA(61).endsWith('em 2 minutos'));
  checar('limite ia: texto em horas', textoLimiteIA(3 * 3600).endsWith('em 3 horas'));

  // ── 4.4 · A-07: login ─────────────────────────────────────────────────────
  const cab = (o: Record<string, string>) => new Headers(o);
  checar('ip: na Vercel vem do x-real-ip', ipDaRequisicao(cab({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }), { vercel: true }) === '1.2.3.4');
  checar('ip: com IP_HEADER, o mais à direita', ipDaRequisicao(cab({ 'x-forwarded-for': 'a, b, c' }), { vercel: false, ipHeader: 'x-forwarded-for' }) === 'c');
  checar('ip: x-forwarded-for forjado sem IP_HEADER não conta', ipDaRequisicao(cab({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '7.7.7.7' }), { vercel: false }) === SEM_IP);
  checar('ip: cabeçalho ausente vira sem-ip', ipDaRequisicao(cab({}), { vercel: true }) === SEM_IP && ipDaRequisicao(cab({}), { vercel: false, ipHeader: 'x-real-ip' }) === SEM_IP);
  checar('espera: 3 livres, depois dobra, teto de 15 min', [1, 2, 3, 4, 5, 6, 20].map(esperaSegundos).join() === '0,0,0,2,4,8,900');

  // ── 3.8: categoria pelo nome ──────────────────────────────────────────────
  checar('nome na tela: apelido manda', nomeNaTela({ apelido: 'Padaria da Alane', descLimpa: 'Alane Ferreira', descOrigem: 'ALANE FERREIRA 123' }) === 'Padaria da Alane');
  checar('nome na tela: apelido vazio passa ao nome limpo', nomeNaTela({ apelido: '', descLimpa: 'Alane Ferreira', descOrigem: 'X' }) === 'Alane Ferreira');
  checar('nome na tela: sem os dois, o original', nomeNaTela({ apelido: null, descLimpa: null, descOrigem: 'ALANE FERREIRA 123' }) === 'ALANE FERREIRA 123');
  checar('chave do nome: sem maiúscula nem espaço sobrando', chaveDoNome('  Alane   FERREIRA ') === 'alane ferreira');
  checar('mudou junto: nenhum outro, sem aviso', textoMudouJunto(0, 'Alane Ferreira', 'Padaria') === null);
  checar('mudou junto: singular', textoMudouJunto(1, 'Alane Ferreira', 'Padaria') === 'Também mudei 1 lançamento de “Alane Ferreira” para Padaria.');
  checar('mudou junto: plural', textoMudouJunto(12, 'Alane Ferreira', 'Padaria') === 'Também mudei 12 lançamentos de “Alane Ferreira” para Padaria.');
  checar('mudou junto: lote, sem nome', textoMudouJunto(3, null, 'Padaria') === 'Também mudei 3 lançamentos com os mesmos nomes para Padaria.');

  // ── 3.9: estabelecimento ──────────────────────────────────────────────────
  const erroDe = (r: ReturnType<typeof validarNovoNome>) => (r.ok ? null : r.codigo);
  checar('renomear: vazio é erro', erroDe(validarNovoNome('A Ferreira', '')) === 'nome_vazio');
  checar('renomear: só espaço é erro', erroDe(validarNovoNome('A Ferreira', '   ')) === 'nome_vazio');
  checar('renomear: 61 caracteres é erro', erroDe(validarNovoNome('A Ferreira', 'x'.repeat(61))) === 'nome_longo');
  checar('renomear: 60 caracteres passa', validarNovoNome('A Ferreira', 'x'.repeat(60)).ok);
  checar('renomear: mesmo nome com outra caixa e espaços é erro', erroDe(validarNovoNome('A Ferreira', '  a   FERREIRA ')) === 'nome_igual');
  const valido = validarNovoNome('A Ferreira', '  Alane Ferreira ');
  checar('renomear: válido volta com trim', valido.ok && valido.nome === 'Alane Ferreira');
  checar('herdada: sem contagem, nenhuma', categoriaHerdada([]) === null);
  checar('herdada: a mais comum', categoriaHerdada([
    { categoryId: 3, n: 2, ultima: '2026-09-30' },
    { categoryId: 7, n: 9, ultima: '2026-01-10' },
  ]) === 7);
  checar('herdada: empate fica com a mais recente', categoriaHerdada([
    { categoryId: 3, n: 4, ultima: '2026-05-02' },
    { categoryId: 7, n: 4, ultima: '2026-09-15' },
    { categoryId: 9, n: 1, ultima: '2026-10-01' },
  ]) === 7);
  checar('renomeado: com categoria', textoRenomeado(12, 'A Ferreira', 'Alane Ferreira', 'Padaria') === '12 lançamentos de “A Ferreira” agora são “Alane Ferreira” (Padaria).');
  checar('renomeado: sem categoria', textoRenomeado(12, 'A Ferreira', 'Alane Ferreira', null) === '12 lançamentos de “A Ferreira” agora são “Alane Ferreira”.');
  checar('renomeado: singular', textoRenomeado(1, 'A Ferreira', 'Alane Ferreira', null) === '1 lançamento de “A Ferreira” agora é “Alane Ferreira”.');

  process.stdout.write(falhas === 0 ? '\nTodos os testes passaram.\n' : `\n${falhas} falha(s).\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
