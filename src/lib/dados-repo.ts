import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  account,
  aiOutput,
  aiUso,
  category,
  connection,
  conversaTurno,
  installmentPlan,
  institution,
  learnedLabel,
  plan,
  statement,
  txn,
  userSetting,
} from '@/db/schema';
import { env } from '@/env';
import type { LinhaCsv } from './csv';
import { mesDaTxn, rotuloDaConta } from './txn-repo';

/** Todos os cartões e meses, sem excluídos nem suspeitos — o filtro da tela não vale aqui. */
export async function linhasParaCsv(userId: string): Promise<LinhaCsv[]> {
  const linhas = await db
    .select({
      mes: mesDaTxn,
      banco: rotuloDaConta,
      cartao: account.last4,
      data: txn.data,
      desc: txn.descOrigem,
      limpa: txn.descLimpa,
      apelido: txn.apelido,
      categoria: category.nome,
      parcelaN: txn.parcelaN,
      totalParcelas: installmentPlan.totalParcelas,
      tipo: txn.tipo,
      valor: txn.valor,
      cartaoApelido: account.apelido,
      fonte: txn.fonte,
    })
    .from(txn)
    .innerJoin(account, and(eq(account.id, txn.accountId), eq(account.userId, userId)))
    .innerJoin(institution, eq(institution.id, account.institutionId))
    // não aparece no select, mas mesDaTxn lê statement.mes_ref
    .leftJoin(statement, and(eq(statement.id, txn.statementId), eq(statement.accountId, txn.accountId)))
    .leftJoin(category, eq(category.id, txn.categoryId))
    .leftJoin(installmentPlan, and(eq(installmentPlan.id, txn.installmentId), eq(installmentPlan.accountId, txn.accountId)))
    .where(and(eq(txn.userId, userId), isNull(txn.excluidoEm), eq(txn.suspeitoDuplicado, false)))
    .orderBy(asc(mesDaTxn), asc(rotuloDaConta), asc(txn.data), asc(txn.id));
  return linhas.map((l) => ({ ...l, valor: Number(l.valor) }));
}

/**
 * Apaga tudo o que é do dono, numa transação (`db.batch`). Conta apagada leva
 * faturas, parcelas e lançamentos em cascata; plano leva as metas; conexão leva
 * o histórico de sync. Usuário, senha e sessão ficam — o dono cai no app vazio.
 * Instituição é catálogo compartilhado e login_attempt é por IP: nenhum dos dois
 * é dado dele.
 */
export async function apagarTudo(userId: string): Promise<{ conexoesApagadas: number }> {
  const conexoes = await db.select({ id: connection.id }).from(connection).where(eq(connection.userId, userId));
  await db.batch([
    db.delete(account).where(eq(account.userId, userId)),
    db.delete(txn).where(eq(txn.userId, userId)),
    db.delete(learnedLabel).where(eq(learnedLabel.userId, userId)),
    db.delete(plan).where(eq(plan.userId, userId)),
    db.delete(aiOutput).where(eq(aiOutput.userId, userId)),
    db.delete(aiUso).where(eq(aiUso.userId, userId)),
    db.delete(conversaTurno).where(eq(conversaTurno.userId, userId)),
    db.delete(connection).where(eq(connection.userId, userId)),
    db
      .update(userSetting)
      .set({ rendaDeclarada: null, metaPoupanca: '20', gastoForaCartao: '0', modeloIa: env.OPENROUTER_MODEL, tetoIaUsd: null })
      .where(eq(userSetting.userId, userId)),
  ]);
  return { conexoesApagadas: conexoes.length };
}
