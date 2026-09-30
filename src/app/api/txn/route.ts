import type { NextRequest } from 'next/server';
import { comUsuario } from '@/lib/rota';
import { listarTxn } from '@/lib/txn-repo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const mes = q.get('mes');

  return comUsuario(async (userId) => {
    const linhas = await listarTxn(userId, {
      mes: mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null,
      accountId: q.get('conta'),
      categoria: q.get('categoria'),
      busca: q.get('busca'),
      limite: Number(q.get('limite')) || undefined,
    });
    return { linhas, total: linhas.reduce((s, l) => s + Number(l.valor), 0) };
  });
}
