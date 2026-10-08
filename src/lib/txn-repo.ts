import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';
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
import { chaveAprendizado, lerParcela, normalizarDescricao } from './descricao';
import { chaveDedupe, comOrdinais } from './dedupe';
import { candidatosDoSuspeito, type Decisao, type LinhaDup } from './duplicados';
import { mesPorExtenso } from './filtro';
import { categoriaHerdada, chaveDoNome } from './nome-na-tela';
import { planoDaParcela, tipoDoTxn } from './importacao';
import type { LancLimpo } from './extracao';

// espelho de `chaveDoNome(nomeNaTela(l))` (src/lib/nome-na-tela.ts): o nome que
// a lista mostra, sem maiúscula nem espaço sobrando. `nullif` repete o `||` da tela
const chaveDoNomeSql = sql`lower(regexp_replace(btrim(coalesce(nullif(${txn.apelido}, ''), nullif(${txn.descLimpa}, ''), ${txn.descOrigem})), '\\s+', ' ', 'g'))`;

/**
 * Tudo que lê ou escreve lançamento passa por aqui, e TODA consulta carrega o
 * `user_id` da sessão dentro do `where` — nunca num `if` depois do select. É a
 * diferença entre "o app confere a posse" e "o banco não devolve o que não é
 * seu".
 */

/**
 * O mês de um lançamento é o da FATURA, não o da compra: é assim que o app
 * antigo agrupava e é o que você paga. Sem fatura (conta corrente, fatia 6), vale
 * o mês da data. Toda consulta por mês usa esta expressão, senão painel e lista
 * dão números diferentes para o mesmo mês.
 */
export const mesDaTxn = sql<string>`to_char(coalesce(${statement.mesRef}, date_trunc('month', ${txn.data})::date), 'YYYY-MM')`;

export type FiltroTxn = {
  mes?: string | null; // 'YYYY-MM'; null = todos
  accountIds?: string[];
  categoria?: string | null;
  busca?: string | null;
  /** nome na tela de um estabelecimento: só os dele, pela mesma chave da 3.8 */
  nome?: string | null;
  limite?: number;
};

/**
 * Nome do cartão na tela quando não há apelido. O `nome_origem` vem da fatura em
 * PDF (o banco) ou do Pluggy (o produto, "Itau Uniclass Visa Infinite"); a
 * instituição sozinha não serve: pelo agregador MeuPluggy ela é "MeuPluggy".
 */
export const nomeDaConta = sql<string>`coalesce(${account.nomeOrigem}, ${institution.nome})`;

// "Itaú conta" e "Itaú" (cartão) não podem aparecer iguais no filtro, no Hero e na lista
export const rotuloDaConta = sql<string>`${nomeDaConta} || case when ${account.kind} = 'conta_corrente' then ' conta' else '' end`;

export async function listarTxn(userId: string, f: FiltroTxn = {}) {
  // pagamento de fatura só quita o que já está na lista: mostrá-lo somaria o gasto duas vezes
  const cond = [eq(txn.userId, userId), isNull(txn.excluidoEm), eq(txn.suspeitoDuplicado, false), ne(txn.tipo, 'pagamento')];

  if (f.mes) cond.push(sql`${mesDaTxn} = ${f.mes}`);
  // os ids vêm do cliente; o join da conta abaixo confirma a posse
  if (f.accountIds?.length) cond.push(inArray(txn.accountId, f.accountIds));
  if (f.categoria) cond.push(eq(category.nome, f.categoria));
  if (f.busca) {
    const alvo = `%${normalizarDescricao(f.busca)}%`;
    // o nome limpo é o que aparece na tela: quem busca pelo que vê precisa achar.
    // `%` e `_` do termo são texto, não curinga ("50%" não pode casar com tudo)
    const termo = f.busca.trim().replace(/[\\%_]/g, '\\$&');
    cond.push(or(sql`${txn.descNorm} like ${alvo}`, ilike(txn.descLimpa, `%${termo}%`))!);
  }
  if (f.nome) cond.push(sql`${chaveDoNomeSql} = ${chaveDoNome(f.nome)}`);

  return db
    .select({
      id: txn.id,
      data: txn.data,
      mes: mesDaTxn,
      valor: txn.valor,
      descOrigem: txn.descOrigem,
      descNorm: txn.descNorm,
      descLimpa: txn.descLimpa,
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
      contaBanco: nomeDaConta,
    })
    .from(txn)
    .leftJoin(statement, and(eq(statement.id, txn.statementId), eq(statement.accountId, txn.accountId)))
    .leftJoin(category, eq(category.id, txn.categoryId))
    .innerJoin(account, and(eq(account.id, txn.accountId), eq(account.userId, userId)))
    .innerJoin(institution, eq(institution.id, account.institutionId))
    .leftJoin(installmentPlan, and(eq(installmentPlan.id, txn.installmentId), eq(installmentPlan.accountId, txn.accountId)))
    .where(and(...cond))
    .orderBy(desc(txn.data), asc(txn.descNorm))
    .limit(Math.min(f.limite ?? 500, 2000));
}

