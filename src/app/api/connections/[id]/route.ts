import type { NextRequest } from 'next/server';
import { ehUuid } from '@/lib/filtro';
import { desconectar } from '@/lib/pluggy/conexao-repo';
import { SemChavePluggy } from '@/lib/pluggy/http';
import { ErroDeUso, comUsuario } from '@/lib/rota';

export const runtime = 'nodejs';

const naoEncontrada = () => new ErroDeUso('conexao_nao_encontrada', 'Conexão não encontrada', 404);

/**
 * Desconecta um banco: revoga o item no Pluggy e para a conexão de
 * sincronizar. Os lançamentos já trazidos ficam (guia, "Conexões") — só
 * `desconectar` em `conexao-repo.ts` decide isso, aqui é só a rota.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return comUsuario(async (userId) => {
    if (!ehUuid(id)) throw naoEncontrada();
    try {
      if (!(await desconectar(userId, id))) throw naoEncontrada();
    } catch (e) {
      if (e instanceof SemChavePluggy) throw new ErroDeUso('sem_chave_pluggy', 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.local', 501);
      throw e;
    }
    return { ok: true };
  });
}
