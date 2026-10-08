import type { NextRequest } from 'next/server';
import { NOMES } from '@/lib/categorias';
import { parseValor } from '@/lib/descricao';
import { ehUuid } from '@/lib/filtro';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { atualizarTxn, excluirTxn, restaurarTxn } from '@/lib/txn-repo';

export const runtime = 'nodejs';

const naoEncontrado = () => new ErroDeUso('nao_encontrado', 'lançamento não encontrado', 404);

type Corpo = {
  valor?: unknown;
  categoria?: unknown;
  apelido?: unknown;
  data?: unknown;
  restaurar?: unknown;
};

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  return comUsuario(async (userId) => {
    // dentro do comUsuario: JSON inválido tem de virar 400, não 500
    const bruto = await corpoJson<unknown>(req);
    const corpo: Corpo = bruto && typeof bruto === 'object' ? (bruto as Corpo) : {};
    // id que não é uuid faria o Postgres estourar (503); tem de ser o mesmo 404 de um id alheio
    if (!ehUuid(id)) throw naoEncontrado();

    if (corpo.restaurar === true) {
      const linha = await restaurarTxn(userId, id);
      if (!linha) throw naoEncontrado();
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
      // "2026-13-45" passa no formato e o Postgres recusa: confere que a data existe
      const existe = /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
      if (!existe) throw new ErroDeUso('data_invalida', 'data fora do formato');
      mudanca.data = d;
    }

    const r = await atualizarTxn(userId, id, mudanca);
    // id inexistente e id de outro dono dão a mesma resposta, de propósito
    if (!r.linha) throw naoEncontrado();
    return { ok: true, outros: r.outros };
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  return comUsuario(async (userId) => {
    if (!ehUuid(id)) throw naoEncontrado();
    const linha = await excluirTxn(userId, id);
    if (!linha) throw naoEncontrado();
    // o id volta para a tela poder oferecer "desfazer"
    return { ok: true, id: linha.id };
  });
}
