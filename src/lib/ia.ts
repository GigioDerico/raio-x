import type { Txn } from '@/db/schema';
import { nomeExibido, normDesc, parecido, type Contexto, type Lanc } from './calculos/base';
import { composicaoMes, recorrentes, recorrentesFixas } from './calculos/composicao';
import { cartoesInfo, encargosDoMes, lancsDoMes, mesAtual, porCategoria, porMes } from './calculos/meses';
import { parcelasInfo, projecao } from './calculos/parcelas';
import { ASSINA, COMIDAS, OBJETIVOS, RITMOS, planoSaudavel, quedaMax, type Metas, type Prefs, type ResultadoPlano } from './calculos/plano';
import type { DadosResumo } from './calculos/resumo';
import { NOMES } from './categorias';
import { REGRA_OBRAS, promptExtracao } from './extracao';
import { rotuloMes } from './filtro';
import { moeda, pct } from './formato';

/**
 * A IA é o único ponto onde o dado sai da sua infraestrutura: o OpenRouter
 * roteia para um provedor de modelo que nem sempre é o que você escolheu.
 *
 * TODO prompt passa por aqui. Nada de objeto cru do banco.
 *
 * Fora, de propósito: id, account_id, pluggy_txn_id, saldo, limite, CPF e nome
 * do titular (que, aliás, nem são gravados — ver drizzle/0000_init.sql).
 */
export type TxnParaIA = {
  data: string;
  valor: number;
  desc: string;
  categoria: string | null;
  cartao: string | null;
};

export function paraIA(
  t: Pick<Txn, 'data' | 'valor' | 'descNorm'>,
  extras: { categoria?: string | null; apelidoConta?: string | null } = {},
): TxnParaIA {
  return {
    data: t.data, // sem hora
    valor: Number(t.valor),
    desc: t.descNorm, // normalizada, sem código de autorização
    categoria: extras.categoria ?? null,
    cartao: extras.apelidoConta ?? null, // 'Itaú - Azul', nunca o last4
  };
}

export function lotarParaIA(
  linhas: Array<Pick<Txn, 'data' | 'valor' | 'descNorm'>>,
): TxnParaIA[] {
  return linhas.map((l) => paraIA(l));
}

/**
 * Começo do que a IA lê no lugar de um lançamento para pessoa física — Pix,
 * TED, DOC ou transferência, na conta ou no cartão. Decisão do dono: nem a
 * descrição do banco, nem o nome limpo, nem o apelido que ele mesmo deu saem —
 * o apelido de uma pessoa costuma ser o nome dela. Valor, data e categoria
 * continuam. Cada pessoa ganha uma letra (`rotuloDaPessoa`).
 */
export const PESSOA_FISICA_PARA_IA = 'Pix pessoa';

/**
 * A, B, …, Z, AA, AB… Letra e não número: `normDesc`, que agrupa recorrentes e
 * fixas, tira os dígitos e corta em três palavras — "Pix pessoa 1" e "Pix
 * pessoa 2" virariam a mesma fixa.
 */
export function rotuloDaPessoa(i: number): string {
  let letras = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
  return `${PESSOA_FISICA_PARA_IA} ${letras}`;
}

/**
 * Troca o nome de cada lançamento privado pelo rótulo da pessoa. A pessoa é a
 * chave com que os cálculos agrupam (`normDesc(nomeExibido(…, false))`, em
 * composicao.ts), lida no contexto da tela: duas pessoas continuam duas e a
 * mesma pessoa continua uma, e fixas, composição e projeção que a IA lê são as
 * da tela. As chaves vão em ordem para a mesma tela dar o mesmo prompt na página
 * e na rota (o hash do cache é do prompt); uma pessoa nova no recorte pode
 * trocar as letras das outras, e o cache refaz uma vez.
 */
