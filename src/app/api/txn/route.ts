import type { NextRequest } from 'next/server';
import { lerFiltro } from '@/lib/filtro';
import { comUsuario } from '@/lib/rota';
import { contarNaoConta, listarTxn, totalDoNome } from '@/lib/txn-repo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const f = lerFiltro(q);
  // nome maior que o que o Renomear grava não é de nenhum estabelecimento; cortar
  // evita mandar texto arbitrário inteiro ao banco
  const nome = q.get('nome')?.trim().slice(0, 200) || null;

  const papel = q.get('papel') === 'fora' ? 'fora' : 'gasto';

  return comUsuario(async (userId) => {
    const mesF = f.mes === 'TODOS' ? null : f.mes;
    const linhas = await listarTxn(userId, {
      mes: mesF,
      accountIds: f.cartoes,
      categoria: q.get('categoria'),
      busca: q.get('busca'),
      nome,
      papel,
      limite: Number(q.get('limite')) || undefined,
    });
    const total = linhas.reduce((s, l) => s + Number(l.valor), 0);
    // o N do alternador é do recorte (mês e cartões), não da busca nem da categoria
    const naoConta = await contarNaoConta(userId, { mes: mesF, accountIds: f.cartoes });
    if (!nome) return { linhas, total, naoConta };
    return { linhas, total, naoConta, totalTodosMeses: await totalDoNome(userId, nome, f.cartoes) };
  });
}
