import type { NextRequest } from 'next/server';
import {
  limparCabecalho,
  limparLanc,
  mesDeReferencia,
  tirarRepetidosDaLeitura,
  type LancBruto,
} from '@/lib/extracao';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { contaDoPdf, faturaDoPdf, fraseMesCoberto, importarDoPdf, instituicaoPorNome, mesCoberto } from '@/lib/txn-repo';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_LANCS = 2000;

type Corpo = { cabecalho?: Record<string, unknown> | null; lancamentos?: unknown };

/**
 * Fecha a importação: cria conta e fatura se ainda não existirem e grava os
 * lançamentos deduplicados.
 *
 * Os lançamentos chegam do navegador, então passam por `limparLanc` de novo
 * aqui — o que o cliente manda nunca é aceito como veio, mesmo sendo você.
 */
export async function POST(req: NextRequest) {
  return comUsuario(async (userId) => {
    // dentro do comUsuario: JSON inválido vira 400, e sem sessão o corpo nem é lido
    const corpo = await corpoJson<Corpo>(req);
    const lista = Array.isArray(corpo.lancamentos) ? (corpo.lancamentos as LancBruto[]) : [];
    if (lista.length === 0) throw new ErroDeUso('sem_lancamentos', 'nenhum lançamento para gravar');
    if (lista.length > MAX_LANCS) throw new ErroDeUso('lote_grande', 'fatura acima do limite');

    const limpos = tirarRepetidosDaLeitura(
      lista.map(limparLanc).filter((l): l is NonNullable<typeof l> => l !== null),
    );
    if (limpos.length === 0) throw new ErroDeUso('sem_lancamentos', 'nada aproveitável na leitura');

    const cab = limparCabecalho(corpo.cabecalho ?? null);
    const mesRef = mesDeReferencia(cab, limpos);
    // segunda trava: quem chama a rota direto não passa pelo "conferir" da tela
    if (cab.cartao && (await mesCoberto(userId, cab.cartao, mesRef))) {
      throw new ErroDeUso('mes_coberto', fraseMesCoberto(mesRef, cab.cartao), 409);
    }

    const institutionId = await instituicaoPorNome(cab.banco);
    const accountId = await contaDoPdf(userId, institutionId, cab.cartao || 'xxxx', cab.banco);
    const statementId = await faturaDoPdf(accountId, mesRef, cab.vencimento, cab.total);

    const r = await importarDoPdf(userId, accountId, statementId, mesRef, limpos);

    // o total impresso é o que a fatura cobra: pagamento da fatura anterior não
    // entra nele (estorno entra, com sinal negativo)
    const somaLida = limpos.filter((l) => l.tipo !== 'pagamento').reduce((s, l) => s + l.val, 0);
    return {
      ...r,
      mesRef,
      banco: cab.banco,
      cartao: cab.cartao,
      // divergência entre o total impresso e a soma do que foi lido é o sinal
      // mais honesto de que a leitura perdeu (ou inventou) alguma linha
      totalInformado: cab.total || null,
      totalLido: Math.round(somaLida * 100) / 100,
    };
  });
}