function mascaraDePessoas(ctx: Contexto): <T extends Lanc>(l: T) => T {
  const chave = (l: Lanc) => normDesc(nomeExibido(ctx, l, false));
  const chaves = [...new Set(ctx.faturas.flatMap((f) => f.lancamentos.filter((l) => l.privado).map(chave)))].sort();
  const rotulos = new Map(chaves.map((k, i) => [k, rotuloDaPessoa(i)]));
  // o apelido fixo faz `nomeExibido` parar nele, sem consultar os aprendidos
  return (l) => {
    if (!l.privado) return l;
    const rotulo = rotulos.get(chave(l)) ?? PESSOA_FISICA_PARA_IA;
    return { ...l, desc: rotulo, limpa: null, apelido: rotulo };
  };
}

/**
 * Cópia do contexto que pode virar prompt. Todo construtor de prompt que recebe
 * um `Contexto` passa por aqui (regra 4): o painel mostra o nome ao dono, a IA
 * não o vê.
 *
 * Os apelidos aprendidos cuja chave é a descrição de um lançamento privado (ou
 * parecida com ela, que é como `nomeExibido` os acha) também saem: um apelido
 * "Maria" aprendido antes da 6.0 voltaria por outro lançamento parecido. Só os
 * privados do recorte são vistos aqui; regra nova vinda de um privado fora
 * dele não existe, porque o privado não ensina (`podeAprender`, descricao.ts).
 */
export function contextoParaIA(ctx: Contexto): Contexto {
  const privados = ctx.faturas.flatMap((f) => f.lancamentos.filter((l) => l.privado).map((l) => l.desc));
  if (!privados.length) return ctx;
  const mascarar = mascaraDePessoas(ctx);
  const apelidos = Object.fromEntries(
    Object.entries(ctx.apelidos).filter(([k]) => !privados.some((d) => normDesc(k) === normDesc(d) || parecido(k, d))),
  );
  return { ...ctx, apelidos, faturas: ctx.faturas.map((f) => ({ ...f, lancamentos: f.lancamentos.map(mascarar) })) };
}

/**
 * Prompt do plano, o mesmo texto do app antigo (app-antigo.html:1662-1705).
 * Vai: categorias e médias, tetos por mês, preferências e até 10 cobranças
 * fixas com a descrição normalizada — a mesma que a importação já manda —
 * para a IA sugerir o que cancelar. Não vai: cartão, banco, last4, id, nem o
 * nome de quem recebe Pix (as fixas saem de `contextoParaIA`).
 *
 * Recebe o contexto, e não as fixas prontas, para ninguém montar a lista sem a
 * máscara.
 */
