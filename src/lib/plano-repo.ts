import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { aiOutput, category, plan, planTarget } from '@/db/schema';
import type { Contexto } from './calculos/base';
import type { ResultadoPlano } from './calculos/plano';
import { validarPrefs } from './plano-prefs';
import type { Uso } from './openrouter';
import { carregarContexto } from './painel-repo';

/** Todos os cartões e o mês mais recente: o teto vem da renda inteira. */
export async function contextoDoPlano(userId: string, obra: boolean): Promise<Contexto> {
  const { ctx } = await carregarContexto(userId, { mes: null, cartoes: [], obra });
  return ctx;
}

export async function planoAtivo(userId: string) {
  const [linha] = await db
    .select({ id: plan.id, prefs: plan.prefs, resultado: plan.resultado })
    .from(plan)
    .where(and(eq(plan.userId, userId), eq(plan.ativo, true)))
    .orderBy(desc(plan.criadoEm))
    .limit(1);
  // plano gravado antes da migração 0004 não tem resultado: é como não ter plano
  if (!linha?.resultado) return null;
  // só a rota grava prefs, sempre validadas; revalidar custa pouco e um jsonb
  // mexido à mão vira "sem plano" em vez de 503
  const v = validarPrefs({ prefs: linha.prefs });
  if (!v.ok) return null;
  return { id: linha.id, prefs: v.mudanca, resultado: linha.resultado as ResultadoPlano };
}

type RegistroIA = { modelo: string; uso: Uso; prompt: string; conteudo: unknown };

/**
 * Tudo ou nada (`db.batch` é uma transação no driver HTTP do Neon): desativa
 * o plano anterior, grava o novo e as metas, e o uso da IA quando houver.
 */
export async function gravarPlano(userId: string, r: ResultadoPlano, cfg: Pick<Contexto, 'renda' | 'metaPoupanca'>, ia?: RegistroIA) {
  const nomes = r.cats.map((c) => c.cat);
  const ids = await db.select({ id: category.id, nome: category.nome }).from(category).where(inArray(category.nome, nomes));
  const idDe = new Map(ids.map((x) => [x.nome, x.id]));
  const planId = randomUUID();
  // ajustarPlano nunca devolve plano sem categoria, e as categorias vêm de CATS,
  // semeadas em 0001_categorias.sql: a lista de metas nunca é vazia
  const metas = r.cats.flatMap((c) => {
    const categoryId = idDe.get(c.cat);
    if (categoryId === undefined) return [];
    return r.meses.map((m, i) => ({ planId, mesRef: `${m.mes}-01`, categoryId, alvo: c.alvos[i]!.toFixed(2) }));
  });

  const desativar = db.update(plan).set({ ativo: false }).where(and(eq(plan.userId, userId), eq(plan.ativo, true)));
  const inserir = db.insert(plan).values({
    id: planId,
    userId,
    ritmo: r.prefs.ritmo,
    objetivo: r.prefs.objetivo,
    rendaBase: cfg.renda.toFixed(2),
    metaPoupanca: cfg.metaPoupanca.toFixed(2),
    prefs: r.prefs,
    resultado: r,
  });
  const inserirMetas = db.insert(planTarget).values(metas);

  if (!ia) {
    await db.batch([desativar, inserir, inserirMetas]);
    return planId;
  }
  const inputHash = createHash('sha256').update(ia.prompt).digest('hex');
  const custoUsd = ia.uso.custoUsd === null ? null : ia.uso.custoUsd.toFixed(6);
  // refinar duas vezes com o mesmo prompt bate na chave única (user, kind, escopo, input_hash)
  const registrar = db
    .insert(aiOutput)
    .values({ userId, kind: 'plano', escopo: 'plano', modelo: ia.modelo, inputHash, conteudo: ia.conteudo, tokensIn: ia.uso.tokensIn, tokensOut: ia.uso.tokensOut, custoUsd })
    .onConflictDoUpdate({
      target: [aiOutput.userId, aiOutput.kind, aiOutput.escopo, aiOutput.inputHash],
      set: { modelo: ia.modelo, conteudo: ia.conteudo, tokensIn: ia.uso.tokensIn, tokensOut: ia.uso.tokensOut, custoUsd, criadoEm: sql`now()` },
    });
  await db.batch([desativar, inserir, inserirMetas, registrar]);
  return planId;
}
