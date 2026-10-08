/**
 * Filtro global: mês, cartões e "separar obra".
 *
 * A URL é a fonte da verdade — é o que faz voltar e favoritar funcionarem e o
 * server component ler o recorte sem estado no cliente. O cookie `rx_filtro`
 * só lembra o último recorte para quando a URL chega sem nenhum.
 *
 * Puro, sem `server-only`: o middleware, as páginas e o componente do filtro
 * usam as mesmas regras.
 */

export type Filtro = {
  /** 'YYYY-MM', 'TODOS', ou null = mês mais recente com dado */
  mes: string | null;
  /** ids de conta; vazio = todos */
  cartoes: string[];
  obra: boolean;
};

export const COOKIE_FILTRO = 'rx_filtro';
const CHAVES = ['mes', 'cartoes', 'obra'] as const;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (s: string) => UUID.test(s);
const MAX_CARTOES = 20;

export function lerFiltro(q: URLSearchParams): Filtro {
  const m = q.get('mes');
  const mes = m === 'TODOS' || (m && MES.test(m)) ? m : null;
  const cartoes = (q.get('cartoes') ?? '')
    .split(',')
    .filter((c) => UUID.test(c))
    .slice(0, MAX_CARTOES);
  return { mes, cartoes, obra: q.get('obra') === '1' };
}

export function paraQuery(f: Filtro): string {
  const q = new URLSearchParams();
  if (f.mes) q.set('mes', f.mes);
  if (f.cartoes.length) q.set('cartoes', f.cartoes.join(','));
  if (f.obra) q.set('obra', '1');
  return q.toString();
}

/**
 * `searchParams` de uma página do Next → URLSearchParams. Parâmetro repetido
 * (`?mes=a&mes=b`) chega como array e fica de fora: ninguém aqui o produz, e
 * aceitar um dos dois seria adivinhar.
 */
export function deParametros(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') q.set(k, v);
  return q;
}

/**
 * O mês em foco, como `mesAtual()` do legado. `disponiveis` vem do mais recente
 * para o mais antigo (é a ordem de `opcoesDoFiltro`). null = todos os meses.
 */
export function resolverMes(mes: string | null, disponiveis: readonly string[]): string | null {
  if (mes === 'TODOS') return null;
  if (mes && disponiveis.includes(mes)) return mes;
  return disponiveis[0] ?? null;
}

/**
 * Se a URL chegou sem filtro e há um recorte lembrado, devolve a nova `search`
 * para redirecionar; senão null.
 */
export function completarComCookie(search: string, cookie: string | undefined): string | null {
  const atual = new URLSearchParams(search);
  if (CHAVES.some((k) => atual.has(k)) || !cookie) return null;
  const lembrado = paraQuery(lerFiltro(new URLSearchParams(cookie)));
  if (!lembrado) return null;
  for (const [k, v] of new URLSearchParams(lembrado)) atual.set(k, v);
  return `?${atual.toString()}`;
}

/**
 * O que o cookie deve lembrar desta URL, ou null para não mexer nele.
 *
 * Com `cat`, o mês veio fixado pelo link da categoria, não escolhido. O mês
 * mais recente vira "sem mês", como `aplicar` no seletor: lembrado como data,
 * prenderia o app nele quando chegar a fatura do mês seguinte.
 */
export function filtroParaLembrar(params: URLSearchParams, maisRecente: string | undefined): string | null {
  if (params.has('cat')) return null;
  const f = lerFiltro(params);
  return paraQuery(maisRecente && f.mes === maisRecente ? { ...f, mes: null } : f);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function rotuloMes(m: string): string {
  return `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
}

const MESES_EXTENSO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "2026-09" → "Setembro de 2026", para frase inteira (o rótulo curto é `rotuloMes`). */
export function mesPorExtenso(m: string): string {
  return `${MESES_EXTENSO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
}
