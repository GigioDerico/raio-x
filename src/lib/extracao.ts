/**
 * Leitura de fatura em PDF: divisão do texto, prompt e limpeza do que o modelo
 * devolve.
 *
 * O prompt é o do app atual, quase palavra por palavra — ele já foi afinado
 * contra faturas de verdade e reescrevê-lo do zero seria jogar fora meses de
 * ajuste. Puro e sem 'server-only' para poder ser testado sozinho.
 */
import { NOMES, normalizarCategoria } from './categorias';
import { lerParcela, parseValor } from './descricao';

export const TAMANHO_PEDACO = 11_000;
export const MAX_PEDACOS = 8;

export type TipoLanc = 'compra' | 'encargo' | 'estorno' | 'pagamento';

export type LancBruto = {
  d?: unknown;
  desc?: unknown;
  val?: unknown;
  cat?: unknown;
  parc?: unknown;
  tipo?: unknown;
};

export type LancLimpo = {
  d: string;
  desc: string;
  val: number;
  cat: string;
  parc: string | null;
  tipo: TipoLanc;
};

export type CabecalhoFatura = {
  banco: string;
  cartao: string;
  vencimento: string;
  total: number;
};

/** Quebra o texto em pedaços de linhas inteiras — nunca no meio de um lançamento. */
export function pedacos(texto: string, tamanho = TAMANHO_PEDACO): string[] {
  const linhas = texto
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const saida: string[] = [];
  let atual = '';
  for (const l of linhas) {
    if (atual.length + l.length + 1 > tamanho && atual) {
      saida.push(atual);
      atual = '';
    }
    atual += `${l}\n`;
  }
  if (atual.trim()) saida.push(atual);
  return saida;
}

export function promptExtracao(
  trecho: string,
  comCabecalho: boolean,
  idx: number,
  n: number,
  anoDica: string,
): string {
  const exemploLanc =
    '{"d":"2026-08-11","desc":"Assaí","val":612.4,"cat":"Mercado & Padaria","parc":null,"tipo":"compra"}';

  return `Você extrai dados de faturas de cartão de crédito brasileiras (Nubank, Itaú, Bradesco, Santander, Sicredi, Banco PAN, Mercado Pago, PicPay e outros).

Abaixo está o texto bruto de uma fatura — trecho ${idx} de ${n}.
${comCabecalho ? 'Extraia o cabeçalho E os lançamentos deste trecho.' : 'Extraia APENAS os lançamentos deste trecho (sem cabeçalho).'}

Regras:
- val: número em reais com ponto decimal. "1.234,56" => 1234.56.
- Despesas positivas. Estornos, créditos, descontos e pagamentos de fatura: negativos.
- d: data no formato "YYYY-MM-DD". Se o texto não trouxer o ano, use ${anoDica} e ajuste a virada de ano quando fizer sentido.
- Ignore publicidade, limites, saldos, pontos, avisos, códigos de barras, subtotais e totais. Só lançamentos reais.
- parc: "3/10" quando for parcela; null quando não for. Não deixe a informação de parcela dentro de desc.
- tipo: "compra" | "encargo" (juros, mora, multa, anuidade, IOF, seguro) | "estorno" | "pagamento".
- cat: exatamente um destes: ${NOMES.join(' | ')}
- "Construção / Obras" cobre material de construção, ferragens, tintas, elétrica, hidráulica, madeireira, marmoraria, vidraçaria, aluguel de equipamento e mão de obra de reforma (Leroy Merlin, Telhanorte, C&C, Obramax, Sodimac, Dicico, Ferreira Costa, Casa do Construtor, depósitos e lojas de material). Só móveis e decoração prontos ficam em "Compras & Vestuário"; conta de luz, água e internet ficam em "Casa & Contas".
- desc: nome limpo do estabelecimento, sem códigos nem cidade, até 40 caracteres.

Responda SOMENTE com JSON neste formato:
${
  comCabecalho
    ? `{"banco":"Nubank","cartao":"1234","vencimento":"2026-09-10","total":1234.56,"lancamentos":[${exemploLanc}]}`
    : `{"lancamentos":[${exemploLanc}]}`
}

Texto da fatura:
"""
${trecho}
"""`;
}

const TIPOS: readonly TipoLanc[] = ['compra', 'encargo', 'estorno', 'pagamento'];

/** Devolve null quando a linha não é um lançamento aproveitável. */
export function limparLanc(l: LancBruto): LancLimpo | null {
  const val = parseValor(l.val);
  if (!Number.isFinite(val) || val === 0) return null;

  const d = String(l.d ?? '').slice(0, 10);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';

  const parcela = lerParcela(l.parc);
  const tipo = TIPOS.includes(l.tipo as TipoLanc) ? (l.tipo as TipoLanc) : 'compra';

  return {
    d: data,
    desc: String(l.desc ?? '—').slice(0, 60),
    val: Math.round(val * 100) / 100,
    cat: normalizarCategoria(typeof l.cat === 'string' ? l.cat : null),
    parc: parcela ? `${parcela.n}/${parcela.total}` : null,
    tipo,
  };
}

/** Tira linhas idênticas que a leitura repetiu entre pedaços que se sobrepõem. */
export function tirarRepetidosDaLeitura(lancs: readonly LancLimpo[]): LancLimpo[] {
  const vistos = new Set<string>();
  return lancs.filter((l) => {
    const k = `${l.d}|${l.desc}|${l.val}|${l.parc ?? ''}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export function limparCabecalho(h: Record<string, unknown> | null | undefined): CabecalhoFatura {
  const venc = String(h?.vencimento ?? '');
  return {
    banco: String(h?.banco ?? 'Cartão').slice(0, 28),
    cartao: String(h?.cartao ?? '').replace(/\D/g, '').slice(-4),
    vencimento: /^\d{4}-\d{2}-\d{2}$/.test(venc) ? venc : '',
    total: Number.isFinite(parseValor(h?.total)) ? parseValor(h?.total) : 0,
  };
}

/**
 * Mês de referência da fatura: o do vencimento quando existe; senão, o mês
 * seguinte ao último lançamento — uma compra de agosto cai na fatura de setembro.
 */
export function mesDeReferencia(cab: CabecalhoFatura, lancs: readonly LancLimpo[]): string {
  if (cab.vencimento) return cab.vencimento.slice(0, 7);
  const datas = lancs.map((l) => l.d).filter(Boolean).sort();
  const ultima = datas.at(-1);
  if (!ultima) return new Date().toISOString().slice(0, 7);
  const ano = Number(ultima.slice(0, 4));
  const mes = Number(ultima.slice(5, 7)); // +1 já vem de não subtrair 1 aqui
  const d = new Date(Date.UTC(ano, mes, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
