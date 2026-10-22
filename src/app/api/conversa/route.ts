import type { NextRequest } from 'next/server';
import { env } from '@/env';
import { chaveRecorte, lerTexto } from '@/lib/calculos/resumo';
import { lancsDoMes, mesAtual } from '@/lib/calculos/meses';
import { LIMITE_PERGUNTA, LIMITE_RESPOSTA, validarPergunta } from '@/lib/conversa';
import { falasDoRecorte, gravarPar, limparConversa } from '@/lib/conversa-repo';
import { lerFiltro, type Filtro } from '@/lib/filtro';
import { dadosDiagnostico, mensagensConversa, promptDiagnostico, type Mensagem } from '@/lib/ia';
import type { ReservaIA } from '@/lib/ia-limite';
import { registrarUso, reservarChamadaIA } from '@/lib/ia-uso-repo';
import { carregarContexto } from '@/lib/painel-repo';
import { planoAtivo } from '@/lib/plano-repo';
import { hashDoPrompt, saidaGuardada } from '@/lib/resumo-repo';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { configuracoes } from '@/lib/sessao-servidor';
import { respostaEmStream } from '@/lib/stream-rota';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Preparo = { userId: string; entrada: Mensagem[]; escopo: string; dadosHash: string; pergunta: string; modelo?: string; reserva: ReservaIA };

// o mês nulo do filtro quer dizer "o mais recente": a chave usa o mês resolvido
async function recorte(userId: string, filtro: Filtro) {
  const { ctx } = await carregarContexto(userId, filtro);
  const m = mesAtual(ctx);
  return { ctx, m, escopo: chaveRecorte(filtro, m) };
}

export async function POST(req: NextRequest) {
  const filtro = lerFiltro(req.nextUrl.searchParams);
  // objeto, não `let`: o TS não acompanha atribuição feita dentro do callback
  const p: { v?: Preparo } = {};

  const antes = await comUsuario(async (userId) => {
    const corpo = await corpoJson<unknown>(req);
    const pergunta = validarPergunta(corpo && typeof corpo === 'object' ? (corpo as { pergunta?: unknown }).pergunta : undefined);
    if (!pergunta) throw new ErroDeUso('pergunta_invalida', `Escreva uma pergunta de até ${LIMITE_PERGUNTA} caracteres`);

    const { ctx, m, escopo } = await recorte(userId, filtro);
    if (!lancsDoMes(ctx, m).length) throw new ErroDeUso('sem_lancamentos', 'Não há lançamentos neste recorte');
    if (!env.OPENROUTER_API_KEY) throw new ErroDeUso('sem_chave', 'Configure OPENROUTER_API_KEY');

    const plano = await planoAtivo(userId);
    const dados = dadosDiagnostico(ctx, filtro.cartoes.length > 0, plano?.resultado ?? null);
    const dadosHash = hashDoPrompt(dados);
    // só o diagnóstico dos mesmos números: um texto velho faria a IA defender números que mudaram
    const diag = await saidaGuardada(userId, 'diagnostico', escopo, hashDoPrompt(promptDiagnostico(dados)));
    const historico = await falasDoRecorte(userId, escopo, 6, dadosHash);
    const cfg = await configuracoes(userId);
    // reserva aqui, e não no stream: o 429 precisa sair antes do stream abrir
    const reserva = await reservarChamadaIA(userId, 'botao');
    p.v = {
      userId,
      entrada: mensagensConversa(dados, diag?.atual ? diag.texto : null, historico, pergunta),
      escopo,
      dadosHash,
      pergunta,
      modelo: cfg?.modeloIa,
      reserva,
    };
    return null;
  });
  if (!p.v) return antes;

  const { userId, entrada, escopo, dadosHash, pergunta, modelo, reserva } = p.v;
  return respostaEmStream({
    entrada,
    modelo,
    reserva,
    sinal: req.signal,
    rotulo: 'conversa',
    mensagemErro: 'A IA não terminou a resposta; tente de novo',
    aoTerminar: async (texto, modeloUsado, uso) => {
      await registrarUso(userId, 'conversa', modeloUsado, uso);
      const resposta = lerTexto({ texto }, LIMITE_RESPOSTA);
      if (!resposta) throw new Error('resposta vazia da IA');
      await gravarPar(userId, escopo, dadosHash, pergunta, resposta);
    },
  });
}

export async function DELETE(req: NextRequest) {
  const filtro = lerFiltro(req.nextUrl.searchParams);
  return comUsuario(async (userId) => {
    const { escopo } = await recorte(userId, filtro);
    await limparConversa(userId, escopo);
    return { ok: true };
  });
}