export function promptPlano(mt: Metas, prefs: Prefs, ctx: Contexto): string {
  const fixas = recorrentesFixas(contextoParaIA(ctx));
  const cats = mt.cats.slice(0, 8).map((c) => `- ${c.cat}: hoje ${moeda(c.media)}/mês`).join('\n');
  const alvos = mt.meses.map((m) => `${rotuloMes(m.mes)}: o variável inteiro precisa caber em ${moeda(m.alvo)}`).join('\n');
  const fixasTxt = fixas.slice(0, 10).map((r) => `- ${normDesc(r.desc)}: ${moeda(r.medio)}/mês`).join('\n') || '- nenhuma';
  const ritmo = RITMOS[prefs.ritmo] || RITMOS.equilibrado!;
  return `Você é um planejador financeiro pessoal, prático, falando português do Brasil.

Monte um plano de 3 meses para os gastos VARIÁVEIS (os que a pessoa escolhe no mês) caberem no teto saudável, sem propor nada irreal.

Gasto variável por categoria hoje (média de ${mt.mesesBase} ${mt.mesesBase === 1 ? 'mês' : 'meses'}):
${cats}

Tetos do variável, mês a mês (a soma das categorias tem que bater com o valor de cada mês):
${alvos}

Cobranças fixas atuais (podem ser canceladas ou renegociadas, mas não fazem parte do variável):
${fixasTxt}

Rotina e preferências da pessoa:
- Objetivo: ${OBJETIVOS[prefs.objetivo] || OBJETIVOS.guardar}
- Ritmo aceito: ${ritmo.rotulo}
- Comida no dia a dia: ${COMIDAS[prefs.comida] || COMIDAS.misto}
- Assinaturas: ${ASSINA[prefs.assinaturas] || ASSINA.nao_uso}
- Não quer mexer em: ${prefs.intocaveis.join(', ') || 'nada em especial'}
- Topa cortar fundo em: ${prefs.cortar.join(', ') || 'não indicou'}
- Compromisso grande no período: ${prefs.evento || 'nenhum'}

Regras:
- As categorias que ela pediu para não mexer ficam EXATAMENTE no valor de hoje nos três meses. Não proponha nada para elas.
- Onde ela autorizou cortar fundo, vá mais forte — mas nenhuma categoria cai mais de ${Math.round(quedaMax(prefs) * 100)}% de um mês para o outro.
- O plano nunca pode passar da renda: nos primeiros meses a pessoa guarda menos, nunca gasta a mais.
- Se houver compromisso grande no período, reserve espaço para ele no mês certo e diga isso na nota.
- Ações têm que caber na rotina descrita: para quem quase não cozinha, proponha reduzir frequência e ticket, não "cozinhar todo dia".
- Preserve mercado, saúde e transporte essencial — reduza esses no máximo 15%.
- Nenhuma categoria vai a zero.
- Para cada categoria dê uma ação concreta e verificável ("2 pedidos de delivery por semana em vez de 5"), no máximo 90 caracteres.
- Em "fixos", liste no máximo 3 cobranças que valem cancelar ou renegociar, com a economia mensal.
- "nota": uma frase sobre o que torna este plano possível ou arriscado.

Responda SOMENTE com JSON:
{"categorias":[{"cat":"Restaurantes & Delivery","alvos":[520,430,360],"acao":"..."}],
 "fixos":[{"desc":"...","acao":"...","economia":120}],
 "nota":"..."}`;
}

/**
 * A descrição crua do banco pode trazer CPF, CNPJ ou conta ("PIX ENVIADO
 * 123.456.789-00 FULANO"). Tira qualquer sequência de dígitos com pontuação;
 * se não sobrar nada, um nome neutro.
 */
export function semDocumentos(texto: string): string {
  return texto.replace(/\d[\d.\-\/]{3,}/g, ' ').replace(/\s+/g, ' ').trim() || 'lançamento';
}

// o apelido foi escrito pela pessoa e vai como está; o resto passa pelo filtro — o nome
// limpo também, porque a IA pode ter copiado um documento da descrição crua
function nomeParaIA(ctx: Contexto, l: Parameters<typeof nomeExibido>[1]): string {
  const nome = nomeExibido(ctx, l);
  return nome === l.desc || nome === l.limpa ? semDocumentos(nome) : nome;
}

/**
 * Prompt do resumo do mês, o texto do app antigo (app-antigo.html:1150-1180).
 * Vai: totais, categorias, composição, parcelas, fixos e os 6 maiores
 * lançamentos pelo nome exibido (sem documentos, se for a descrição crua).
 * Não vai: os quatro dígitos do cartão (o legado mandava), id, saldo, limite. A resposta é pedida em JSON para usar
 * `pedirJson`, com o modelo escolhido e o registro de custo.
 *
 * Os totais de `d` não dependem de nome; os lançamentos e as contas daqui, sim:
 * os dois passam pela máscara de pessoa física.
 */
