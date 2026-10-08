import 'server-only';
import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { account, connection } from '@/db/schema';
import { configuracoes } from '@/lib/sessao-servidor';
import { categorizarPendentes } from './categorizar-repo';
import { pluggy } from './cliente';
import { cartoesDaConexao, itemDaConexao, registrarItem, type EstadoConexao } from './conexao-repo';
import { janelaAtualizar, janelaInicial } from './janela';
import { sincronizarConta, type ResultadoSync } from './sync-repo';

/**
 * Um caminho só de sincronização: o botão, o cron e o webhook passam por
 * aqui, para que a regra de janela, categorização e `ultimo_sync_em` não
 * divirja entre eles. `userId` é sempre parâmetro de quem já sabe o dono —
 * a sessão (botão) ou a linha da conexão (cron e webhook) —, nunca o corpo.
 */

export type ResultadoCartao = Omit<ResultadoSync, 'inseridos'> & { categorizados: number; semCategoria: number; nomes: number };

type OpcoesCartao = {
  /**
   * Início da janela "atualizar" já lido por quem chama. `sincronizarConexao`
   * lê uma vez antes do primeiro cartão: o primeiro grava `ultimo_sync_em =
   * now()`, e o segundo, lendo de novo, perderia os meses de atraso.
   */
  ultimoSyncEm?: Date | null;
};

/**
 * Faturas e lançamentos da janela de um cartão do usuário, gravados, com os
 * novos categorizados. Serve ao cartão e à conta corrente (6.0). `null` se a
 * conta não é dele, é de outro tipo ou não veio do Pluggy. Sem chave do Pluggy, `SemChavePluggy` sobe para quem chama.
 */
export async function sincronizarCartao(
  userId: string,
  accountId: string,
  janela: 'inicial' | 'atualizar',
  opcoes: OpcoesCartao = {},
): Promise<ResultadoCartao | null> {
  const [conta] = await db
    .select({ id: account.id, kind: account.kind, pluggyAccountId: account.pluggyAccountId, connectionId: account.connectionId })
    .from(account)
    .where(
      and(
        eq(account.id, accountId),
        eq(account.userId, userId),
        inArray(account.kind, ['cartao_credito', 'conta_corrente']),
        isNotNull(account.pluggyAccountId),
      ),
    )
    .limit(1);
  if (!conta?.pluggyAccountId) return null;
  const kind = conta.kind === 'conta_corrente' ? 'conta_corrente' : 'cartao_credito';

  const agora = new Date();
  let periodo = janelaInicial(agora);
  if (janela === 'atualizar') {
    // "atualizar" usa a janela desde o último sync, não os 3 meses da carga inicial
    let ultimoSyncEm: Date | null = null;
    if (opcoes.ultimoSyncEm !== undefined) ultimoSyncEm = opcoes.ultimoSyncEm;
    else if (conta.connectionId) {
      const [con] = await db
        .select({ ultimoSyncEm: connection.ultimoSyncEm })
        .from(connection)
        .where(and(eq(connection.id, conta.connectionId), eq(connection.userId, userId)))
        .limit(1);
      ultimoSyncEm = con?.ultimoSyncEm ?? null;
    }
    periodo = janelaAtualizar(ultimoSyncEm, agora);
  }

  const [faturas, transacoes] = await Promise.all([
    // conta corrente não tem fatura
    kind === 'cartao_credito' ? pluggy().faturas(conta.pluggyAccountId) : Promise.resolve([]),
    pluggy().transacoes(conta.pluggyAccountId, periodo.de, periodo.ate),
  ]);
  const { inseridos, ...resultado } = await sincronizarConta(userId, conta.id, faturas, transacoes, conta.connectionId, kind);
  const cfg = await configuracoes(userId);
  const cat = await categorizarPendentes(userId, conta.id, inseridos, cfg?.modeloIa);
  if (conta.connectionId) {
    await db
      .update(connection)
      .set({ ultimoSyncEm: sql`now()`, status: 'ativa', ultimoErro: null })
      .where(and(eq(connection.id, conta.connectionId), eq(connection.userId, userId)));
  }
  return { ...resultado, ...cat };
}

export type ResultadoConexao =
  | { pulada: false; estado: EstadoConexao; cartoes: number; inseridos: number }
  // outro sync automático desta conexão começou há menos de 2 minutos: o Pluggy nem é chamado
  | { pulada: true };

// cobre um sync de conexão inteiro (o webhook e o cron têm 60 s); passado isso, a trava é de quem morreu no meio
const TRAVA_SYNC = sql`now() - interval '2 minutes'`;

/**
 * Reserva a conexão para um sync automático, num `update` só: dois webhooks
 * (ou webhook e cron) chegando juntos não passam os dois, porque o segundo já
 * encontra `ultima_tentativa_em` recente. Grava antes de chamar o Pluggy —
 * dando certo ou não —, para o cron mandar ao fim da fila a conexão que travou.
 */
async function reservarSync(userId: string, conexaoId: string): Promise<boolean> {
  const r = await db
    .update(connection)
    .set({ ultimaTentativaEm: sql`now()` })
    .where(
      and(
        eq(connection.id, conexaoId),
        eq(connection.userId, userId),
        ne(connection.status, 'desconectada'),
        or(isNull(connection.ultimaTentativaEm), lt(connection.ultimaTentativaEm, TRAVA_SYNC)),
      ),
    )
    .returning({ id: connection.id });
  return r.length > 0;
}

