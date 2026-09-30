/**
 * Texto de lançamento: limpeza, chave de aprendizado e semelhança.
 *
 * Funções puras, sem 'server-only' — as telas usam as mesmas regras que o
 * servidor, e os testes rodam sem subir nada.
 *
 * São DUAS semelhanças, de propósito, porque respondem a perguntas diferentes:
 * `parecido` (bigramas) pergunta "isto é o mesmo texto com um erro de leitura?",
 * e serve ao passe aproximado da deduplicação. `mesmoEstabelecimento` (palavras
 * em comum) pergunta "isto é o mesmo lugar escrito de outro jeito?" — é o que
 * faz "TRANSFERENCIA PARA ADRIANA MARTINS" e "PIX ADRIANA MARTINS" caírem sob o
 * mesmo apelido.
 */

const RUIDO: RegExp[] = [
  /\b\d{1,2}\s*\/\s*\d{1,2}\b/g, // 03/10 de parcela
  /\bPARC(ELA)?\s*\d+\s*\/\s*\d+\b/gi,
  /\bAUT\w*\s*\d+\b/gi, // código de autorização
  /\bDOC\s*\d+\b/gi,
  /\b\d{6,}\b/g, // sequências longas de dígitos
  /\*+/g,
];

const PREFIXOS = /^(COMPRA|CARTAO|DEBITO|CREDITO|PAGTO|PAGAMENTO)\s+/;

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Descrição limpa e inteira — entra no hash da chave de deduplicação. */
export function normalizarDescricao(bruta: string): string {
  let s = semAcento(String(bruta ?? ''));
  for (const r of RUIDO) s = s.replace(r, ' ');
  s = s.replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(PREFIXOS, '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Chave de `learned_label`: as três primeiras palavras da descrição limpa.
 *
 * Três e não a frase inteira porque o final costuma carregar cidade, loja e
 * código, que mudam entre meses — e é o mesmo recorte que o app de hoje usa,
 * então as regras que você já ensinou continuam valendo.
 */
export function chaveAprendizado(bruta: string): string {
  return normalizarDescricao(bruta)
    .replace(/[0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

/** Palavras que não identificam ninguém — ignoradas ao comparar nomes. */
const GENERICOS = new Set([
  'TRANSFERENCIA', 'TRANSFERENCIAS', 'TRANSF', 'PARA', 'PIX', 'TED', 'DOC',
  'ENVIADO', 'RECEBIDO', 'PAGAMENTO', 'PAGTO', 'COMPRA', 'CARTAO', 'DEBITO',
  'CREDITO', 'LTDA', 'EIRELI', 'MEI', 'BRASIL', 'COM', 'APP', 'SERVICOS',
  'SERVICO', 'LOJA', 'REF', 'PARC', 'MENSALIDADE',
]);

export function palavrasUteis(s: string): string[] {
  return semAcento(String(s ?? ''))
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !GENERICOS.has(t));
}

/** Mesmo estabelecimento escrito de outro jeito? */
export function mesmoEstabelecimento(a: string, b: string): boolean {
  const A = new Set(palavrasUteis(a));
  const B = new Set(palavrasUteis(b));
  if (!A.size || !B.size) return false;
  if (A.size === 1 || B.size === 1) return [...A].join(' ') === [...B].join(' ');

  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter >= 1 && inter / Math.min(A.size, B.size) >= 0.6 && inter / Math.max(A.size, B.size) >= 0.5;
}

/** Semelhança 0..1 por bigramas — usada no passe aproximado da deduplicação. */
export function parecido(a: string, b: string): number {
  if (a === b) return 1;
  const bigramas = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bigramas(a);
  const B = bigramas(b);
  if (A.size === 0 || B.size === 0) return 0;

  let comuns = 0;
  for (const g of A) if (B.has(g)) comuns++;
  return (2 * comuns) / (A.size + B.size);
}

/**
 * Limiar do passe aproximado.
 *
 * 0.75 e não 0.82 por aritmética: num texto de ~11 caracteres, UM caractere
 * trocado ("NETFLIX COM" → "NETFLIX C0M") derruba a semelhança para 0.80, e um
 * limiar mais alto deixaria passar duplicata justamente no caso que o passe
 * existe para pegar. O risco de juntar coisas distintas é baixo porque este
 * teste só roda depois de conta igual, valor absoluto igual e data dentro de
 * ±3 dias — e, havendo mais de um candidato, nada é unido automaticamente.
 */
export const LIMIAR_PARECIDO = 0.75;
export const JANELA_DIAS = 3;

// ---------------------------------------------------------------------------
// Números e datas

/** Aceita "1.234,56", "1234,56" e "1234.56". NaN quando não é número. */
export function parseValor(bruto: unknown): number {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : NaN;
  let t = String(bruto ?? '').trim().replace(/[R$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

/** "2026-09" + 2 → "2026-11". Trabalha em UTC para não escorregar de mês. */
export function somarMeses(mes: string, k: number): string {
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) - 1 + k;
  const d = new Date(Date.UTC(ano, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type Parcela = { n: number; total: number };

/** "3/10" → {n:3, total:10}. null quando não é parcela ou não faz sentido. */
export function lerParcela(bruto: unknown): Parcela | null {
  const m = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(String(bruto ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (!(total > 1) || !(n >= 1) || n > total) return null;
  return { n, total };
}
