/**
 * Paridade: roda o arquivo do app antigo num `vm` do Node, com o estado global
 * simulado, e compara cada função com a porta em src/lib/calculos sobre as
 * mesmas faturas. Se a porta divergir, o teste quebra — é a prova de que a
 * lógica mudou de casa sem mudar de regra.
 *
 * A comparação é por JSON depois de normalizar Map e Set: objetos criados no
 * `vm` têm outro `Object.prototype`, e `deepStrictEqual` os daria por
 * diferentes mesmo iguais. Por isso também `instanceof Map` não serve aqui.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import * as base from '../src/lib/calculos/base';
import { CONFIG_PADRAO, type Contexto, type Fatura } from '../src/lib/calculos/base';
import * as meses from '../src/lib/calculos/meses';
import * as comp from '../src/lib/calculos/composicao';
import * as anomalias from '../src/lib/calculos/anomalias';
import * as parcelasMod from '../src/lib/calculos/parcelas';
import * as plano from '../src/lib/calculos/plano';
import { APELIDOS, NOMES_CARTAO, faturasDeTeste } from './fixture-legado';

type Fn = (...a: unknown[]) => unknown;
type Legado = Record<string, Fn>;
type Checar = (nome: string, ok: boolean) => void;

const EXPOSTAS = [
  'normCat', 'normDesc', 'tokensDesc', 'parecido', 'nomeExibido', 'addMonths',
  'chaveCartao', 'nomeCartao', 'gastos', 'totalFatura',
  'porMes', 'mesesDisponiveis', 'mesAtual', 'mesAnterior', 'lancsDoMes',
  'porCategoria', 'categoriasPorMes',
  'recorrentes', 'recorrentesFixas', 'classeLanc', 'composicaoMes',
  'cartoesInfo', 'baseCategoria', 'severidade', 'parcelasInfo',
  'encargosDoMes', 'projecao', 'planoSaudavel',
  'variavelPorCategoria', 'metasDoPlano', 'pisoCat', 'quedaMax', 'fecharMes', 'ajustarPlano', 'realDoMes',
  'RITMOS', 'QUEDA_MAX', 'ESSENCIAIS',
];

const CODIGO = readFileSync(join(process.cwd(), 'docs/legado/calculos-do-app-antigo.js'), 'utf8');

// `encargosDoMes` não está em calculos-do-app-antigo.js: só existe dentro do
// artifact (app-antigo.html), ao lado das funções de render. Extraída daqui —
// não digitada — para a paridade rodar contra o original, não contra uma
// cópia que a gente teria de manter sincronizada à mão.
const HTML = readFileSync(join(process.cwd(), 'docs/legado/app-antigo.html'), 'utf8');
const ENCARGOS_MATCH = /function encargosDoMes\(m\)\{[\s\S]*?\n\}/.exec(HTML);
if (!ENCARGOS_MATCH) {
  throw new Error(
    'não achei "function encargosDoMes(m){...}" em docs/legado/app-antigo.html — ' +
      'a paridade não pode rodar contra o original sem essa função',
  );
}
const ENCARGOS_CODIGO = ENCARGOS_MATCH[0];

// `planoSaudavel` também só existe no artifact, ao lado de `renderPrevisto`.
const PLANO_MATCH = /function planoSaudavel\(pj\)\{[\s\S]*?\n\}/.exec(HTML);
if (!PLANO_MATCH) {
  throw new Error(
    'não achei "function planoSaudavel(pj){...}" em docs/legado/app-antigo.html — ' +
      'a paridade não pode rodar contra o original sem essa função',
  );
}
const PLANO_CODIGO = PLANO_MATCH[0];

// `ESSENCIAIS` (piso alto de mercado, saúde, transporte…) só existe no artifact,
// perto de `promptPlano`; `pisoCat` depende dela.
const ESSENCIAIS_MATCH = /const ESSENCIAIS = new Set\(\[[^\]]*\]\);/.exec(HTML);
if (!ESSENCIAIS_MATCH) {
  throw new Error(
    'não achei "const ESSENCIAIS = new Set([...]);" em docs/legado/app-antigo.html — ' +
      'a paridade não pode rodar contra o original sem essa constante',
  );
}
const ESSENCIAIS_CODIGO = ESSENCIAIS_MATCH[0];

export type Config = { renda: number; metaPoupanca: number; foraCartao: number };

export function legado(
  faturas: Fatura[],
  mesFiltro: string | null,
  cfg: Config = CONFIG_PADRAO,
  prefs: plano.Prefs = plano.PREFS_PADRAO,
): Legado {
  const sandbox: Record<string, unknown> = {
    faturas: JSON.parse(JSON.stringify(faturas)),
    apelidos: { ...APELIDOS },
    nomesCartao: { ...NOMES_CARTAO },
    mesFiltro,
    cartaoFiltro: new Set(),
    renda: cfg.renda,
    metaPoupanca: cfg.metaPoupanca,
    foraCartao: cfg.foraCartao,
    prefsPlano: JSON.parse(JSON.stringify(prefs)),
    structuredClone,
    Intl,
  };
  vm.createContext(sandbox);
  // as funções do arquivo são `const`/`function` de topo: um objeto no fim do
  // mesmo script é o jeito de tirá-las do escopo léxico do vm
  const codigo = `${CODIGO}\n${ENCARGOS_CODIGO}\n${PLANO_CODIGO}\n${ESSENCIAIS_CODIGO}\n;({${EXPOSTAS.join(',')}})`;
  return vm.runInContext(codigo, sandbox) as Legado;
}

export function contexto(mesFiltro: string | null, faturas = faturasDeTeste(), cfg: Config = CONFIG_PADRAO): Contexto {
  return { faturas, apelidos: { ...APELIDOS }, mesFiltro, nomesCartao: { ...NOMES_CARTAO }, ...cfg };
}

/**
 * `JSON.stringify` esconde diferença: descarta `undefined`, transforma
 * `NaN`/`Infinity`/`-Infinity` em `null` e não distingue `0` de `-0`. As
 * tasks 3.2/3.3 (parcelas, projeção) têm `?.` e contas que produzem esses
 * valores — sem marcar o tipo, dois resultados diferentes passariam por
 * iguais aqui.
 */
