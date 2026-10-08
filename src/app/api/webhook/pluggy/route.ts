import { lt, sql } from 'drizzle-orm';
import { after, NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db';
import { webhookEvento } from '@/db/schema';
import { env } from '@/env';
import { resumoDoErro } from '@/lib/log';
import { SemChavePluggy } from '@/lib/pluggy/http';
import { lerEventoPluggy } from '@/lib/pluggy/webhook';
import { conexaoPorItem, registrarEstadoDaConexao, sincronizarConexao } from '@/lib/pluggy/sync-auto';
import { segredoConfere } from '@/lib/segredo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// o sync roda no after(), depois da resposta, mas ainda dentro do tempo desta função
export const maxDuration = 60;

// um evento do Pluggy tem poucas centenas de bytes; 64 KB é folga, não convite
const LIMITE_BYTES = 64 * 1024;

/**
 * Lê o corpo até o limite e para no primeiro byte a mais. `content-length`
 * sozinho não basta: pode faltar (chunked) ou mentir.
 */
async function lerCorpo(req: NextRequest): Promise<string | null> {
  if (!req.body) return '';
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITE_BYTES) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString('utf8');
}

/**
 * Aviso do Pluggy de que um item mudou. O corpo não é assinado: quem protege
 * a rota é o cabeçalho secreto que `npm run webhook` cadastrou no Pluggy. Sem
 * sessão — o dono sai da conexão achada pelo `itemId`, nunca do corpo.
 *
 * Responde na hora e trabalha no `after()`: o Pluggy espera resposta rápida e
 * reenvia o que demora, e o sync de um cartão com IA leva segundos.
 */
export async function POST(req: NextRequest) {
  // sem segredo configurado a rota não existe: 404, não 401, para não anunciar que há algo aqui
  if (!env.PLUGGY_WEBHOOK_SECRET) return new NextResponse(null, { status: 404 });
  // antes de ler o corpo: quem não tem o segredo não faz o servidor ler 64 KB
  if (!segredoConfere(req.headers.get('x-raio-x-segredo'), env.PLUGGY_WEBHOOK_SECRET)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  const declarado = Number(req.headers.get('content-length') ?? 0);
  if (declarado > LIMITE_BYTES) return NextResponse.json({ erro: 'corpo_grande_demais' }, { status: 413 });
  const texto = await lerCorpo(req);
  if (texto === null) return NextResponse.json({ erro: 'corpo_grande_demais' }, { status: 413 });

  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400 });
  }

  const { eventId, acao, itemId } = lerEventoPluggy(corpo);
  // evento que o app não usa recebe 200 também: outro código faria o Pluggy reenviar à toa
  if (acao === 'ignorar' || !eventId || !itemId) return NextResponse.json({ ok: true });

  try {
    // a limpeza vai no mesmo batch para não precisar de outro cron só para ela
    const [, novos] = await db.batch([
      db.delete(webhookEvento).where(lt(webhookEvento.recebidoEm, sql`now() - interval '30 days'`)),
      db.insert(webhookEvento).values({ eventId }).onConflictDoNothing().returning({ eventId: webhookEvento.eventId }),
    ]);
    // já visto: o Pluggy repetiu (ou alguém repetiu por ele); 200 para não reenviar de novo
    if (!novos.length) return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[webhook]', resumoDoErro(e));
    // sem gravar o eventId não há trava de repetição: 503 faz o Pluggy tentar mais tarde
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 });
  }

  after(async () => {
    let conexaoId: string | null = null;
    try {
      const c = await conexaoPorItem(itemId);
      if (!c) {
        // item de outra instalação, apagado aqui ou desconectado: nada a fazer
        console.info('[webhook] evento de item sem conexão ativa');
        return;
      }
      conexaoId = c.id;
      if (acao === 'sincronizar') {
        // os três avisos de um mesmo refresh chegam juntos; a trava de sincronizarConexao deixa passar um
        const r = await sincronizarConexao(c.userId, c.id);
        if (r?.pulada) console.info(`[webhook] conexão ${c.id}: já sincronizando, aviso pulado`);
        else if (r) console.info(`[webhook] conexão ${c.id}: ${r.estado}, ${r.cartoes} cartão(ões), ${r.inseridos} novo(s)`);
      } else {
        const estado = await registrarEstadoDaConexao(c.userId, c.id);
        if (estado) console.info(`[webhook] conexão ${c.id}: ${estado}`);
      }
    } catch (e) {
      // a resposta já foi; o cron do dia seguinte cobre o que falhou aqui
      if (e instanceof SemChavePluggy) console.error('[webhook] sem chave do Pluggy');
      else console.error(`[webhook] conexão ${conexaoId ?? '?'}`, resumoDoErro(e));
    }
  });

  return NextResponse.json({ ok: true });
}
