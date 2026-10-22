import type { NextRequest } from 'next/server';
import { ajustarPlano, metasDoPlano, type ResultadoPlano } from '@/lib/calculos/plano';
import { lerFiltro } from '@/lib/filtro';
import { promptPlano } from '@/lib/ia';
import { registrarUso, reservarChamadaIA } from '@/lib/ia-uso-repo';
import { RespostaNaoJson, SemChaveIA, pedirJson } from '@/lib/openrouter';
import { limparFixos, respostaTemCategorias, validarPrefs } from '@/lib/plano-prefs';
import { contextoDoPlano, gravarPlano, planoAtivo } from '@/lib/plano-repo';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { configuracoes } from '@/lib/sessao-servidor';

export const runtime = 'nodejs';
// refinar espera o modelo, e `pedirJson` pode tentar dois; o limite padrão da Vercel corta antes
export const maxDuration = 60;

const iaInvalida = () => new ErroDeUso('ia_invalida', 'A IA não respondeu direito; o plano calculado segue valendo', 502);
const semRenda = () => new ErroDeUso('sem_renda', 'Informe a renda em Ajustes');

export async function POST(req: NextRequest) {
  // só "separar obra" vale aqui; cartões e mês do filtro não entram no plano
  const { obra } = lerFiltro(req.nextUrl.searchParams);

  return comUsuario(async (userId) => {
    const corpo = await corpoJson<unknown>(req);
    const c = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : {};
    const refinar = c.refinar === true;
    if (refinar === 'prefs' in c) throw new ErroDeUso('pedido_invalido', 'mande as preferências ou peça para refinar');

    const ctx = await contextoDoPlano(userId, obra);

    if (!refinar) {
      const v = validarPrefs(c);
      if (!v.ok) throw new ErroDeUso(v.codigo, v.mensagem);
      const mt = metasDoPlano(ctx, v.mudanca);
      if (!mt) throw semRenda();
      const r = ajustarPlano(v.mudanca, null, mt);
      if (!r) throw new ErroDeUso('sem_variavel', 'Não há gasto variável nos últimos meses para planejar');
      await gravarPlano(userId, r, ctx);
      return { ok: true };
    }

    const ativo = await planoAtivo(userId);
    if (!ativo) throw new ErroDeUso('sem_plano', 'Monte o plano primeiro', 404);
    const mt = metasDoPlano(ctx, ativo.prefs);
    if (!mt) throw semRenda();
    // as fixas saem do contexto dentro de promptPlano, já sem o nome de quem recebe Pix
    const prompt = promptPlano(mt, ativo.prefs, ctx);

    const cfg = await configuracoes(userId);
    let resposta: Awaited<ReturnType<typeof pedirJson<unknown>>>;
    try {
      const reserva = await reservarChamadaIA(userId, 'botao');
      resposta = await pedirJson<unknown>(prompt, { reserva, modelo: cfg?.modeloIa });
      await registrarUso(userId, 'plano', resposta.modelo, resposta.uso);
    } catch (e) {
      if (e instanceof RespostaNaoJson && e.modelo && e.uso) await registrarUso(userId, 'plano', e.modelo, e.uso);
      if (e instanceof SemChaveIA) throw new ErroDeUso('sem_chave', e.message);
      if (e instanceof RespostaNaoJson) throw iaInvalida();
      throw e;
    }

    // a resposta do modelo é dado não confiável: formato inesperado é "não respondeu direito", não 503
    if (!respostaTemCategorias(resposta.dados)) throw iaInvalida();
    let r: ResultadoPlano | null;
    try {
      r = ajustarPlano(ativo.prefs, resposta.dados, mt);
    } catch {
      r = null;
    }
    if (!r) throw iaInvalida();
    r.fixos = limparFixos(r.fixos, ctx.renda);
    await gravarPlano(userId, r, ctx, { modelo: resposta.modelo, uso: resposta.uso, prompt, conteudo: resposta.dados });
    return { ok: true };
  });
}