export function promptResumo(ctxTela: Contexto, dTela: DadosResumo): string {
  const ctx = contextoParaIA(ctxTela);
  // os maiores lançamentos com a mesma letra que a pessoa tem no contexto
  const d = { ...dTela, linhas: dTela.linhas.map(mascaraDePessoas(ctxTela)) };
  const L: string[] = [];
  L.push('Mês da fatura: ' + (d.m ? rotuloMes(d.m) : 'todos os meses carregados'));
  L.push('Cartões: ' + (d.porCartao.map((c) => `${c.nome} ${moeda(c.total)}`).join(', ') || 'nenhum'));
  L.push(
    'Total: ' +
      moeda(d.total) +
      (d.prevTot && d.prevM ? ` · mês anterior (${rotuloMes(d.prevM)}): ${moeda(d.prevTot)} (${pct(d.total / d.prevTot - 1)})` : ''),
  );
  L.push(
    'Categorias: ' +
      d.cats
        .slice(0, 7)
        .map(([c, v]) => {
          const p = d.prevCats ? d.prevCats.get(c) || 0 : 0;
          return `${c} ${moeda(v)}` + (p > 0 ? ` (${pct(v / p - 1)})` : ' (novo)');
        })
        .join('; '),
  );
  const enc = encargosDoMes(ctx, d.m);
  if (enc > 0) L.push('Encargos e juros no mês: ' + moeda(enc));
  const comp = composicaoMes(ctx, d.m);
  L.push(`Já contratado antes do mês (fixos+parcelas+encargos): ${moeda(comp.comprometido)} · decidido no mês: ${moeda(comp.escolha)}`);
  const pj = projecao(ctx);
  if (pj && !pj.real) L.push('Próximo mês já começa em: ' + moeda(pj.total));
  const pi = parcelasInfo(ctx);
  if (pi.total > 0) L.push(`Parcelas a vencer: ${moeda(pi.total)} em ${pi.porMes.length} meses`);
  const fixas = recorrentesFixas(ctx);
  if (fixas.length) L.push('Fixos por mês: ' + moeda(fixas.reduce((s, r) => s + r.medio, 0)));
  const top = d.linhas
    .filter((l) => l.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 6);
  L.push('Maiores lançamentos: ' + top.map((l) => `${nomeParaIA(ctx, l)} ${moeda(l.val)}`).join(', '));
  return `Você resume faturas de cartão de crédito para o dono do cartão, em português do Brasil.

Escreva 2 ou 3 frases curtas contando o que aconteceu neste mês: o tamanho da fatura, o que puxou o gasto e a mudança mais relevante em relação ao mês anterior. Termine apontando o ponto que merece atenção.
Use os números que importam, sem repetir todos. Sem listas, sem títulos, sem saudação, sem conselhos genéricos. Máximo 55 palavras.

DADOS:
${L.join('\n')}

Responda SOMENTE com JSON: {"texto": "<o resumo>"}`;
}

export type PlanoParaIA = Pick<ResultadoPlano, 'meses' | 'cats'>;

/**
 * Porta de `resumoParaIA` (docs/legado/app-antigo.html:2781-2827) sobre o
 * Contexto já filtrado. Diferenças: o cartão vai sem os quatro dígitos e toda
 * descrição que pode ser crua (Pluggy traz CPF em PIX) passa por `semDocumentos`.
 * A Conversa (7.3) reusa este bloco. Pix para pessoa física sai mascarado
 * (`contextoParaIA`).
 */
