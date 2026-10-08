import type { NextRequest } from 'next/server';
import { NOMES } from '@/lib/categorias';
import { ehUuid } from '@/lib/filtro';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { categorizarEmLote } from '@/lib/txn-repo';

export const runtime = 'nodejs';

const MAX = 500;

export async function PATCH(req: NextRequest) {
  // a leitura e a validação rodam DENTRO de comUsuario para o ErroDeUso virar 400, e não 500
  return comUsuario(async (userId) => {
    const bruto = await corpoJson<unknown>(req);
    const corpo = (bruto && typeof bruto === 'object' ? bruto : {}) as { ids?: unknown; categoria?: unknown };
    // id que não é uuid não é de ninguém, e no `in (...)` faria o Postgres estourar (503)
    const ids = Array.isArray(corpo.ids)
      ? [...new Set(corpo.ids.filter((x): x is string => typeof x === 'string' && ehUuid(x)))]
      : [];
    if (ids.length === 0) throw new ErroDeUso('ids_vazio', 'nenhum lançamento selecionado');
    if (ids.length > MAX) throw new ErroDeUso('lote_grande', `no máximo ${MAX} de cada vez`);

    const categoria = String(corpo.categoria ?? '');
    if (!NOMES.includes(categoria)) throw new ErroDeUso('categoria_invalida', 'categoria fora da lista');

    const r = await categorizarEmLote(userId, ids, categoria);
    return { ok: true, alterados: r.linhas.length, outros: r.outros };
  });
}
