/**
 * Leitura do evento que o Pluggy manda ao webhook. Puro: o teste importa.
 *
 * O corpo não é assinado pelo Pluggy (só o cabeçalho secreto protege a rota),
 * então daqui sai só o que decide o que fazer — nunca um `userId`: o dono vem
 * da conexão achada pelo `itemId`.
 */
import { ehUuid } from '../filtro';

export type EventoPluggy = {
  eventId: string | null;
  acao: 'sincronizar' | 'estado' | 'ignorar';
  itemId: string | null;
};

const SINCRONIZAR = new Set(['transactions/created', 'transactions/updated', 'item/updated']);
// o item mudou de situação sem dado novo: só o estado da conexão (e a faixa) muda
const ESTADO = new Set(['item/error', 'item/waiting_user_input', 'item/waiting_user_action', 'item/login_succeeded']);

// o eventId vira chave primária de webhook_evento: sem teto, um corpo forjado gravaria texto de qualquer tamanho
const MAX_EVENT_ID = 128;

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function lerEventoPluggy(corpo: unknown): EventoPluggy {
  const o = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : {};
  const idLido = texto(o.eventId);
  const eventId = idLido && idLido.length <= MAX_EVENT_ID ? idLido : null;
  // o Pluggy identifica item por UUID; outro formato não acha conexão, então nem vai ao banco
  const itemLido = texto(o.itemId);
  const itemId = itemLido && ehUuid(itemLido) ? itemLido : null;
  const evento = texto(o.event);
  // sem eventId não há como barrar a repetição; sem itemId não há conexão a achar
  if (!eventId || !itemId || !evento) return { eventId, acao: 'ignorar', itemId };
  if (SINCRONIZAR.has(evento)) return { eventId, acao: 'sincronizar', itemId };
  if (ESTADO.has(evento)) return { eventId, acao: 'estado', itemId };
  return { eventId, acao: 'ignorar', itemId };
}