export function dadosDiagnostico(ctxTela: Contexto, filtrado: boolean, plano: PlanoParaIA | null): string {
  const ctx = contextoParaIA(ctxTela);
  const ms = porMes(ctx);
  const m = mesAtual(ctx);
  const prevM = ms.length > 1 ? ms[ms.length - 2]![0] : null;
  const cur = porCategoria(ctx, m);
  const prev = prevM ? porCategoria(ctx, prevM) : null;
  const tot = [...cur.values()].reduce((a, b) => a + b, 0);
  const L: string[] = [];
  L.push('Recorte analisado: ' + (m ? 'fatura de ' + rotuloMes(m) : 'todos os meses carregados'));
  L.push('Renda mensal informada: ' + (ctx.renda > 0 ? moeda(ctx.renda) : 'não informada'));
  L.push('Total por mês de fatura: ' + ms.map(([k, v]) => rotuloMes(k) + ' ' + moeda(v)).join(' | '));
  L.push(
    'Cartões considerados: ' +
      cartoesInfo(ctx).map((c) => c.nome).join(', ') +
      (filtrado ? ' (o painel está filtrado nesses cartões)' : ''),
  );
  L.push('');
  L.push(
    'Categorias em ' + (m ? rotuloMes(m) : 'todos os meses') + ' (valor, % da fatura, variação vs ' + (prevM ? rotuloMes(prevM) : '—') + '):',
  );
  [...cur.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, v]) => {
      const p = prev ? prev.get(c) || 0 : 0;
      L.push('- ' + c + ': ' + moeda(v) + ', ' + (tot ? ((v / tot) * 100).toFixed(0) : 0) + '%' + (p > 0 ? ', ' + pct(v / p - 1) : prev ? ', novo' : ''));
    });
  L.push('');
  L.push('Encargos/juros no mês: ' + moeda(encargosDoMes(ctx, m)));
  const comp = composicaoMes(ctx, m);
  L.push(
    'Composição do mês: fixos ' + moeda(comp.fixo) + ' | parcelas ' + moeda(comp.parcela) + ' | encargos ' + moeda(comp.encargo) +
      ' | escolha do mês ' + moeda(comp.escolha) + ' (já contratado: ' + moeda(comp.comprometido) + ')',
  );
  const pj = projecao(ctx);
  if (pj)
    L.push(
      'Previsão para ' + rotuloMes(pj.prox) + ': ' + moeda(pj.total) + ' (parcelas ' + moeda(pj.parcelas) + ' + fixos ' + moeda(pj.fixos) +
        ' + variável médio ' + moeda(pj.variavel) + ')',
    );
  if (plano)
    L.push(
      'Plano de 3 meses em vigor: ' + plano.meses.map((x) => rotuloMes(x.mes) + ' variável até ' + moeda(x.alvo)).join(' | ') +
        ' · metas por categoria: ' + plano.cats.map((c) => c.cat + ' ' + moeda(c.alvos[0] ?? 0)).join(', '),
    );
  const pl = planoSaudavel(ctx, pj);
  if (pl && pl.teto !== null)
    L.push(
      'Teto saudável do cartão (renda ' + moeda(ctx.renda) + ' guardando ' + ctx.metaPoupanca + '%): ' + moeda(pl.teto) +
        ' · sobra para escolhas: ' + moeda(Math.max(0, pl.disponivel ?? 0)),
    );
  const rec = recorrentes(ctx);
  const fixas = rec.filter((r) => r.fixa);
  L.push('Cobranças fixas todo mês: ' + (fixas.length ? fixas.slice(0, 14).map((r) => semDocumentos(r.desc) + ' ' + moeda(r.medio)).join(' | ') : 'nenhuma'));
  L.push('Soma das fixas por mês: ' + moeda(fixas.reduce((s, r) => s + r.medio, 0)));
  L.push(
    'Recorrentes de valor variável (média por mês): ' +
      (rec.filter((r) => !r.fixa).slice(0, 10).map((r) => semDocumentos(r.desc) + ' ' + moeda(r.medio)).join(' | ') || 'nenhum'),
  );
  const pi = parcelasInfo(ctx);
  L.push(
    'Compras parceladas em aberto: ' +
      (pi.compras.length
        ? pi.compras.slice(0, 10).map((c) => semDocumentos(c.desc) + ' ' + moeda(c.val) + '/mês, faltam ' + c.restantes + ' de ' + c.N).join(' | ')
        : 'nenhuma'),
  );
  L.push('Total ainda a vencer em parcelas: ' + moeda(pi.total));
  L.push('Parcelas por mês: ' + (pi.porMes.length ? pi.porMes.slice(0, 6).map(([k, e]) => rotuloMes(k) + ' ' + moeda(e.tot)).join(' | ') : 'nenhuma'));
  const top = lancsDoMes(ctx, m)
    .filter((l) => l.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 12);
  L.push('');
  L.push('Maiores lançamentos do mês: ' + top.map((l) => nomeParaIA(ctx, l) + ' ' + moeda(l.val) + (l.parc ? ' (' + l.parc + ')' : '')).join(' | '));
  return L.join('\n').slice(0, 12000);
}

