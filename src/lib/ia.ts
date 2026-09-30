import 'server-only';
import type { Txn } from '@/db/schema';

/**
 * A IA é o único ponto onde o dado sai da sua infraestrutura: o OpenRouter
 * roteia para um provedor de modelo que nem sempre é o que você escolheu.
 *
 * TODO prompt passa por aqui. Nada de objeto cru do banco.
 *
 * Fora, de propósito: id, account_id, pluggy_txn_id, saldo, limite, CPF e nome
 * do titular (que, aliás, nem são gravados — ver drizzle/0000_init.sql).
 */
export type TxnParaIA = {
  data: string;
  valor: number;
  desc: string;
  categoria: string | null;
  cartao: string | null;
};

export function paraIA(
  t: Pick<Txn, 'data' | 'valor' | 'descNorm'>,
  extras: { categoria?: string | null; apelidoConta?: string | null } = {},
): TxnParaIA {
  return {
    data: t.data, // sem hora
    valor: Number(t.valor),
    desc: t.descNorm, // normalizada, sem código de autorização
    categoria: extras.categoria ?? null,
    cartao: extras.apelidoConta ?? null, // 'Itaú - Azul', nunca o last4
  };
}

export function lotarParaIA(
  linhas: Array<Pick<Txn, 'data' | 'valor' | 'descNorm'>>,
): TxnParaIA[] {
  return linhas.map((l) => paraIA(l));
}
