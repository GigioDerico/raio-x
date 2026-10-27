import 'server-only';
import { z } from 'zod';
import { segredoOpcional, chaveOpcionalSemPlaceholder } from '@/lib/segredo';

/**
 * Validação de ambiente. Derruba o processo se faltar chave ou se encontrar
 * valor de exemplo — é isso que impede um segredo de placeholder virar segredo
 * de produção por descuido.
 *
 * `SKIP_ENV_VALIDATION=1` existe só para o `next build` em CI, onde não há
 * (e não deve haver) segredo nenhum.
 */

const proibidos = ['', 'troque-me', 'changeme', 'exemplo', 'example', 'seu-valor-aqui'];

// Remove aspas simples/duplas acidentais, prefixo "VAR_NAME=" e "psql" copiados de dashboards
const sanitizar = (nome: string, v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  return v
    .trim()
    .replace(new RegExp(`^${nome}\\s*=\\s*`, 'i'), '')
    .replace(/^psql\\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
};

const semPlaceholder = <T extends z.ZodType<string>>(nome: string, base: T) =>
  z.preprocess(
    (v) => sanitizar(nome, v),
    base.refine(
      (v) => !proibidos.includes(v.trim().toLowerCase()) && v.trim().length > 0,
      `${nome} não pode ficar vazio ou com valor de exemplo`,
    ),
  );

const schema = z.object({
  DATABASE_URL: semPlaceholder(
    'DATABASE_URL',
    z.string().url('DATABASE_URL precisa ser uma URL válida (ex.: postgresql://usuario:senha@host/banco)'),
  ),
  DATABASE_URL_UNPOOLED: z.preprocess((v) => {
    const limpo = sanitizar('DATABASE_URL_UNPOOLED', v);
    return typeof limpo === 'string' && limpo.length > 0 ? limpo : undefined;
  }, z.string().url('DATABASE_URL_UNPOOLED precisa ser uma URL válida').optional()),

  // Sessão e senha única
  APP_PASSWORD_HASH: semPlaceholder(
    'APP_PASSWORD_HASH',
    z.string().regex(
      /^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/,
      'APP_PASSWORD_HASH fora do formato; gere com `npm run hash-senha`',
    ),
  ),
  SESSION_SECRET: semPlaceholder(
    'SESSION_SECRET',
    z.string().min(32, 'SESSION_SECRET precisa de 32+ caracteres'),
  ),

  // Fatia 4 em diante — opcionais enquanto não existem
  PLUGGY_CLIENT_ID: chaveOpcionalSemPlaceholder('PLUGGY_CLIENT_ID'),
  PLUGGY_CLIENT_SECRET: chaveOpcionalSemPlaceholder('PLUGGY_CLIENT_SECRET'),
  PLUGGY_WEBHOOK_SECRET: segredoOpcional('PLUGGY_WEBHOOK_SECRET'),
  // IA multi-provedor (claude-cli | codex-cli | openrouter | anthropic | openai)
  IA_PROVEDOR: z.enum(['claude-cli', 'codex-cli', 'openrouter', 'anthropic', 'openai']).default('openrouter'),
  ANTHROPIC_API_KEY: chaveOpcionalSemPlaceholder('ANTHROPIC_API_KEY'),
  OPENAI_API_KEY: chaveOpcionalSemPlaceholder('OPENAI_API_KEY'),
  IA_MODEL: z.string().optional(),
  IA_MODEL_FALLBACK: z.string().optional(),
  OPENROUTER_API_KEY: chaveOpcionalSemPlaceholder('OPENROUTER_API_KEY'),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),
  OPENROUTER_MODEL_FALLBACK: z.string().default('openai/gpt-4.1-mini'),
  AI_BUDGET_USD_MONTH: z.coerce.number().nonnegative().default(10),
  CRON_SECRET: segredoOpcional('CRON_SECRET'),
  // login atrás de proxy fora da Vercel: o cabeçalho que ELE escreve (ver src/lib/ip.ts)
  IP_HEADER: z.string().optional(),
  // a Vercel define VERCEL=1 no runtime
  VERCEL: z.string().optional(),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof schema>;

function carregar(): Env {
  if (process.env.SKIP_ENV_VALIDATION === '1') {
    return process.env as unknown as Env;
  }

  const r = schema.safeParse(process.env);
  if (!r.success) {
    const linhas = r.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Ambiente inválido — o app não sobe assim:\n${linhas.join('\n')}\n\n` +
        'Copie .env.example para .env.local e preencha.',
    );
  }
  return r.data;
}

export const env = carregar();
