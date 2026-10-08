import type { NextRequest } from 'next/server';
import { ehUuid } from '@/lib/filtro';
import { pluggy } from '@/lib/pluggy/cliente';
import { itemDaConexao } from '@/lib/pluggy/conexao-repo';
import { SemChavePluggy } from '@/lib/pluggy/http';
import { ErroDeUso, comUsuario } from '@/lib/rota';

export const runtime = 'nodejs';

/**
 * Connect token para o widget do Pluggy abrir no navegador. As credenciais
 * (PLUGGY_CLIENT_ID/SECRET) ficam aqui; o navegador só recebe o token, curto
 * e descartável. O `clientUserId` é o usuário da sessão (regra 1), nunca algo
 * vindo do corpo.
 *
 * Corpo opcional: sem ele, conexão nova; com `conexaoId`, o widget abre no
 * item existente (reconectar/renovar) — o `itemId` vem do banco pela posse já
 * conferida (regra 2), nunca do que o cliente mandar.
 */
export async function POST(req: NextRequest) {
  return comUsuario(async (userId) => {
    const texto = await req.text();
    let conexaoId: unknown;
    if (texto) {
      try {
        conexaoId = (JSON.parse(texto) as { conexaoId?: unknown })?.conexaoId;
      } catch {
        throw new ErroDeUso('json_invalido', 'corpo da requisição não é JSON');
      }
    }
    let itemId: string | undefined;
    if (conexaoId !== undefined) {
      if (typeof conexaoId !== 'string' || !ehUuid(conexaoId)) throw new ErroDeUso('conexao_nao_encontrada', 'Conexão não encontrada', 404);
      const c = await itemDaConexao(userId, conexaoId);
      if (!c) throw new ErroDeUso('conexao_nao_encontrada', 'Conexão não encontrada', 404);
      itemId = c.pluggyItemId;
    }
    try {
      return { accessToken: await pluggy().connectToken(userId, itemId) };
    } catch (e) {
      if (e instanceof SemChavePluggy) {
        throw new ErroDeUso('sem_chave_pluggy', 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.local', 501);
      }
      throw e;
    }
  });
}
