import type { NextRequest } from 'next/server';
import { ehUuid } from '@/lib/filtro';
import { pluggy } from '@/lib/pluggy/cliente';
import { cartoesDaConexao, itemDaConexao, limparOrfas, registrarItem } from '@/lib/pluggy/conexao-repo';
import { SemChavePluggy } from '@/lib/pluggy/http';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';

export const runtime = 'nodejs';
export const maxDuration = 60;

const naoEncontrada = () => new ErroDeUso('conexao_nao_encontrada', 'Conexão não encontrada', 404);

/**
 * "Atualizar agora" em duas etapas para caber no limite da Vercel: `iniciar`
 * pede ao Pluggy para buscar no banco; `conferir` (a tela chama a cada 3 s)
 * diz quando o item ficou pronto e devolve os cartões para trazer.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return comUsuario(async (userId) => {
    if (!ehUuid(id)) throw naoEncontrada();
    const corpo = await corpoJson<unknown>(req);
    const etapa = (corpo as { etapa?: unknown } | null)?.etapa === 'conferir' ? 'conferir' : 'iniciar';
    const c = await itemDaConexao(userId, id);
    if (!c) throw naoEncontrada();

    let item;
    try {
      if (etapa === 'iniciar') {
        try {
          item = await pluggy().atualizarItem(c.pluggyItemId);
        } catch (e) {
          // item do MeuPluggy (e outros que o Pluggy atualiza sozinho) recusa o pedido com
          // 400 "cant be updated": não há o que pedir, traz-se o que o Pluggy já tem
          if (!(e instanceof Error && /respondeu 400/.test(e.message))) throw e;
          item = await pluggy().item(c.pluggyItemId);
        }
      } else {
        item = await pluggy().item(c.pluggyItemId);
      }
    } catch (e) {
      if (e instanceof SemChavePluggy) throw new ErroDeUso('sem_chave_pluggy', 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.local', 501);
      throw e;
    }
    if (!item) throw naoEncontrada();
    const status = await registrarItem(userId, c.id, item);

    if (status === 'erro_login') throw new ErroDeUso('erro_login', 'O banco pediu sua senha de novo. Use "Reconectar".');
    if (status === 'atualizando' || etapa === 'iniciar') return { estado: 'atualizando' as const };
    if (status !== 'ativa' && item.status !== 'OUTDATED') {
      throw new ErroDeUso('erro_pluggy', 'O Pluggy não conseguiu ler o banco. Tente de novo em instantes.', 502);
    }
    await limparOrfas(userId, c.id);
    return {
      estado: 'ok' as const,
      cartoes: await cartoesDaConexao(userId, c.id),
      aviso: item.status === 'OUTDATED' ? 'O banco não respondeu na última leitura; os dados podem estar atrasados.' : null,
    };
  });
}
