import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

// A cripto da senha vive em senha.ts, sem dependência de banco nem de runtime.
export { gerarHash, conferirSenha, FORMATO, SEP } from './senha';

// ---------------------------------------------------------------------------
// Espera crescente por IP

const LIVRES = 3; // tentativas antes de começar a esperar
const TETO_S = 15 * 60;

function esperaSegundos(tentativas: number): number {
  if (tentativas <= LIVRES) return 0;
  return Math.min(2 ** (tentativas - LIVRES), TETO_S);
}

/** Segundos que ainda faltam para este IP poder tentar de novo (0 = pode). */
export async function bloqueioRestante(ip: string): Promise<number> {
  const linhas = await db.execute<{ faltam: number }>(sql`
    select greatest(0, ceil(extract(epoch from (bloqueado_ate - now()))))::int as faltam
    from login_attempt
    where ip = ${ip} and bloqueado_ate is not null and bloqueado_ate > now()
  `);
  return linhas.rows[0]?.faltam ?? 0;
}

export async function registrarFalha(ip: string): Promise<void> {
  const linhas = await db.execute<{ tentativas: number }>(sql`
    insert into login_attempt (ip, tentativas, atualizado_em)
    values (${ip}, 1, now())
    on conflict (ip) do update
      set tentativas = login_attempt.tentativas + 1, atualizado_em = now()
    returning tentativas
  `);

  const tentativas = linhas.rows[0]?.tentativas ?? 1;
  const espera = esperaSegundos(tentativas);
  if (espera > 0) {
    await db.execute(sql`
      update login_attempt
      set bloqueado_ate = now() + make_interval(secs => ${espera})
      where ip = ${ip}
    `);
  }
}

export async function limparFalhas(ip: string): Promise<void> {
  await db.execute(sql`delete from login_attempt where ip = ${ip}`);
}
