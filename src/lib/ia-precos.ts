/**
 * Tabela de preços de modelos oficiais (Anthropic e OpenAI).
 * O OpenRouter já devolve o custo exato em `usage.cost`.
 * Preços em USD por milhão de tokens (input / output).
 *
 * Puro, sem `server-only`: testes e cliente podem importar direto.
 */

export type PrecoModelo = { entrada: number; saida: number };

export const TABELA_PRECOS: Record<string, PrecoModelo> = {
  // Anthropic
  'claude-3-7-sonnet': { entrada: 3.0, saida: 15.0 },
  'claude-3-5-sonnet': { entrada: 3.0, saida: 15.0 },
  'claude-3-5-haiku': { entrada: 0.8, saida: 4.0 },
  'claude-3-haiku': { entrada: 0.25, saida: 1.25 },
  'claude-3-opus': { entrada: 15.0, saida: 75.0 },

  // OpenAI
  'gpt-4o': { entrada: 2.5, saida: 10.0 },
  'gpt-4o-mini': { entrada: 0.15, saida: 0.6 },
  'gpt-4.1-mini': { entrada: 0.4, saida: 1.6 },
  'gpt-4.1': { entrada: 2.0, saida: 8.0 },
  'o1': { entrada: 15.0, saida: 60.0 },
  'o1-mini': { entrada: 3.0, saida: 12.0 },
  'o3-mini': { entrada: 1.1, saida: 4.4 },
};

/**
 * Calcula o custo em USD de uma chamada quando o provedor não entrega o custo pronto.
 * Se o modelo não estiver na tabela, devolve null (entra como 'semCusto' na contabilidade).
 */
export function calcularCustoUsd(modelo: string, tokensIn: number, tokensOut: number): number | null {
  const mod = modelo.toLowerCase().trim();
  // Mais específicos primeiro (ex: 'gpt-4o-mini' antes de 'gpt-4o')
  const chaves = Object.keys(TABELA_PRECOS).sort((a, b) => b.length - a.length);
  for (const chave of chaves) {
    if (mod === chave || mod.startsWith(chave) || mod.includes(chave)) {
      const preco = TABELA_PRECOS[chave]!;
      const custo = (tokensIn * preco.entrada + tokensOut * preco.saida) / 1_000_000;
      return Number(custo.toFixed(6));
    }
  }
  return null;
}
