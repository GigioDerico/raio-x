import { montarCsv } from '@/lib/csv';
import { linhasParaCsv } from '@/lib/dados-repo';
import { usuarioAtual } from '@/lib/sessao-servidor';

export const runtime = 'nodejs';

// não usa comUsuario: a resposta é arquivo, não JSON
export async function GET() {
  try {
    const userId = await usuarioAtual();
    if (!userId) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
    const csv = montarCsv(await linhasParaCsv(userId));
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="lancamentos-raio-x.csv"',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[export/csv]', e);
    return Response.json({ erro: 'indisponivel' }, { status: 503 });
  }
}
