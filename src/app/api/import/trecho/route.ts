import type { NextRequest } from 'next/server';
import { limparCabecalho, limparLanc, type LancBruto } from '@/lib/extracao';
import { promptDeExtracaoComMapa } from '@/lib/ia';
import { RespostaNaoJson, SemChaveIA, pedirJson } from '@/lib/openrouter';
import { registrarUso, reservarChamadaIA } from '@/lib/ia-uso-repo';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { configuracoes } from '@/lib/sessao-servidor';

export const runtime = 'nodejs';
// um pedaço por chamada: oito leituras num request só estouram o limite da Vercel
export const maxDuration = 60;

const MAX_TRECHO = 20_000;

type Corpo = { trecho?: unknown; idx?: unknown; n?: unknown };

export async function POST(req: NextRequest) {
  return comUsuario(async (userId) => {
    // dentro do comUsuario: JSON inválido vira 400, e sem sessão o corpo nem é lido
    const corpo = await corpoJson<Corpo>(req);
    const trecho = String(corpo.trecho ?? '');
    if (!trecho.trim()) throw new ErroDeUso('trecho_vazio', 'nada para ler neste trecho');
    if (trecho.length > MAX_TRECHO) throw new ErroDeUso('trecho_grande', 'trecho acima do limite');

    const idx = Math.max(1, Number(corpo.idx) || 1);
    const n = Math.max(idx, Number(corpo.n) || 1);
    const comCabecalho = idx === 1;

    const cfg = await configuracoes(userId);
    const anoDica = String(new Date().getFullYear());

    const { prompt, mapaPessoas } = promptDeExtracaoComMapa(trecho, comCabecalho, idx, n, anoDica);

    let bruto: { banco?: unknown; cartao?: unknown; vencimento?: unknown; total?: unknown; lancamentos?: unknown };
    try {
      const reserva = await reservarChamadaIA(userId, 'botao');
      const r = await pedirJson<typeof bruto>(prompt, {
        reserva,
        modelo: cfg?.modeloIa,
      });
      await registrarUso(userId, 'extracao', r.modelo, r.uso);
      bruto = r.dados;
    } catch (e) {
      if (e instanceof RespostaNaoJson && e.modelo && e.uso) await registrarUso(userId, 'extracao', e.modelo, e.uso);
      if (e instanceof SemChaveIA) {
        throw new ErroDeUso('sem_chave_ia', e.message, 501);
      }
      if (e instanceof RespostaNaoJson && !comCabecalho) {
        // trecho do meio ilegível não derruba a importação inteira
        return { lancamentos: [], cabecalho: null, ignorado: true };
      }
      throw e;
    }

    const lista = Array.isArray(bruto.lancamentos) ? (bruto.lancamentos as LancBruto[]) : [];
    const lancamentos = lista.map(limparLanc).filter((l): l is NonNullable<typeof l> => l !== null);

    // A-2: restaura o nome original de pessoas em transferências anonimizadas para a IA
    if (Object.keys(mapaPessoas).length > 0) {
      for (const l of lancamentos) {
        for (const [marcador, nomeReal] of Object.entries(mapaPessoas)) {
          const semColchetes = marcador.slice(1, -1);
          if (l.desc.includes(marcador)) {
            l.desc = l.desc.replaceAll(marcador, nomeReal);
          } else if (l.desc.includes(semColchetes)) {
            l.desc = l.desc.replaceAll(semColchetes, nomeReal);
          }
        }
      }
    }

    return {
      lancamentos,
      cabecalho: comCabecalho ? limparCabecalho(bruto) : null,
      ignorado: false,
    };
  });
}
