/**
 * Porta do plano de 3 meses do app antigo: `planoSaudavel` e as constantes de
 * rótulo vêm de docs/legado/app-antigo.html; o resto, de
 * docs/legado/calculos-do-app-antigo.js (:299-455). A lógica é a de lá, linha a
 * linha; o global `prefsPlano` virou o parâmetro `prefs`, e `renda`,
 * `metaPoupanca`, `foraCartao` vêm do `Contexto`. A paridade
 * (scripts/paridade.ts) compara as duas sobre as mesmas faturas.
 * Puro, sem `server-only`: o teste importa direto.
 */
import { addMonths, CATS, normCat, normDesc, type Contexto } from './base';
import { classeLanc, recorrentesFixas } from './composicao';
import { lancsDoMes, mesAtual, mesesDisponiveis } from './meses';
import { parcelasInfo, projecao, type Projecao } from './parcelas';

export type ConfigRenda = Pick<Contexto, 'renda' | 'metaPoupanca' | 'foraCartao'>;

export type PlanoSaudavel = {
  /** o que pode ir para gastos guardando a meta; null sem renda */
  teto: number | null;
  compromissos: number;
  disponivel: number | null;
  poupanca: number | null;
};

export function planoSaudavel(cfg: ConfigRenda, pj: Projecao | null): PlanoSaudavel | null {
  if (!pj) return null;
  const { renda, metaPoupanca, foraCartao } = cfg;
  const teto = renda > 0 ? Math.max(0, renda * (1 - metaPoupanca / 100) - foraCartao) : null;
  const compromissos = pj.parcelas + pj.fixos;
  return {
    teto,
    compromissos,
    disponivel: teto === null ? null : teto - compromissos,
    poupanca: renda > 0 ? (renda * metaPoupanca) / 100 : null,
  };
}

export type Prefs = {
  objetivo: string;
  ritmo: string;
  intocaveis: string[];
  cortar: string[];
  comida: string;
  assinaturas: string;
  evento: string;
};

export const PREFS_PADRAO: Prefs = {
  objetivo: 'guardar',
  ritmo: 'equilibrado',
  intocaveis: [],
  cortar: [],
  comida: 'misto',
  assinaturas: 'nao_uso',
  evento: '',
};

export const RITMOS: Record<string, { ramp: number[]; rotulo: string }> = {
  firme: { ramp: [1, 1, 1], rotulo: 'De uma vez — já no primeiro mês' },
  equilibrado: { ramp: [0.4, 0.75, 1], rotulo: 'Em três passos (recomendado)' },
  suave: { ramp: [0.25, 0.55, 1], rotulo: 'Devagar — aperta mais no fim' },
};

export const OBJETIVOS: Record<string, string> = {
  guardar: 'Guardar mais todo mês',
  juros: 'Sair dos juros do rotativo',
  parcelas: 'Parar de parcelar e quitar o que já existe',
  segurar: 'Só parar de crescer, sem cortar muito',
};

export const COMIDAS: Record<string, string> = {
  cozinho: 'Cozinho quase sempre',
  misto: 'Metade em casa, metade fora',
  fora: 'Quase sempre peço ou como fora',
};

export const ASSINA: Record<string, string> = {
  nao_uso: 'Pode cancelar o que eu não uso',
  qualquer: 'Pode cortar qualquer uma',
  manter: 'Não quero mexer nas assinaturas',
};

export const ESSENCIAIS = new Set(['Mercado & Padaria', 'Saúde & Farmácia', 'Transporte', 'Casa & Contas', 'Educação']);

export type CatVariavel = { cat: string; media: number };

export function variavelPorCategoria(ctx: Contexto): { cats: CatVariavel[]; meses: number } {
  const ms0 = mesesDisponiveis(ctx);
  const alvo = mesAtual(ctx);
  const ms = (alvo ? ms0.filter((m) => m <= alvo) : ms0).slice(-3);
  if (!ms.length) return { cats: [], meses: 0 };
  const fixas = new Set(recorrentesFixas(ctx).map((r) => normDesc(r.desc)));
  const acc = new Map<string, number>();
  for (const m of ms)
    for (const l of lancsDoMes(ctx, m)) {
      if (classeLanc(ctx, l, fixas) !== 'escolha') continue;
      const c = normCat(l.cat);
      acc.set(c, (acc.get(c) || 0) + (+l.val || 0));
    }
  return {
    meses: ms.length,
    cats: [...acc.entries()]
      .map(([cat, v]) => ({ cat, media: v / ms.length }))
      .filter((x) => x.media > 0)
      .sort((a, b) => b.media - a.media),
  };
}

