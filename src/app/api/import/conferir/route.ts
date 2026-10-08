import type { NextRequest } from 'next/server';
import { limparCabecalho } from '@/lib/extracao';
import { comUsuario, corpoJson } from '@/lib/rota';
import { fraseMesCoberto, mesCoberto } from '@/lib/txn-repo';

export const runtime = 'nodejs';

/**
 * Chamada logo depois do trecho que traz o cabeçalho: se o mês já vem pelo Open
 * Finance, a importação para ali, sem gastar IA com os outros trechos.
 */
export async function POST(req: NextRequest) {
  return comUsuario(async (userId) => {
    // dentro do comUsuario: JSON inválido vira 400, não erro solto da rota
    const corpo = await corpoJson<{ cabecalho?: Record<string, unknown> | null } | null>(req);
    const cab = limparCabecalho(corpo?.cabecalho ?? null);
    if (!cab.cartao || !cab.vencimento) return { coberto: false };
    const mesRef = cab.vencimento.slice(0, 7);
    const coberto = await mesCoberto(userId, cab.cartao, mesRef);
    return coberto ? { coberto: true, mensagem: fraseMesCoberto(mesRef, cab.cartao) } : { coberto: false };
  });
}
