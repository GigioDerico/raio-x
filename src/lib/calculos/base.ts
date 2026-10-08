/**
 * Porta de docs/legado/calculos-do-app-antigo.js — constantes, texto e seleção
 * de faturas. A lógica é a do app antigo, linha a linha: mudar a regra e o
 * lugar ao mesmo tempo tornaria impossível saber qual dos dois quebrou. O teste
 * de paridade (scripts/paridade.ts) prova que as duas dão o mesmo resultado.
 *
 * O estado global de lá (`faturas`, `apelidos`, `mesFiltro`, `nomesCartao`,
 * `renda`, `metaPoupanca`, `foraCartao`) vira o `Contexto`. O filtro de cartão
 * (`fats()`) é aplicado antes, por quem monta o contexto: aqui `ctx.faturas`
 * já é o recorte.
 *
 * `normDesc` e `parecido` daqui NÃO são os de src/lib/descricao.ts: estes são os
 * do app antigo, dos quais dependem `recorrentes` e as cobranças fixas; os de lá
 * servem à deduplicação e ao aprendizado. Unificar fica para depois.
 *
 * Puro, sem `server-only`: o teste importa direto.
 */

export type TipoLegado = 'compra' | 'encargo' | 'estorno' | 'pagamento';

export type Lanc = {
  desc: string;
  /** nome limpo pela IA (Pluggy); só para mostrar — a chave dos apelidos aprendidos continua `desc` */
  limpa?: string | null;
  apelido: string | null;
  val: number;
  cat: string;
  parc: string | null; // "3/10"
  tipo: TipoLegado;
  /** 'YYYY-MM-DD', como gravada; só o ciclo da fatura aberta usa (o legado não tinha) */
  data?: string;
};

export type Fatura = {
  id: string;
  mesRef: string;
  banco: string;
  cartao: string;
  lancamentos: Lanc[];
  /** 'YYYY-MM-DD'; usada pelo hero ("vence dia N") e por `cartoesInfo`. */
  vencimento?: string;
  /** da statement; só o ciclo da fatura aberta usa (o legado não tinha) */
  aberta?: boolean;
  fechamento?: string;
};

export type Contexto = {
  faturas: Fatura[];
  apelidos: Record<string, string>;
  /** null = mês mais recente; 'TODOS'; ou 'YYYY-MM' */
  mesFiltro: string | null;
  nomesCartao: Record<string, string>;
  renda: number;
  /** percentual, 0–80 */
  metaPoupanca: number;
  foraCartao: number;
};

// os mesmos defaults das colunas de user_setting e do `let` do app antigo
export const CONFIG_PADRAO = { renda: 0, metaPoupanca: 20, foraCartao: 0 };

export const CATS = [
  'Mercado & Padaria', 'Restaurantes & Delivery', 'Transporte', 'Assinaturas & Apps', 'Casa & Contas',
  'Construção / Obras', 'Saúde & Farmácia', 'Compras & Vestuário', 'Lazer & Viagem', 'Educação',
  'Serviços & Profissional', 'Encargos do cartão', 'Outros',
] as const;

// categorias renomeadas ao longo do tempo
const RENOMES: Record<string, string> = { Mercado: 'Mercado & Padaria' };

export function normCat(c: string | null | undefined): string {
  const n = (c != null && RENOMES[c]) || c;
  return n != null && (CATS as readonly string[]).includes(n) ? n : 'Outros';
}

export function addMonths(m: string, k: number): string {
  const y = +m.slice(0, 4);
  const mo = +m.slice(5, 7) - 1 + k;
  const d = new Date(Date.UTC(y, mo, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// palavras que não identificam ninguém — ignoradas ao comparar nomes
const GENERICOS = new Set([
  'TRANSFERENCIA', 'TRANSFERENCIAS', 'TRANSF', 'PARA', 'PIX', 'TED', 'DOC', 'ENVIADO', 'RECEBIDO',
  'PAGAMENTO', 'PAGTO', 'COMPRA', 'CARTAO', 'DEBITO', 'CREDITO', 'LTDA', 'EIRELI', 'MEI', 'BRASIL', 'COM', 'APP',
  'SERVICOS', 'SERVICO', 'LOJA', 'REF', 'PARC', 'MENSALIDADE',
]);

export function tokensDesc(s: string | null | undefined): string[] {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !GENERICOS.has(t));
}

/** Mesmo estabelecimento com escrita diferente? */
export function parecido(a: string, b: string): boolean {
  const A = new Set(tokensDesc(a));
  const B = new Set(tokensDesc(b));
  if (!A.size || !B.size) return false;
  if (A.size === 1 || B.size === 1) return [...A].join(' ') === [...B].join(' ');
  let inter = 0;
  A.forEach((t) => {
    if (B.has(t)) inter++;
  });
  return inter >= 1 && inter / Math.min(A.size, B.size) >= 0.6 && inter / Math.max(A.size, B.size) >= 0.5;
}

export function normDesc(s: string | null | undefined): string {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\d+\/\d+/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

/**
 * O nome na tela: apelido do lançamento > apelido de um parecido > nome da fatura.
 *
 * `comLimpo = false` é para quem usa o nome como chave (recorrentes, fixos,
 * parcelas): o nome limpo é texto da IA e varia entre lotes ("Netflix" ×
 * "Netflix.com"), o que dividiria uma recorrência e mudaria a regra portada.
 */
export function nomeExibido(ctx: Contexto, l: Lanc, comLimpo = true): string {
  if (l.apelido) return l.apelido;
  const direto = ctx.apelidos[normDesc(l.desc)];
  if (direto) return direto;
  for (const key in ctx.apelidos) if (parecido(key, l.desc)) return ctx.apelidos[key]!;
  return (comLimpo && l.limpa) || l.desc;
}

/** Os 4 dígitos mandam; sem eles, o nome do banco normalizado. */
export function chaveCartao(f: { cartao?: string | null; banco?: string | null }): string {
  const dig = String(f.cartao || '').replace(/\D/g, '').slice(-4);
  if (dig.length === 4) return 'n' + dig;
  return (
    'b' +
    String(f.banco || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '')
  );
}

export function nomeCartao(ctx: Contexto, f: Fatura): string {
  return (ctx.nomesCartao[chaveCartao(f)] || f.banco || 'Cartão') + (f.cartao ? ' ••' + f.cartao : '');
}

export const gastos = (f: Fatura) => f.lancamentos.filter((l) => l.tipo !== 'pagamento');

export function totalFatura(f: Fatura): number {
  return gastos(f).reduce((s, l) => s + (+l.val || 0), 0);
}
