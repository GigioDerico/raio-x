import 'server-only';
import { env } from '@/env';

/**
 * Cliente mínimo do OpenRouter.
 *
 * Toda chamada de modelo do app passa por aqui — é o único lugar com a chave, e
 * o único ponto onde dado sai da sua infraestrutura. O que pode ir no prompt
 * está definido em `ia.ts`; aqui só se cuida do transporte.
 */

const URL_BASE = 'https://openrouter.ai/api/v1/chat/completions';

export type Uso = { tokensIn: number; tokensOut: number; custoUsd: number | null };

export class SemChaveIA extends Error {
  constructor() {
    super('OPENROUTER_API_KEY não configurada');
    this.name = 'SemChaveIA';
  }
}

export class RespostaNaoJson extends Error {
  constructor(readonly bruto: string) {
    super('o modelo não devolveu JSON válido');
    this.name = 'RespostaNaoJson';
  }
}

type Resposta = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

async function chamar(modelo: string, prompt: string, sinal?: AbortSignal) {
  const r = await fetch(URL_BASE, {
    method: 'POST',
    signal: sinal,
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      // o OpenRouter usa estes dois só para atribuição no painel dele
      'x-title': 'Raio-X',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
      usage: { include: true },
    }),
  });

  const corpo = (await r.json()) as Resposta;
  if (!r.ok || corpo.error) {
    throw new Error(`OpenRouter ${r.status}: ${corpo.error?.message ?? 'falha'}`);
  }
  return corpo;
}

/**
 * Pede JSON ao modelo. Tenta o modelo configurado e, se ele falhar, o reserva —
 * um provedor fora do ar não pode derrubar a importação inteira.
 */
export async function pedirJson<T>(
  prompt: string,
  opcoes: { modelo?: string; sinal?: AbortSignal } = {},
): Promise<{ dados: T; modelo: string; uso: Uso }> {
  if (!env.OPENROUTER_API_KEY) throw new SemChaveIA();

  const tentativas = [opcoes.modelo ?? env.OPENROUTER_MODEL, env.OPENROUTER_MODEL_FALLBACK].filter(
    (m, i, a): m is string => Boolean(m) && a.indexOf(m) === i,
  );

  let ultimoErro: unknown;
  for (const modelo of tentativas) {
    try {
      const corpo = await chamar(modelo, prompt, opcoes.sinal);
      const texto = corpo.choices?.[0]?.message?.content ?? '';
      const uso: Uso = {
        tokensIn: corpo.usage?.prompt_tokens ?? 0,
        tokensOut: corpo.usage?.completion_tokens ?? 0,
        custoUsd: typeof corpo.usage?.cost === 'number' ? corpo.usage.cost : null,
      };
      try {
        return { dados: JSON.parse(extrairJson(texto)) as T, modelo, uso };
      } catch {
        throw new RespostaNaoJson(texto);
      }
    } catch (e) {
      if (opcoes.sinal?.aborted) throw e;
      ultimoErro = e;
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('falha ao chamar o modelo');
}

/** Alguns modelos embrulham o JSON em ```json … ``` mesmo com response_format. */
function extrairJson(texto: string): string {
  const t = texto.trim();
  const cerca = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  if (cerca?.[1]) return cerca[1];
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  return i >= 0 && j > i ? t.slice(i, j + 1) : t;
}