export type OpcoesFiltro = {
  meses: string[]; // mais recente primeiro
  cartoes: { id: string; nome: string }[];
};

/**
 * O que o filtro global pode oferecer: meses com dado e os seus cartões.
 * `cache` porque o layout e a página pedem as mesmas opções na mesma requisição.
 */
export const opcoesDoFiltro = cache(async (userId: string): Promise<OpcoesFiltro> => {
  const meses = await db
    .selectDistinct({ mes: mesDaTxn })
    .from(txn)
    .innerJoin(account, and(eq(account.id, txn.accountId), eq(account.userId, userId)))
    .leftJoin(statement, and(eq(statement.id, txn.statementId), eq(statement.accountId, txn.accountId)))
    // suspeito fica fora dos totais; um mês só de suspeitos apareceria vazio
    .where(and(eq(txn.userId, userId), isNull(txn.excluidoEm), eq(txn.suspeitoDuplicado, false)))
    .orderBy(desc(mesDaTxn));

  const contas = await db
    .select({ id: account.id, apelido: account.apelido, last4: account.last4, banco: nomeDaConta })
    .from(account)
    .innerJoin(institution, eq(institution.id, account.institutionId))
    // conta corrente e poupança do Pluggy esperam a fatia 6: o filtro é de cartões
    .where(and(eq(account.userId, userId), eq(account.ativo, true), eq(account.kind, 'cartao_credito')))
    .orderBy(asc(nomeDaConta), asc(account.last4));

  return {
    meses: meses.map((m) => m.mes),
    // apelido manda; sem ele, "Banco ••4471" — o `nomeCartao` do app antigo
    cartoes: contas.map((c) => ({
      id: c.id,
      nome: (c.apelido || c.banco || 'Cartão') + (c.last4 ? ` ••${c.last4}` : ''),
    })),
  };
});

export type Alteracao = {
  valor?: number;
  categoria?: string | null;
  apelido?: string | null;
  data?: string;
};

/**
 * Edita um lançamento. A posse vai no `where`: id errado e id de outro dono dão
 * o mesmo resultado — nada alterado — e nenhum dos dois conta qual foi o caso.
 * Mudar a categoria leva junto os de mesmo nome na tela; `outros` diz quantos.
 */
