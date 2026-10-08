import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env';
import { resumoDoErro } from '@/lib/log';
import { SemChavePluggy } from '@/lib/pluggy/http';
import { precisaSincronizar } from '@/lib/pluggy/janela';
import { conexoesParaCron, sincronizarConexao } from '@/lib/pluggy/sync-auto';
import { segredoConfere } from '@/lib/segredo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// melhor esforço: a conferência é antes de cada conexão, e uma começada aos 49 s pode passar dos
// 60 s e ser cortada no meio. Os 10 s de folga cobrem o caso comum; o corte raro não estraga nada
// (o upsert é idempotente) e a conexão cortada vai ao fim da fila de amanhã por ultima_tentativa_em
const ORCAMENTO_MS = 50_000;

/**
 * Rede de segurança diária (vercel.json, 6h de Brasília): sincroniza as
 * conexões que o webhook e o botão deixaram para trás. Sem sessão — a rota se
 * defende sozinha com `CRON_SECRET`, que a Vercel manda como `Bearer`.
 */
export async function GET(req: NextRequest) {
  // sem segredo configurado a rota não existe: 404, não 401, para não anunciar que há algo aqui
  if (!env.CRON_SECRET) return new NextResponse(null, { status: 404 });
  // conferido antes de qualquer acesso ao banco ou ao Pluggy
  if (!segredoConfere(req.headers.get('authorization'), `Bearer ${env.CRON_SECRET}`)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  const inicio = Date.now();
  let conexoes;
  try {
    conexoes = await conexoesParaCron();
  } catch (e) {
    console.error('[cron]', resumoDoErro(e));
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 });
  }

  let sincronizadas = 0;
  let puladas = 0;
  let falharam = 0;
  let restantes = 0;
  for (const c of conexoes) {
    // o que não couber fica para amanhã; as menos tentadas já vieram primeiro
    if (Date.now() - inicio > ORCAMENTO_MS) {
      restantes++;
      continue;
    }
    if (!precisaSincronizar(c.ultimoSyncEm, new Date())) {
      puladas++;
      continue;
    }
    try {
      // o dono vem da linha da conexão, nunca da requisição (que nem tem corpo)
      const r = await sincronizarConexao(c.userId, c.id);
      if (!r || r.pulada) {
        // desconectada entre a lista e agora, ou um webhook já está sincronizando esta conexão
        puladas++;
        continue;
      }
      sincronizadas++;
      console.info(`[cron] conexão ${c.id}: ${r.estado}, ${r.cartoes} cartão(ões), ${r.inseridos} novo(s)`);
    } catch (e) {
      // sem chave nenhuma conexão vai dar certo: parar em vez de repetir a mesma falha em todas
      if (e instanceof SemChavePluggy) return NextResponse.json({ erro: 'sem_chave_pluggy' }, { status: 501 });
      // uma conexão ruim não para as outras; a próxima rodada tenta de novo
      falharam++;
      console.error(`[cron] conexão ${c.id}`, resumoDoErro(e));
    }
  }

  // só contagens: nem banco, nem id, nem erro saem na resposta
  return NextResponse.json({ ok: true, sincronizadas, puladas, falharam, restantes });
}