function normalizar(x: unknown): unknown {
  if (typeof x === 'number') {
    if (Number.isNaN(x)) return '__NaN';
    if (x === Infinity) return '__inf';
    if (x === -Infinity) return '__-inf';
    if (Object.is(x, -0)) return '__-0';
    return x;
  }
  if (x === undefined) return '__undef';
  const tipo = Object.prototype.toString.call(x);
  if (tipo === '[object Map]') {
    return { __map: [...(x as Map<unknown, unknown>)].map(([k, v]) => [k, normalizar(v)]) };
  }
  if (tipo === '[object Set]') return { __set: [...(x as Set<unknown>)].map(normalizar) };
  if (Array.isArray(x)) return x.map(normalizar);
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, normalizar(v)]));
  }
  return x;
}

export const igual = (a: unknown, b: unknown) => JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));

export function paridadeBase(checar: Checar) {
  const L = legado(faturasDeTeste(), null);
  const ctx = contexto(null);

  const descs = [
    'ASSAI ATACADISTA 4471', 'Compra PÃO DE AÇÚCAR 03/10', 'PIX ADRIANA MARTINS 8821',
    'TRANSFERENCIA PARA ADRIANA MARTINS', 'Adriana — faxina', '', 'IOF', 'NETFLIX.COM',
  ];
  checar('paridade normDesc', descs.every((d) => L.normDesc!(d) === base.normDesc(d)));
  checar('paridade tokensDesc', descs.every((d) => igual(L.tokensDesc!(d), base.tokensDesc(d))));
  checar(
    'paridade parecido',
    descs.every((a) => descs.every((b) => L.parecido!(a, b) === base.parecido(a, b))),
  );
  const cats = ['Mercado', 'Mercado & Padaria', 'Viagem Espacial', '', undefined, null, 'Outros'];
  checar('paridade normCat', cats.every((c) => L.normCat!(c) === base.normCat(c)));
  checar(
    'paridade addMonths',
    [['2026-11', 3], ['2026-01', -1], ['2026-06', 0], ['2025-12', 13]].every(
      ([m, k]) => L.addMonths!(m, k) === base.addMonths(m as string, k as number),
    ),
  );

  const fats = faturasDeTeste();
  checar('paridade chaveCartao', fats.every((f) => L.chaveCartao!(f) === base.chaveCartao(f)));
  checar(
    'paridade chaveCartao sem dígitos',
    L.chaveCartao!({ banco: 'Itaú Personnalité', cartao: '' }) ===
      base.chaveCartao({ banco: 'Itaú Personnalité', cartao: '' }),
  );
  checar(
    'paridade nomeCartao sem banco nem cartão',
    L.nomeCartao!({ banco: '', cartao: '' }) ===
      base.nomeCartao(ctx, { id: 'x', mesRef: '2026-01', banco: '', cartao: '', lancamentos: [] }),
  );
  checar('paridade nomeCartao', fats.every((f) => L.nomeCartao!(f) === base.nomeCartao(ctx, f)));
  checar('paridade gastos', fats.every((f) => igual(L.gastos!(f), base.gastos(f))));
  checar('paridade totalFatura', fats.every((f) => L.totalFatura!(f) === base.totalFatura(f)));
  checar(
    'paridade nomeExibido',
    fats.every((f) => f.lancamentos.every((x) => L.nomeExibido!(x) === base.nomeExibido(ctx, x))),
  );
}

