import type { NextRequest } from 'next/server';
import { ehUuid } from '@/lib/filtro';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { mudarPapel } from '@/lib/txn-repo';
import type { Papel } from '@/lib/pluggy/mapear';

export const runtime = 'nodejs';

const MAX = 500;
const PAPEIS: readonly Papel[] = ['gasto', 'entrada', 'renda', 'fora'];

/**
 * A marcação do dono na linha ou no lote, em Lançamentos e em Entradas. O que
 * não é conta corrente, não é do usuário ou não cabe no sinal é pulado no
 * `where`; se nada coube, a mesma resposta para todos os casos — não diz se o
 * id existe.
 */
export async function PATCH(req: NextRequest) {
  return comUsuario(async (userId) => {
    const bruto = await corpoJson<unknown>(req);
    const corpo = (bruto && typeof bruto === 'object' ? bruto : {}) as { ids?: unknown; papel?: unknown };
    const ids = Array.isArray(corpo.ids)
      ? [...new Set(corpo.ids.filter((x): x is string => typeof x === 'string' && ehUuid(x)))]
      : [];
    if (ids.length === 0) throw new ErroDeUso('ids_vazio', 'nenhum lançamento selecionado');
    if (ids.length > MAX) throw new ErroDeUso('lote_grande', `no máximo ${MAX} de cada vez`);
    const papel = corpo.papel as Papel;
    if (!PAPEIS.includes(papel)) throw new ErroDeUso('papel_invalido', 'marcação desconhecida');

    const r = await mudarPapel(userId, ids, papel);
    if (r.alterados === 0) throw new ErroDeUso('papel_nao_coube', 'Nenhum desses lançamentos aceita essa marcação.');
    return { ok: true, alterados: r.alterados, outros: r.outros, aprendeu: r.aprendeu };
  });
}
