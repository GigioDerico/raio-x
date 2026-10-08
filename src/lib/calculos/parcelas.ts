/**
 * Porta de "Parcelas: o que já está comprometido à frente" do app antigo.
 * Lidas APENAS da fatura mais recente de cada cartão, senão a mesma compra
 * parcelada seria contada uma vez por mês carregado.
 *
 * `projecao` — o que a próxima fatura já traz: parcelas + fixos + variável
 * médio de até 3 meses.
 */
import { addMonths, chaveCartao, gastos, nomeCartao, nomeExibido, normDesc, type Contexto, type Fatura } from './base';
import { composicaoMes, recorrentesFixas } from './composicao';
import { mesAtual, mesesDisponiveis, porMes } from './meses';

export type CompraParcelada = {
  desc: string;
  val: number;
  n: number;
  N: number;
  restantes: number;
  total: number;
  cartao: string;
  base: string;
};

export type MesParcelas = { tot: number; itens: string[] };

export type ParcelasInfo = {
  compras: CompraParcelada[];
  porMes: [string, MesParcelas][];
  total: number;
  cartoes: number;
};

export function parcelasInfo(ctx: Contexto): ParcelasInfo {
  const alvo = mesAtual(ctx);
  const ult = new Map<string, Fatura>();
  for (const f of ctx.faturas) {
    if (alvo && f.mesRef > alvo) continue;
    const k = chaveCartao(f);
    const atual = ult.get(k);
    if (!atual || f.mesRef > atual.mesRef) ult.set(k, f);
  }
  const compras: CompraParcelada[] = [];
  const porMes = new Map<string, MesParcelas>();
  const vistos = new Set<string>();
  for (const f of ult.values()) {
    for (const l of gastos(f)) {
      if (!l.parc) continue;
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(l.parc).trim());
      if (!m) continue;
      const n = +m[1]!;
      const N = +m[2]!;
      if (!(N > n)) continue;
      const val = +l.val || 0;
      if (val <= 0) continue;
      const nome = nomeExibido(ctx, l);
      const assinatura = f.id + '|' + normDesc(nomeExibido(ctx, l, false)) + '|' + l.parc + '|' + val.toFixed(2);
      if (vistos.has(assinatura)) continue; // linha repetida na leitura
      vistos.add(assinatura);
      const restantes = N - n;
      compras.push({
        desc: nome,
        val,
        n,
        N,
        restantes,
        total: val * restantes,
        cartao: nomeCartao(ctx, f),
        base: f.mesRef,
      });
      for (let k = 1; k <= restantes; k++) {
        const mes = addMonths(f.mesRef, k);
        if (!porMes.has(mes)) porMes.set(mes, { tot: 0, itens: [] });
        const e = porMes.get(mes)!;
        e.tot += val;
        e.itens.push(nome + ' ' + (n + k) + '/' + N);
      }
    }
  }
  compras.sort((a, b) => b.total - a.total);
  return {
    compras,
    porMes: [...porMes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    total: compras.reduce((s, c) => s + c.total, 0),
    cartoes: ult.size,
  };
}

export type Projecao = {
  prox: string;
  parcelas: number;
  fixos: number;
  variavel: number;
  total: number;
  /** total já importado do mês `prox`; null quando ele ainda não chegou */
  real: number | null;
  meses: number;
};

export function projecao(ctx: Contexto): Projecao | null {
  const ms = mesesDisponiveis(ctx);
  const m = mesAtual(ctx) || (ms.length ? ms[ms.length - 1]! : null);
  if (!m) return null;
  const prox = addMonths(m, 1);
  const pi = parcelasInfo(ctx);
  const parcelas = pi.porMes.find((x) => x[0] === prox)?.[1].tot || 0;
  const fixasArr = recorrentesFixas(ctx);
  const fixas = new Set(fixasArr.map((r) => normDesc(r.desc)));
  const fixos = fixasArr.reduce((s, r) => s + r.medio, 0);
  const base = ms.filter((x) => x <= m).slice(-3);
  const vals = base.map((x) => composicaoMes(ctx, x, fixas).escolha);
  const variavel = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const real = ms.includes(prox) ? porMes(ctx).find((x) => x[0] === prox)?.[1] || 0 : null;
  return { prox, parcelas, fixos, variavel, total: parcelas + fixos + variavel, real, meses: base.length };
}
