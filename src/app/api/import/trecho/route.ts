import type { NextRequest } from 'next/server';
import { limparCabecalho, limparLanc, promptExtracao, type LancBruto } from '@/lib/extracao';
import { RespostaNaoJson, SemChaveIA, pedirJson } from '@/lib/openrouter';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { configuracoes } from '@/lib/sessao-servidor';

export const runtime = 'nodejs';
// um pedaço por chamada: oito leituras num request só estouram o limite da Vercel
export const maxDuration = 60;

const MAX_TRECHO = 20_000;

type Corpo = { trecho?: unknown; idx?: unknown; n?: unknown };

export async function POST(req: NextRequest) {
  const corpo = await corpoJson<Corpo>(req);

  return comUsuario(async (userId) => {
    const trecho = String(corpo.trecho ?? '');
    if (!trecho.trim()) throw new ErroDeUso('trecho_vazio', 'nada para ler neste trecho');
    if (trecho.length > MAX_TRECHO) throw new ErroDeUso('trecho_grande', 'trecho acima do limite');

    const idx = Math.max(1, Number(corpo.idx) || 1);
    const n = Math.max(idx, Number(corpo.n) || 1);
    const comCabecalho = idx === 1;

    const cfg = await configuracoes(userId);
    const anoDica = String(new Date().getFullYear());

    let bruto: { banco?: unknown; cartao?: unknown; vencimento?: unknown; total?: unknown; lancamentos?: unknown };
    try {
      const r = await pedirJson<typeof bruto>(promptExtracao(trecho, comCabecalho, idx, n, anoDica), {
        modelo: cfg?.modeloIa,
      });
      bruto = r.dados;
    } catch (e) {
      if (e instanceof SemChaveIA) {
        throw new ErroDeUso('sem_chave_ia', 'configure OPENROUTER_API_KEY para importar PDF', 501);
      }
      if (e instanceof RespostaNaoJson && !comCabecalho) {
        // trecho do meio ilegível não derruba a importação inteira
        return { lancamentos: [], cabecalho: null, ignorado: true };
      }
      throw e;
    }

    const lista = Array.isArray(bruto.lancamentos) ? (bruto.lancamentos as LancBruto[]) : [];
    const lancamentos = lista.map(limparLanc).filter((l): l is NonNullable<typeof l> => l !== null);

    return {
      lancamentos,
      cabecalho: comCabecalho ? limparCabecalho(bruto) : null,
      ignorado: false,
    };
  });
}
