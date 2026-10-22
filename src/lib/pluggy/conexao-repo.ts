import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { nomeDaConta, rotuloDaConta } from '@/lib/txn-repo';
import { db } from '@/db';
import { account, connection, connectionStatus, institution } from '@/db/schema';
import { pluggy } from './cliente';
import { conexoesOrfas } from './estado';
import { casarConta, contaDoPluggy, corDoConector, escolherInstituicao, statusDoItem, type ContaPluggy, type ItemPluggy, type StatusConexao } from './mapear';

export type CartaoConectado = { id: string; nome: string };

/**
 * Grava instituição, conexão e contas de um item cuja posse já foi conferida
 * no Pluggy. Lê antes e decide com as funções puras. A conexão e as contas vão
 * num `db.batch` só (tudo ou nada); a instituição fica fora — é catálogo
 * compartilhado e gravá-la de novo não muda nada.
 */
export async function gravarConexao(
  userId: string,
  item: ItemPluggy & { connector: NonNullable<ItemPluggy['connector']> },
  contas: ContaPluggy[],
  status: StatusConexao,
): Promise<{ conexaoId: string; cartoes: CartaoConectado[] }> {
  const insts = await db
    .select({ id: institution.id, nome: institution.nome, pluggyConnectorId: institution.pluggyConnectorId })
    .from(institution)
    .orderBy(institution.id);
  const escolha = escolherInstituicao(insts, item.connector);
  let institutionId: number;
  if ('usar' in escolha) {
    institutionId = escolha.usar;
    // casou pelo nome: o conector passa a ser conhecido; o que já existe (conector, cor, logo) não é sobrescrito
    await db
      .update(institution)
      .set({
        pluggyConnectorId: sql`coalesce(${institution.pluggyConnectorId}, ${item.connector.id})`,
        cor: sql`coalesce(${institution.cor}, ${corDoConector(item.connector)})`,
        logoUrl: sql`coalesce(${institution.logoUrl}, ${item.connector.imageUrl ?? null})`,
      })
      .where(eq(institution.id, institutionId));
  } else {
    const [nova] = await db
      .insert(institution)
      .values(escolha.criar)
      // outro usuário pode ter criado a mesma no meio-tempo: a linha é compartilhada,
      // então nada muda nela; o update no-op só existe para o `returning` devolver o id
      .onConflictDoUpdate({ target: institution.slug, set: { slug: sql`excluded.slug` } })
      .returning({ id: institution.id });
    institutionId = nova!.id;
  }

  // o batch não deixa reagir a um `returning` vazio no meio: a posse é conferida antes
  const [dona] = await db.select({ userId: connection.userId }).from(connection).where(eq(connection.pluggyItemId, item.id)).limit(1);
  if (dona && dona.userId !== userId) throw new Error('conexao_de_outro_usuario');

  const ultimoErro = status === 'erro' ? (item.error?.message ?? null) : null;
  const saudeConector = item.connector.health?.status ?? null;
  const consentExpiraEm = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;
  const upsertConexao = db
    .insert(connection)
    .values({ userId, institutionId, pluggyItemId: item.id, status, ultimoErro, saudeConector, consentExpiraEm })
    .onConflictDoUpdate({
      target: connection.pluggyItemId,
      set: { status, ultimoErro, saudeConector, consentExpiraEm },
      // item de outro usuário nunca é tocado (a posse já foi conferida, isto é mais uma trava)
      setWhere: eq(connection.userId, userId),
    })
    .returning({ id: connection.id });
  // a conexão existente mantém o id antigo, que só se conhece dentro da transação
  const conexaoId = sql`(select id from connection where pluggy_item_id = ${item.id} and user_id = ${userId})`;

  const existentes = await db
    .select({ id: account.id, kind: account.kind, last4: account.last4, pluggyAccountId: account.pluggyAccountId })
    .from(account)
    .where(eq(account.userId, userId));

  const comandos: unknown[] = [upsertConexao];
  for (const bruta of contas) {
    const c = contaDoPluggy(bruta);
    const decisao = casarConta(existentes, c);
    const limite = c.limite === null ? null : c.limite.toFixed(2);
    // saldo só de conta corrente/poupança, para a fatia 6; do cartão o Pluggy manda a fatura em aberto, não saldo
    const saldo = c.kind !== 'cartao_credito' && typeof bruta.balance === 'number' ? { saldo: bruta.balance.toFixed(2), saldoEm: new Date() } : {};
    if ('usar' in decisao) {
      comandos.push(
        db
          .update(account)
          .set({
            pluggyAccountId: c.pluggyAccountId,
            connectionId: conexaoId,
            limite,
            ...saldo,
            // a conta ligada antes da 6.0 ficou sem nome (era "MeuPluggy conta"); o cartão mantém o que tem
            ...(c.kind !== 'cartao_credito' && c.nomeOrigem ? { nomeOrigem: c.nomeOrigem } : {}),
          })
          .where(and(eq(account.id, decisao.usar), eq(account.userId, userId))),
      );
    } else {
      comandos.push(
        db
          .insert(account)
          .values({
            userId,
            connectionId: conexaoId,
            institutionId,
            kind: c.kind,
            pluggyAccountId: c.pluggyAccountId,
            last4: c.last4,
            // na conta, `contaDoPluggy` já trocou o `name` (que pode ser o titular) pelo banco do código COMPE
            nomeOrigem: c.nomeOrigem,
            limite,
            ...saldo,
          })
          // duas poupanças sem número no mesmo banco caem na mesma `account_chave`
          // (e dois cartões do item com o mesmo last4): a segunda fica de fora em vez de derrubar o batch
          .onConflictDoNothing(),
      );
    }
  }
  const [linhas] = (await db.batch(comandos as unknown as Parameters<typeof db.batch>[0])) as unknown as [{ id: string }[]];
  const con = linhas[0];
  if (!con) throw new Error('conexao_de_outro_usuario');

  return { conexaoId: con.id, cartoes: await cartoesDaConexao(userId, con.id) };
}