export async function atualizarTxn(userId: string, id: string, mudanca: Alteracao) {
  const campos: Record<string, unknown> = {};
  if (mudanca.valor !== undefined) campos.valor = mudanca.valor.toFixed(2);
  if (mudanca.data !== undefined) campos.data = mudanca.data;
  if (mudanca.apelido !== undefined) campos.apelido = mudanca.apelido || null;

  let categoryId: number | null = null;
  if (mudanca.categoria !== undefined) {
    categoryId = mudanca.categoria ? await idDaCategoria(mudanca.categoria) : null;
    campos.categoryId = categoryId;
    campos.categoryFonte = 'manual'; // correção sua nunca é desfeita pela IA nem pelo sync
  }
  if (Object.keys(campos).length === 0) return { linha: null, outros: 0 };

  const alterar = db
    .update(txn)
    .set(campos)
    .where(and(eq(txn.id, id), eq(txn.userId, userId), isNull(txn.excluidoEm)))
    .returning({ id: txn.id, descNorm: txn.descNorm, categoryId: txn.categoryId, apelido: txn.apelido });

  // nessa ordem, no mesmo batch: o segundo lê o nome já com o apelido novo, se o
  // mesmo PATCH mudou o apelido, e ou muda tudo ou nada
  const [alteradas, outros] =
    mudanca.categoria !== undefined
      ? await db.batch([alterar, mesmaCategoriaPeloNome(userId, [id], categoryId)])
      : [await alterar, []];
  const linha = alteradas[0];
  if (!linha) return { linha: null, outros: 0 };

  // só categoria e apelido ensinam regra; corrigir o valor não pode virar
  // learned_label, senão um valor mal lido na próxima fatura reaprenderia o
  // palpite errado da IA como se fosse decisão sua
  if (mudanca.categoria !== undefined || mudanca.apelido !== undefined) {
    await aprender(userId, linha.descNorm, linha.categoryId, linha.apelido);
  }
  // a regra aprendida segue para o alterado (como hoje) e para as variações do
  // nome que mudaram junto, para as próximas importações também acertarem
  for (const chave of new Set(outros.map((o) => o.descNorm))) await aprender(userId, chave, linha.categoryId, undefined);
  return { linha, outros: outros.length };
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
  if (ids.length === 0) return { linhas: [], outros: 0 };
  const categoryId = await idDaCategoria(categoria);

  const [linhas, outros] = await db.batch([
    db
      .update(txn)
      .set({ categoryId, categoryFonte: 'manual' })
      .where(and(inArray(txn.id, ids), eq(txn.userId, userId), isNull(txn.excluidoEm)))
      .returning({ id: txn.id, descNorm: txn.descNorm }),
    mesmaCategoriaPeloNome(userId, ids, categoryId),
  ]);

  for (const chave of new Set([...linhas, ...outros].map((l) => l.descNorm))) await aprender(userId, chave, categoryId, undefined);
  return { linhas, outros: outros.length };
}

/**
 * Leva a categoria a todos os lançamentos com o mesmo nome na tela de algum dos
 * `ids` (pedido do dono, 3.8): trocar "Alane Ferreira" num mês troca nos outros.
 * Pagamento de fatura e excluído ficam fora. Devolve o update para ir no mesmo
 * batch do alterado — ou muda tudo, ou nada.
 */
function mesmaCategoriaPeloNome(userId: string, ids: string[], categoryId: number | null) {
  // excluído fora também aqui: o update do alterado não o toca (a rota responde
  // 404), e o nome dele não pode mudar os outros por trás
  const nomes = db
    .select({ chave: chaveDoNomeSql })
    .from(txn)
    .where(and(inArray(txn.id, ids), eq(txn.userId, userId), isNull(txn.excluidoEm)));
  return db
    .update(txn)
    .set({ categoryId, categoryFonte: 'manual' })
    .where(
      and(
        eq(txn.userId, userId),
        isNull(txn.excluidoEm),
        ne(txn.tipo, 'pagamento'),
        notInArray(txn.id, ids),
        sql`${chaveDoNomeSql} in ${nomes}`,
      ),
    )
    .returning({ id: txn.id, descNorm: txn.descNorm });
}

/**
 * Total de um estabelecimento em todos os meses, nos cartões do filtro. Em SQL e
 * não somando a lista: ela tem limite, e o total de anos de compras passaria dele.
 * As exclusões são as de `listarTxn`, senão os dois números não conversam.
 */
export async function totalDoNome(userId: string, nome: string, accountIds?: string[]): Promise<number> {
  const cond = [
    eq(txn.userId, userId),
    isNull(txn.excluidoEm),
    eq(txn.suspeitoDuplicado, false),
    ne(txn.tipo, 'pagamento'),
    sql`${chaveDoNomeSql} = ${chaveDoNome(nome)}`,
  ];
  if (accountIds?.length) cond.push(inArray(txn.accountId, accountIds));
  const [linha] = await db
    .select({ total: sql<string | null>`sum(${txn.valor})` })
    .from(txn)
    // os ids dos cartões vêm do cliente: o join confirma a posse, como na lista
    .innerJoin(account, and(eq(account.id, txn.accountId), eq(account.userId, userId)))
    .where(and(...cond));
  return Number(linha?.total ?? 0);
}

const nomeNaTelaSql = sql<string>`btrim(coalesce(nullif(${txn.apelido}, ''), nullif(${txn.descLimpa}, ''), ${txn.descOrigem}))`;

