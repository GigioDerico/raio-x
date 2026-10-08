/**
 * Porta de "Compromisso × escolha" (base de comparação) e "Severidade de uma
 * variação" do app antigo — usadas pelo ranking "Onde está apertando".
 */
import type { Contexto } from './base';
import { mesesDisponiveis, porCategoria } from './meses';

export type BaseCategoria = { media: number; n: number; ultimo: string };

/** Base de comparação: média dos até 3 meses anteriores a `m`. */
export function baseCategoria(
  ctx: Contexto,
  cat: string,
  m: string,
  mapa: Map<string, Map<string, number>>,
): BaseCategoria | null {
  const ms = mesesDisponiveis(ctx);
  const i = ms.indexOf(m);
  const ant = i > 0 ? ms.slice(Math.max(0, i - 3), i) : [];
  if (!ant.length) return null;
  const vals = ant.map((x) => (mapa.get(x) || porCategoria(ctx, x)).get(cat) || 0);
  return { media: vals.reduce((a, b) => a + b, 0) / vals.length, n: ant.length, ultimo: ant[ant.length - 1]! };
}

export type Severidade = { k: '' | 'good' | 'warn' | 'crit'; g: string; t: string };

/** Severidade de uma variação (usada no destaque de anomalia). */
export function severidade(cur: number, prev: number, share: number, cat: string): Severidade {
  if (cat === 'Encargos do cartão' && cur > 0) return { k: 'crit', g: '▲', t: 'juros pagos' };
  if (prev <= 0 && cur > 0) return { k: 'warn', g: '＋', t: 'novo neste mês' };
  if (prev > 0 && cur / prev - 1 > 0.4 && share > 0.08) return { k: 'crit', g: '▲', t: 'acima da média' };
  if (prev > 0 && cur / prev - 1 > 0.15) return { k: 'warn', g: '▲', t: 'subindo' };
  if (prev > 0 && cur < prev * 0.9) return { k: 'good', g: '▼', t: 'abaixo da média' };
  return { k: '', g: '●', t: 'na média' };
}
