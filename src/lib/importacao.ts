/**
 * Regras da importação que não dependem de banco.
 *
 * `txn.tipo` guarda só a ORIGEM do lançamento (parcela, encargo, pagamento ou
 * escolha). Se é "fixo" ou "escolha" no painel é decidido na hora por
 * `classeLanc`, porque depende de quais cobranças se repetiram nos últimos
 * meses — e isso muda a cada fatura importada.
 */
import { somarMeses, type Parcela } from './descricao';
import type { TipoLanc } from './extracao';

export type TipoTxn = 'parcela' | 'encargo' | 'pagamento' | 'escolha';

export function tipoDoTxn(tipo: TipoLanc, parcela: Parcela | null): TipoTxn {
  if (tipo === 'pagamento') return 'pagamento';
  if (tipo === 'encargo') return 'encargo';
  if (parcela) return 'parcela';
  return 'escolha';
}

export type PlanoParcela = { totalParcelas: number; valorParcela: string; primeiraRef: string };

/**
 * A parcela n de uma fatura do mês M foi comprada no mês M − (n − 1). É o que
 * permite reconhecer a mesma compra parcelada em faturas diferentes.
 */
export function planoDaParcela(mesRef: string, parcela: Parcela, valor: number): PlanoParcela {
  return {
    totalParcelas: parcela.total,
    valorParcela: Math.abs(valor).toFixed(2),
    primeiraRef: `${somarMeses(mesRef, -(parcela.n - 1))}-01`,
  };
}