/** Os mesmos cenários de filtro de mês que o app antigo aceitava. */
export const CENARIOS: (string | null)[] = [null, '2026-04', 'TODOS', '2025-01'];

export function paridadeMeses(checar: Checar) {
  for (const mesFiltro of CENARIOS) {
    const L = legado(faturasDeTeste(), mesFiltro);
    const ctx = contexto(mesFiltro);
    const r = `[${mesFiltro ?? 'recente'}]`;
    const m = meses.mesAtual(ctx);

    checar(`paridade ${r} porMes`, igual(L.porMes!(), meses.porMes(ctx)));
    checar(`paridade ${r} mesesDisponiveis`, igual(L.mesesDisponiveis!(), meses.mesesDisponiveis(ctx)));
    checar(`paridade ${r} mesAtual`, L.mesAtual!() === m);
    checar(
      `paridade ${r} mesAnterior`,
      [...meses.mesesDisponiveis(ctx), null, '1999-01'].every((x) => L.mesAnterior!(x) === meses.mesAnterior(ctx, x)),
    );
    checar(`paridade ${r} lancsDoMes`, igual(L.lancsDoMes!(m), meses.lancsDoMes(ctx, m)));
    checar(`paridade ${r} lancsDoMes todos`, igual(L.lancsDoMes!(null), meses.lancsDoMes(ctx, null)));
    checar(`paridade ${r} porCategoria`, igual(L.porCategoria!(m), meses.porCategoria(ctx, m)));
    checar(`paridade ${r} categoriasPorMes`, igual(L.categoriasPorMes!(), meses.categoriasPorMes(ctx)));
  }
}

export function paridadeComposicao(checar: Checar) {
  for (const mesFiltro of CENARIOS) {
    const L = legado(faturasDeTeste(), mesFiltro);
    const ctx = contexto(mesFiltro);
    const r = `[${mesFiltro ?? 'recente'}]`;
    const m = meses.mesAtual(ctx);
    const fixas = new Set(comp.recorrentesFixas(ctx).map((x) => base.normDesc(x.desc)));

    checar(`paridade ${r} recorrentes`, igual(L.recorrentes!(), comp.recorrentes(ctx)));
    checar(`paridade ${r} recorrentesFixas`, igual(L.recorrentesFixas!(), comp.recorrentesFixas(ctx)));
    // as entradas (lancsDoMes, fixas) vêm da porta, não do legado, mas as duas
    // já têm paridade própria acima — aqui só se prova a regra do classeLanc
    checar(
      `paridade ${r} classeLanc`,
      meses.lancsDoMes(ctx, null).every((x) => L.classeLanc!(x, fixas) === comp.classeLanc(ctx, x, fixas)),
    );
    checar(`paridade ${r} composicaoMes`, igual(L.composicaoMes!(m), comp.composicaoMes(ctx, m)));
    checar(`paridade ${r} composicaoMes todos`, igual(L.composicaoMes!(null), comp.composicaoMes(ctx, null)));
    checar(
      `paridade ${r} composicaoMes sem fixas`,
      igual(L.composicaoMes!(m, new Set()), comp.composicaoMes(ctx, m, new Set())),
    );
  }

  // a fixture tem de exercitar as quatro classes, senão a paridade é fraca
  const ctx = contexto(null);
  const c = comp.composicaoMes(ctx, '2026-06');
  checar('fixture tem fixo, parcela, encargo e escolha', c.fixo > 0 && c.parcela > 0 && c.encargo > 0 && c.escolha > 0);
  checar(
    'apelido aprendido e apelido do lançamento viram a mesma cobrança fixa',
    comp.recorrentesFixas(ctx).some((x) => x.desc === 'Adriana — faxina' && x.meses === 3),
  );
}

