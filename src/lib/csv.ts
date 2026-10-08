/**
 * CSV de lançamentos no formato do app antigo (`;`, BOM, vírgula decimal):
 * abre direto no Excel em português. Puro, para o teste.
 */
export type LinhaCsv = {
  mes: string;
  banco: string;
  cartao: string | null;
  data: string;
  desc: string;
  limpa: string | null;
  apelido: string | null;
  categoria: string | null;
  parcelaN: number | null;
  totalParcelas: number | null;
  tipo: string;
  valor: number;
  cartaoApelido: string | null;
  fonte: string;
  papel: string;
};

const COLUNAS = [
  'mes_fatura', 'banco', 'cartao', 'data', 'estabelecimento_na_fatura', 'meu_nome',
  'categoria', 'parcela', 'tipo', 'valor', 'cartao_apelido', 'fonte',
  // no fim, para as colunas do app antigo ficarem onde estavam; o CSV é tudo, e
  // sem o papel o crédito e o "não conta" da conta corrente pareceriam estorno e gasto
  'papel',
];

// texto vindo de fatura é de terceiros: "=HYPERLINK(...)" viraria fórmula no Excel
const guarda = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const celula = (s: string) => `"${s.replace(/"/g, '""')}"`;
const texto = (s: string | null) => celula(guarda(s ?? ''));

export function montarCsv(linhas: readonly LinhaCsv[]): string {
  const corpo = linhas.map((l) =>
    [
      texto(l.mes),
      texto(l.banco),
      texto(l.cartao),
      texto(l.data),
      texto(l.desc),
      texto(l.apelido || l.limpa || l.desc),
      texto(l.categoria),
      texto(l.parcelaN && l.totalParcelas ? `${l.parcelaN}/${l.totalParcelas}` : ''),
      texto(l.tipo),
      // número não passa pela guarda: o sinal de menos de um estorno é o valor
      celula(l.valor.toFixed(2).replace('.', ',')),
      texto(l.cartaoApelido),
      texto(l.fonte),
      texto(l.papel),
    ].join(';'),
  );
  return '﻿' + [COLUNAS.map(celula).join(';'), ...corpo].join('\r\n');
}