/** Texto do legado (app-antigo.html:2920-2934), sem o aviso de dados de exemplo. */
export function promptDiagnostico(dados: string): string {
  return `Você é um analista de finanças pessoais falando português do Brasil, direto e sem rodeios.
Abaixo estão os números reais das faturas de cartão de crédito de uma pessoa.

Escreva um diagnóstico curto usando os valores reais (não invente nada que não esteja nos dados).
Estruture exatamente nestas seções, com "###" antes de cada título:
### O diagnóstico — 2 ou 3 frases sobre o que os números mostram.
### Onde está o problema — as 3 categorias ou hábitos que mais pesam, com valor e variação.
### O que cortar primeiro — 3 cortes concretos, cada um com a economia estimada por mês em reais.
### Cuidado com o fluxo — parcelas já compradas e encargos: o que isso trava nos próximos meses.
### Próximos 30 dias — 3 ações objetivas, na ordem de execução.

Máximo 400 palavras. Não use tabelas. Se algo nos dados parecer errado ou incompleto, diga em uma linha.

DADOS:
${dados}`;
}

export type Fala = { papel: 'pessoa' | 'ia'; texto: string };
export type Mensagem = { role: 'user' | 'assistant'; content: string };

// o guia fixa seis: o histórico inteiro encareceria sem melhorar a resposta
const FALAS_NO_CONTEXTO = 6;

/**
 * Pedido da conversa: a instrução do chat do legado (app-antigo.html:2850-2857)
 * com o bloco de dados do diagnóstico e, se houver, o diagnóstico atual — é o
 * que deixa perguntar "detalha o segundo corte". O texto da pessoa vai como
 * ela escreveu: é dela, não do banco.
 */
export function mensagensConversa(dados: string, diagnostico: string | null, historico: Fala[], pergunta: string): Mensagem[] {
  const instrucao =
    `Você é um analista de finanças pessoais respondendo perguntas sobre as faturas de cartão desta pessoa, em português do Brasil.

Regras: responda curto (até 120 palavras), com os números reais dos dados abaixo. Não invente nada — se a resposta não estiver nos dados, diga o que falta e sugira o que ela pode olhar no app. Nada de listas longas nem de conselhos genéricos. Pode usar "-" para no máximo 4 itens quando fizer sentido.

DADOS DO RECORTE QUE A PESSOA ESTÁ VENDO:
${dados}` + (diagnostico ? `\n\nDIAGNÓSTICO QUE VOCÊ JÁ ESCREVEU SOBRE ESTE RECORTE:\n${diagnostico}` : '');
  const recentes = historico.slice(-FALAS_NO_CONTEXTO);
  // depois da resposta fixa vem sempre a pessoa: os papéis precisam alternar
  const inicio = recentes.findIndex((f) => f.papel === 'pessoa');
  const falas = inicio < 0 ? [] : recentes.slice(inicio);
  return [
    { role: 'user', content: instrucao },
    { role: 'assistant', content: 'Entendi os números. Pode perguntar.' },
    ...falas.map((f): Mensagem => ({ role: f.papel === 'pessoa' ? 'user' : 'assistant', content: f.texto })),
    { role: 'user', content: pergunta },
  ];
}

export type ItemCategorizar = { data: string; valor: number; desc: string };

/**
 * Categorias dos lançamentos que chegaram do Pluggy sem regra aprendida. Vai
 * só data, valor e a descrição original sem documentos (`semDocumentos`), com
 * um índice local — nada de id, cartão ou banco (regra 4). As categorias e a regra de obras são as da
 * extração do PDF, para os dois caminhos classificarem igual.
 */
