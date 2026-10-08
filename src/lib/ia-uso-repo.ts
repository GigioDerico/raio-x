import 'server-only';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { aiUso, iaChamada } from '@/db/schema';
import { env } from '@/env';
import { lerConfig } from './ajustes-repo';
import { resumoGasto } from './ia-gasto';
import { limiteDeIA, textoLimiteIA, type ReservaIA } from './ia-limite';
import { SemChaveIA, type Uso } from './openrouter';
import { ErroDeUso } from './rota';

/**
 * Contabilidade, não dado do usuário: se a gravação falhar, a importação e o
 * plano seguem — perder uma linha de custo é melhor que perder a importação.
 */
export async function registrarUso(userId: string, kind: 'extracao' | 'plano' | 'resumo' | 'diagnostico' | 'conversa' | 'categorizar', modelo: string, uso: Uso) {
  try {
    await db.insert(aiUso).values({
      userId,
      kind,
      modelo,
      tokensIn: uso.tokensIn,
      tokensOut: uso.tokensOut,
      custoUsd: uso.custoUsd === null ? null : uso.custoUsd.toFixed(6),
    });
  } catch (e) {
    console.error('[ai_uso]', e);
  }
}

export type GastoDoMes = { gasto: number; chamadas: number; semCusto: number };

export async function gastoDoMes(userId: string): Promise<GastoDoMes> {
  // o mês é o do dono, em São Paulo — não o do servidor em UTC
  const inicio = sql`(date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`;
  const [linha] = await db
    .select({
      gasto: sql<string>`coalesce(sum(${aiUso.custoUsd}), 0)`,
      chamadas: sql<number>`count(*)::int`,
      semCusto: sql<number>`count(*) filter (where ${aiUso.custoUsd} is null)::int`,
    })
    .from(aiUso)
    .where(and(eq(aiUso.userId, userId), gte(aiUso.criadoEm, inicio)));
  return { gasto: Number(linha?.gasto ?? 0), chamadas: linha?.chamadas ?? 0, semCusto: linha?.semCusto ?? 0 };
}

const quando = (v: unknown): Date | null => (v == null ? null : new Date(v as string | Date));

/**
 * A trava de toda chamada de IA (auditoria 4.3, A-10). 'botao' é o que o dono
 * pediu na tela: estourou o limite → 429; o teto do mês não para. 'automatica'
 * é o sync: estourou o limite ou passou do teto → null, e quem chamou segue sem
 * IA. A chamada é gravada antes de ir ao modelo — a que falha também conta.
 */
export function reservarChamadaIA(userId: string, origem: 'botao'): Promise<ReservaIA>;
export function reservarChamadaIA(userId: string, origem: 'automatica'): Promise<ReservaIA | null>;
export async function reservarChamadaIA(userId: string, origem: 'botao' | 'automatica'): Promise<ReservaIA | null> {
  if (!env.OPENROUTER_API_KEY) {
    if (origem === 'automatica') return null;
    throw new SemChaveIA();
  }

  // a hora é a do banco: é com ela que `em` foi gravado
  const [j] = await db
    .select({
      n10: sql<number>`count(*) filter (where ${iaChamada.em} > now() - interval '10 minutes')::int`,
      antiga10: sql<unknown>`min(${iaChamada.em}) filter (where ${iaChamada.em} > now() - interval '10 minutes')`,
      n24: sql<number>`count(*)::int`,
      antiga24: sql<unknown>`min(${iaChamada.em})`,
      agora: sql<unknown>`now()`,
    })
    .from(iaChamada)
    .where(and(eq(iaChamada.userId, userId), gte(iaChamada.em, sql`now() - interval '24 hours'`)));
  const espera = limiteDeIA(
    { n10: j?.n10 ?? 0, antiga10: quando(j?.antiga10), n24: j?.n24 ?? 0, antiga24: quando(j?.antiga24) },
    quando(j?.agora) ?? new Date(),
  );
  if (espera !== null) {
    if (origem === 'automatica') {
      console.warn('[ia] limite de chamadas: categorização automática pulada');
      return null;
    }
    throw new ErroDeUso('limite_ia', textoLimiteIA(espera), 429, espera);
  }

  if (origem === 'automatica') {
    const [gasto, cfg] = await Promise.all([gastoDoMes(userId), lerConfig(userId)]);
    if (resumoGasto(gasto, cfg.tetoIaUsd ?? env.AI_BUDGET_USD_MONTH).acima) return null;
  }

  await db.batch([
    db.insert(iaChamada).values({ userId, origem }),
    // a janela mais longa é de 24 h: o resto só ocupa espaço
    db.delete(iaChamada).where(and(eq(iaChamada.userId, userId), lt(iaChamada.em, sql`now() - interval '2 days'`))),
  ]);
  return {} as ReservaIA;
}
