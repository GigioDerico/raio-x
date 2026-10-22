import type { NextRequest } from 'next/server';
import { env } from '@/env';
import { chaveRecorte, lerTexto } from '@/lib/calculos/resumo';
import { lancsDoMes, mesAtual } from '@/lib/calculos/meses';
import { lerFiltro } from '@/lib/filtro';
import { dadosDiagnostico, promptDiagnostico } from '@/lib/ia';
import type { ReservaIA } from '@/lib/ia-limite';
import { registrarUso, reservarChamadaIA } from '@/lib/ia-uso-repo';
import { carregarContexto } from '@/lib/painel-repo';
import { planoAtivo } from '@/lib/plano-repo';
import { guardarSaida, hashDoPrompt, saidaGuardada } from '@/lib/resumo-repo';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { configuracoes } from '@/lib/sessao-servidor';
import { SemChaveIA, iaConfigurada } from '@/lib/openrouter';
import { respostaEmStream } from '@/lib/stream-rota';

export const runtime = 'nodejs';
// o stream de umas 400 palavras cabe folgado; o reserva só entra antes da primeira
export const maxDuration = 60;

type Preparo = { userId: string; prompt: string; hash: string; escopo: string; modelo?: string; reserva: ReservaIA };

export async function POST(req: NextRequest) {
  const filtro = lerFiltro(req.nextUrl.searchParams);
  // objeto, não `let`: o TS não acompanha atribuição feita dentro do callback
  const p: { v?: Preparo } = {};

  // tudo que pode falhar com mensagem para o usuário acontece antes de abrir o stream
  const antes = await comUsuario(async (userId) => {
    const corpo = await corpoJson<unknown>(req);
    const forcar = !!corpo && typeof corpo === 'object' && (corpo as { forcar?: unknown }).forcar === true;

    const { ctx } = await carregarContexto(userId, filtro);
    const m = mesAtual(ctx);
    if (!lancsDoMes(ctx, m).length) throw new ErroDeUso('sem_lancamentos', 'Não há lançamentos neste recorte');

    const plano = await planoAtivo(userId);
    const prompt = promptDiagnostico(dadosDiagnostico(ctx, filtro.cartoes.length > 0, plano?.resultado ?? null));
    const hash = hashDoPrompt(prompt);
    const escopo = chaveRecorte(filtro, m);

    if (!forcar) {
      // mesmos números, mesmo diagnóstico: não paga de novo pelo mesmo texto
      const guardado = await saidaGuardada(userId, 'diagnostico', escopo, hash);
      if (guardado?.atual) return { texto: guardado.texto };
    }
    if (!iaConfigurada()) throw new ErroDeUso('sem_chave', new SemChaveIA().message);

    const cfg = await configuracoes(userId);
    // reserva aqui, e não no stream: o 429 precisa sair antes do stream abrir
    const reserva = await reservarChamadaIA(userId, 'botao');
    p.v = { userId, prompt, hash, escopo, modelo: cfg?.modeloIa, reserva };
    return null;
  });
  if (!p.v) return antes;

  const { userId, prompt, hash, escopo, modelo, reserva } = p.v;
  return respostaEmStream({
    entrada: prompt,
    modelo,
    reserva,
    sinal: req.signal,
    rotulo: 'diagnostico',
    mensagemErro: 'A IA não terminou o diagnóstico; tente de novo',
    aoTerminar: async (texto, modeloUsado, uso) => {
      await registrarUso(userId, 'diagnostico', modeloUsado, uso);
      const final = lerTexto({ texto }, 6000);
      if (final) await guardarSaida(userId, 'diagnostico', escopo, hash, final, modeloUsado, uso);
    },
  });
}
