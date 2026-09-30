import type { NextRequest } from 'next/server';
import { NOMES } from '@/lib/categorias';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { categorizarEmLote } from '@/lib/txn-repo';

export const runtime = 'nodejs';

const MAX = 500;

export async function PATCH(req: NextRequest) {
  const corpo = await corpoJson<{ ids?: unknown; categoria?: unknown }>(req);

  // a validação roda DENTRO de comUsuario para o ErroDeUso virar 400, e não 500
  return comUsuario(async (userId) => {
    const ids = Array.isArray(corpo.ids)
      ? [...new Set(corpo.ids.filter((x): x is string => typeof x === 'string'))]
      : [];
    if (ids.length === 0) throw new ErroDeUso('ids_vazio', 'nenhum lançamento selecionado');
    if (ids.length > MAX) throw new ErroDeUso('lote_grande', `no máximo ${MAX} de cada vez`);

    const categoria = String(corpo.categoria ?? '');
    if (!NOMES.includes(categoria)) throw new ErroDeUso('categoria_invalida', 'categoria fora da lista');

    const linhas = await categorizarEmLote(userId, ids, categoria);
    return { ok: true, alterados: linhas.length };
  });
}
