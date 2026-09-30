import 'server-only';
import { z } from 'zod';

/**
 * Validação de ambiente. Derruba o processo se faltar chave ou se encontrar
 * valor de exemplo — é isso que impede um segredo de placeholder virar segredo
 * de produção por descuido.
 *
 * `SKIP_ENV_VALIDATION=1` existe só para o `next build` em CI, onde não há
 * (e não deve haver) segredo nenhum.
 */

const proibidos = ['', 'troque-me', 'changeme', 'exemplo', 'example', 'seu-valor-aqui'];

// O refine tem de ser o ÚLTIMO elo da corrente: ele devolve ZodEffects, que já
// não expõe .url()/.regex()/.min(). Por isso as regras de formato entram na base.
const semPlaceholder = (nome: string, base: z.ZodString = z.string()) =>
  base.min(1, `${nome} não pode ficar vazio`).refine(
    (v) => !proibidos.includes(v.trim().toLowerCase()),
    `${nome} ainda está com o valor de exemplo do .env.example`,
  );

const schema = z.object({
  DATABASE_URL: semPlaceholder('DATABASE_URL', z.string().url('DATABASE_URL precisa ser uma URL')),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

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
  PLUGGY_CLIENT_ID: z.string().optional(),
  PLUGGY_CLIENT_SECRET: z.string().optional(),
  PLUGGY_WEBHOOK_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4.5'),
  OPENROUTER_MODEL_FALLBACK: z.string().default('openai/gpt-4.1-mini'),
  AI_BUDGET_USD_MONTH: z.coerce.number().nonnegative().default(10),
  CRON_SECRET: z.string().optional(),

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
