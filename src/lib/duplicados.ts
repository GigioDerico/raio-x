import { ehUuid } from './filtro';

/**
 * Possíveis duplicados: compra do Pluggy que pode ser a mesma de um PDF já
 * importado, e o planejador não teve como decidir sozinho. Puro: rota, tela e
 * teste usam daqui.
 */
export type LinhaDup = { id: string; accountId: string; data: string; valor: number; fonte: 'pdf' | 'pluggy' | 'manual'; excluido: boolean; duplicadoDe?: string | null };

const DIA_MS = 86_400_000;
const distancia = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA_MS;
const centavos = (v: number) => Math.round(Math.abs(v) * 100);

/**
 * O passe aproximado do planejador (4.0) — mesma conta, mesmo valor, até 3 dias,
 * só PDF não excluído e ainda não ligado a outra compra —, mas com o mesmo
 * sinal: aqui o dono confirma "é a mesma compra", e um estorno não é a compra.
 */
export function candidatosDoSuspeito(suspeito: LinhaDup, outras: readonly LinhaDup[]): LinhaDup[] {
  return outras
    .filter(
      (o) =>
        o.id !== suspeito.id &&
        o.accountId === suspeito.accountId &&
        o.fonte === 'pdf' &&
        !o.excluido &&
        !o.duplicadoDe &&
        (o.valor < 0) === (suspeito.valor < 0) &&
        centavos(o.valor) === centavos(suspeito.valor) &&
        distancia(o.data, suspeito.data) <= 3,
    )
    .sort((a, b) => distancia(a.data, suspeito.data) - distancia(b.data, suspeito.data));
}

export type Decisao = { decisao: 'mesmo'; candidatoId: string } | { decisao: 'diferente' } | { decisao: 'desfazer'; candidatoId: string };

export function validarDecisao(v: unknown): { ok: true; decisao: Decisao } | { ok: false } {
  const o = v as { decisao?: unknown; candidatoId?: unknown } | null;
  if (!o || typeof o !== 'object') return { ok: false };
  if (o.decisao === 'diferente') return { ok: true, decisao: { decisao: 'diferente' } };
  if ((o.decisao === 'mesmo' || o.decisao === 'desfazer') && typeof o.candidatoId === 'string' && ehUuid(o.candidatoId)) {
    return { ok: true, decisao: { decisao: o.decisao, candidatoId: o.candidatoId } };
  }
  return { ok: false };
}
