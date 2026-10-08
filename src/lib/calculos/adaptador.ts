/**
 * Do banco ao formato do app antigo. As funções portadas continuam lendo
 * `faturas[].lancamentos[]`, e é aqui — não nelas — que o banco se encaixa.
 * Puro: a consulta fica em src/lib/painel-repo.ts.
 */
import { chaveCartao, normCat, CONFIG_PADRAO, type Fatura, type Lanc, type TipoLegado } from './base';

/** Uma linha da consulta do painel (txn ⋈ statement ⋈ account ⋈ category ⋈ plano). */
export type LinhaPainel = {
  statementId: string | null;
  accountId: string;
  mes: string; // 'YYYY-MM', o mês da fatura (mesDaTxn)
  banco: string;
  last4: string | null;
  apelidoConta: string | null;
  desc: string;
  limpa: string | null;
  apelido: string | null;
  valor: string; // numeric chega como texto
  categoria: string | null;
  tipo: 'fixo' | 'parcela' | 'encargo' | 'escolha' | 'pagamento';
  parcelaN: number | null;
  totalParcelas: number | null;
  vencimento: string | null; // 'YYYY-MM-DD', de statement.vencimento
  data: string; // 'YYYY-MM-DD', de txn.data
  aberta: boolean; // statement.status = 'aberta'; falso sem statement
  fechamento: string | null; // 'YYYY-MM-DD', de statement.fechamento
};

/**
 * `txn.tipo` guarda a origem; o app antigo distinguia compra, encargo, estorno e
 * pagamento. Estorno não tem tipo próprio no banco: é o valor negativo que o
 * denuncia.
 */
function tipoLegado(l: LinhaPainel, val: number): TipoLegado {
  if (l.tipo === 'pagamento') return 'pagamento';
  if (l.tipo === 'encargo') return 'encargo';
  if (val < 0) return 'estorno';
  return 'compra';
}

export function montarFaturas(linhas: readonly LinhaPainel[]): {
  faturas: Fatura[];
  nomesCartao: Record<string, string>;
} {
  const porId = new Map<string, Fatura>();
  const nomesCartao: Record<string, string> = {};

  for (const l of linhas) {
    // sem fatura (conta corrente, fatia 6): uma fatura por conta e mês
    const id = l.statementId ?? `${l.accountId}|${l.mes}`;
    let f = porId.get(id);
    if (!f) {
      f = { id, mesRef: l.mes, banco: l.banco, cartao: l.last4 ?? '', lancamentos: [] };
      porId.set(id, f);
    }
    if (l.apelidoConta) nomesCartao[chaveCartao(f)] = l.apelidoConta;
    // todas as linhas de uma mesma fatura compartilham o vencimento (vem do
    // join com `statement`); só grava se ainda não houver, para uma linha com
    // vencimento nulo não apagar o que uma linha anterior já resolveu
    if (!f.vencimento && l.vencimento) f.vencimento = l.vencimento;
    if (!f.fechamento && l.fechamento) f.fechamento = l.fechamento;
    if (l.aberta) f.aberta = true;

    const val = Number(l.valor);
    // o estorno de uma parcela (devolução) não ganha plano de parcelamento —
    // valor negativo, sem `installmentPlan` — mas o app antigo o contava como
    // parcela em `classeLanc`. O "?" no lugar do total é rejeitado pelo regex
    // de parcelas futuras (`parcelasInfo`), que é o certo para estorno: não há
    // parcela restante a prever.
    const lanc: Lanc = {
      desc: l.desc,
      limpa: l.limpa,
      apelido: l.apelido,
      val,
      cat: l.categoria ?? 'Outros',
      parc: l.parcelaN ? `${l.parcelaN}/${l.totalParcelas ?? '?'}` : null,
      tipo: tipoLegado(l, val),
      data: l.data,
    };
    f.lancamentos.push(lanc);
  }

  return { faturas: [...porId.values()], nomesCartao };
}

const OBRA = 'Construção / Obras';

/**
 * "Separar obra": a obra sai dos totais, das médias e das anomalias, e volta
 * como um número à parte por mês. Feito antes das contas para que nenhuma
 * função portada precise saber que a obra existe.
 */
export function separarObra(faturas: readonly Fatura[]): {
  faturas: Fatura[];
  obraPorMes: Record<string, number>;
} {
  const obraPorMes: Record<string, number> = {};
  const semObra = faturas.map((f) => {
    const resto: Lanc[] = [];
    for (const l of f.lancamentos) {
      if (normCat(l.cat) === OBRA && l.tipo !== 'pagamento') {
        obraPorMes[f.mesRef] = (obraPorMes[f.mesRef] ?? 0) + (+l.val || 0);
      } else {
        resto.push(l);
      }
    }
    return { ...f, lancamentos: resto };
  });
  return { faturas: semObra, obraPorMes };
}

/** `numeric` chega do driver como string; sem linha, valem os defaults das colunas. */
export function configDoUsuario(
  linha: { renda: string | null; meta: string | null; fora: string | null } | undefined,
): { renda: number; metaPoupanca: number; foraCartao: number } {
  return {
    renda: Number(linha?.renda ?? CONFIG_PADRAO.renda),
    metaPoupanca: Number(linha?.meta ?? CONFIG_PADRAO.metaPoupanca),
    foraCartao: Number(linha?.fora ?? CONFIG_PADRAO.foraCartao),
  };
}
