import type { NextRequest } from 'next/server';
import { apagarTudo } from '@/lib/dados-repo';
import { confirmouApagar } from '@/lib/dados';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return comUsuario(async (userId) => {
    // a ação mais destrutiva do app: exigir JSON força preflight em qualquer
    // pedido de outra origem, além do SameSite=Lax do cookie de sessão
    if (!req.headers.get('content-type')?.startsWith('application/json')) {
      throw new ErroDeUso('formato', 'pedido precisa ser JSON', 415);
    }
    const corpo = await corpoJson<unknown>(req);
    const c = corpo && typeof corpo === 'object' ? (corpo as { confirmacao?: unknown }) : {};
    if (!confirmouApagar(c.confirmacao)) throw new ErroDeUso('confirmacao', 'digite APAGAR TUDO para confirmar');
    const r = await apagarTudo(userId);
    return { ok: true, conexoesApagadas: r.conexoesApagadas };
  });
}