// o banco aceita estados que o app ainda não grava (consentimento expirado, desconectada — 4.1c)
export type EstadoConexao = (typeof connectionStatus.enumValues)[number];

export type ConexaoListada = {
  id: string;
  banco: string;
  conectorId: number | null;
  logoUrl: string | null;
  cor: string | null;
  status: EstadoConexao;
  saudeConector: string | null;
  consentExpiraEm: Date | null;
  ultimoSyncEm: Date | null;
  ultimoErro: string | null;
  cartoes: string[];
};

/**
 * Uma consulta para as conexões e uma para as contas de todas elas (não uma
 * por conexão) — o mapa de cartões é montado no código.
 *
 * Em `cache`: o layout lê para a faixa do topo e a tela de Conexões lê de
 * novo na mesma requisição; assim é uma ida ao banco, não duas.
 */
export const listarConexoes = cache(async function listarConexoes(userId: string): Promise<ConexaoListada[]> {
  const conexoes = await db
    .select({
      id: connection.id,
      banco: institution.nome,
      conectorId: institution.pluggyConnectorId,
      logoUrl: institution.logoUrl,
      cor: institution.cor,
      status: connection.status,
      saudeConector: connection.saudeConector,
      consentExpiraEm: connection.consentExpiraEm,
      ultimoSyncEm: connection.ultimoSyncEm,
      ultimoErro: connection.ultimoErro,
    })
    .from(connection)
    .innerJoin(institution, eq(institution.id, connection.institutionId))
    .where(and(eq(connection.userId, userId), ne(connection.status, 'desconectada')))
    .orderBy(asc(institution.nome), desc(connection.criadoEm));
  if (!conexoes.length) return [];

  const ids = conexoes.map((c) => c.id);
  const cartoes = await db
    .select({ connectionId: account.connectionId, apelido: account.apelido, last4: account.last4, banco: nomeDaConta })
    .from(account)
    .innerJoin(institution, eq(institution.id, account.institutionId))
    .where(and(eq(account.userId, userId), inArray(account.connectionId, ids), eq(account.kind, 'cartao_credito')));
  const porConexao = new Map<string, string[]>();
  for (const c of cartoes) {
    const lista = porConexao.get(c.connectionId!) ?? [];
    lista.push((c.apelido || c.banco) + (c.last4 ? ` ••${c.last4}` : ''));
    porConexao.set(c.connectionId!, lista);
  }
  return conexoes.map((c) => ({ ...c, cartoes: porConexao.get(c.id) ?? [] }));
});

