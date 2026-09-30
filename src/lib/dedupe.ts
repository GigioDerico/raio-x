// Sem 'server-only': aqui não há segredo nem banco, só funções puras — e a
// marca impediria os testes de importar este arquivo. O que mantém isto fora do
// navegador é ninguém no cliente importar (o `node:crypto` abaixo denunciaria).
import { createHash } from 'node:crypto';

// As regras de texto são puras e vivem em descricao.ts — usadas também nas telas.
export {
  normalizarDescricao,
  chaveAprendizado,
  parecido,
  mesmoEstabelecimento,
  LIMIAR_PARECIDO,
  JANELA_DIAS,
} from './descricao';

/**
 * Chave natural de um lançamento.
 *
 * Tem de ser calculável igual pelas duas fontes — API e PDF — senão o mesmo
 * gasto entra duas vezes. Por isso NENHUM id do Pluggy entra aqui: o PDF não
 * tem esse id e nunca colidiria.
 *
 * O `ordinal` distingue repetições legítimas: dois cafés de R$ 12 no mesmo dia
 * na mesma padaria são dois lançamentos. Como as duas fontes listam ambos, os
 * ordinais se alinham sozinhos.
 */
export function chaveDedupe(
  accountId: string,
  data: string,
  valor: number,
  descNorm: string,
  ordinal = 0,
): string {
  const centavos = Math.round(Math.abs(valor) * 100);
  const d = createHash('sha1').update(descNorm).digest('hex').slice(0, 10);
  return `${accountId}|${data}|${centavos}|${d}|${ordinal}`;
}

/**
 * Atribui o ordinal dentro de um lote: mesma conta, mesma data, mesmo valor e
 * mesma descrição normalizada ganham 0, 1, 2… na ordem em que aparecem.
 */
export function comOrdinais<T extends { data: string; valor: number; descNorm: string }>(
  linhas: readonly T[],
): Array<T & { ordinal: number }> {
  const contagem = new Map<string, number>();
  return linhas.map((l) => {
    const k = `${l.data}|${Math.round(Math.abs(l.valor) * 100)}|${l.descNorm}`;
    const ordinal = contagem.get(k) ?? 0;
    contagem.set(k, ordinal + 1);
    return { ...l, ordinal };
  });
}
