/**
 * O que o painel mostra, calculado de uma vez — as mesmas contas de
 * `renderKpis` e `renderRank` do app antigo (docs/legado/app-antigo.html,
 * :1289–1351 e :1783–1806). A página e o /api/overview usam esta mesma
 * função: não há conta escrita duas vezes.
 */
import { pct } from '../formato';
import { rotuloMes } from '../filtro';
import { chaveCartao, totalFatura, type Contexto } from './base';
import { baseCategoria, severidade, type Severidade } from './anomalias';
import { recorrentesFixas, composicaoMes, type Composicao } from './composicao';
import {
  cartoesInfo,
  categoriasPorMes,
  encargosDoMes,
  lancsDoMes,
  mesAnterior,
  mesAtual,
  mesesDisponiveis,
  porCategoria,
  porMes,
  type CartaoInfo,
} from './meses';
import { parcelasInfo } from './parcelas';
import { compararCiclo, projetarFechamento } from './ciclo';

export type LinhaRank = { cat: string; valor: number; share: number; sev: Severidade; varTxt: string };

export type ResumoPainel = {
  mes: string | null; // null = todos os meses
  meses: string[];
  vazio: boolean;
  obra: number | null; // só com "separar obra" e gasto de obra no recorte
  hero: {
    cur: number;
    prevMes: string | null;
    prev: number;
    delta: number | null; // prev ? cur/prev - 1 : null  (igual ao legado)
    /** com fatura aberta no mês: prev e ciclo.atual são o mesmo ponto do ciclo (anterior e de hoje); cur segue o total do mês */
    ciclo: { dias: number | null; atual: number; comparados: number; total: number } | null;
    projecao: number | null;
    venc: string; // vencimento mais cedo das faturas do mês, ou ''
    pctRenda: number | null; // renda > 0 && mes ? cur / renda * 100 : null
    cartoes: { nome: string; cartao: string; total: number }[]; // cs.slice(0, 4)
    comp: Composicao;
    pcComp: number; // comp.tot ? comprometido / tot * 100 : 0
    mesesCarregados: number;
  };
  stats: {
    encargos: number; // encargosDoMes(m)
    fixoMensal: number; // soma de recorrentesFixas().medio
    fixas: number;
    parcelasTotal: number; // parcelasInfo().total
    proxParcela: { mes: string; tot: number } | null; // pi.porMes[0]
    comprasParceladas: number;
  };
  rank: LinhaRank[]; // renderRank: |v| > 0.009, desc; share = v/tot; sev e varTxt como lá
};

