/**
 * Sessão: um cookie httpOnly assinado com HMAC-SHA256 via Web Crypto.
 *
 * Web Crypto (e não node:crypto) porque o middleware roda no runtime Edge.
 * O cookie carrega só o id do usuário e a expiração — nada sensível, e mesmo
 * assim é assinado para não poder ser forjado.
 */

export const COOKIE = 'raiox_sessao';
export const DURACAO_S = 60 * 60 * 24 * 7; // 7 dias

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function chave(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export type Sessao = { sub: string; exp: number };

export async function assinar(sessao: Sessao, segredo: string): Promise<string> {
  const corpo = b64url(enc.encode(JSON.stringify(sessao)));
  const mac = await crypto.subtle.sign('HMAC', await chave(segredo), enc.encode(corpo));
  return `${corpo}.${b64url(mac)}`;
}

/** Devolve a sessão, ou null se a assinatura não bater ou o prazo tiver passado. */
export async function verificar(token: string | undefined, segredo: string): Promise<Sessao | null> {
  if (!token) return null;
  const ponto = token.lastIndexOf('.');
  if (ponto < 1) return null;

  const corpo = token.slice(0, ponto);
  const mac = token.slice(ponto + 1);

  // Tudo dentro do try: `atob` estoura com base64 inválido, e um cookie
  // adulterado tem de virar "não autenticado", nunca erro 500 — além de ser
  // ruído no log, a diferença entre 401 e 500 conta a quem tentou o que falhou.
  try {
    // crypto.subtle.verify compara em tempo constante
    const ok = await crypto.subtle.verify(
      'HMAC',
      await chave(segredo),
      deB64url(mac) as unknown as ArrayBuffer,
      enc.encode(corpo),
    );
    if (!ok) return null;

    const sessao = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as Sessao;
    if (typeof sessao.exp !== 'number' || sessao.exp * 1000 < Date.now()) return null;
    if (typeof sessao.sub !== 'string' || !sessao.sub) return null;
    return sessao;
  } catch {
    return null;
  }
}
