/**
 * Uma linha do stream SSE do OpenRouter. Fora do `openrouter.ts` porque ele é
 * `server-only` e o teste precisa importar isto.
 */
export type UsoSse = { tokensIn: number; tokensOut: number; custoUsd: number | null };
export type LinhaSse = { texto: string; uso: UsoSse | null; fim: boolean; erro: string | null };

type Pedaco = {
  choices?: Array<{ delta?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: unknown };
  error?: { message?: unknown };
};

export function lerLinhaSse(linha: string): LinhaSse | null {
  const l = linha.trim();
  // ": OPENROUTER PROCESSING" é comentário de keep-alive; linha vazia separa eventos
  if (!l.startsWith('data:')) return null;
  const dado = l.slice(5).trim();
  if (dado === '[DONE]') return { texto: '', uso: null, fim: true, erro: null };
  let p: Pedaco;
  try {
    p = JSON.parse(dado) as Pedaco;
  } catch {
    return null;
  }
  if (p.error) return { texto: '', uso: null, fim: false, erro: String(p.error.message ?? 'falha') };
  const c = p.choices?.[0]?.delta?.content;
  const u = p.usage;
  return {
    texto: typeof c === 'string' ? c : '',
    uso: u
      ? { tokensIn: u.prompt_tokens ?? 0, tokensOut: u.completion_tokens ?? 0, custoUsd: typeof u.cost === 'number' ? u.cost : null }
      : null,
    fim: false,
    erro: null,
  };
}