/** O item do Pluggy de uma conexão do usuário — `itemId` nunca vem do cliente. */
export async function itemDaConexao(userId: string, conexaoId: string) {
  const [c] = await db
    .select({ id: connection.id, pluggyItemId: connection.pluggyItemId, ultimoSyncEm: connection.ultimoSyncEm, status: connection.status })
    .from(connection)
    .where(and(eq(connection.id, conexaoId), eq(connection.userId, userId), ne(connection.status, 'desconectada')))
    .limit(1);
  return c ?? null;
}

/** Grava o que o Pluggy disse do item: estado, saúde do conector, prazo do consentimento e erro. */
export async function registrarItem(userId: string, conexaoId: string, item: ItemPluggy): Promise<EstadoConexao> {
  // status reais do Pluggy no fim de uma sincronização: LOGIN_ERROR, OUTDATED,
  // WAITING_USER_INPUT ou UPDATED — statusDoItem já devolve 'erro' para qualquer
  // status fora dos que conhece, OUTDATED incluso; chamada direta, sem ramo redundante
  const status: EstadoConexao = statusDoItem(item.status);
  await db
    .update(connection)
    .set({
      status,
      saudeConector: item.connector?.health?.status ?? null,
      consentExpiraEm: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
      ultimoErro: status === 'ativa' || status === 'atualizando' ? null : (item.error?.message ?? null),
    })
    .where(and(eq(connection.id, conexaoId), eq(connection.userId, userId)));
  return status;
}

/**
 * Desconecta as conexões que ficaram sem conta. A revogação no Pluggy é melhor
 * esforço (falha vai ao log); a marcação local acontece de qualquer jeito, senão
 * a sobra continuaria na tela.
 */
export async function limparOrfas(userId: string, atual: string) {
  const conexoes = await db.select({ id: connection.id, status: connection.status, itemId: connection.pluggyItemId }).from(connection).where(eq(connection.userId, userId));
  const comConta = await db
    .selectDistinct({ id: account.connectionId })
    .from(account)
    .where(and(eq(account.userId, userId), isNotNull(account.connectionId)));
  const orfas = conexoesOrfas(conexoes, comConta.map((c) => c.id!).filter(Boolean), atual);
  for (const id of orfas) {
    const itemId = conexoes.find((c) => c.id === id)!.itemId;
    try {
      await pluggy().apagarItem(itemId);
    } catch (e) {
      console.error('[orfas]', e);
    }
  }
  if (orfas.length) {
    await db.update(connection).set({ status: 'desconectada' }).where(and(inArray(connection.id, orfas), eq(connection.userId, userId)));
  }
}

/** Revoga no Pluggy e para de sincronizar; os lançamentos ficam (guia, "Conexões"). */
export async function desconectar(userId: string, conexaoId: string): Promise<boolean> {
  const c = await itemDaConexao(userId, conexaoId);
  if (!c) return false;
  await pluggy().apagarItem(c.pluggyItemId);
  await db.batch([
    db.update(connection).set({ status: 'desconectada' }).where(and(eq(connection.id, c.id), eq(connection.userId, userId))),
    // o pluggy_account_id fica: um "Conectar banco" futuro religa o mesmo cartão
    db.update(account).set({ connectionId: null }).where(and(eq(account.connectionId, c.id), eq(account.userId, userId))),
  ]);
  return true;
}

/**
 * Cartões e contas correntes de uma conexão, com o rótulo da tela. É a lista
 * que o "atualizar agora", a carga inicial e o cron percorrem.
 */
export async function cartoesDaConexao(userId: string, conexaoId: string): Promise<CartaoConectado[]> {
  const gravados = await db
    .select({ id: account.id, apelido: account.apelido, last4: account.last4, banco: rotuloDaConta })
    .from(account)
    .innerJoin(institution, eq(institution.id, account.institutionId))
    .where(
      and(
        eq(account.userId, userId),
        eq(account.connectionId, conexaoId),
        inArray(account.kind, ['cartao_credito', 'conta_corrente']),
      ),
    );
  return gravados.map((g) => ({ id: g.id, nome: (g.apelido || g.banco) + (g.last4 ? ` ••${g.last4}` : '') }));
}