/**
 * Pergunta ao Pluggy como está o item, grava o estado e, se há dado para
 * trazer, sincroniza cada cartão da conexão, um de cada vez (em paralelo, a IA
 * de vários cartões disputaria o mesmo limite de chamadas). Estado que pede o
 * dono (senha, consentimento) só é gravado: a faixa e a tela de Conexões
 * cuidam do resto.
 *
 * É o caminho do cron e do webhook, e passa pela trava de `reservarSync`; o
 * botão "atualizar agora" vai por `sincronizarCartao` e não espera trava —
 * quem apertou quer o dado agora.
 *
 * `null` se a conexão não é do usuário ou está desconectada.
 */
export async function sincronizarConexao(userId: string, conexaoId: string): Promise<ResultadoConexao | null> {
  const c = await itemDaConexao(userId, conexaoId);
  if (!c) return null;
  if (!(await reservarSync(userId, c.id))) return { pulada: true };
  const item = await pluggy().item(c.pluggyItemId);
  // o item sumiu do Pluggy (apagado lá fora): falha para o log; desconectar é decisão do dono
  if (!item) throw new Error('item_nao_encontrado_no_pluggy');
  const estado = await registrarItem(userId, c.id, item);
  // OUTDATED: o banco não respondeu na última leitura, mas o que o Pluggy já tem vale ser trazido
  if (estado !== 'ativa' && item.status !== 'OUTDATED') return { pulada: false, estado, cartoes: 0, inseridos: 0 };

  const cartoes = await cartoesDaConexao(userId, c.id);
  if (!cartoes.length) {
    // sem cartão não há sincronizarCartao para gravar a data; sem ela, o cron voltaria a esta conexão todo dia
    if (estado === 'ativa') {
      await db
        .update(connection)
        .set({ ultimoSyncEm: sql`now()` })
        .where(and(eq(connection.id, c.id), eq(connection.userId, userId)));
    }
    return { pulada: false, estado, cartoes: 0, inseridos: 0 };
  }
  let inseridos = 0;
  for (const cartao of cartoes) {
    const r = await sincronizarCartao(userId, cartao.id, 'atualizar', { ultimoSyncEm: c.ultimoSyncEm });
    if (r) inseridos += r.novos + r.suspeitos;
  }
  return { pulada: false, estado: 'ativa', cartoes: cartoes.length, inseridos };
}

/**
 * Só o estado: pergunta ao Pluggy como está o item e grava, sem buscar
 * lançamento. É o que o webhook faz quando o aviso é de senha, consentimento
 * ou login — não há dado novo, só a faixa e a tela de Conexões mudam.
 *
 * `null` se a conexão não é do usuário ou está desconectada.
 */
export async function registrarEstadoDaConexao(userId: string, conexaoId: string): Promise<EstadoConexao | null> {
  const c = await itemDaConexao(userId, conexaoId);
  if (!c) return null;
  const item = await pluggy().item(c.pluggyItemId);
  // mesmo caso de sincronizarConexao: vai para o log, desconectar é decisão do dono
  if (!item) throw new Error('item_nao_encontrado_no_pluggy');
  return registrarItem(userId, c.id, item);
}

export type ConexaoDoCron = { id: string; userId: string; ultimoSyncEm: Date | null };

/**
 * As conexões que o cron percorre, de TODOS os usuários. A fila é pela última
 * tentativa (nunca tentadas na frente): a conexão que travou ontem vai para o
 * fim, em vez de comer o orçamento de novo e deixar as outras para trás. Entre
 * as de mesma tentativa, a mais atrasada primeiro. `atualizando` entra: o
 * estado gravado pode ser de um refresh que nunca terminou, e quem decide é
 * `precisaSincronizar` e o que o Pluggy disser do item agora.
 *
 * É a única consulta do app sem `user_id` no `where` (exceção à regra 1): o
 * cron não tem sessão, e o dono de cada sync sai daqui, da própria linha —
 * nunca de algo que a requisição mande. Só id, dono e data saem; o resto é
 * lido já com `user_id`.
 */
export async function conexoesParaCron(): Promise<ConexaoDoCron[]> {
  return db
    .select({ id: connection.id, userId: connection.userId, ultimoSyncEm: connection.ultimoSyncEm })
    .from(connection)
    .where(inArray(connection.status, ['ativa', 'atualizando', 'erro']))
    .orderBy(
      sql`${connection.ultimaTentativaEm} asc nulls first`,
      sql`${connection.ultimoSyncEm} asc nulls first`,
      asc(connection.criadoEm),
    );
}

export type ConexaoDoItem = { id: string; userId: string };

/**
 * A conexão de um item do Pluggy, de QUALQUER usuário — a outra exceção à
 * regra 1, pelo mesmo motivo de `conexoesParaCron`: o webhook não tem sessão,
 * e o dono sai da própria linha, nunca do corpo do aviso (que só traz o
 * `itemId`). Desconectada não volta: o dono já disse que não quer mais.
 */
export async function conexaoPorItem(pluggyItemId: string): Promise<ConexaoDoItem | null> {
  const [c] = await db
    .select({ id: connection.id, userId: connection.userId })
    .from(connection)
    .where(and(eq(connection.pluggyItemId, pluggyItemId), ne(connection.status, 'desconectada')))
    .limit(1);
  return c ?? null;
}
