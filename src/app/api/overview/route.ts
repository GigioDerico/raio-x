import type { NextRequest } from 'next/server';
import { hojeEmSaoPaulo } from '@/lib/calculos/ciclo';
import { resumoDoPainel } from '@/lib/calculos/painel';
import { lerFiltro } from '@/lib/filtro';
import { carregarContexto } from '@/lib/painel-repo';
import { comUsuario } from '@/lib/rota';

export const runtime = 'nodejs';

/** O mesmo resumo que o painel mostra, em JSON — para teste e para depois. */
export async function GET(req: NextRequest) {
  const f = lerFiltro(req.nextUrl.searchParams);
  return comUsuario(async (userId) => {
    const { ctx, obraPorMes } = await carregarContexto(userId, f);
    return resumoDoPainel(ctx, obraPorMes, f.obra, ctx.renda, hojeEmSaoPaulo());
  });
}
