import type { NextRequest } from 'next/server';
import { lerFiltro } from '@/lib/filtro';
import { comUsuario } from '@/lib/rota';
import { listarSuspeitos } from '@/lib/txn-repo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const f = lerFiltro(req.nextUrl.searchParams);
  return comUsuario(async (userId) => ({
    // o mesmo contrato do /api/txn, senão a faixa conta um recorte e a lista mostra outro
    suspeitos: await listarSuspeitos(userId, { mes: f.mes === 'TODOS' ? null : f.mes, accountIds: f.cartoes }),
  }));
}
