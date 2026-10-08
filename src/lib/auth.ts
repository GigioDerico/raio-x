import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { FALHAS_GLOBAIS_HORA, LIVRES, TETO_S, VAGA_GLOBAL_S } from './tentativas';

// A cripto da senha vive em senha.ts, sem dependência de banco nem de runtime.
export { gerarHash, conferirSenha, FORMATO, SEP } from './senha';

// ---------------------------------------------------------------------------
// Espera crescente por IP, e uma vaga por minuto para todos sob ataque
//
// A tentativa é reservada ANTES do scrypt, num comando só: o `on conflict do
// update` trava a linha, e o `where` deixa passar só quem não está em espera.
// Ler o bloqueio e gravar a falha em comandos separados deixava N pedidos em
// paralelo passarem juntos (auditoria 4.3, A-07).

// não é IP: não colide com nenhuma chave de IP nem com 'sem-ip'
const GLOBAL = '*';

// O expoente para em 30 (2^30 s já passa muito do teto): a contagem só zera com
// login certo, e `power` em double precision dá erro de overflow perto de 2^1024 —
// um balde atacado por semanas travaria o login de vez num 503.
const EXPOENTE_MAX = 30;

/** Segundos que ainda faltam para esta chave poder tentar de novo (0 = pode). */
async function bloqueioRestante(chave: string): Promise<number> {
  const linhas = await db.execute<{ faltam: number }>(sql`
    select greatest(0, ceil(extract(epoch from (bloqueado_ate - now()))))::int as faltam
    from login_attempt
    where ip = ${chave} and bloqueado_ate is not null and bloqueado_ate > now()
  `);
  return linhas.rows[0]?.faltam ?? 0;
}

/**
 * Só leitura: a espera que este IP ainda cumpre. Não reserva nada — quem conta
 * a tentativa, atômico, continua sendo `reservarTentativa`.
 */
export function esperaDoIp(ip: string): Promise<number> {
  return bloqueioRestante(ip);
}

/**
 * Conta uma tentativa para o IP e já grava a espera da próxima (a mesma escada
 * de `esperaSegundos`). Em espera: não conta e devolve os segundos que faltam.
 */
export async function reservarTentativa(ip: string): Promise<number> {
  // `where` falso no `do update` não devolve linha: é isso que diz "em espera"
  const r = await db.execute(sql`
    insert into login_attempt (ip, tentativas, bloqueado_ate, atualizado_em)
    values (${ip}, 1, null, now())
    on conflict (ip) do update set
      tentativas = login_attempt.tentativas + 1,
      bloqueado_ate = case
        when login_attempt.tentativas + 1 > ${LIVRES}::int
          then now() + make_interval(secs => least(
            power(2::double precision, least(login_attempt.tentativas + 1 - ${LIVRES}::int, ${EXPOENTE_MAX}::int)),
            ${TETO_S}::int
          ))
        else null
      end,
      atualizado_em = now()
    where login_attempt.bloqueado_ate is null or login_attempt.bloqueado_ate <= now()
    returning tentativas
  `);
  if (r.rows.length) return 0;
  // a espera pode ter acabado entre os dois comandos: ainda assim, esta não passou
  return Math.max(1, await bloqueioRestante(ip));
}

/** Com o teto global ativo, uma tentativa por VAGA_GLOBAL_S para todos; senão, 0. */
export async function reservarVagaGlobal(): Promise<number> {
  const c = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from login_falha where em > now() - interval '1 hour'
  `);
  if ((c.rows[0]?.n ?? 0) < FALHAS_GLOBAIS_HORA) return 0;

  const r = await db.execute(sql`
    insert into login_attempt (ip, tentativas, bloqueado_ate, atualizado_em)
    values (${GLOBAL}, 1, now() + make_interval(secs => ${VAGA_GLOBAL_S}::int), now())
    on conflict (ip) do update set
      tentativas = login_attempt.tentativas + 1,
      bloqueado_ate = now() + make_interval(secs => ${VAGA_GLOBAL_S}::int),
      atualizado_em = now()
    where login_attempt.bloqueado_ate is null or login_attempt.bloqueado_ate <= now()
    returning tentativas
  `);
  if (r.rows.length) return 0;
  return Math.max(1, await bloqueioRestante(GLOBAL));
}

/** Senha errada: entra na conta global; as de mais de um dia já não contam para nada. */
export async function registrarFalhaGlobal(): Promise<void> {
  // CTE de escrita roda mesmo sem ser referenciada: um comando, dois efeitos
  await db.execute(sql`
    with nova as (insert into login_falha default values returning id)
    delete from login_falha where em < now() - interval '1 day'
  `);
}

export async function limparFalhas(ip: string): Promise<void> {
  await db.execute(sql`delete from login_attempt where ip = ${ip}`);
}
