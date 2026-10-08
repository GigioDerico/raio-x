import 'server-only';
import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { aiOutput } from '@/db/schema';
import { lerTexto } from './calculos/resumo';
import type { Uso } from './openrouter';

// o hash do próprio prompt é a assinatura: muda com qualquer dado que a IA veria
export const hashDoPrompt = (prompt: string) => createHash('sha256').update(prompt).digest('hex');

export type KindSaida = 'resumo' | 'diagnostico';
// o mesmo limite que a rota aplicou ao gravar: um jsonb mexido à mão não passa disso
const LIMITE: Record<KindSaida, number> = { resumo: 600, diagnostico: 6000 };

/**
 * Prefere a linha do mesmo prompt (o "↻" pode ter deixado outra mais nova com
 * dado diferente, e voltar ao dado antigo não deve pagar de novo). Sem ela, a
 * mais recente do recorte, para a tela dizer que os dados mudaram.
 */
export async function saidaGuardada(userId: string, kind: KindSaida, escopo: string, hash: string) {
  const [linha] = await db
    .select({ conteudo: aiOutput.conteudo, inputHash: aiOutput.inputHash })
    .from(aiOutput)
    .where(and(eq(aiOutput.userId, userId), eq(aiOutput.kind, kind), eq(aiOutput.escopo, escopo)))
    .orderBy(desc(sql`${aiOutput.inputHash} = ${hash}`), desc(aiOutput.criadoEm))
    .limit(1);
  if (!linha) return null;
  const texto = lerTexto(linha.conteudo, LIMITE[kind]);
  return texto ? { texto, atual: linha.inputHash === hash } : null;
}

export async function guardarSaida(userId: string, kind: KindSaida, escopo: string, inputHash: string, texto: string, modelo: string, uso: Uso) {
  const custoUsd = uso.custoUsd === null ? null : uso.custoUsd.toFixed(6);
  await db
    .insert(aiOutput)
    .values({ userId, kind, escopo, modelo, inputHash, conteudo: { texto }, tokensIn: uso.tokensIn, tokensOut: uso.tokensOut, custoUsd })
    // "↻" com o mesmo prompt bate na chave única (user, kind, escopo, input_hash)
    .onConflictDoUpdate({
      target: [aiOutput.userId, aiOutput.kind, aiOutput.escopo, aiOutput.inputHash],
      set: { conteudo: { texto }, modelo, tokensIn: uso.tokensIn, tokensOut: uso.tokensOut, custoUsd, criadoEm: sql`now()` },
    });
}

export const resumoGuardado = (userId: string, escopo: string, hash: string) => saidaGuardada(userId, 'resumo', escopo, hash);
export const guardarResumo = (userId: string, escopo: string, inputHash: string, texto: string, modelo: string, uso: Uso) =>
  guardarSaida(userId, 'resumo', escopo, inputHash, texto, modelo, uso);
