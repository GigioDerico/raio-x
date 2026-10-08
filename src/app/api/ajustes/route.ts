import type { NextRequest } from 'next/server';
import { validarConfig } from '@/lib/ajustes';
import { salvarConfig } from '@/lib/ajustes-repo';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  return comUsuario(async (userId) => {
    // dentro do comUsuario: JSON inválido tem de virar 400, não 500
    const v = validarConfig(await corpoJson<unknown>(req));
    if (!v.ok) throw new ErroDeUso(v.codigo, v.mensagem);
    return { ok: true, config: await salvarConfig(userId, v.mudanca) };
  });
}
