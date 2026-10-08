import 'server-only';
import { and, asc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { account, category, installmentPlan, institution, learnedLabel, statement, txn, userSetting } from '@/db/schema';
import { configDoUsuario, montarFaturas, separarObra } from './calculos/adaptador';
import type { Contexto } from './calculos/base';
import type { Filtro } from './filtro';
import { mesDaTxn, rotuloDaConta } from './txn-repo';

/**
 * Monta o contexto das contas do painel: uma consulta pelos lançamentos do
 * recorte de cartões, outra pelos apelidos aprendidos. Todas as faturas do
 * recorte vêm, sem janela de meses — são dezenas, e escolher em SQL quais meses
 * entram seria reescrever `mesAtual` e `recorrentes`.
 *
 * Posse: `txn.user_id` e `learned_label.user_id` da sessão; o join obrigatório
 * da conta confirma `account.user_id`. Fatura e parcelamento só contribuem
 * metadados quando pertencem à mesma conta do lançamento.
 */
export async function carregarContexto(
  userId: string,
  f: Filtro,
): Promise<{ ctx: Contexto; obraPorMes: Record<string, number> }> {
  // crédito, renda e o que não conta ficam fora: o painel soma o que saiu (6.0)
  const cond = [eq(txn.userId, userId), isNull(txn.excluidoEm), eq(txn.suspeitoDuplicado, false), eq(txn.papel, 'gasto')];
  if (f.cartoes.length) cond.push(inArray(txn.accountId, f.cartoes));

  const [linhas, rotulos, config] = await Promise.all([
    db
      .select({
        statementId: statement.id,
        accountId: txn.accountId,
        mes: mesDaTxn,
        banco: rotuloDaConta,
        last4: account.last4,
        apelidoConta: account.apelido,
        desc: txn.descOrigem,
        limpa: txn.descLimpa,
        apelido: txn.apelido,
        valor: txn.valor,
        categoria: category.nome,
        tipo: txn.tipo,
        parcelaN: txn.parcelaN,
        totalParcelas: installmentPlan.totalParcelas,
        vencimento: statement.vencimento,
        data: txn.data,
        // sem statement (left join) o status vem nulo
        aberta: sql<boolean>`coalesce(${statement.status} = 'aberta', false)`,
        fechamento: statement.fechamento,
        privado: txn.pessoaFisica,
      })
      .from(txn)
      .leftJoin(statement, and(eq(statement.id, txn.statementId), eq(statement.accountId, txn.accountId)))
      .innerJoin(account, and(eq(account.id, txn.accountId), eq(account.userId, userId)))
      .innerJoin(institution, eq(institution.id, account.institutionId))
      .leftJoin(category, eq(category.id, txn.categoryId))
      .leftJoin(installmentPlan, and(eq(installmentPlan.id, txn.installmentId), eq(installmentPlan.accountId, txn.accountId)))
      .where(and(...cond))
      // a ordem importa: o app antigo somava na ordem em que os lançamentos
      // estavam na fatura, e `recorrentes` guarda o nome mais curto visto
      .orderBy(asc(txn.data), asc(txn.criadoEm), asc(txn.id)),
    db
      .select({ descNorm: learnedLabel.descNorm, apelido: learnedLabel.apelido })
      .from(learnedLabel)
      .where(and(eq(learnedLabel.userId, userId), isNotNull(learnedLabel.apelido))),
    db
      .select({ renda: userSetting.rendaDeclarada, meta: userSetting.metaPoupanca, fora: userSetting.gastoForaCartao })
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .limit(1),
  ]);

  const { faturas, nomesCartao } = montarFaturas(linhas);
  const { faturas: recorte, obraPorMes } = f.obra ? separarObra(faturas) : { faturas, obraPorMes: {} };
  const apelidos: Record<string, string> = {};
  for (const r of rotulos) if (r.apelido) apelidos[r.descNorm] = r.apelido;

  return {
    ctx: { faturas: recorte, apelidos, mesFiltro: f.mes, nomesCartao, ...configDoUsuario(config[0]) },
    obraPorMes,
  };
}