export function paridadeVisual(checar: Checar) {
  for (const mesFiltro of CENARIOS) {
    const L = legado(faturasDeTeste(), mesFiltro);
    const ctx = contexto(mesFiltro);
    const r = `[${mesFiltro ?? 'recente'}]`;
    const m = meses.mesAtual(ctx);
    const mapa = meses.categoriasPorMes(ctx);

    checar(`paridade ${r} cartoesInfo`, igual(L.cartoesInfo!(), meses.cartoesInfo(ctx)));
    checar(`paridade ${r} encargosDoMes`, L.encargosDoMes!(m) === meses.encargosDoMes(ctx, m));
    checar(`paridade ${r} encargosDoMes todos`, L.encargosDoMes!(null) === meses.encargosDoMes(ctx, null));
    checar(
      `paridade ${r} baseCategoria`,
      base.CATS.every((cat) =>
        meses
          .mesesDisponiveis(ctx)
          .every((mm) => igual(L.baseCategoria!(cat, mm, mapa), anomalias.baseCategoria(ctx, cat, mm, mapa))),
      ),
    );
    checar(`paridade ${r} parcelasInfo`, igual(L.parcelasInfo!(), parcelasMod.parcelasInfo(ctx)));
  }

  // tabela de casos cobrindo os 6 ramos de severidade, na ordem em que o
  // legado os testa: encargo > 0; prev ≤ 0 e cur > 0; > 40% com share > 8%;
  // > 15%; cur < prev*0.9; na média
  const CASOS_SEVERIDADE: [number, number, number, string][] = [
    [50, 0, 0.1, 'Encargos do cartão'],
    [100, 0, 0.1, 'Mercado & Padaria'],
    [145, 100, 0.2, 'Mercado & Padaria'],
    [130, 100, 0.5, 'Mercado & Padaria'],
    [80, 100, 0.2, 'Mercado & Padaria'],
    [95, 100, 0.2, 'Mercado & Padaria'],
  ];
  const L0 = legado(faturasDeTeste(), null);
  checar(
    'paridade severidade',
    CASOS_SEVERIDADE.every(([cur, prev, share, cat]) =>
      igual(L0.severidade!(cur, prev, share, cat), anomalias.severidade(cur, prev, share, cat)),
    ),
  );
}

const CONFIGS: [string, Config][] = [
  ['sem renda', { renda: 0, metaPoupanca: 20, foraCartao: 0 }],
  ['renda', { renda: 9000, metaPoupanca: 20, foraCartao: 0 }],
  ['renda e fora do cartão', { renda: 9000, metaPoupanca: 15, foraCartao: 2500 }],
  ['fora do cartão maior que a renda', { renda: 2000, metaPoupanca: 20, foraCartao: 5000 }],
];

export function paridadeProjecao(checar: Checar) {
  for (const mesFiltro of CENARIOS) {
    const L = legado(faturasDeTeste(), mesFiltro);
    const ctx = contexto(mesFiltro);
    const r = `[${mesFiltro ?? 'recente'}]`;
    checar(`paridade ${r} projecao`, igual(L.projecao!(), parcelasMod.projecao(ctx)));
  }
  // o recorte 2026-04 tem o mês seguinte importado: é onde `real` sai de null
  checar('fixture exercita projeção com real', parcelasMod.projecao(contexto('2026-04'))?.real !== null);
  checar('fixture exercita projeção sem real', parcelasMod.projecao(contexto(null))?.real === null);
  checar('paridade projecao sem faturas', igual(legado([], null).projecao!(), parcelasMod.projecao(contexto(null, []))));

  for (const [nome, cfg] of CONFIGS) {
    const L = legado(faturasDeTeste(), null, cfg);
    const ctx = contexto(null, faturasDeTeste(), cfg);
    checar(
      `paridade planoSaudavel ${nome}`,
      igual(L.planoSaudavel!(L.projecao!()), plano.planoSaudavel(ctx, parcelasMod.projecao(ctx))),
    );
  }
  checar('paridade planoSaudavel sem projeção', igual(legado([], null).planoSaudavel!(null), plano.planoSaudavel(contexto(null, []), null)));
}