/**
 * Os nomes que o datalist do Renomear oferece: um por chave (a grafia é a
 * menor, só para ser estável), em ordem alfabética.
 */
export async function nomesNaTela(userId: string): Promise<string[]> {
  const linhas = await db
    .select({ nome: sql<string>`min(${nomeNaTelaSql})` })
    .from(txn)
    .where(and(eq(txn.userId, userId), isNull(txn.excluidoEm), ne(txn.tipo, 'pagamento')))
    .groupBy(chaveDoNomeSql)
    .orderBy(chaveDoNomeSql)
    .limit(3000);
  return linhas.map((l) => l.nome);
}

/**
 * Renomeia todos os lançamentos de nome `de` para `para` (todos os meses). Se
 * `para` já existe, os renomeados herdam a categoria dele: juntar dois nomes que
 * são o mesmo lugar não pode deixar o grupo com duas categorias. A categoria
 * herdada é decisão sua (`manual`), e a regra aprendida leva nome e categoria às
 * próximas importações.
 */
export async function renomearEstabelecimento(userId: string, de: string, para: string) {
  const chaveDe = chaveDoNome(de);
  const base = [eq(txn.userId, userId), isNull(txn.excluidoEm), ne(txn.tipo, 'pagamento')];

  const contagens = await db
    .select({
      categoryId: category.id,
      nome: category.nome,
      n: sql<number>`count(*)::int`,
      ultima: sql<string>`max(${txn.data})::text`,
    })
    .from(txn)
    .innerJoin(category, eq(category.id, txn.categoryId))
    .where(and(...base, sql`${chaveDoNomeSql} = ${chaveDoNome(para)}`, sql`${chaveDoNomeSql} <> ${chaveDe}`))
    .groupBy(category.id, category.nome);

  const herdada = categoriaHerdada(contagens);
  const nomeHerdada = contagens.find((c) => c.categoryId === herdada)?.nome ?? null;

  const linhas = await db
    .update(txn)
    .set(herdada === null ? { apelido: para } : { apelido: para, categoryId: herdada, categoryFonte: 'manual' })
    .where(and(...base, sql`${chaveDoNomeSql} = ${chaveDe}`))
    .returning({ id: txn.id, descNorm: txn.descNorm });

  for (const chave of new Set(linhas.map((l) => l.descNorm))) await aprender(userId, chave, herdada, para);
  return { renomeados: linhas.length, categoria: nomeHerdada };
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
    .select({ descNorm: learnedLabel.descNorm, categoryId: learnedLabel.categoryId, apelido: learnedLabel.apelido, papel: learnedLabel.papel })
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

/** Reaproveita o plano da mesma compra parcelada vista em outra fatura. */
export async function planoDeParcela(
  accountId: string,
  descNorm: string,
  mesRef: string,
  parcela: { n: number; total: number },
  valor: number,
): Promise<string> {
  const p = planoDaParcela(mesRef, parcela, valor);
  const [linha] = await db
    .insert(installmentPlan)
    .values({ accountId, descNorm, ...p })
    .onConflictDoUpdate({
      target: [
        installmentPlan.accountId,
        installmentPlan.descNorm,
        installmentPlan.totalParcelas,
        installmentPlan.valorParcela,
        installmentPlan.primeiraRef,
      ],
      // o conflito precisa de um SET para o RETURNING devolver o id; de quebra reativa o plano
      set: { ativo: true },
    })
    .returning({ id: installmentPlan.id });
  if (!linha) throw new Error('nao_foi_possivel_gravar_parcela');
  return linha.id;
}

/**
 * Grava os lançamentos lidos de um PDF.
 *
 * A chave natural é a mesma que o Open Finance vai calcular na fatia 4, então o
 * mesmo gasto vindo das duas fontes colide aqui em vez de duplicar.
 *
 * Reimportar a mesma fatura corrige tipo e parcela (foi assim que a fatia 3
 * consertou o que a fatia 2 gravou errado), mas nunca toca no que é seu:
 * apelido, categoria, e o que você excluiu continua excluído. Linha que veio
 * da API (fatia 4) também não é tocada — o PDF cede lugar a ela. E linha igual
 * à que já está gravada não é reescrita: reimportar a fatura certa não conta
 * nada como corrigido.
 */
export async function importarDoPdf(
  userId: string,
  accountId: string,
  statementId: string,
  mesRef: string,
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
    const tipo = tipoDoTxn(p.original.tipo, parcela);
    // encargo também parcela (parcelamento de fatura, anuidade): sem o plano, o
    // compromisso dos meses seguintes some da conta. Estorno não compromete nada.
    const installmentId =
      parcela && p.valor > 0
        ? await planoDeParcela(accountId, p.descNorm, mesRef, parcela, p.valor)
        : null;

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
        tipo,
        installmentId,
        parcelaN: parcela?.n ?? null,
        fonte: 'pdf',
        dedupeKey: chaveDedupe(accountId, p.data, p.valor, p.descNorm, p.ordinal),
      })
      .onConflictDoUpdate({
        target: [txn.userId, txn.dedupeKey],
        set: { tipo, installmentId, parcelaN: parcela?.n ?? null, statementId },
        // só reescreve linha de PDF que ainda existe e que de fato mudou: reimportar
        // uma fatura certa não conta nada como "corrigido", e o que veio da API
        // (fatia 4) nunca é sobrescrito pela leitura do PDF
        setWhere: and(
          isNull(txn.excluidoEm),
          eq(txn.fonte, 'pdf'),
          sql`(${txn.tipo}, ${txn.installmentId}, ${txn.parcelaN}, ${txn.statementId})
              is distinct from (excluded.tipo, excluded.installment_id, excluded.parcela_n, excluded.statement_id)`,
        ),
      })
      // xmax = 0 só na linha recém-inserida: é como separar novo de atualizado
      .returning({ novo: sql<boolean>`(xmax = 0)` });

    if (!linha) duplicados++;
    else if (linha.novo) novos++;
    else atualizados++;
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
      // fatura em PDF já fechou: a 'aberta' que o sync criou para este mês deixa de ser
      set: { vencimento: vencimento || null, totalInformado: total ? total.toFixed(2) : null, status: 'fechada' },
    })
    .returning({ id: statement.id });
  if (!linha) throw new Error('nao_foi_possivel_criar_fatura');
  return linha.id;
}