export function resumoDoPainel(
  ctx: Contexto,
  obraPorMes: Record<string, number>,
  separar: boolean,
  renda: number,
  hoje?: string,
): ResumoPainel {
  const meses = mesesDisponiveis(ctx);
  const m = mesAtual(ctx);
  const ms = porMes(ctx);
  const prevM = m ? mesAnterior(ctx, m) : null;
  // fatura aberta: mês inteiro contra mês inteiro compararia um parcial com
  // um fechado, então a comparação passa a ser o mesmo ponto do ciclo. O número
  // grande continua o total do mês: um cartão sem ciclo anterior (ou já fechado)
  // não pode sumir dele só por não ter com que comparar
  const cmp = m && hoje ? compararCiclo(ctx, m, hoje) : null;
  const cur = m ? (ms.find((x) => x[0] === m)?.[1] ?? 0) : ms.reduce((a, b) => a + b[1], 0);
  const prev = cmp ? cmp.anterior : prevM ? (ms.find((x) => x[0] === prevM)?.[1] ?? 0) : 0;
  const base = cmp ? cmp.atual : cur;
  const delta = prev ? base / prev - 1 : null;
  const doMes = m ? ctx.faturas.filter((f) => f.mesRef === m) : [];
  const ciclo = cmp
    ? { dias: cmp.dias, atual: cmp.atual, comparados: cmp.cartoes.length, total: new Set(doMes.map(chaveCartao)).size }
    : null;
  const fechamento = cmp && m && hoje ? projetarFechamento(ctx, m, hoje) : null;
  // o que ficou fora da comparação entra na projeção como está. Pelos cartões, não
  // por `cur − atual`: lançamento com data depois de hoje na própria fatura aberta
  // já está no resto médio dos ciclos anteriores e contaria duas vezes
  const fora = cmp ? doMes.filter((f) => !cmp.cartoes.includes(chaveCartao(f))).reduce((s, f) => s + totalFatura(f), 0) : 0;
  const projecao = cmp && fechamento !== null ? fechamento + fora : null;

  const enc = encargosDoMes(ctx, m);
  const pi = parcelasInfo(ctx);
  const fixas = recorrentesFixas(ctx);
  const rec = fixas.reduce((s, r) => s + r.medio, 0);
  const comp = composicaoMes(ctx, m);
  const proxMes = pi.porMes.length ? pi.porMes[0]! : null;
  // `ctx.faturas` já é o recorte de cartão (quem monta o contexto aplicou o
  // filtro antes) — diferente do legado, que calculava "vence dia" sobre a
  // lista de faturas SEM o filtro de cartão (só `fats()` era filtrado). Aqui
  // não existe mais essa lista à parte, então `venc` segue o recorte, como
  // todo o resto do painel; ver Decisões em docs/acompanhamento/3.1-painel.md.
  const cs = cartoesInfo(ctx).filter((c) => c.faturas.some((f) => !m || f.mesRef === m));
  const totalCartao = (c: CartaoInfo) =>
    c.faturas.filter((f) => !m || f.mesRef === m).reduce((t, f) => t + totalFatura(f), 0);
  const venc = m
    ? ctx.faturas
        .filter((f) => f.mesRef === m && f.vencimento)
        .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : 1))[0]?.vencimento || ''
    : '';
  const pcComp = comp.tot ? (comp.comprometido / comp.tot) * 100 : 0;
  const pctRenda = renda > 0 && m ? (cur / renda) * 100 : null;

  const obraBruta = m ? (obraPorMes[m] ?? 0) : Object.values(obraPorMes).reduce((s, v) => s + v, 0);

  const mapa = categoriasPorMes(ctx);
  const curCats = m ? mapa.get(m) || porCategoria(ctx, m) : porCategoria(ctx, null);
  const tot = [...curCats.values()].reduce((a, b) => a + b, 0);
  const linhas = [...curCats.entries()].filter(([, v]) => Math.abs(v) > 0.009).sort((a, b) => b[1] - a[1]);
  const rank: LinhaRank[] = linhas.map(([cat, v]) => {
    const b = m ? baseCategoria(ctx, cat, m, mapa) : null;
    const share = tot ? v / tot : 0;
    const sev = b ? severidade(v, b.media, share, cat) : { k: '' as const, g: '●', t: 'sem comparação' };
    const ref = b ? (b.n >= 2 ? 'média de ' + b.n + ' meses' : 'vs ' + rotuloMes(b.ultimo)) : '';
    const varTxt = b && b.media > 0 ? pct(v / b.media - 1) + ' · ' + ref : '';
    return { cat, valor: v, share, sev, varTxt };
  });

  return {
    mes: m,
    meses,
    // com a obra à parte, um mês só de obra não é "nada neste mês" — a tela
    // ainda tem o que mostrar (a linha da obra)
    vazio: lancsDoMes(ctx, m).length === 0 && !(separar && obraBruta > 0),
    obra: separar && obraBruta > 0 ? obraBruta : null,
    hero: {
      cur,
      prevMes: prevM,
      prev,
      delta,
      ciclo,
      projecao,
      venc,
      pctRenda,
      cartoes: cs.slice(0, 4).map((c) => ({ nome: c.nome, cartao: c.cartao, total: totalCartao(c) })),
      comp,
      pcComp,
      mesesCarregados: ms.length,
    },
    stats: {
      encargos: enc,
      fixoMensal: rec,
      fixas: fixas.length,
      parcelasTotal: pi.total,
      proxParcela: proxMes ? { mes: proxMes[0], tot: proxMes[1].tot } : null,
      comprasParceladas: pi.compras.length,
    },
    rank,
  };
}
