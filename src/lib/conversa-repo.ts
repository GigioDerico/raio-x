import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { conversaTurno } from '@/db/schema';
import type { FalaGuardada } from './conversa';

/** As últimas `limite` falas do recorte, em ordem de conversa. */
export async function falasDoRecorte(userId: string, escopo: string, limite = 50): Promise<(FalaGuardada & { id: number })[]> {
  const linhas = await db
    .select({ id: conversaTurno.id, papel: conversaTurno.papel, texto: conversaTurno.texto, dadosHash: conversaTurno.dadosHash })
    .from(conversaTurno)
    .where(and(eq(conversaTurno.userId, userId), eq(conversaTurno.escopo, escopo)))
    .orderBy(desc(conversaTurno.criadoEm), desc(conversaTurno.id))
    .limit(limite);
  // o check do banco só aceita os dois papéis: o cast não esconde outro valor
  return linhas.reverse().map((l) => ({ ...l, papel: l.papel as FalaGuardada['papel'] }));
}

/**
 * Pergunta e resposta num insert só: atômico, e o id (identity, na ordem do
 * VALUES) desempata o criado_em igual.
 */
export async function gravarPar(userId: string, escopo: string, dadosHash: string, pergunta: string, resposta: string) {
  await db.insert(conversaTurno).values([
    { userId, escopo, papel: 'pessoa', texto: pergunta, dadosHash },
    { userId, escopo, papel: 'ia', texto: resposta, dadosHash },
  ]);
}

export async function limparConversa(userId: string, escopo: string) {
  await db.delete(conversaTurno).where(and(eq(conversaTurno.userId, userId), eq(conversaTurno.escopo, escopo)));
}
