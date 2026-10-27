import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Confere o segredo de cron e webhook. Compara os hashes, não os textos:
 * `timingSafeEqual` exige o mesmo tamanho, e um `if` de tamanho antes dele
 * vazaria pelo tempo o comprimento do segredo.
 *
 * Esperado vazio nunca confere — rota sem segredo configurado não pode virar
 * rota aberta para quem mandar cabeçalho vazio.
 */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!esperado) return false;
  const a = createHash('sha256').update(recebido ?? '').digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Regra do `src/env.ts` para `CRON_SECRET` e `PLUGGY_WEBHOOK_SECRET`, aqui
 * para o teste importar (`env.ts` é `server-only`). Vazio vale como "não
 * configurado" — é como o `.env.example` chega e o que deixa a rota em 404 —;
 * curto derruba o app: um segredo que se adivinha protege tanto quanto nenhum.
 */
export const segredoOpcional = (nome: string) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32, `${nome} precisa de 32+ caracteres`).optional());

const PROIBIDOS_PLACEHOLDER = ['', 'troque-me', 'changeme', 'exemplo', 'example', 'seu-valor-aqui'];

export const sanitizarEnvVar = (nome: string, v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  return v
    .trim()
    .replace(new RegExp(`^${nome}\\s*=\\s*`, 'i'), '')
    .replace(/^psql\\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
};

/**
 * Para chaves de API opcionais (Anthropic, OpenAI, OpenRouter, Pluggy).
 * Vazio ou ausente vira `undefined` (não configurado).
 * Se tiver valor de exemplo/placeholder proibido, derruba o processo no startup.
 */
export const chaveOpcionalSemPlaceholder = (nome: string) =>
  z.preprocess((v) => {
    const limpo = sanitizarEnvVar(nome, v);
    if (typeof limpo !== 'string' || limpo.length === 0) return undefined;
    if (PROIBIDOS_PLACEHOLDER.includes(limpo.toLowerCase())) {
      throw new Error(`${nome} não pode conter valor de exemplo/placeholder proibido ("${limpo}")`);
    }
    return limpo;
  }, z.string().optional());

