/**
 * Porta de "Recorrentes" e "Compromisso × escolha" do app antigo. "Fixo" não é
 * um campo do lançamento: é a cobrança que se repetiu nos últimos meses com
 * valor quase igual — por isso a classe é calculada aqui, e não gravada.
 */
import { gastos, nomeExibido, normCat, normDesc, type Contexto, type Lanc } from './base';
import { lancsDoMes, mesAtual, mesesDisponiveis } from './meses';

export type Recorrente = { desc: string; cat: string; meses: number; medio: number; fixa: boolean; vals: number[] };

export function recorrentes(ctx: Contexto): Recorrente[] {
  const alvo = mesAtual(ctx);
  const todos = mesesDisponiveis(ctx);
  const ms = (alvo ? todos.filter((m) => m <= alvo) : todos).slice(-3);
  const g = new Map<string, { desc: string; cat: string; meses: Map<string, number> }>();
  for (const f of ctx.faturas) {
    if (!ms.includes(f.mesRef)) continue;
    for (const l of gastos(f)) {
      if (l.parc || l.tipo === 'estorno' || (+l.val || 0) <= 0) continue;
      // sem o nome limpo também no rótulo: os fixos são achados por normDesc(r.desc)
      const nome = nomeExibido(ctx, l, false);
      const k = normDesc(nome);
      if (!k) continue;
      if (!g.has(k)) g.set(k, { desc: nome, cat: normCat(l.cat), meses: new Map() });
      const r = g.get(k)!;
      r.meses.set(f.mesRef, (r.meses.get(f.mesRef) || 0) + (+l.val || 0)); // soma do MÊS, não da compra
      if (nome.length < r.desc.length) r.desc = nome;
    }
  }
  const out: Recorrente[] = [];
  for (const r of g.values()) {
    if (r.meses.size < 2) continue;
    const vals = [...r.meses.values()];
    const medio = vals.reduce((a, b) => a + b, 0) / vals.length; // média POR MÊS
    const variacao = medio ? Math.max(...vals.map((v) => Math.abs(v - medio))) / medio : 0;
    out.push({ desc: r.desc, cat: r.cat, meses: r.meses.size, medio, fixa: variacao <= 0.08, vals });
  }
  return out.sort((a, b) => b.medio - a.medio);
}

export const recorrentesFixas = (ctx: Contexto) => recorrentes(ctx).filter((r) => r.fixa);

export type Classe = 'fixo' | 'parcela' | 'encargo' | 'escolha';

/** Cada lançamento é compromisso (fixo, parcela, encargo) ou escolha do mês. */
export function classeLanc(ctx: Contexto, l: Lanc, fixas: Set<string>): Classe {
  if (l.tipo === 'encargo' || normCat(l.cat) === 'Encargos do cartão') return 'encargo';
  if (l.parc) return 'parcela';
  if (fixas.has(normDesc(nomeExibido(ctx, l, false)))) return 'fixo';
  return 'escolha';
}

export type Composicao = {
  fixo: number;
  parcela: number;
  encargo: number;
  escolha: number;
  tot: number;
  comprometido: number;
};

export function composicaoMes(ctx: Contexto, m: string | null, fixas?: Set<string>): Composicao {
  const set = fixas || new Set(recorrentesFixas(ctx).map((r) => normDesc(r.desc)));
  const b = { fixo: 0, parcela: 0, encargo: 0, escolha: 0 };
  for (const l of lancsDoMes(ctx, m)) b[classeLanc(ctx, l, set)] += +l.val || 0;
  const tot = b.fixo + b.parcela + b.encargo + b.escolha;
  return { ...b, tot, comprometido: b.fixo + b.parcela + b.encargo };
}
