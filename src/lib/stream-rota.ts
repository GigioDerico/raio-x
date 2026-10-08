import 'server-only';
import type { Mensagem } from './ia';
import type { ReservaIA } from './ia-limite';
import { linhaNdjson, type EventoDiagnostico } from './ndjson';
import { pedirTextoEmStream, type Uso } from './openrouter';

type Opcoes = {
  entrada: string | Mensagem[];
  modelo?: string;
  reserva: ReservaIA;
  /** o `req.signal` da rota */
  sinal: AbortSignal;
  /** prefixo do log */
  rotulo: string;
  /** o que o cliente lê se a IA falhar depois de aberto o stream */
  mensagemErro: string;
  /**
   * Chamado uma vez, depois do [DONE], com o texto inteiro. Registra o custo e
   * grava; se lançar, o cliente recebe `mensagemErro`.
   */
  aoTerminar: (texto: string, modelo: string, uso: Uso) => Promise<void>;
};

/** Resposta NDJSON (`{t}`, `{fim}`, `{erro}`) de um texto da IA em stream. Parou ou deu erro: nada é gravado. */
export function respostaEmStream(o: Opcoes): Response {
  const enc = new TextEncoder();
  // req.signal nem sempre dispara quando o cliente some; o cancel() do stream cobre o resto
  const ac = new AbortController();
  const corpo = new ReadableStream<Uint8Array>({
    async start(controle) {
      const enviar = (e: EventoDiagnostico) => controle.enqueue(enc.encode(linhaNdjson(e)));
      let texto = '';
      try {
        for await (const ev of pedirTextoEmStream(o.entrada, { reserva: o.reserva, modelo: o.modelo, sinal: AbortSignal.any([o.sinal, ac.signal]) })) {
          if (ev.tipo === 'texto') {
            texto += ev.t;
            enviar({ t: ev.t });
          } else {
            // um Parar que chega junto do [DONE] não desfaz nada: a chamada já foi paga e
            // está completa, então registra e grava; o cliente recarrega e mostra o que ficou
            await o.aoTerminar(texto, ev.modelo, ev.uso);
            enviar({ fim: true });
          }
        }
      } catch (e) {
        // interrompido pelo usuário: não há para quem responder
        if (!o.sinal.aborted && !ac.signal.aborted) {
          console.error(`[${o.rotulo}]`, e);
          try {
            enviar({ erro: o.mensagemErro });
          } catch {
            // o cliente pode ter fechado entre o erro e esta linha
          }
        }
      } finally {
        try {
          controle.close();
        } catch {
          // já fechado pelo cancelamento do cliente
        }
      }
    },
    cancel() {
      ac.abort();
    },
  });
  return new Response(corpo, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}
