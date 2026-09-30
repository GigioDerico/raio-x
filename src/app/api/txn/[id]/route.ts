import type { NextRequest } from 'next/server';
import { NOMES } from '@/lib/categorias';
import { parseValor } from '@/lib/descricao';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { atualizarTxn, excluirTxn, restaurarTxn } from '@/lib/txn-repo';

export const runtime = 'nodejs';

type Corpo = {
  valor?: unknown;
  categoria?: unknown;
  apelido?: unknown;
  data?: unknown;
  restaurar?: unknown;
};

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const corpo = await corpoJson<Corpo>(req);

  return comUsuario(async (userId) => {
    if (corpo.restaurar === true) {
      const linha = await restaurarTxn(userId, id);
      if (!linha) throw new ErroDeUso('nao_encontrado', 'lançamento não encontrado', 404);
      return { ok: true, restaurado: true };
    }

    const mudanca: Parameters<typeof atualizarTxn>[2] = {};

    if (corpo.valor !== undefined) {
      const v = parseValor(corpo.valor);
      if (!Number.isFinite(v)) throw new ErroDeUso('valor_invalido', 'valor não é um número');
      mudanca.valor = Math.round(v * 100) / 100;
    }
    if (corpo.categoria !== undefined) {
      if (corpo.categoria !== null && !NOMES.includes(String(corpo.categoria))) {
        throw new ErroDeUso('categoria_invalida', 'categoria fora da lista');
      }
      mudanca.categoria = corpo.categoria === null ? null : String(corpo.categoria);
    }
    if (corpo.apelido !== undefined) {
      mudanca.apelido = corpo.apelido === null ? null : String(corpo.apelido).slice(0, 60);
    }
    if (corpo.data !== undefined) {
      const d = String(corpo.data).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ErroDeUso('data_invalida', 'data fora do formato');
      mudanca.data = d;
    }

    const linha = await atualizarTxn(userId, id, mudanca);
    // id inexistente e id de outro dono dão a mesma resposta, de propósito
    if (!linha) throw new ErroDeUso('nao_encontrado', 'lançamento não encontrado', 404);
    return { ok: true };
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  return comUsuario(async (userId) => {
    const linha = await excluirTxn(userId, id);
    if (!linha) throw new ErroDeUso('nao_encontrado', 'lançamento não encontrado', 404);
    // o id volta para a tela poder oferecer "desfazer"
    return { ok: true, id: linha.id };
  });
}