const PREFS_TESTE: [string, plano.Prefs][] = [
  ['padrão', plano.PREFS_PADRAO],
  ['firme com intocável e corte', { ...plano.PREFS_PADRAO, ritmo: 'firme', intocaveis: ['Mercado & Padaria'], cortar: ['Restaurantes & Delivery'] }],
  ['suave cortando fundo', { ...plano.PREFS_PADRAO, ritmo: 'suave', cortar: ['Restaurantes & Delivery', 'Transporte'] }],
];
// folgado: padrão já cabe; apertado: precisa cortar; estourado: os pisos não deixam fechar (avisos)
const CONFIGS_PLANO: [string, Config][] = [
  ['folgado', { renda: 15000, metaPoupanca: 20, foraCartao: 0 }],
  ['apertado', { renda: 2000, metaPoupanca: 20, foraCartao: 0 }],
  ['estourado', { renda: 1200, metaPoupanca: 20, foraCartao: 0 }],
];
// resposta de "IA" hostil: categoria inventada, categoria sem média, alvos como
// texto e como não-lista, intocável que a IA tentou cortar, textos longos
const BRUTO_TESTE = {
  categorias: [
    { cat: 'Restaurantes & Delivery', alvos: ['120', 90, 10], acao: 'x'.repeat(200) },
    { cat: 'Mercado & Padaria', alvos: [1, 1, 1], acao: 'cortar mercado' },
    { cat: 'Categoria Inventada', alvos: [1, 2, 3], acao: 'x' },
    { cat: 'Lazer & Viagem', alvos: [50, 50, 50], acao: 'sem média' },
    { cat: 'Transporte', alvos: 'nada', acao: null },
  ],
  fixos: [{ desc: 'N'.repeat(80), acao: 'a'.repeat(200), economia: '55.9' }, { desc: 'b' }, { desc: 'c' }, { desc: 'd' }],
  nota: 'n'.repeat(300),
};
const semData = (r: unknown) => (r && typeof r === 'object' ? { ...(r as Record<string, unknown>), criadoEm: null } : r);

export function paridadePlano(checar: Checar) {
  const usados = new Set<string>();
  for (const mesFiltro of CENARIOS) {
    for (const [nomeCfg, cfg] of CONFIGS_PLANO) {
      for (const [nomePrefs, prefs] of PREFS_TESTE) {
        const L = legado(faturasDeTeste(), mesFiltro, cfg, prefs);
        const ctx = contexto(mesFiltro, faturasDeTeste(), cfg);
        const r = `[${mesFiltro ?? 'recente'} · ${nomeCfg} · ${nomePrefs}]`;
        const mtL = L.metasDoPlano!() as plano.Metas | null;
        const mtP = plano.metasDoPlano(ctx, prefs);
        checar(`paridade ${r} metasDoPlano`, igual(mtL, mtP));
        if (mtL && mtP) {
          const ajL = L.ajustarPlano!(null, mtL);
          const ajP = plano.ajustarPlano(prefs, null, mtP);
          checar(`paridade ${r} ajustarPlano sem IA`, igual(semData(ajL), semData(ajP)));
          const brL = L.ajustarPlano!(JSON.parse(JSON.stringify(BRUTO_TESTE)), L.metasDoPlano!());
          const brP = plano.ajustarPlano(prefs, JSON.parse(JSON.stringify(BRUTO_TESTE)), plano.metasDoPlano(ctx, prefs)!);
          checar(`paridade ${r} ajustarPlano com IA hostil`, igual(semData(brL), semData(brP)));
          if (mtP.precisa) usados.add('precisa');
          if (ajP?.avisos.length) usados.add('avisos');
          if (ajP?.cats.some((c) => c.travada)) usados.add('travada');
        }
      }
    }
    const L = legado(faturasDeTeste(), mesFiltro);
    const ctx = contexto(mesFiltro);
    const r = `[${mesFiltro ?? 'recente'}]`;
    checar(`paridade ${r} variavelPorCategoria`, igual(L.variavelPorCategoria!(), plano.variavelPorCategoria(ctx)));
    checar(
      `paridade ${r} realDoMes`,
      [...meses.mesesDisponiveis(ctx), '1999-01'].every((m) =>
        base.CATS.every((cat) => L.realDoMes!(m, cat) === plano.realDoMes(ctx, m, cat)),
      ),
    );
  }
  for (const [nomePrefs, prefs] of PREFS_TESTE) {
    const L = legado(faturasDeTeste(), null, CONFIG_PADRAO, prefs);
    checar(
      `paridade pisoCat e quedaMax [${nomePrefs}]`,
      base.CATS.every((cat) => L.pisoCat!({ cat, atual: 100 }) === plano.pisoCat(prefs, { cat, atual: 100 })) &&
        L.quedaMax!() === plano.quedaMax(prefs),
    );
  }
  const L0 = legado(faturasDeTeste(), null);
  checar('paridade RITMOS, QUEDA_MAX e ESSENCIAIS', igual(L0.RITMOS, plano.RITMOS) && igual(L0.QUEDA_MAX, plano.QUEDA_MAX) && igual(L0.ESSENCIAIS, plano.ESSENCIAIS));
  checar('paridade exercita corte, aviso e categoria travada', usados.has('precisa') && usados.has('avisos') && usados.has('travada'));
  checar('paridade ajustarPlano sem categoria variável', plano.ajustarPlano(plano.PREFS_PADRAO, null, { ...plano.metasDoPlano(contexto(null, faturasDeTeste(), CONFIGS_PLANO[0]![1]), plano.PREFS_PADRAO)!, cats: [] }) === null);
}
