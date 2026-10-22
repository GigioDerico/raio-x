import type { NextRequest } from 'next/server';
import { chaveRecorte, dadosResumo, lerResumo } from '@/lib/calculos/resumo';
import { lerFiltro } from '@/lib/filtro';
import { promptResumo } from '@/lib/ia';
import { registrarUso, reservarChamadaIA } from '@/lib/ia-uso-repo';
import { RespostaNaoJson, SemChaveIA, pedirJson } from '@/lib/openrouter';
import { carregarContexto } from '@/lib/painel-repo';
import { guardarResumo, hashDoPrompt, resumoGuardado } from '@/lib/resumo-repo';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { configuracoes } from '@/lib/sessao-servidor';

export const runtime = 'nodejs';
// espera o modelo, e pedirJson pode tentar o de reserva
export const maxDuration = 60;

const iaInvalida = () => new ErroDeUso('ia_invalida', 'A IA não respondeu direito; tente de novo', 502);

export async function POST(req: NextRequest) {
  const filtro = lerFiltro(req.nextUrl.searchParams);

  return comUsuario(async (userId) => {
    const corpo = await corpoJson<unknown>(req);
    const forcar = !!corpo && typeof corpo === 'object' && (corpo as { forcar?: unknown }).forcar === true;

    const { ctx } = await carregarContexto(userId, filtro);
    const d = dadosResumo(ctx);
    if (!d.linhas.length) throw new ErroDeUso('sem_lancamentos', 'Não há lançamentos neste recorte');

    const prompt = promptResumo(ctx, d);
    const hash = hashDoPrompt(prompt);
    const escopo = chaveRecorte(filtro, d.m);

    if (!forcar) {
      // dado igual, resumo igual: não paga de novo pelo mesmo texto
      const guardado = await resumoGuardado(userId, escopo, hash);
      if (guardado?.atual) return { texto: guardado.texto };
    }

    const cfg = await configuracoes(userId);
    let resposta: Awaited<ReturnType<typeof pedirJson<unknown>>>;
    try {
      const reserva = await reservarChamadaIA(userId, 'botao');
      resposta = await pedirJson<unknown>(prompt, { reserva, modelo: cfg?.modeloIa });
    } catch (e) {
      if (e instanceof SemChaveIA) throw new ErroDeUso('sem_chave', e.message);
      if (e instanceof RespostaNaoJson) {
        if (e.modelo && e.uso) await registrarUso(userId, 'resumo', e.modelo, e.uso);
        throw iaInvalida();
      }
      throw e;
    }
    await registrarUso(userId, 'resumo', resposta.modelo, resposta.uso);

    const texto = lerResumo(resposta.dados);
    if (!texto) throw iaInvalida();
    await guardarResumo(userId, escopo, hash, texto, resposta.modelo, resposta.uso);
    return { texto };
  });
}
