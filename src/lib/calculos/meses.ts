/**
 * Porta de "Seleção de faturas e totais" do app antigo. O mês de cada fatura é
 * o `mesRef` — o mês da fatura, não o da compra.
 */
import { CATS, chaveCartao, gastos, normCat, totalFatura, type Contexto, type Fatura, type Lanc } from './base';

export function porMes(ctx: Contexto): [string, number][] {
  const m = new Map<string, number>();
  for (const f of ctx.faturas) m.set(f.mesRef, (m.get(f.mesRef) || 0) + totalFatura(f));
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export const mesesDisponiveis = (ctx: Contexto) => porMes(ctx).map((x) => x[0]);

/** O mês em foco no painel — null significa "todos os meses". */
export function mesAtual(ctx: Contexto): string | null {
  const ms = mesesDisponiveis(ctx);
  if (ctx.mesFiltro === 'TODOS') return null;
  if (ctx.mesFiltro && ms.includes(ctx.mesFiltro)) return ctx.mesFiltro;
  return ms.length ? ms[ms.length - 1]! : null;
}

export function mesAnterior(ctx: Contexto, m: string | null): string | null {
  const ms = mesesDisponiveis(ctx);
  const i = m === null ? -1 : ms.indexOf(m);
  return i > 0 ? ms[i - 1]! : null;
}

export type LancDoMes = Lanc & { banco: string; cartao: string };

export function lancsDoMes(ctx: Contexto, m: string | null): LancDoMes[] {
  const out: LancDoMes[] = [];
  for (const f of ctx.faturas) {
    if (!m || f.mesRef === m) for (const l of gastos(f)) out.push({ ...l, banco: f.banco, cartao: f.cartao });
  }
  return out;
}

export function porCategoria(ctx: Contexto, m: string | null): Map<string, number> {
  const map = new Map<string, number>(CATS.map((c) => [c, 0]));
  for (const l of lancsDoMes(ctx, m)) {
    const c = normCat(l.cat);
    map.set(c, (map.get(c) || 0) + (+l.val || 0));
  }
  return map;
}

/** Categorias de todos os meses de uma vez (evita recalcular a cada consulta). */
export function categoriasPorMes(ctx: Contexto): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const m of mesesDisponiveis(ctx)) out.set(m, porCategoria(ctx, m));
  return out;
}

export type CartaoInfo = {
  k: string;
  banco: string;
  cartao: string;
  faturas: Fatura[];
  ultimo: Fatura | null;
  meses: string[];
  nome: string;
  apelido: string;
  venc: string;
  total: number;
  exemplo: boolean;
};

/**
 * Um cartão pode aparecer em faturas com nome de banco escrito diferente de um
 * mês para o outro — `chaveCartao` agrupa; o "nome" mostrado é o mais recente.
 * O legado itera `faturas` (todas, sem filtro de cartão); aqui `ctx.faturas`
 * já é o recorte — quem monta o contexto aplicou o filtro antes.
 */
export function cartoesInfo(ctx: Contexto): CartaoInfo[] {
  const m = new Map<string, { k: string; banco: string; cartao: string; faturas: Fatura[]; ultimo: Fatura | null }>();
  for (const f of ctx.faturas) {
    const k = chaveCartao(f);
    if (!m.has(k)) m.set(k, { k, banco: f.banco, cartao: f.cartao, faturas: [], ultimo: null });
    const c = m.get(k)!;
    c.faturas.push(f);
    if (!c.ultimo || f.mesRef > c.ultimo.mesRef) {
      c.ultimo = f;
      c.banco = f.banco;
      if (f.cartao) c.cartao = f.cartao;
    }
  }
  return [...m.values()]
    .map((c) => {
      const meses = c.faturas.map((f) => f.mesRef).sort();
      return {
        ...c,
        meses,
        nome: ctx.nomesCartao[c.k] || c.banco || 'Cartão',
        apelido: ctx.nomesCartao[c.k] || '',
        venc: c.ultimo?.vencimento || '',
        total: totalFatura(c.ultimo!),
        // `exemplo` marcava fatura de demonstração no app antigo; não existe
        // no nosso modelo de dados, então é sempre falso — a chave fica para
        // manter o mesmo formato do legado
        exemplo: false,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Juros e encargos do mês. O legado compara `l.cat === "Encargos do cartão"`
 * SEM `normCat` — porte igual: a categoria já vem canônica na maior parte dos
 * casos, e mudar para `normCat` aqui seria consertar uma regra que não é
 * nossa para consertar.
 */
export function encargosDoMes(ctx: Contexto, m: string | null): number {
  return lancsDoMes(ctx, m)
    .filter((l) => l.tipo === 'encargo' || l.cat === 'Encargos do cartão')
    .reduce((s, l) => s + (+l.val || 0), 0);
}
