import 'server-only';
import { env } from '@/env';
import type { Mensagem } from './ia';
import type { ReservaIA } from './ia-limite';
import { calcularCustoUsd } from './ia-precos';
import { lerLinhaSse } from './sse';
import { lerLinhaSseAnthropic } from './sse-anthropic';

/**
 * Cliente unificado de IA do Raio-X.
 *
 * Suporta 3 provedores:
 * - 'openrouter': OpenRouter API (agregador multi-modelo)
 * - 'anthropic': Anthropic Claude API oficial
 * - 'openai': OpenAI GPT API oficial
 *
 * Toda chamada de modelo do app passa por aqui — é o único lugar com as chaves, e
 * o único ponto onde dado sai da sua infraestrutura. O que pode ir no prompt
 * está definido em `ia.ts`; aqui só se cuida do transporte.
 */

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const URL_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const URL_OPENAI = 'https://api.openai.com/v1/chat/completions';

export type Uso = { tokensIn: number; tokensOut: number; custoUsd: number | null };

export class SemChaveIA extends Error {
  constructor(mensagem?: string) {
    const prov = env.IA_PROVEDOR;
    const chave = prov === 'anthropic' ? 'ANTHROPIC_API_KEY' : prov === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
    super(mensagem ?? `${chave} não configurada`);
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

export type EventoStream = { tipo: 'texto'; t: string } | { tipo: 'fim'; modelo: string; uso: Uso };

export function provedorAtivo(): 'openrouter' | 'anthropic' | 'openai' {
  return env.IA_PROVEDOR;
}

export function iaConfigurada(): boolean {
  const prov = env.IA_PROVEDOR;
  if (prov === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY);
  if (prov === 'openai') return Boolean(env.OPENAI_API_KEY);
  return Boolean(env.OPENROUTER_API_KEY);
}

export function modelosPadrao(): { principal: string; fallback: string } {
  const prov = env.IA_PROVEDOR;
  if (prov === 'anthropic') {
    return {
      principal: env.IA_MODEL || 'claude-3-5-sonnet-20241022',
      fallback: env.IA_MODEL_FALLBACK || 'claude-3-5-haiku-20241022',
    };
  }
  if (prov === 'openai') {
    return {
      principal: env.IA_MODEL || 'gpt-4o',
      fallback: env.IA_MODEL_FALLBACK || 'gpt-4o-mini',
    };
  }
  return {
    principal: env.IA_MODEL || env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5',
    fallback: env.IA_MODEL_FALLBACK || env.OPENROUTER_MODEL_FALLBACK || 'openai/gpt-4.1-mini',
  };
}

type RespostaChat = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
};

type RespostaAnthropic = {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
};

async function chamarOpenRouter(modelo: string, prompt: string, sinal?: AbortSignal) {
  const r = await fetch(URL_OPENROUTER, {
    method: 'POST',
    signal: sinal,
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
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

  const corpo = (await r.json()) as RespostaChat;
  if (!r.ok || corpo.error) {
    throw new Error(`OpenRouter ${r.status}: ${corpo.error?.message ?? 'falha'}`);
  }
  const texto = corpo.choices?.[0]?.message?.content ?? '';
  const uso: Uso = {
    tokensIn: corpo.usage?.prompt_tokens ?? 0,
    tokensOut: corpo.usage?.completion_tokens ?? 0,
    custoUsd: typeof corpo.usage?.cost === 'number' ? corpo.usage.cost : null,
  };
  return { texto, uso };
}

async function chamarAnthropic(modelo: string, prompt: string, sinal?: AbortSignal) {
  const r = await fetch(URL_ANTHROPIC, {
    method: 'POST',
    signal: sinal,
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  });

  const corpo = (await r.json()) as RespostaAnthropic;
  if (!r.ok || corpo.error) {
    throw new Error(`Anthropic ${r.status}: ${corpo.error?.message ?? 'falha'}`);
  }
  const texto = corpo.content?.[0]?.text ?? '';
  const tokensIn = corpo.usage?.input_tokens ?? 0;
  const tokensOut = corpo.usage?.output_tokens ?? 0;
  const uso: Uso = {
    tokensIn,
    tokensOut,
    custoUsd: calcularCustoUsd(modelo, tokensIn, tokensOut),
  };
  return { texto, uso };
}

async function chamarOpenAI(modelo: string, prompt: string, sinal?: AbortSignal) {
  const r = await fetch(URL_OPENAI, {
    method: 'POST',
    signal: sinal,
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  const corpo = (await r.json()) as RespostaChat;
  if (!r.ok || corpo.error) {
    throw new Error(`OpenAI ${r.status}: ${corpo.error?.message ?? 'falha'}`);
  }
  const texto = corpo.choices?.[0]?.message?.content ?? '';
  const tokensIn = corpo.usage?.prompt_tokens ?? 0;
  const tokensOut = corpo.usage?.completion_tokens ?? 0;
  const uso: Uso = {
    tokensIn,
    tokensOut,
    custoUsd: calcularCustoUsd(modelo, tokensIn, tokensOut),
  };
  return { texto, uso };
}

async function chamarAtivo(modelo: string, prompt: string, sinal?: AbortSignal) {
  const prov = env.IA_PROVEDOR;
  if (prov === 'anthropic') return chamarAnthropic(modelo, prompt, sinal);
  if (prov === 'openai') return chamarOpenAI(modelo, prompt, sinal);
  return chamarOpenRouter(modelo, prompt, sinal);
}

/**
 * Pede JSON ao modelo. Tenta o modelo configurado e, se ele falhar, o reserva —
 * um modelo fora do ar não pode derrubar a importação inteira.
 */
export async function pedirJson<T>(
  prompt: string,
  // a reserva não é lida aqui: exigi-la no tipo é o que impede chamada sem trava
  opcoes: { reserva: ReservaIA; modelo?: string; sinal?: AbortSignal },
): Promise<{ dados: T; modelo: string; uso: Uso }> {
  if (!iaConfigurada()) throw new SemChaveIA();

  const padrao = modelosPadrao();
  const tentativas = [opcoes.modelo ?? padrao.principal, padrao.fallback].filter(
    (m, i, a): m is string => Boolean(m) && a.indexOf(m) === i,
  );

  let ultimoErro: unknown;
  for (const modelo of tentativas) {
    try {
      const { texto, uso } = await chamarAtivo(modelo, prompt, opcoes.sinal);
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

async function abrirStreamOpenRouter(modelo: string, mensagens: Mensagem[], sinal?: AbortSignal) {
  const r = await fetch(URL_OPENROUTER, {
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

async function abrirStreamOpenAI(modelo: string, mensagens: Mensagem[], sinal?: AbortSignal) {
  const r = await fetch(URL_OPENAI, {
    method: 'POST',
    signal: sinal,
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      messages: mensagens,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.3,
    }),
  });
  if (!r.ok || !r.body) {
    const corpo = await r.text().catch(() => '');
    throw new Error(`OpenAI ${r.status}: ${corpo.slice(0, 200)}`);
  }
  return r.body;
}

async function abrirStreamAnthropic(modelo: string, mensagens: Mensagem[], sinal?: AbortSignal) {
  const r = await fetch(URL_ANTHROPIC, {
    method: 'POST',
    signal: sinal,
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 4096,
      messages: mensagens,
      stream: true,
      temperature: 0.3,
    }),
  });
  if (!r.ok || !r.body) {
    const corpo = await r.text().catch(() => '');
    throw new Error(`Anthropic ${r.status}: ${corpo.slice(0, 200)}`);
  }
  return r.body;
}

/**
 * Texto em stream. O reserva só entra se o principal falhar antes da primeira
 * palavra — depois disso, trocar de modelo emendaria duas respostas diferentes.
 */
export async function* pedirTextoEmStream(
  entrada: string | Mensagem[],
  opcoes: { reserva: ReservaIA; modelo?: string; sinal?: AbortSignal },
): AsyncGenerator<EventoStream> {
  if (!iaConfigurada()) throw new SemChaveIA();
  const mensagens: Mensagem[] = typeof entrada === 'string' ? [{ role: 'user', content: entrada }] : entrada;

  const padrao = modelosPadrao();
  const tentativas = [opcoes.modelo ?? padrao.principal, padrao.fallback].filter(
    (m, i, a): m is string => Boolean(m) && a.indexOf(m) === i,
  );

  const prov = env.IA_PROVEDOR;
  let ultimoErro: unknown;

  for (const modelo of tentativas) {
    let comecou = false;
    try {
      if (prov === 'anthropic') {
        const corpo = await abrirStreamAnthropic(modelo, mensagens, opcoes.sinal);
        let tokensIn = 0;
        let tokensOut = 0;
        let terminou = false;

        for await (const linha of linhasDe(corpo)) {
          const p = lerLinhaSseAnthropic(linha);
          if (!p) continue;
          if (p.erro) throw new Error(`Anthropic: ${p.erro}`);
          if (p.tokensIn) tokensIn = p.tokensIn;
          if (p.tokensOut) tokensOut += p.tokensOut;
          if (p.texto) {
            comecou = true;
            yield { tipo: 'texto', t: p.texto };
          }
          if (p.fim) {
            terminou = true;
            break;
          }
        }
        if (!comecou) throw new Error('Anthropic: resposta vazia');
        if (!terminou) throw new Error('Anthropic: stream interrompido antes do fim');
        const uso: Uso = {
          tokensIn,
          tokensOut,
          custoUsd: calcularCustoUsd(modelo, tokensIn, tokensOut),
        };
        yield { tipo: 'fim', modelo, uso };
        return;
      }

      // OpenAI ou OpenRouter
      const corpo = prov === 'openai'
        ? await abrirStreamOpenAI(modelo, mensagens, opcoes.sinal)
        : await abrirStreamOpenRouter(modelo, mensagens, opcoes.sinal);

      let uso: Uso = { tokensIn: 0, tokensOut: 0, custoUsd: null };
      let terminou = false;
      for await (const linha of linhasDe(corpo)) {
        const p = lerLinhaSse(linha);
        if (!p) continue;
        if (p.erro) throw new Error(`${prov === 'openai' ? 'OpenAI' : 'OpenRouter'}: ${p.erro}`);
        if (p.uso) {
          uso = {
            ...p.uso,
            custoUsd: p.uso.custoUsd ?? calcularCustoUsd(modelo, p.uso.tokensIn, p.uso.tokensOut),
          };
        }
        if (p.texto) {
          comecou = true;
          yield { tipo: 'texto', t: p.texto };
        }
        if (p.fim) {
          terminou = true;
          break;
        }
      }
      if (!comecou) throw new Error(`${prov === 'openai' ? 'OpenAI' : 'OpenRouter'}: resposta vazia`);
      if (!terminou) throw new Error(`${prov === 'openai' ? 'OpenAI' : 'OpenRouter'}: stream terminou sem [DONE]`);
      yield { tipo: 'fim', modelo, uso };
      return;
    } catch (e) {
      if (comecou || opcoes.sinal?.aborted) throw e;
      ultimoErro = e;
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('falha ao chamar o modelo');
}
