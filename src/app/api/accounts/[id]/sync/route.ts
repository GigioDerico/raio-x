import type { NextRequest } from 'next/server';
import { ehUuid } from '@/lib/filtro';
import { SemChavePluggy } from '@/lib/pluggy/http';
import { sincronizarCartao } from '@/lib/pluggy/sync-auto';
import { ErroDeUso, comUsuario } from '@/lib/rota';

export const runtime = 'nodejs';
// um cartão por requisição: 3 meses de lançamentos, faturas e a IA cabem no limite da Vercel
export const maxDuration = 60;

const naoEncontrada = () => new ErroDeUso('conta_nao_encontrada', 'Cartão não encontrado', 404);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return comUsuario(async (userId) => {
    if (!ehUuid(id)) throw naoEncontrada();
    // "atualizar agora" (tela de conexões) pede a janela desde o último sync; o resto é a carga inicial
    const janela = req.nextUrl.searchParams.get('janela') === 'atualizar' ? 'atualizar' : 'inicial';
    let r;
    try {
      r = await sincronizarCartao(userId, id, janela);
    } catch (e) {
      if (e instanceof SemChavePluggy) throw new ErroDeUso('sem_chave_pluggy', 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.local', 501);
      throw e;
    }
    if (!r) throw naoEncontrada();
    return r;
  });
}
