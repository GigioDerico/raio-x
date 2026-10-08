import type { NextRequest } from 'next/server';
import { lerFiltro } from '@/lib/filtro';
import { comUsuario } from '@/lib/rota';
import { listarTxn, totalDoNome } from '@/lib/txn-repo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const f = lerFiltro(q);
  // nome maior que o que o Renomear grava não é de nenhum estabelecimento; cortar
  // evita mandar texto arbitrário inteiro ao banco
  const nome = q.get('nome')?.trim().slice(0, 200) || null;

  return comUsuario(async (userId) => {
    const linhas = await listarTxn(userId, {
      mes: f.mes === 'TODOS' ? null : f.mes,
      accountIds: f.cartoes,
      categoria: q.get('categoria'),
      busca: q.get('busca'),
      nome,
      limite: Number(q.get('limite')) || undefined,
    });
    const total = linhas.reduce((s, l) => s + Number(l.valor), 0);
    if (!nome) return { linhas, total };
    return { linhas, total, totalTodosMeses: await totalDoNome(userId, nome, f.cartoes) };
  });
}
