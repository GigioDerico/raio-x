import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  account,
  category,
  installmentPlan,
  institution,
  learnedLabel,
  statement,
  txn,
} from '@/db/schema';
import { chaveAprendizado, normalizarDescricao } from './descricao';
import { chaveDedupe, comOrdinais } from './dedupe';
import { lerParcela } from './descricao';
import type { LancLimpo } from './extracao';

/**
 * Tudo que lê ou escreve lançamento passa por aqui, e TODA consulta carrega o
 * `user_id` da sessão dentro do `where` — nunca num `if` depois do select. É a
 * diferença entre "o app confere a posse" e "o banco não devolve o que não é
 * seu".
 */

export type FiltroTxn = {
  mes?: string | null; // 'YYYY-MM'
  accountId?: string | null;
  categoria?: string | null;
  busca?: string | null;
  limite?: number;
};

export async function listarTxn(userId: string, f: FiltroTxn = {}) {
  const cond = [eq(txn.userId, userId), isNull(txn.excluidoEm)];

  if (f.mes) {
    const ini = `${f.mes}-01`;
    const fim = sql<string>`(${ini}::date + interval '1 month' - interval '1 day')::date`;
    cond.push(gte(txn.data, ini));
    cond.push(lte(txn.data, fim as unknown as string));
  }
  if (f.accountId) cond.push(eq(txn.accountId, f.accountId));
  if (f.categoria) cond.push(eq(category.nome, f.categoria));
  if (f.busca) {
    const alvo = `%${normalizarDescricao(f.busca)}%`;
    cond.push(sql`${txn.descNorm} like ${alvo}`);
  }

  return db
    .select({
      id: txn.id,
      data: txn.data,
      valor: txn.valor,
      descOrigem: txn.descOrigem,
      descNorm: txn.descNorm,
      apelido: txn.apelido,
      categoria: category.nome,
      categoryId: txn.categoryId,
      categoryFonte: txn.categoryFonte,
      tipo: txn.tipo,
      parcelaN: txn.parcelaN,
      totalParcelas: installmentPlan.totalParcelas,
      fonte: txn.fonte,
      pendente: txn.pendente,
      contaApelido: account.apelido,
      contaLast4: account.last4,
    })
    .from(txn)
    .leftJoin(category, eq(category.id, txn.categoryId))
    .leftJoin(account, eq(account.id, txn.accountId))
    .leftJoin(installmentPlan, eq(installmentPlan.id, txn.installmentId))
    .where(and(...cond))
    .orderBy(desc(txn.data), asc(txn.descNorm))
    .limit(Math.min(f.limite ?? 500, 2000));
}

export type Alteracao = {
  valor?: number;
  categoria?: string | null;
  apelido?: string | null;
  data?: string;
};

/**
 * Edita um lançamento. A posse vai no `where`: id errado e id de outro dono dão
 * o mesmo resultado — nada alterado — e nenhum dos dois conta qual foi o caso.
 */
export async function atualizarTxn(userId: string, id: string, mudanca: Alteracao) {
  const campos: Record<string, unknown> = {};
  if (mudanca.valor !== undefined) campos.valor = mudanca.valor.toFixed(2);
  if (mudanca.data !== undefined) campos.data = mudanca.data;
  if (mudanca.apelido !== undefined) campos.apelido = mudanca.apelido || null;

  if (mudanca.categoria !== undefined) {
    campos.categoryId = mudanca.categoria ? await idDaCategoria(mudanca.categoria) : null;
    campos.categoryFonte = 'manual'; // correção sua nunca é desfeita pela IA nem pelo sync
  }
  if (Object.keys(campos).length === 0) return null;

  const [linha] = await db
    .update(txn)
    .set(campos)
    .where(and(eq(txn.id, id), eq(txn.userId, userId), isNull(txn.excluidoEm)))
    .returning({ id: txn.id, descNorm: txn.descNorm, categoryId: txn.categoryId, apelido: txn.apelido });

  if (linha) await aprender(userId, linha.descNorm, linha.categoryId, linha.apelido);
  return linha ?? null;
}

