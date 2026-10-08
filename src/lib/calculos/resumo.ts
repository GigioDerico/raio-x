/**
 * Dados do resumo do mês: porta de `dadosResumo` do app antigo
 * (docs/legado/app-antigo.html:1132-1148) sobre o Contexto já filtrado por
 * cartão e obra. Puro, sem `server-only`: o teste importa direto.
 */
import { totalFatura, type Contexto } from './base';
import { cartoesInfo, lancsDoMes, mesAnterior, mesAtual, porCategoria, porMes, type LancDoMes } from './meses';
import type { Filtro } from '../filtro';

export type DadosResumo = {
  m: string | null;
  prevM: string | null;
  linhas: LancDoMes[];
  total: number;
  prevTot: number;
  cats: [string, number][];
  prevCats: Map<string, number> | null;
  porCartao: { nome: string; total: number }[];
};

export function dadosResumo(ctx: Contexto): DadosResumo {
  const m = mesAtual(ctx);
  const linhas = lancsDoMes(ctx, m);
  const total = linhas.reduce((s, l) => s + (+l.val || 0), 0);
  const cats = [...porCategoria(ctx, m).entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const prevM = m ? mesAnterior(ctx, m) : null;
  const prevCats = prevM ? porCategoria(ctx, prevM) : null;
  const prevTot = prevM ? porMes(ctx).find((x) => x[0] === prevM)?.[1] || 0 : 0;
  // o legado juntava "••1234" ao nome do cartão; o prompt não leva os quatro
  // dígitos (regra 4), então fica só o apelido ou o banco
  const porCartao = cartoesInfo(ctx)
    .filter((c) => c.faturas.some((f) => !m || f.mesRef === m))
    .map((c) => ({
      nome: c.nome,
      total: c.faturas.filter((f) => !m || f.mesRef === m).reduce((t, f) => t + totalFatura(f), 0),
    }))
    .filter((c) => c.total)
    .sort((a, b) => b.total - a.total);
  return { m, prevM, linhas, total, prevTot, cats, prevCats, porCartao };
}

/**
 * O resumo vale para o recorte da tela: mês resolvido, cartões e obra. O mês
 * vem à parte porque `filtro.mes` nulo quer dizer "o mais recente", que muda
 * quando chega fatura nova.
 */
export function chaveRecorte(filtro: Filtro, mes: string | null): string {
  const cartoes = filtro.cartoes.length ? [...filtro.cartoes].sort().join(',') : 'todos';
  return `${mes ?? 'todos'}|${cartoes}|${filtro.obra ? 1 : 0}`;
}

/** A resposta da IA é dado não confiável: só um texto, aparado e com limite. */
export function lerTexto(dados: unknown, max: number): string | null {
  if (!dados || typeof dados !== 'object') return null;
  const texto = (dados as { texto?: unknown }).texto;
  if (typeof texto !== 'string') return null;
  const t = texto.trim();
  return t ? t.slice(0, max) : null;
}

export const lerResumo = (dados: unknown) => lerTexto(dados, 600);
