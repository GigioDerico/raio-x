import 'server-only';
import { env } from '@/env';
import type { Mensagem } from './ia';
import type { ReservaIA } from './ia-limite';
import { lerLinhaSse } from './sse';

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
  // a chamada custou mesmo devolvendo texto ilegível: quem registra o gasto precisa do uso
  constructor(
    readonly bruto: string,
    readonly modelo?: string,
    readonly uso?: Uso,
  ) {
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
  // a reserva não é lida aqui: exigi-la no tipo é o que impede chamada sem trava
  opcoes: { reserva: ReservaIA; modelo?: string; sinal?: AbortSignal },
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
        throw new RespostaNaoJson(texto, modelo, uso);
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

export type EventoStream = { tipo: 'texto'; t: string } | { tipo: 'fim'; modelo: string; uso: Uso };

async function abrirStream(modelo: string, mensagens: Mensagem[], sinal?: AbortSignal) {
  const r = await fetch(URL_BASE, {
    method: 'POST',
    signal: sinal,
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'x-title': 'Raio-X',
    },
    body: JSON.stringify({
      model: modelo,
      messages: mensagens,
      stream: true,
      // texto corrido: um pouco de variação lê melhor que o zero do JSON
      temperature: 0.3,
      usage: { include: true },
    }),
  });
  if (!r.ok || !r.body) {
    const corpo = await r.text().catch(() => '');
    throw new Error(`OpenRouter ${r.status}: ${corpo.slice(0, 200)}`);
  }
  return r.body;
}

async function* linhasDe(corpo: ReadableStream<Uint8Array>) {
  const leitor = corpo.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const linhas = buf.split('\n');
      buf = linhas.pop() ?? '';
      yield* linhas;
    }
    buf += dec.decode();
    if (buf) yield buf;
  } finally {
    // erro no meio, resposta vazia ou consumidor que parou: sem cancelar, o socket fica aberto
    await leitor.cancel().catch(() => {});
    leitor.releaseLock();
  }
}

/**
 * Texto em stream. O reserva só entra se o principal falhar antes da primeira
 * palavra — depois disso, trocar de modelo emendaria duas respostas diferentes.
 * O uso vem no último pedaço (`usage.include`).
 */
export async function* pedirTextoEmStream(
  entrada: string | Mensagem[],
  opcoes: { reserva: ReservaIA; modelo?: string; sinal?: AbortSignal },
): AsyncGenerator<EventoStream> {
  if (!env.OPENROUTER_API_KEY) throw new SemChaveIA();
  const mensagens: Mensagem[] = typeof entrada === 'string' ? [{ role: 'user', content: entrada }] : entrada;

  const tentativas = [opcoes.modelo ?? env.OPENROUTER_MODEL, env.OPENROUTER_MODEL_FALLBACK].filter(
    (m, i, a): m is string => Boolean(m) && a.indexOf(m) === i,
  );

  let ultimoErro: unknown;
  for (const modelo of tentativas) {
    let comecou = false;
    try {
      const corpo = await abrirStream(modelo, mensagens, opcoes.sinal);
      let uso: Uso = { tokensIn: 0, tokensOut: 0, custoUsd: null };
      let terminou = false;
      for await (const linha of linhasDe(corpo)) {
        const p = lerLinhaSse(linha);
        if (!p) continue;
        if (p.erro) throw new Error(`OpenRouter: ${p.erro}`);
        if (p.uso) uso = p.uso;
        if (p.texto) {
          comecou = true;
          yield { tipo: 'texto', t: p.texto };
        }
        if (p.fim) {
          terminou = true;
          break;
        }
      }
      if (!comecou) throw new Error('OpenRouter: resposta vazia');
      // sem [DONE] o texto pode estar truncado, e não pode ser gravado como completo
      if (!terminou) throw new Error('OpenRouter: stream terminou sem [DONE]');
      yield { tipo: 'fim', modelo, uso };
      return;
    } catch (e) {
      if (comecou || opcoes.sinal?.aborted) throw e;
      ultimoErro = e;
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('falha ao chamar o modelo');
}
