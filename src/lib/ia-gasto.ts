/** Gasto de IA do mês contra o teto. Puro: a consulta fica em ia-uso-repo.ts. */
import type { GastoDoMes } from './ia-uso-repo';

export type ResumoGasto = GastoDoMes & { teto: number; pct: number | null; acima: boolean };

/** `teto` 0 = sem teto: nada de barra nem de aviso. */
export function resumoGasto(g: GastoDoMes, teto: number): ResumoGasto {
  if (!teto) return { ...g, teto: 0, pct: null, acima: false };
  return { ...g, teto, pct: Math.min(100, (g.gasto / teto) * 100), acima: g.gasto > teto };
}
