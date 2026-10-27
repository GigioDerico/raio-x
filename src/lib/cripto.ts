import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '@/env';

/**
 * Criptografia simétrica com autenticação (AES-256-GCM).
 *
 * Usa o SESSION_SECRET como raiz de derivação de chave para que
 * nenhuma chave de API seja salva em texto plano no banco de dados.
 */

function derivarChave(segredo: string): Buffer {
  return createHash('sha256').update(segredo).digest();
}

export function encriptar(texto: string, segredo = env.SESSION_SECRET): string {
  const chave = derivarChave(segredo);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave, iv);

  let enc = cipher.update(texto, 'utf8', 'hex');
  enc += cipher.final('hex');

  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
}

export function decriptar(cifrado: string, segredo = env.SESSION_SECRET): string | null {
  try {
    if (!cifrado || !cifrado.startsWith('v1:')) return null;

    const partes = cifrado.split(':');
    if (partes.length !== 4) return null;

    const [, ivHex, tagHex, encHex] = partes;
    if (!ivHex || !tagHex || !encHex) return null;

    const chave = derivarChave(segredo);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', chave, iv);
    decipher.setAuthTag(tag);

    const parte1 = decipher.update(encHex, 'hex', 'utf8');
    const parte2 = decipher.final('utf8');
    return `${parte1}${parte2}`;
  } catch (e) {
    console.error('[cripto] Falha ao decriptar dado sensível:', e);
    return null;
  }
}
