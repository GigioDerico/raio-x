import Link from 'next/link';
import Hero from '@/components/painel/Hero';
import Indicadores from '@/components/painel/Indicadores';
import ResumoMes from '@/components/painel/ResumoMes';
import VazioPorFiltro from '@/components/casca/VazioPorFiltro';
import { hojeEmSaoPaulo } from '@/lib/calculos/ciclo';
import { resumoDoPainel } from '@/lib/calculos/painel';
import { chaveRecorte, dadosResumo } from '@/lib/calculos/resumo';
import { deParametros, lerFiltro, paraQuery, rotuloMes } from '@/lib/filtro';
import { moeda, moeda0 } from '@/lib/formato';
import { promptResumo } from '@/lib/ia';
import { carregarContexto } from '@/lib/painel-repo';
import { hashDoPrompt, resumoGuardado } from '@/lib/resumo-repo';
import { exigirUsuario } from '@/lib/sessao-servidor';
import { opcoesDoFiltro } from '@/lib/txn-repo';
import { fraseDoVazio, linksDoVazio, nomesDosCartoes } from '@/lib/vazio';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Painel({ searchParams }: { searchParams: Params }) {
  const userId = await exigirUsuario();
  const f = lerFiltro(deParametros(await searchParams));
  const { meses, cartoes } = await opcoesDoFiltro(userId);

  if (meses.length === 0) {
    return (
      <section className="cartao vazio">
        <h1>Importe uma fatura para começar</h1>
        <p className="suave">O painel aparece assim que houver um mês aqui dentro.</p>
        <Link href="/lancamentos?importar=1" className="botao">
          Importar fatura em PDF
        </Link>
      </section>
    );
  }

  const { ctx, obraPorMes } = await carregarContexto(userId, f);
  const r = resumoDoPainel(ctx, obraPorMes, f.obra, ctx.renda, hojeEmSaoPaulo());
  const recorte = r.mes ? rotuloMes(r.mes) : 'todos os meses';

  if (r.vazio) {
    return <VazioPorFiltro frase={fraseDoVazio({ mes: r.mes, nomesCartoes: nomesDosCartoes(f.cartoes, cartoes) })} links={linksDoVazio(f, '/', meses[0], r.mes)} />;
  }

  // só conta: calcular o prompt para saber se o resumo guardado ainda vale não chama a IA (regra 9)
  const dResumo = dadosResumo(ctx);
  const promptAtual = dResumo.linhas.length ? promptResumo(ctx, dResumo) : null;
  const hashResumo = promptAtual ? hashDoPrompt(promptAtual) : '';
  const guardado = promptAtual ? await resumoGuardado(userId, chaveRecorte(f, dResumo.m), hashResumo) : null;
  const estadoResumo = !guardado ? 'nenhum' : guardado.atual ? 'atual' : 'desatualizado';

  // a categoria abre a lista já filtrada, mantendo o recorte
  const filtroQ = paraQuery(f);
  const verCategoria = (cat: string) => {
    const q = new URLSearchParams(filtroQ);
    q.set('cat', cat);
    // o painel resolve o mês pelos cartões do recorte; Lançamentos resolve
    // pelos seus próprios (todos, sem filtro de cartão) — sem fixar o mês
    // aqui, o link pode abrir outro mês
    q.set('mes', r.mes ?? 'TODOS');
    return `/lancamentos?${q}`;
  };

  const maxRank = r.rank[0]?.valor;

  return (
    <div className="painel">
      <div className="kpis">
        <Hero mes={r.mes} hero={r.hero} />

        {r.obra !== null && (
          <p className="painel-obra">
            + {moeda0(r.obra)} de Construção / Obras {r.mes ? 'neste mês' : 'no período'}, fora dos números abaixo.
          </p>
        )}

        {promptAtual && (
          // a chave zera o texto recém-pedido quando o recorte ou os dados mudam —
          // senão uma categoria editada depois continuaria mostrando "atual"
          <ResumoMes key={`${filtroQ}|${hashResumo}`}titulo={`Resumo de ${recorte}`} texto={guardado?.texto ?? null} estado={estadoResumo} query={filtroQ} />
        )}

        <Indicadores stats={r.stats} />
      </div>

      <section className="block">
        <div className="block-head">
          <h2>Onde está apertando</h2>
          <p>Clique numa categoria para abrir os lançamentos dela.</p>
        </div>
        <div className="cartao rank">
          {r.rank.length === 0 || !maxRank ? (
            <p className="empty">
              Sem lançamentos {r.mes ? `em ${recorte}` : 'ainda'}.{' '}
              {r.mes ? 'Escolha outro mês' : 'Suba uma fatura para ver o panorama'}.
            </p>
          ) : (
            r.rank.map((x) => {
              const corPill =
                x.sev.k === 'crit'
                  ? 'var(--crit)'
                  : x.sev.k === 'warn'
                    ? 'var(--warn)'
                    : x.sev.k === 'good'
                      ? 'var(--good)'
                      : 'var(--line)';
              return (
                <Link key={x.cat} className="rank-row" href={verCategoria(x.cat)}>
                  <span className="rank-name">
                    <span>{x.cat}</span>
                    <span className="rank-meta">
                      <span className={`chip ${x.sev.k}`}>
                        <span className="g">{x.sev.g}</span>
                        {x.sev.t}
                      </span>
                      <span>{(x.share * 100).toFixed(0)}%</span>
                      {x.varTxt && <span>{x.varTxt}</span>}
                    </span>
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${Math.max(2, (x.valor / maxRank) * 100)}%` }} />
                  </span>
                  <span className="rank-val">{moeda(x.valor)}</span>
                  <span className="rank-pill" aria-hidden="true" style={{ background: corPill }} />
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