export type MesMeta = {
  mes: string;
  compromissos: number;
  disp: number;
  dispMax: number;
  alvo: number;
  poupanca: number;
  estoura: boolean;
};

export type Metas = {
  meses: MesMeta[];
  variavelHoje: number;
  teto: number;
  metaPoupancaValor: number;
  cats: CatVariavel[];
  mesesBase: number;
  precisa: boolean;
  impossivel: boolean;
};

/* metas mensais: o teto com poupança é o alvo, a renda é o limite intransponível */
export function metasDoPlano(ctx: Contexto, prefs: Prefs): Metas | null {
  const pj = projecao(ctx);
  if (!pj) return null;
  const pl = planoSaudavel(ctx, pj);
  if (!pl || pl.teto === null) return null;
  const teto = pl.teto;
  const pi = parcelasInfo(ctx);
  const vc = variavelPorCategoria(ctx);
  const variavelHoje = vc.cats.reduce((s, c) => s + c.media, 0) || pj.variavel;
  const ramp = (RITMOS[prefs.ritmo] || RITMOS.equilibrado!).ramp;
  const rendaLiquida = Math.max(0, ctx.renda - ctx.foraCartao); // o que pode ir para o cartão sem poupar nada
  const meses = [0, 1, 2].map((i) => {
    const m = addMonths(pj.prox, i);
    const compromissos = (pi.porMes.find((x) => x[0] === m)?.[1].tot || 0) + pj.fixos;
    const disp = teto - compromissos; // sobra guardando a meta
    const dispMax = rendaLiquida - compromissos; // sobra sem guardar nada
    const precisaCortar = Math.max(0, variavelHoje - disp);
    const rampa = Math.max(0, variavelHoje - precisaCortar * ramp[i]!);
    const alvo = Math.max(0, Math.min(rampa, Math.max(0, dispMax), i === 2 ? Math.max(disp, 0) : Infinity));
    return { mes: m, compromissos, disp, dispMax, alvo, poupanca: rendaLiquida - compromissos - alvo, estoura: dispMax < 0 };
  });
  return {
    meses,
    variavelHoje,
    teto: pl.teto,
    metaPoupancaValor: (ctx.renda * ctx.metaPoupanca) / 100,
    cats: vc.cats,
    mesesBase: vc.meses,
    precisa: meses.some((m) => m.alvo < variavelHoje - 1),
    impossivel: meses.some((m) => m.estoura),
  };
}

export function pisoCat(prefs: Prefs, c: { cat: string; atual: number }): number {
  if (prefs.intocaveis.includes(c.cat)) return c.atual; // não mexe, ponto
  if (prefs.cortar.includes(c.cat)) return 0.25 * c.atual; // pode cortar fundo — mas não até quase zero
  return (ESSENCIAIS.has(c.cat) ? 0.85 : 0.45) * c.atual;
}

/* quanto uma categoria pode cair de um mês para o outro */
export const QUEDA_MAX: Record<string, number> = { firme: 0.5, equilibrado: 0.33, suave: 0.2 };
export const quedaMax = (prefs: Prefs) => QUEDA_MAX[prefs.ritmo] ?? 0.33;

export type CatPlano = { cat: string; atual: number; acao: string; alvos: number[]; travada?: boolean };

/* fecha o mês no alvo sem passar dos limites de cada categoria.
   Devolve o que faltou cortar (0 quando fechou). */
export function fecharMes(prefs: Prefs, cats: CatPlano[], i: number, alvo: number, cap: number): number {
  const base = (c: CatPlano) => (i === 0 ? c.atual : c.alvos[i - 1]!);
  const teto = (c: CatPlano) => base(c);
  const piso = (c: CatPlano) =>
    prefs.intocaveis.includes(c.cat) ? c.atual : Math.max(pisoCat(prefs, c), base(c) * (1 - cap));
  cats.forEach((c) => {
    c.alvos[i] = Math.min(teto(c), Math.max(piso(c), c.alvos[i]!));
  });
  const soma = () => cats.reduce((s, c) => s + c.alvos[i]!, 0);
  let dif = alvo - soma();
  for (let passo = 0; passo < 10 && Math.abs(dif) > 1; passo++) {
    const pesos = cats.map((c) => (dif > 0 ? Math.max(0, teto(c) - c.alvos[i]!) : Math.max(0, c.alvos[i]! - piso(c))));
    const tot = pesos.reduce((a, b) => a + b, 0);
    if (tot <= 0) break;
    cats.forEach((c, k) => {
      c.alvos[i] = Math.min(teto(c), Math.max(piso(c), c.alvos[i]! + (dif * pesos[k]!) / tot));
    });
    dif = alvo - soma();
  }
  cats.forEach((c) => {
    c.alvos[i] = Math.round(c.alvos[i]!);
  });
  return dif;
}

