/**
 * As categorias do app, iguais às do artifact — ver drizzle/0001_categorias.sql
 * para o porquê de não "melhorar" esses nomes.
 *
 * Sem 'server-only': a lista também é usada nas telas.
 */

export const GRUPOS = ['essencial', 'flexivel', 'encargo'] as const;
export type Grupo = (typeof GRUPOS)[number];

export const CATEGORIAS: ReadonlyArray<{ nome: string; grupo: Grupo }> = [
  { nome: 'Mercado & Padaria', grupo: 'essencial' },
  { nome: 'Casa & Contas', grupo: 'essencial' },
  { nome: 'Transporte', grupo: 'essencial' },
  { nome: 'Saúde & Farmácia', grupo: 'essencial' },
  { nome: 'Educação', grupo: 'essencial' },
  { nome: 'Assinaturas & Apps', grupo: 'essencial' },
  { nome: 'Restaurantes & Delivery', grupo: 'flexivel' },
  { nome: 'Compras & Vestuário', grupo: 'flexivel' },
  { nome: 'Lazer & Viagem', grupo: 'flexivel' },
  { nome: 'Construção / Obras', grupo: 'flexivel' },
  { nome: 'Serviços & Profissional', grupo: 'flexivel' },
  { nome: 'Encargos do cartão', grupo: 'encargo' },
  { nome: 'Outros', grupo: 'flexivel' },
];

export const NOMES = CATEGORIAS.map((c) => c.nome);

/** Categorias que mudaram de nome ao longo do tempo. */
export const RENOMES: Record<string, string> = {
  Mercado: 'Mercado & Padaria',
};

/** Qualquer coisa que não esteja na lista vira "Outros" — nunca null solto. */
export function normalizarCategoria(bruta: string | null | undefined): string {
  if (!bruta) return 'Outros';
  const n = RENOMES[bruta] ?? bruta;
  return NOMES.includes(n) ? n : 'Outros';
}

export function grupoDe(nome: string): Grupo {
  return CATEGORIAS.find((c) => c.nome === nome)?.grupo ?? 'flexivel';
}

/** Compromisso (já estava decidido) × escolha (dava para não gastar). */
export function ehCompromisso(nome: string): boolean {
  return grupoDe(nome) !== 'flexivel';
}