/** Exclusão lógica: o sync da madrugada não pode ressuscitar o que você apagou. */
export async function excluirTxn(userId: string, id: string) {
  const [linha] = await db
    .update(txn)
    .set({ excluidoEm: new Date() })
    .where(and(eq(txn.id, id), eq(txn.userId, userId), isNull(txn.excluidoEm)))
    .returning({ id: txn.id });
  return linha ?? null;
}

export async function restaurarTxn(userId: string, id: string) {
  const [linha] = await db
    .update(txn)
    .set({ excluidoEm: null })
    .where(and(eq(txn.id, id), eq(txn.userId, userId)))
    .returning({ id: txn.id });
  return linha ?? null;
}

/** Multi-seleção: uma categoria para vários lançamentos numa transação só. */
export async function categorizarEmLote(userId: string, ids: string[], categoria: string) {
  if (ids.length === 0) return [];
  const categoryId = await idDaCategoria(categoria);

  const linhas = await db
    .update(txn)
    .set({ categoryId, categoryFonte: 'manual' })
    .where(and(inArray(txn.id, ids), eq(txn.userId, userId), isNull(txn.excluidoEm)))
    .returning({ id: txn.id, descNorm: txn.descNorm });

  for (const l of linhas) await aprender(userId, l.descNorm, categoryId, undefined);
  return linhas;
}

/**
 * Grava o que você ensinou. Na próxima importação a regra responde no lugar da
 * IA — é o que faz o custo cair mês a mês em vez de subir.
 */
export async function aprender(
  userId: string,
  descNorm: string,
  categoryId: number | null,
  apelido: string | null | undefined,
) {
  const chave = chaveAprendizado(descNorm);
  if (!chave) return;

  await db
    .insert(learnedLabel)
    .values({ userId, descNorm: chave, categoryId, apelido: apelido ?? null })
    .onConflictDoUpdate({
      target: [learnedLabel.userId, learnedLabel.descNorm],
      set: {
        categoryId: categoryId ?? sql`${learnedLabel.categoryId}`,
        apelido: apelido === undefined ? sql`${learnedLabel.apelido}` : (apelido || null),
        hits: sql`${learnedLabel.hits} + 1`,
        atualizadoEm: new Date(),
      },
    });
}

export async function regrasAprendidas(userId: string) {
  const linhas = await db
    .select({ descNorm: learnedLabel.descNorm, categoryId: learnedLabel.categoryId, apelido: learnedLabel.apelido })
    .from(learnedLabel)
    .where(eq(learnedLabel.userId, userId));
  return new Map(linhas.map((l) => [l.descNorm, l]));
}

const cacheCategorias = new Map<string, number>();

export async function idDaCategoria(nome: string): Promise<number | null> {
  const emCache = cacheCategorias.get(nome);
  if (emCache) return emCache;

  const [linha] = await db.select({ id: category.id }).from(category).where(eq(category.nome, nome)).limit(1);
  if (linha) cacheCategorias.set(nome, linha.id);
  return linha?.id ?? null;
}

// ---------------------------------------------------------------------------
// Importação

export type ResultadoImport = { novos: number; atualizados: number; duplicados: number };

/**
 * Grava os lançamentos lidos de um PDF.
 *
 * A chave natural é a mesma que o Open Finance vai calcular na fatia 4, então o
 * mesmo gasto vindo das duas fontes colide aqui em vez de duplicar. O que veio
 * de PDF cede lugar ao que vier da API; o que você editou à mão fica.
 */