export type ResultadoPlano = {
  cats: CatPlano[];
  fixos: { desc: string; acao: string; economia: number }[];
  nota: string;
  meses: { mes: string; alvo: number; poupanca: number; disp: number }[];
  avisos: { mes: string; falta: number }[];
  metaPoupancaValor: number;
  variavelHoje: number;
  teto: number;
  prefs: Prefs;
  criadoEm: string;
};

type BrutoIA = {
  categorias?: { cat?: unknown; acao?: unknown; alvos?: unknown }[];
  fixos?: { desc?: unknown; acao?: unknown; economia?: unknown }[];
  nota?: unknown;
};

/**
 * Aplica as travas sobre o que a IA devolveu (ou sobre nada: `bruto` nulo dá
 * o plano calculado). Resposta de formato inesperado pode lançar, como no
 * legado — quem chama trata como "a IA não respondeu direito".
 */
export function ajustarPlano(prefs: Prefs, bruto: unknown, mt: Metas): ResultadoPlano | null {
  const b = bruto as BrutoIA | null | undefined;
  const atual = new Map(mt.cats.map((c) => [c.cat, c.media]));
  const cats: CatPlano[] = (b?.categorias || [])
    .filter((c) => (CATS as readonly string[]).includes(c.cat as string) && atual.has(c.cat as string))
    .map((c) => ({
      cat: c.cat as string,
      atual: atual.get(c.cat as string) || 0,
      acao: String(c.acao || '').slice(0, 110),
      alvos: [0, 1, 2].map((i) => Math.max(0, +((Array.isArray(c.alvos) ? c.alvos[i] : 0) as number) || 0)),
    }));
  for (const [cat, media] of atual)
    if (!cats.some((c) => c.cat === cat) && media > 0) cats.push({ cat, atual: media, acao: '', alvos: [media, media, media] });
  if (!cats.length) return null;

  /* o que a pessoa mandou não mexer, não se mexe — a IA não tem voto aqui */
  cats.forEach((c) => {
    if (prefs.intocaveis.includes(c.cat)) {
      c.alvos = [c.atual, c.atual, c.atual];
      c.travada = true;
    }
  });

  const avisos: { mes: string; falta: number }[] = [];
  [0, 1, 2].forEach((i) => {
    let resto = fecharMes(prefs, cats, i, mt.meses[i]!.alvo, quedaMax(prefs));
    if (resto < -1) resto = fecharMes(prefs, cats, i, mt.meses[i]!.alvo, 1); // não coube devagar: vai até o piso
    if (resto < -1) avisos.push({ mes: mt.meses[i]!.mes, falta: -resto });
  });

  cats.sort((a, b) => b.atual - b.alvos[2]! - (a.atual - a.alvos[2]!));
  return {
    cats,
    fixos: (b?.fixos || []).slice(0, 3).map((f) => ({
      desc: String(f.desc || '').slice(0, 40),
      acao: String(f.acao || '').slice(0, 110),
      economia: +(f.economia as number) || 0,
    })),
    nota: String(b?.nota || '').slice(0, 240),
    meses: mt.meses.map((m) => ({ mes: m.mes, alvo: Math.round(m.alvo), poupanca: Math.round(m.poupanca), disp: Math.round(m.disp) })),
    avisos,
    metaPoupancaValor: Math.round(mt.metaPoupancaValor || 0),
    variavelHoje: Math.round(mt.variavelHoje),
    teto: Math.round(mt.teto),
    prefs: { ...prefs },
    criadoEm: new Date().toISOString(),
  };
}

/* quanto foi gasto de verdade num mês do plano, por categoria */
export function realDoMes(ctx: Contexto, m: string, cat: string): number | null {
  if (!mesesDisponiveis(ctx).includes(m)) return null;
  const fixas = new Set(recorrentesFixas(ctx).map((r) => normDesc(r.desc)));
  let t = 0;
  for (const l of lancsDoMes(ctx, m)) if (classeLanc(ctx, l, fixas) === 'escolha' && normCat(l.cat) === cat) t += +l.val || 0;
  return t;
}
