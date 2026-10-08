import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@/env';
import * as schema from './schema';

/**
 * Driver HTTP do Neon: funciona em função serverless sem segurar conexão TCP.
 * Migração usa a string não-pooled (ver scripts/migrar.ts).
 *
 * A conexão é criada na PRIMEIRA consulta, não na importação do módulo. Sem
 * isso o `next build` tenta conectar durante a coleta de rotas, onde não há
 * (nem deve haver) DATABASE_URL.
 */
type Db = ReturnType<typeof criar>;

function criar() {
  return drizzle(neon(env.DATABASE_URL), { schema });
}

let instancia: Db | undefined;

export const db = new Proxy({} as Db, {
  get(_alvo, prop, receptor) {
    instancia ??= criar();
    return Reflect.get(instancia, prop, receptor);
  },
});

export { schema };