/**
 * O mês do PDF já vem pelo Open Finance? Cartão ligado ao Pluggy com fatura do
 * Pluggy naquele mês, ou com lançamento do Pluggy apontando para a fatura daquele
 * mês (a fatura aberta da 4.2a não tem pluggy_bill_id). Importar o PDF por cima
 * duplicaria quase tudo: a descrição que a IA tira do PDF raramente bate com a
 * do banco.
 *
 * Só a fatura diz o mês, nunca a data da compra: o Pluggy traz parcela de compra
 * antiga sem fatura, e pelo mês da data ela bloquearia o PDF daquele mês antigo,
 * que o Open Finance não cobre.
 */
export async function mesCoberto(userId: string, last4: string, mesRef: string): Promise<boolean> {
  const [conta] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.kind, 'cartao_credito'), eq(account.last4, last4), eq(account.ativo, true), isNotNull(account.pluggyAccountId)))
    // com dois cartões de mesmo final, a resposta não pode mudar de uma chamada para outra
    .orderBy(asc(account.id))
    .limit(1);
  if (!conta) return false;
  const [fatura] = await db
    .select({ id: statement.id })
    .from(statement)
    .where(and(eq(statement.accountId, conta.id), eq(statement.mesRef, `${mesRef}-01`), isNotNull(statement.pluggyBillId)))
    .limit(1);
  if (fatura) return true;
  const [lanc] = await db
    .select({ id: txn.id })
    .from(txn)
    .innerJoin(statement, and(eq(statement.id, txn.statementId), eq(statement.accountId, txn.accountId), eq(statement.mesRef, `${mesRef}-01`)))
    .where(and(eq(txn.userId, userId), eq(txn.accountId, conta.id), eq(txn.fonte, 'pluggy'), isNull(txn.excluidoEm)))
    .limit(1);
  return Boolean(lanc);
}

export const fraseMesCoberto = (mesRef: string, last4: string) =>
  `${mesPorExtenso(mesRef)} do cartão ••${last4} já vem pelo Open Finance. Para conferir, use Lançamentos — importar o PDF duplicaria as compras.`;