export function promptCategorizar(itens: ItemCategorizar[]): string {
  const linhas = itens.map((t, i) => `${i} | ${t.data} | ${t.valor.toFixed(2).replace('.', ',')} | ${t.desc}`).join('\n');
  return `Você classifica lançamentos de cartão de crédito de uma pessoa no Brasil.

Para cada linha (índice | data | valor em reais | descrição como veio do banco), devolva:
- categoria: exatamente uma destas: ${NOMES.join(' | ')}
- ${REGRA_OBRAS}
- Juros, multa, IOF e anuidade: "Encargos do cartão". Sem pista nenhuma: "Outros".
- nome: o estabelecimento, sem cidade, país, códigos nem número de parcela, até 40 caracteres, com maiúsculas normais ("SUPERMERCADO CANDIO OLNAZARE PAULISBR" → "Supermercado Candio").

Responda SOMENTE com JSON: {"categorias": [{"i": <índice>, "categoria": "<uma das categorias>", "nome": "<nome>"}]}

Lançamentos:
${linhas}`;
}

export type CategoriaLida = { categoria: string | null; nome: string | null };

/** Resposta da IA → categoria e nome por item, na ordem; o que não vale vira nulo. */
export function lerCategorias(dados: unknown, n: number): CategoriaLida[] {
  const saida: CategoriaLida[] = Array.from({ length: n }, () => ({ categoria: null, nome: null }));
  const lista = (dados as { categorias?: unknown } | null)?.categorias;
  if (!Array.isArray(lista)) return saida;
  for (const c of lista) {
    const i = (c as { i?: unknown })?.i;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= n) continue;
    const cat = (c as { categoria?: unknown })?.categoria;
    const nome = (c as { nome?: unknown })?.nome;
    saida[i] = {
      categoria: typeof cat === 'string' && NOMES.includes(cat) ? cat : null,
      // texto do modelo, exibido na tela: uma linha, curto
      nome: typeof nome === 'string' && nome.trim() && !/[\r\n]/.test(nome) ? nome.trim().slice(0, 40) : null,
    };
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Texto da fatura em PDF (auditoria 4.3, A-09)
//
// O cabeçalho de uma fatura traz nome, CPF, endereço, limite e linha digitável.
// Nada disso ajuda a ler lançamento, e tudo sairia para o OpenRouter.

const VALOR = /\d{1,3}(?:\.\d{3})*,\d{2}/;
const DATA = /\d{2}\/\d{2}/;

// Limite/saldo só é dado sensível como rótulo de um valor: "SEM LIMITE ACADEMIA
// 99,90" e "RECARGA SALDO VIVO 20,00" são lançamentos, e cortar até o primeiro
// valor apagava o lançamento inteiro.
const ROTULO_SALDO = String.raw`\b(?:limite|saldo|dispon[ií]vel)(?:\s+(?:total|dispon[ií]vel|de cr[eé]dito|de saque|para saque|utilizado|anterior|devedor|atual|em aberto))?\s*:?`;
const SALDO_DEPOIS = new RegExp(String.raw`${ROTULO_SALDO}\s*(?:R\$\s*)?(?:${VALOR.source}|$)`, 'gi');
// coluna da direita em que o valor veio antes do rótulo: o valor sai junto
const SALDO_ANTES = new RegExp(String.raw`(?:R\$\s*)?${VALOR.source}\s+${ROTULO_SALDO}\s*$`, 'gi');

// os lookarounds impedem pegar 11 posições de dentro de um cartão ou código
const CPF = /(?<![\d*•Xx])[\d*•Xx]{3}\.?[\d*•Xx]{3}\.?[\d*•Xx]{3}-?[\d*•Xx]{2}(?![\d*•Xx])/g;
// 16 posições em grupos de 4 (dígito ou máscara); máscara corrida (5502********1234);
// Amex em 4-6-5; ou 13 a 19 dígitos corridos
const CARTAO =
  /(?:[\dXx*•]{4}[ .-]){3}(\d{4})\b|\b\d{4,6}[*•Xx]{2,9}(\d{4})\b|\b[\dXx*•]{4} [\dXx*•]{6} \d(\d{4})\b|\b\d{9,15}(\d{4})\b/g;
const CEP = /\b\d{5}-\d{3}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const ENDERECO = /^(rua|r\.|av\.?|avenida|alameda|al\.|travessa|tv\.|rodovia|estrada|praça|praca)\s/i;
// só no começo da linha ou seguido de ':' — "RESTAURANTE BOM NOME" e "PG *CLIENTE
// FELIZ" não são rótulo
const ROTULO_NOME = String.raw`(?:nome(?: do (?:titular|cliente))?|titular|cliente|portador)`;
const NOME = new RegExp(String.raw`^${ROTULO_NOME}\b|\b${ROTULO_NOME}\s*:`, 'i');
const NOME_TRECHO = new RegExp(String.raw`(?:^${ROTULO_NOME}\b|\b${ROTULO_NOME}(?=\s*:))\s*:?\s*[A-Za-zÀ-ÿ'. ]*`, 'gi');

// os globais têm lastIndex: o teste de presença usa uma cópia sem a flag g
const tem = (re: RegExp, l: string) => new RegExp(re.source, re.flags.replace('g', '')).test(l);

/**
 * Sequência de números (só dígito e ponto) com 20 dígitos ou mais vira um
 * `[código]`: linha digitável, chave de pix. Por token, para o valor do
 * lançamento ao lado ("120,00", com vírgula) nunca entrar na conta.
 */
function semCodigos(l: string): string {
  const partes = l.split(/(\s+)/); // pares: token; ímpares: espaço
  const numerico = (j: number) => j % 2 === 0 && /^[\d.]+$/.test(partes[j] ?? '');
  const saida: string[] = [];
  let i = 0;
  while (i < partes.length) {
    if (!numerico(i)) {
      saida.push(partes[i++] ?? '');
      continue;
    }
    let fim = i;
    while (numerico(fim + 2)) fim += 2;
    const sequencia = partes.slice(i, fim + 1);
    const digitos = sequencia.join('').replace(/\D/g, '').length;
    saida.push(...(digitos >= 20 ? ['[código]'] : sequencia));
    i = fim + 1;
  }
  return saida.join('');
}

/** O trecho de fatura sem dado pessoal, pronto para o prompt de extração. */
export function textoDaFaturaParaIA(trecho: string): string {
  return trecho
    .split('\n')
    .flatMap((bruta) => {
      const l = semCodigos(bruta)
        .replace(CPF, '[CPF]')
        .replace(CARTAO, (_, a?: string, b?: string, c?: string, d?: string) => `•••• ${a ?? b ?? c ?? d}`);
      // endereço não tem pedaço que preste
      if (ENDERECO.test(l)) return [];
      const sensivel =
        l.includes('[código]') ||
        tem(CEP, l) ||
        tem(EMAIL, l) ||
        tem(SALDO_DEPOIS, l) ||
        tem(SALDO_ANTES, l) ||
        NOME.test(l);
      if (!sensivel) return [l];
      // o pdf-cliente monta a linha pela coordenada Y: num PDF de duas colunas,
      // um lançamento ou o total da fatura divide a linha com "Limite total".
      // Com valor ou data há o que salvar; sem, a linha é só o dado pessoal.
      if (!VALOR.test(l) && !DATA.test(l)) return [];
      const cortada = l
        .replace(CEP, '[CEP]')
        .replace(EMAIL, '[e-mail]')
        .replace(SALDO_ANTES, ' [omitido]')
        .replace(SALDO_DEPOIS, '[omitido] ')
        .replace(NOME_TRECHO, '[omitido] ')
        .replace(/\s+/g, ' ')
        .trim();
      // "Limite total R$ 10.000,00" sozinha vira só marcador: não vale a linha
      return cortada.replace(/\[(?:omitido|CEP|e-mail|código)\]/g, '').trim() ? [cortada] : [];
    })
    .join('\n');
}

/** O prompt de extração (texto em `extracao.ts`) com o trecho já filtrado. */
export function promptDeExtracaoParaIA(trecho: string, comCabecalho: boolean, idx: number, n: number, anoDica: string): string {
  return promptExtracao(textoDaFaturaParaIA(trecho), comCabecalho, idx, n, anoDica);
}
