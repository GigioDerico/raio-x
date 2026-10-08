import type { NextRequest } from 'next/server';
import { validarNovoNome } from '@/lib/nome-na-tela';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { renomearEstabelecimento } from '@/lib/txn-repo';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // a leitura e a validação rodam DENTRO de comUsuario para o ErroDeUso virar 400, e não 500
  return comUsuario(async (userId) => {
    const bruto = await corpoJson<unknown>(req);
    const corpo = (bruto && typeof bruto === 'object' ? bruto : {}) as { de?: unknown; para?: unknown };
    const de = typeof corpo.de === 'string' ? corpo.de.trim() : '';
    if (!de) throw new ErroDeUso('nome_vazio', 'falta o nome de agora');

    const v = validarNovoNome(de, typeof corpo.para === 'string' ? corpo.para : '');
    if (!v.ok) throw new ErroDeUso(v.codigo, v.mensagem);

    const r = await renomearEstabelecimento(userId, de, v.nome);
    // nome que não existe e nome de outro dono dão a mesma resposta
    if (r.renomeados === 0) throw new ErroDeUso('nao_encontrado', 'estabelecimento não encontrado', 404);
    return { ok: true, renomeados: r.renomeados, categoria: r.categoria };
  });
}
