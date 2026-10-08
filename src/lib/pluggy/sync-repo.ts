import 'server-only';
import { and, eq, gte, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { account, statement, syncRun, txn } from '@/db/schema';
import { prefixoDedupe } from '../dedupe';
import { chaveAprendizado, JANELA_DIAS } from '../descricao';
import { idDaCategoria, planoDeParcela, regrasAprendidas } from '../txn-repo';
import {
  destinoNoSync,
  faturaDaBill,
  faturasAbertasDosRecebidos,
  lancamentoDaConta,
  lancamentoDoPluggy,
  mesesDasFaturas,
  type FaturaMapeada,
  type FaturaPluggy,
  type Recebido,
  type TransacaoPluggy,
} from './mapear';
import { camposDaAcao, planejarSync, type Existente } from './planejar';

const somaDias = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

export type ResultadoSync = {
  novos: number;
  atualizados: number;
  promovidos: number;
  suspeitos: number;
  ignorados: number;
  descartados: number;
  // ids dos lançamentos criados agora que vão à IA: só eles, o resto já foi (regra 9),
  // e o Pix para pessoa física, o crédito e o que não conta nunca vão (regra 4)
  inseridos: string[];
};

/**
 * Fatura do Pluggy → `statement` da conta. Pelo `pluggy_bill_id` primeiro: um
 * vencimento remarcado para outro mês não pode criar uma segunda linha (e a
 * `unique` de `pluggy_bill_id` estouraria). Sem ela, a linha do mês — talvez a
 * do PDF, talvez a aberta que o app criou — recebe o id só se ainda não tem um.
 * Duas bills no mesmo mês já chegam aqui em meses diferentes (`mesesDasFaturas`).
 *
 * Devolve o mapa bill → statement e as faturas com o mês em que de fato ficaram,
 * que é de onde sai o mês da fatura aberta.
 */
async function gravarFaturas(accountId: string, faturas: FaturaPluggy[]) {
  const fatura = new Map<string, { statementId: string; mesRef: string }>();
  const gravadas: FaturaMapeada[] = [];
  for (const f of mesesDasFaturas(faturas.map(faturaDaBill))) {
    const total = f.total.toFixed(2);
    const [ligada] = await db
      .select({ id: statement.id, mesRef: statement.mesRef })
      .from(statement)
      .where(and(eq(statement.accountId, accountId), eq(statement.pluggyBillId, f.pluggyBillId)))
      .limit(1);
    if (ligada) {
      await db
        .update(statement)
        .set({ vencimento: f.vencimento, totalInformado: total, ...(f.fechamento ? { fechamento: f.fechamento } : {}) })
        .where(and(eq(statement.id, ligada.id), eq(statement.accountId, accountId)));
      fatura.set(f.pluggyBillId, { statementId: ligada.id, mesRef: ligada.mesRef.slice(0, 7) });
      gravadas.push({ ...f, mesRef: ligada.mesRef.slice(0, 7) });
      continue;
    }
    const [linha] = await db
      .insert(statement)
      .values({
        accountId,
        mesRef: `${f.mesRef}-01`,
        vencimento: f.vencimento,
        fechamento: f.fechamento,
        totalInformado: total,
        pluggyBillId: f.pluggyBillId,
        status: 'fechada',
      })
      .onConflictDoUpdate({
        target: [statement.accountId, statement.mesRef],
        set: {
          pluggyBillId: sql`coalesce(${statement.pluggyBillId}, excluded.pluggy_bill_id)`,
          vencimento: f.vencimento,
          // o fechamento que o PDF ou um sync anterior gravou não some se esta bill não trouxer
          fechamento: sql`coalesce(excluded.fechamento, ${statement.fechamento})`,
          totalInformado: total,
          // a aberta que o app criou para este mês vira a fechada do Pluggy no lugar
          status: 'fechada',
        },
        // a linha do mês já é de outra bill (vencimento remarcado, ou /bills mudou o
        // encaixe de `mesesDasFaturas`): sobrescrever trocaria total e vencimento de
        // uma fatura pelos de outra, e as duas alternariam a cada sync
        setWhere: sql`${statement.pluggyBillId} is null or ${statement.pluggyBillId} = excluded.pluggy_bill_id`,
      })
      .returning({ id: statement.id });
    if (linha) {
      fatura.set(f.pluggyBillId, { statementId: linha.id, mesRef: f.mesRef });
      gravadas.push(f);
    } else {
      // os lançamentos desta bill ficam sem statement, no mês da compra, até o conflito se desfazer
      console.warn(`sync: fatura de ${f.mesRef} não gravada, o mês já é de outra bill`);
    }
  }
  return { fatura, mapeadas: gravadas };
}

const colunasExistente = {
  id: txn.id,
  data: txn.data,
  valor: txn.valor,
  descNorm: txn.descNorm,
  fonte: txn.fonte,
  pluggyTxnId: txn.pluggyTxnId,
  dedupeKey: txn.dedupeKey,
  excluidoEm: txn.excluidoEm,
  tipo: txn.tipo,
  pendente: txn.pendente,
  parcelaN: txn.parcelaN,
  statementId: txn.statementId,
  installmentId: txn.installmentId,
  duplicadoDe: txn.duplicadoDe,
};

async function lerExistentes(userId: string, accountId: string, filtro: SQL | undefined): Promise<Existente[]> {
  const linhas = await db
    .select(colunasExistente)
    .from(txn)
    .where(and(eq(txn.userId, userId), eq(txn.accountId, accountId), filtro));
  return linhas.map((l) => ({
    id: l.id,
    data: l.data,
    valor: Number(l.valor),
    descNorm: l.descNorm,
    fonte: l.fonte,
    pluggyTxnId: l.pluggyTxnId,
    dedupeKey: l.dedupeKey,
    excluido: l.excluidoEm !== null,
    tipo: l.tipo,
    pendente: l.pendente,
    parcelaN: l.parcelaN,
    statementId: l.statementId,
    installmentId: l.installmentId,
    duplicadoDe: l.duplicadoDe,
  }));
}

/**
 * Grava o que veio do Pluggy para uma conta já casada (ver `casarConta`).
 * Faturas primeiro, para o `statement_id` existir; depois o planejador decide
 * e tudo dos lançamentos vai num `db.batch` (tudo ou nada).
 */
export async function sincronizarConta(
  userId: string,
  accountId: string,
  faturas: FaturaPluggy[],
  transacoes: TransacaoPluggy[],
  connectionId: string | null = null,
  kind: 'cartao_credito' | 'conta_corrente' = 'cartao_credito',
): Promise<ResultadoSync> {
  // a conta vem do casamento, mas o executor confere de novo: posse no where
  const [dono] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.id, accountId), eq(account.userId, userId)))
    .limit(1);
  if (!dono) throw new Error('conta_nao_encontrada');

  const { fatura, mapeadas } = await gravarFaturas(accountId, faturas);
  const statementDoBill = (billId: string | null) => (billId ? (fatura.get(billId)?.statementId ?? null) : null);

  const mapear = kind === 'conta_corrente' ? lancamentoDaConta : lancamentoDoPluggy;
  const recebidos: Recebido[] = [];
  let descartados = 0;
  for (const t of transacoes) {
    const r = mapear(t);
    if (r) recebidos.push(r);
    else descartados++;
  }

  // fatura aberta: lançamento sem billId lançado depois do último fechamento é dela; ganha uma
  // statement 'aberta' (que o Pluggy fecha depois, no mesmo mes_ref) e uma chave sintética
  // no mapa de faturas, para o planejador e o plano de parcela verem o mês certo. A chave
  // só existe no mapa: o que vai ao banco é o statementId, nunca o billId
  for (const [i, aberta] of faturasAbertasDosRecebidos(mapeadas, recebidos)) {
    const r = recebidos[i]!;
    const chave = `aberta:${aberta.mesRef}`;
    if (!fatura.has(chave)) {
      const [linha] = await db
        .insert(statement)
        .values({ accountId, mesRef: `${aberta.mesRef}-01`, vencimento: aberta.vencimento, status: 'aberta' })
        // já existe (PDF ou sync anterior): usa a que está lá, sem mexer — o set reescreve
        // o mes_ref com o próprio valor só para o returning devolver o id
        .onConflictDoUpdate({ target: [statement.accountId, statement.mesRef], set: { mesRef: sql`excluded.mes_ref` } })
        .returning({ id: statement.id });
      if (linha) fatura.set(chave, { statementId: linha.id, mesRef: aberta.mesRef });
    }
    if (fatura.has(chave)) r.billId = chave;
  }

  const resultado: ResultadoSync = { novos: 0, atualizados: 0, promovidos: 0, suspeitos: 0, ignorados: 0, descartados, inseridos: [] };

  if (recebidos.length) {
    const datas = recebidos.map((r) => r.data).sort();
    const de = somaDias(datas[0]!, -JANELA_DIAS);
    const ate = somaDias(datas[datas.length - 1]!, JANELA_DIAS);
    const statementIds = [...new Set(recebidos.map((r) => statementDoBill(r.billId)).filter((s): s is string => !!s))];
    // todos os ordinais já gravados de cada gasto: o `inserir` só escolhe chave
    // livre entre as que enxerga, e uma colisão derrubaria o batch inteiro
    const prefixos = [...new Set(recebidos.map((r) => prefixoDedupe(accountId, r.data, r.valor, r.descNorm)))];
    // excluídos entram de propósito: precisam casar para serem ignorados, senão
    // voltariam como novos. Fatura e chave além da janela: a parcela do PDF pode
    // ter data da compra antiga, e o dono pode ter editado a data de uma linha
    const existentes = await lerExistentes(
      userId,
      accountId,
      or(
        and(gte(txn.data, de), lte(txn.data, ate)),
        inArray(txn.pluggyTxnId, recebidos.map((r) => r.pluggyTxnId)),
        inArray(txn.statementId, statementIds),
        ...prefixos.map((p) => like(txn.dedupeKey, `${p}%`)),
      ),
    );

    const acoes = planejarSync(accountId, existentes, recebidos, statementDoBill);
    const porId = new Map(existentes.map((e) => [e.id, e]));
    const regras = await regrasAprendidas(userId);
    // Pix para pessoa física não vai à IA: chega em "Outros" para o dono categorizar
    const outrosId = recebidos.some((r) => r.pessoaFisica) ? await idDaCategoria('Outros') : null;
    const comandos: unknown[] = [];
    const posicoesInsert: { pos: number; vaiParaIA: boolean }[] = [];

    for (const a of acoes) {
      if (a.tipo === 'ignorar') {
        resultado.ignorados++;
        continue;
      }
      const r = a.recebido;
      const f = r.billId ? fatura.get(r.billId) : undefined;
      const e = a.tipo === 'inserir' ? undefined : porId.get(a.existenteId);
      // sem fatura conhecida não há mês de referência para o plano da parcela; e
      // a compra que o PDF já planejou não ganha um segundo plano
      const installmentId =
        r.parcela && r.valor > 0 && f && !e?.installmentId
          ? await planoDeParcela(accountId, r.descNorm, f.mesRef, r.parcela, r.valor)
          : null;

      if (a.tipo === 'atualizar' || a.tipo === 'promover') {
        if (a.tipo === 'atualizar') resultado.atualizados++;
        else resultado.promovidos++;
        const set = {
          ...camposDaAcao(a, e),
          ...(f ? { statementId: f.statementId } : {}),
          ...(installmentId ? { installmentId } : {}),
        };
        comandos.push(db.update(txn).set(set).where(and(eq(txn.id, a.existenteId), eq(txn.userId, userId))));
      } else {
        if (a.suspeitoDuplicado) resultado.suspeitos++;
        else resultado.novos++;
        const regra = regras.get(chaveAprendizado(r.descNorm));
        const destino = destinoNoSync(r, regra?.papel);
        posicoesInsert.push({ pos: comandos.length, vaiParaIA: destino.vaiParaIA });
        comandos.push(
          db
            .insert(txn)
            .values({
              userId,
              accountId,
              statementId: f?.statementId ?? null,
              data: r.data,
              valor: r.valor.toFixed(2),
              descOrigem: r.descOrigem,
              descNorm: r.descNorm,
              apelido: regra?.apelido ?? null,
              categoryId: regra?.categoryId ?? (destino.outros ? outrosId : null),
              // só a categoria aprendida faz a fonte ser 'regra': a regra que traz só papel ou
              // só apelido deixaria o gasto sem categoria e fora da IA para sempre
              // (`precisaCategoria` exige fonte 'ia' e categoria vazia)
              categoryFonte: regra?.categoryId ? 'regra' : 'ia',
              tipo: r.tipo,
              papel: destino.papel,
              pessoaFisica: !!r.pessoaFisica,
              installmentId,
              parcelaN: r.parcela?.n ?? null,
              fonte: 'pluggy',
              pluggyTxnId: r.pluggyTxnId,
              dedupeKey: a.dedupeKey,
              pendente: r.pendente,
              suspeitoDuplicado: a.suspeitoDuplicado,
            })
            .returning({ id: txn.id }),
        );
      }
    }

    if (comandos.length) {
      // botão e cron (fatia 5) sincronizando a mesma conta: o lock só serializa os
      // batches; a leitura e o planejamento acima ficam fora dele, então o segundo
      // pode ter planejado os mesmos inserts e falhar inteiro nas chaves únicas —
      // seguro, nada fica gravado pela metade, mas é falha, não espera
      comandos.unshift(db.execute(sql`select pg_advisory_xact_lock(hashtext(${accountId}))`));
      const saidas = (await db.batch(comandos as unknown as Parameters<typeof db.batch>[0])) as unknown as unknown[];
      // o lock entrou na frente: cada posição anda uma casa
      for (const { pos, vaiParaIA } of posicoesInsert) {
        if (!vaiParaIA) continue;
        for (const l of saidas[pos + 1] as { id: string }[]) resultado.inseridos.push(l.id);
      }
    }
  }

  await db.insert(syncRun).values({
    connectionId,
    terminadoEm: new Date(),
    resultado: 'ok',
    novos: resultado.novos,
    atualizados: resultado.atualizados,
    duplicados: resultado.suspeitos,
    detalhe: { accountId, promovidos: resultado.promovidos, ignorados: resultado.ignorados, descartados },
  });
  return resultado;
}
