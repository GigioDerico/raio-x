import type { NextRequest } from 'next/server';
import { ehUuid } from '@/lib/filtro';
import { pluggy } from '@/lib/pluggy/cliente';
import { gravarConexao, limparOrfas } from '@/lib/pluggy/conexao-repo';
import { SemChavePluggy } from '@/lib/pluggy/http';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';

export const runtime = 'nodejs';
export const maxDuration = 60;

const naoEncontrado = () => new ErroDeUso('item_nao_encontrado', 'Conexão não encontrada no Pluggy', 404);

/**
 * O widget devolve o itemId ao navegador; quem garante que o item é desta
 * pessoa é o Pluggy (`clientUserId`, posto pelo connect token), não o corpo.
 * "Não existe" e "não é seu" respondem igual.
 */
export async function POST(req: NextRequest) {
  return comUsuario(async (userId) => {
    const corpo = await corpoJson<unknown>(req);
    const itemId = (corpo as { itemId?: unknown } | null)?.itemId;
    // ids de item do Pluggy são UUID: o resto nem chega à API deles
    if (typeof itemId !== 'string' || !ehUuid(itemId.trim())) throw new ErroDeUso('item_invalido', 'itemId inválido');

    let item;
    try {
      item = await pluggy().item(itemId.trim());
    } catch (e) {
      if (e instanceof SemChavePluggy) throw new ErroDeUso('sem_chave_pluggy', 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.local', 501);
      throw e;
    }
    if (!item || item.clientUserId !== userId || !item.connector) throw naoEncontrado();

    if (item.status === 'UPDATING') return { estado: 'atualizando' as const };
    if (item.status === 'LOGIN_ERROR' || item.status === 'WAITING_USER_INPUT') {
      throw new ErroDeUso('erro_login', 'O banco recusou o acesso. Conecte de novo e confira a senha.');
    }
    if (item.status !== 'UPDATED' && item.status !== 'OUTDATED') {
      throw new ErroDeUso('erro_pluggy', 'O Pluggy não conseguiu ler o banco. Tente de novo em instantes.', 502);
    }

    const contas = await pluggy().contasDoItem(item.id);
    const { conexaoId, cartoes } = await gravarConexao(userId, { ...item, connector: item.connector }, contas, item.status === 'UPDATED' ? 'ativa' : 'erro');
    // um item novo religa os mesmos cartões (last4): a conexão antiga que ficou sem conta se desconecta sozinha
    await limparOrfas(userId, conexaoId);
    return {
      estado: 'ok' as const,
      conexaoId,
      cartoes,
      aviso: item.status === 'OUTDATED' ? 'O banco não respondeu na última leitura; os dados podem estar atrasados.' : null,
    };
  });
}