export async function importarDoPdf(
  userId: string,
  accountId: string,
  statementId: string | null,
  lancs: readonly LancLimpo[],
): Promise<ResultadoImport> {
  const regras = await regrasAprendidas(userId);

  const preparados = comOrdinais(
    lancs
      .filter((l) => l.d)
      .map((l) => ({
        data: l.d,
        valor: l.tipo === 'estorno' || l.tipo === 'pagamento' ? -Math.abs(l.val) : l.val,
        descNorm: normalizarDescricao(l.desc),
        original: l,
      })),
  );

  let novos = 0;
  let atualizados = 0;
  let duplicados = 0;

  for (const p of preparados) {
    const regra = regras.get(chaveAprendizado(p.descNorm));
    const categoryId = regra?.categoryId ?? (await idDaCategoria(p.original.cat));
    const parcela = lerParcela(p.original.parc);

    const [linha] = await db
      .insert(txn)
      .values({
        userId,
        accountId,
        statementId,
        data: p.data,
        valor: p.valor.toFixed(2),
        descOrigem: p.original.desc,
        descNorm: p.descNorm,
        apelido: regra?.apelido ?? null,
        categoryId,
        categoryFonte: regra ? 'regra' : 'ia',
        tipo: p.original.tipo === 'encargo' ? 'encargo' : parcela ? 'parcela' : 'escolha',
        parcelaN: parcela?.n ?? null,
        fonte: 'pdf',
        dedupeKey: chaveDedupe(accountId, p.data, p.valor, p.descNorm, p.ordinal),
      })
      .onConflictDoNothing({ target: [txn.userId, txn.dedupeKey] })
      .returning({ id: txn.id });

    if (linha) novos++;
    else duplicados++;
  }

  return { novos, atualizados, duplicados };
}

/** Conta e fatura do PDF: criadas na primeira importação daquele cartão. */
export async function contaDoPdf(
  userId: string,
  institutionId: number,
  last4: string,
  nomeOrigem: string,
): Promise<string> {
  const [existente] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.kind, 'cartao_credito'), eq(account.last4, last4)))
    .limit(1);
  if (existente) return existente.id;

  const [criada] = await db
    .insert(account)
    .values({ userId, institutionId, kind: 'cartao_credito', last4, nomeOrigem })
    .returning({ id: account.id });
  if (!criada) throw new Error('nao_foi_possivel_criar_conta');
  return criada.id;
}

/** Instituição criada sob demanda a partir do nome que veio na fatura. */
export async function instituicaoPorNome(nome: string): Promise<number> {
  const slug =
    normalizarDescricao(nome).toLowerCase().replace(/\s+/g, '-').slice(0, 40) || 'cartao';

  const [existente] = await db
    .select({ id: institution.id })
    .from(institution)
    .where(eq(institution.slug, slug))
    .limit(1);
  if (existente) return existente.id;

  const [criada] = await db
    .insert(institution)
    .values({ slug, nome: nome.slice(0, 40) })
    .onConflictDoNothing({ target: institution.slug })
    .returning({ id: institution.id });
  if (criada) return criada.id;

  const [depois] = await db
    .select({ id: institution.id })
    .from(institution)
    .where(eq(institution.slug, slug))
    .limit(1);
  if (!depois) throw new Error('nao_foi_possivel_criar_instituicao');
  return depois.id;
}

export async function faturaDoPdf(
  accountId: string,
  mesRef: string,
  vencimento: string,
  total: number,
): Promise<string> {
  const [linha] = await db
    .insert(statement)
    .values({
      accountId,
      mesRef: `${mesRef}-01`,
      vencimento: vencimento || null,
      totalInformado: total ? total.toFixed(2) : null,
      status: 'fechada',
    })
    .onConflictDoUpdate({
      target: [statement.accountId, statement.mesRef],
      set: { vencimento: vencimento || null, totalInformado: total ? total.toFixed(2) : null },
    })
    .returning({ id: statement.id });
  if (!linha) throw new Error('nao_foi_possivel_criar_fatura');
  return linha.id;
}