// ---------------------------------------------------------------------------
// Possíveis duplicados

export type SuspeitoListado = {
  id: string;
  data: string;
  valor: number;
  nome: string;
  cartao: string;
  candidatos: { id: string; data: string; valor: number; nome: string }[];
};

const nomeDoTxn = sql<string>`coalesce(${txn.apelido}, ${txn.descLimpa}, ${txn.descOrigem})`;
// o de sync-repo não é exportado, e sync-repo importa daqui
const somaDias = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

/** Suspeitos do recorte com os candidatos do PDF; uma leitura só para os candidatos de todos. */
export async function listarSuspeitos(userId: string, f: { mes?: string | null; accountIds?: string[] }): Promise<SuspeitoListado[]> {
  const cond = [eq(txn.userId, userId), eq(txn.suspeitoDuplicado, true), isNull(txn.excluidoEm)];
  if (f.mes) cond.push(sql`${mesDaTxn} = ${f.mes}`);
  // os ids vêm do cliente; o join da conta abaixo confirma a posse
  if (f.accountIds?.length) cond.push(inArray(txn.accountId, f.accountIds));
  const suspeitos = await db
    .select({ id: txn.id, accountId: txn.accountId, data: txn.data, valor: txn.valor, nome: nomeDoTxn, cartao: nomeDaConta, contaApelido: account.apelido, last4: account.last4 })
    .from(txn)
    .innerJoin(account, and(eq(account.id, txn.accountId), eq(account.userId, userId)))
    .innerJoin(institution, eq(institution.id, account.institutionId))
    .leftJoin(statement, and(eq(statement.id, txn.statementId), eq(statement.accountId, txn.accountId)))
    .where(and(...cond))
    .orderBy(asc(txn.data));
  if (!suspeitos.length) return [];

  const contas = [...new Set(suspeitos.map((s) => s.accountId))];
  const datas = suspeitos.map((s) => s.data).sort();
  const de = somaDias(datas[0]!, -3);
  const ate = somaDias(datas.at(-1)!, 3);
  const pdfs = await db
    .select({ id: txn.id, accountId: txn.accountId, data: txn.data, valor: txn.valor, nome: nomeDoTxn, duplicadoDe: txn.duplicadoDe })
    .from(txn)
    .where(and(eq(txn.userId, userId), inArray(txn.accountId, contas), eq(txn.fonte, 'pdf'), isNull(txn.excluidoEm), gte(txn.data, de), lte(txn.data, ate)));
  const comoDup = (l: { id: string; accountId: string; data: string; valor: string; duplicadoDe?: string | null }, fonte: LinhaDup['fonte']): LinhaDup => ({ id: l.id, accountId: l.accountId, data: l.data, valor: Number(l.valor), fonte, excluido: false, duplicadoDe: l.duplicadoDe ?? null });
  const nomePdf = new Map(pdfs.map((p) => [p.id, p.nome]));

  return suspeitos.map((s) => ({
    id: s.id,
    data: s.data,
    valor: Number(s.valor),
    nome: s.nome,
    // como no filtro: apelido manda; sem ele, "Banco ••4471"
    cartao: s.contaApelido || s.cartao + (s.last4 ? ` ••${s.last4}` : ''),
    candidatos: candidatosDoSuspeito(comoDup(s, 'pluggy'), pdfs.map((p) => comoDup(p, 'pdf'))).map((c) => ({ id: c.id, data: c.data, valor: c.valor, nome: nomePdf.get(c.id) ?? '' })),
  }));
}

/**
 * A decisão sobre um suspeito. O candidato é relido e revalidado aqui — nunca
 * vale só porque veio da tela —, e o estado (suspeito ainda em aberto, PDF ainda
 * livre) é conferido no próprio `update`: duas abas decidindo ao mesmo tempo não
 * podem excluir dois PDFs pela mesma compra, nem desfazer o que a outra fez.
 */
