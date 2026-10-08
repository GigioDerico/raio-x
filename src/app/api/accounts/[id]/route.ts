import type { NextRequest } from 'next/server';
import { validarConta } from '@/lib/ajustes';
import { salvarConta } from '@/lib/ajustes-repo';
import { ehUuid } from '@/lib/filtro';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return comUsuario(async (userId) => {
    const v = validarConta(await corpoJson<unknown>(req));
    if (!v.ok) throw new ErroDeUso(v.codigo, v.mensagem);
    // id que não é uuid faria o Postgres estourar (503); tem de ser o mesmo 404 de um id alheio
    const conta = ehUuid(id) ? await salvarConta(userId, id, v.mudanca) : null;
    if (!conta) throw new ErroDeUso('nao_encontrado', 'cartão não encontrado', 404);
    return { ok: true, conta };
  });
}
