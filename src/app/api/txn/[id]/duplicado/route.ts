import type { NextRequest } from 'next/server';
import { validarDecisao } from '@/lib/duplicados';
import { ehUuid } from '@/lib/filtro';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { decidirDuplicado } from '@/lib/txn-repo';

export const runtime = 'nodejs';

const naoEncontrado = () => new ErroDeUso('nao_encontrado', 'Lançamento não encontrado', 404);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return comUsuario(async (userId) => {
    if (!ehUuid(id)) throw naoEncontrado();
    const v = validarDecisao(await corpoJson<unknown>(req));
    if (!v.ok) throw new ErroDeUso('decisao_invalida', 'Decisão inválida');
    if (!(await decidirDuplicado(userId, id, v.decisao))) throw naoEncontrado();
    return { ok: true };
  });
}
