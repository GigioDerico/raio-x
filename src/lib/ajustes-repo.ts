import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { nomeDaConta } from './txn-repo';
import { db } from '@/db';
import { env } from '@/env';
import { account, institution, statement, userSetting } from '@/db/schema';
import { configDoUsuario } from './calculos/adaptador';
import { tiposDeContaQuePodemMudar, type CartaoAjuste, type MudancaConfig, type MudancaConta } from './ajustes';

import { modelosPadrao, provedorAtivo, validarModeloParaProvedor } from './openrouter';

const colunasConfig = {
  renda: userSetting.rendaDeclarada,
  meta: userSetting.metaPoupanca,
  modeloIa: userSetting.modeloIa,
  tetoIaUsd: userSetting.tetoIaUsd,
};

type LinhaConfig = { renda: string | null; meta: string; modeloIa: string; tetoIaUsd: string | null };

function configCompleta(linha: LinhaConfig | undefined) {
  const padrao = modelosPadrao();
  const prov = provedorAtivo();
  const modeloValido = validarModeloParaProvedor(linha?.modeloIa, prov, padrao);
  return {
    ...configDoUsuario(linha),
    modeloIa: modeloValido,
    tetoIaUsd: linha?.tetoIaUsd == null ? null : Number(linha.tetoIaUsd),
  };
}

export async function lerConfig(userId: string) {
  const [linha] = await db.select(colunasConfig).from(userSetting).where(eq(userSetting.userId, userId)).limit(1);
  return configCompleta(linha);
}

export async function salvarConfig(userId: string, m: MudancaConfig) {
  const campos: Partial<typeof userSetting.$inferInsert> = {};
  if (m.renda !== undefined) campos.rendaDeclarada = m.renda === null ? null : m.renda.toFixed(2);
  if (m.metaPoupanca !== undefined) campos.metaPoupanca = m.metaPoupanca.toFixed(2);
  // vazio volta ao modelo padrão do provedor ativo; a coluna é not null
  if (m.modeloIa !== undefined) {
    const padrao = modelosPadrao();
    const prov = provedorAtivo();
    campos.modeloIa = m.modeloIa ? validarModeloParaProvedor(m.modeloIa, prov, padrao) : padrao.principal;
  }
  if (m.tetoIaUsd !== undefined) campos.tetoIaUsd = m.tetoIaUsd === null ? null : m.tetoIaUsd.toFixed(2);
  const [linha] = await db.update(userSetting).set(campos).where(eq(userSetting.userId, userId)).returning(colunasConfig);
  // a linha nasce no primeiro login (obterOuCriarUsuario); faltar é defeito, não erro do usuário
  if (!linha) throw new Error('user_setting ausente');
  return configCompleta(linha);
}

/**
 * Posse e tipo no `where`: id de outro dono, de conta corrente ou inexistente
 * dão o mesmo `null`, e nenhum dos três conta qual foi o caso.
 */
export async function salvarConta(userId: string, id: string, m: MudancaConta) {
  const [linha] = await db
    .update(account)
    .set(m)
    .where(and(eq(account.id, id), eq(account.userId, userId), inArray(account.kind, tiposDeContaQuePodemMudar(m))))
    .returning({
      id: account.id,
      apelido: account.apelido,
      diaFechamento: account.diaFechamento,
      diaVencimento: account.diaVencimento,
    });
  return linha ?? null;
}

export async function listarCartoes(userId: string): Promise<CartaoAjuste[]> {
  return db
    .select({
      id: account.id,
      banco: nomeDaConta,
      last4: account.last4,
      apelido: account.apelido,
      nomeOrigem: account.nomeOrigem,
      diaFechamento: account.diaFechamento,
      diaVencimento: account.diaVencimento,
      faturas: sql<number>`count(${statement.id})::int`,
      primeiroMes: sql<string | null>`min(${statement.mesRef})::text`,
      ultimoMes: sql<string | null>`max(${statement.mesRef})::text`,
    })
    .from(account)
    .innerJoin(institution, eq(institution.id, account.institutionId))
    .leftJoin(statement, eq(statement.accountId, account.id))
    .where(and(eq(account.userId, userId), eq(account.kind, 'cartao_credito')))
    .groupBy(account.id, institution.nome)
    .orderBy(asc(nomeDaConta), asc(account.last4));
}

export async function listarContasCorrentes(userId: string) {
  return db
    .select({ id: account.id, banco: nomeDaConta, last4: account.last4, apelido: account.apelido })
    .from(account)
    .innerJoin(institution, eq(institution.id, account.institutionId))
    .where(and(eq(account.userId, userId), eq(account.kind, 'conta_corrente'), eq(account.ativo, true)))
    .orderBy(asc(nomeDaConta), asc(account.last4));
}
