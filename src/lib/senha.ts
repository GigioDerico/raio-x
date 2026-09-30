/**
 * Hash e conferência da senha única.
 *
 * Este arquivo é de propósito independente: não importa 'server-only' nem o
 * banco, então dá para testá-lo e usá-lo no script `hash-senha` sem arrastar
 * meio app junto. A espera crescente por IP, que precisa do banco, vive em
 * `auth.ts`.
 */
import { scrypt as _scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number },
) => Promise<Buffer>;

export const N = 16384;
export const R = 8;
export const P = 1;
export const TAMANHO = 32;

/**
 * Separador `:` e não `$`: o Next expande `$VAR` dentro dos arquivos .env, e um
 * `$16384` no meio do hash viraria string vazia — o login falharia com uma
 * mensagem que não aponta para a causa.
 */
export const SEP = ':';

/** Bate com o regex de APP_PASSWORD_HASH em src/env.ts. */
export const FORMATO = /^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

const b64url = (b: Buffer) => b.toString('base64url');

/** Formato: scrypt:N:r:p:sal:hash — sal e hash em base64url. */
export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha.normalize('NFKC'), sal, TAMANHO, { N, r: R, p: P });
  return ['scrypt', N, R, P, b64url(sal), b64url(hash)].join(SEP);
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.trim().split(SEP);
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, sN, sr, sp, sSal, sHash] = partes as [string, string, string, string, string, string];
  const sal = Buffer.from(sSal, 'base64url');
  const esperado = Buffer.from(sHash, 'base64url');

  // O comprimento derivado é fixo, não o do valor guardado: a saída do scrypt
  // com dkLen menor é PREFIXO da saída maior, então um hash truncado passaria
  // na comparação se deixássemos o próprio hash ditar quantos bytes derivar.
  if (esperado.length !== TAMANHO || sal.length === 0) return false;

  const custo = { N: Number(sN), r: Number(sr), p: Number(sp) };
  if (!Number.isInteger(custo.N) || !Number.isInteger(custo.r) || !Number.isInteger(custo.p)) return false;
  if (custo.N < 1024 || custo.r < 1 || custo.p < 1) return false;

  let obtido: Buffer;
  try {
    obtido = await scrypt(senha.normalize('NFKC'), sal, TAMANHO, custo);
  } catch {
    return false;
  }

  return timingSafeEqual(obtido, esperado);
}