export async function decidirDuplicado(userId: string, id: string, d: Decisao): Promise<boolean> {
  if (d.decisao === 'diferente') {
    const linhas = await db
      .update(txn)
      .set({ suspeitoDuplicado: false })
      .where(and(eq(txn.id, id), eq(txn.userId, userId), eq(txn.fonte, 'pluggy'), eq(txn.suspeitoDuplicado, true), isNull(txn.excluidoEm)))
      .returning({ id: txn.id });
    return linhas.length > 0;
  }

  const [s] = await db
    .select({ id: txn.id, accountId: txn.accountId, data: txn.data, valor: txn.valor })
    .from(txn)
    .where(and(eq(txn.id, id), eq(txn.userId, userId), eq(txn.fonte, 'pluggy'), isNull(txn.excluidoEm)))
    .limit(1);
  if (!s) return false;
  const [c] = await db
    .select({ id: txn.id, accountId: txn.accountId, data: txn.data, valor: txn.valor })
    .from(txn)
    .where(and(eq(txn.id, d.candidatoId), eq(txn.userId, userId), eq(txn.fonte, 'pdf')))
    .limit(1);
  if (!c) return false;

  // o candidato precisa ser candidato de verdade: mesma conta, mesmo valor e sinal,
  // até 3 dias. Exclusão e vínculo ficam de fora daqui porque o "desfazer" trata
  // justamente do PDF excluído e ligado; o estado é conferido no update abaixo
  const casa =
    candidatosDoSuspeito(
      { id: s.id, accountId: s.accountId, data: s.data, valor: Number(s.valor), fonte: 'pluggy', excluido: false },
      [{ id: c.id, accountId: c.accountId, data: c.data, valor: Number(c.valor), fonte: 'pdf', excluido: false }],
    ).length === 1;
  if (!casa) return false;

  // Um statement só, com as duas linhas travadas antes de mudar qualquer uma: num
  // `with x as (update …) update …` o primeiro update grava mesmo quando o segundo
  // não acha nada, e o suspeito sairia da revisão com o PDF ainda contando. O
  // `for update` relê a linha depois da espera, então a segunda aba vê o estado
  // que a primeira deixou e não muda nada. O candidato só trava depois do
  // suspeito (o `exists`), na mesma ordem em toda decisão
  const r =
    d.decisao === 'mesmo'
      ? await db.execute<{ id: string }>(sql`
          with s as (
            select id, category_fonte from txn
            where id = ${id} and user_id = ${userId} and fonte = 'pluggy'
              and suspeito_duplicado = true and excluido_em is null
            for update
          ),
          c as (
            select id, apelido, category_id, category_fonte from txn
            where id = ${d.candidatoId} and user_id = ${userId} and fonte = 'pdf'
              and excluido_em is null and duplicado_de is null
              and exists (select 1 from s)
            for update
          ),
          suspeito as (
            update txn set
              suspeito_duplicado = false,
              apelido = coalesce(txn.apelido, c.apelido),
              -- o que você corrigiu à mão no PDF vale para a compra do banco, mas
              -- não passa por cima do que você corrigiu nela (regra 7)
              category_id = case when c.category_fonte = 'manual' and s.category_fonte <> 'manual' then c.category_id else txn.category_id end,
              category_fonte = case when c.category_fonte = 'manual' and s.category_fonte <> 'manual' then 'manual' else txn.category_fonte end
            from s, c
            where txn.id = s.id and txn.user_id = ${userId}
            returning txn.id
          ),
          pdf as (
            update txn set excluido_em = now(), duplicado_de = s.id
            from s, c
            where txn.id = c.id and txn.user_id = ${userId}
            returning txn.id
          )
          select id from suspeito`)
      : await db.execute<{ id: string }>(sql`
          with s as (
            select id from txn
            where id = ${id} and user_id = ${userId} and fonte = 'pluggy'
              and suspeito_duplicado = false and excluido_em is null
            for update
          ),
          c as (
            select id from txn
            where id = ${d.candidatoId} and user_id = ${userId} and fonte = 'pdf'
              and duplicado_de = ${id} and excluido_em is not null
              and exists (select 1 from s)
            for update
          ),
          suspeito as (
            update txn set suspeito_duplicado = true
            from s, c
            where txn.id = s.id and txn.user_id = ${userId}
            returning txn.id
          ),
          pdf as (
            update txn set excluido_em = null, duplicado_de = null
            from s, c
            where txn.id = c.id and txn.user_id = ${userId}
            returning txn.id
          )
          select id from suspeito`);
  return r.rows.length > 0;
}
