import { rotuloMes } from '@/lib/filtro';
import { moeda0, pct } from '@/lib/formato';
import type { ResumoPainel } from '@/lib/calculos/painel';

/**
 * O cartão escuro do topo do painel — porta de `renderKpis`
 * (docs/legado/app-antigo.html:1289–1351), só a parte do hero. Componente à
 * parte (e não inline em page.tsx) para o dia em que ele aparecer em mais de
 * uma tela — ver docs/acompanhamento/3.1-painel.md.
 */
export default function Hero({ mes, hero }: { mes: string | null; hero: ResumoPainel['hero'] }) {
  const { cur, prevMes, prev, delta, ciclo, projecao, venc, pctRenda, cartoes, comp, pcComp, mesesCarregados } = hero;

  return (
    <div className="hero">
      <div className="hero-top">
        <div className="hero-main">
          <h1 className="hero-lab">
            {mes ? `Fatura de ${rotuloMes(mes)}` : 'Todos os meses'}
            {venc ? ` · vence dia ${venc.slice(8, 10)}` : ''}
          </h1>
          <span className="hero-val">{moeda0(cur)}</span>
          {projecao !== null && (
            <p className="hero-projecao">
              {ciclo?.dias != null ? `dia ${ciclo.dias + 1} do ciclo · ` : ''}deve fechar perto de {moeda0(projecao)}
            </p>
          )}
          {delta !== null ? (
            <span
              className="hero-chip"
              title={ciclo && ciclo.comparados < ciclo.total ? `compara ${ciclo.comparados} de ${ciclo.total} cartões` : undefined}
            >
              {/* um item só no flex do chip: o gap de 8px separaria o glifo do número */}
              <span>
                <span aria-hidden="true">{delta >= 0 ? '▲' : '▼'}</span>
                <span className="sr-only">{delta >= 0 ? 'alta de' : 'queda de'}</span> {pct(delta)} vs{' '}
                {ciclo ? 'mesmo ponto do ciclo anterior' : prevMes ? rotuloMes(prevMes) : ''}
              </span>
              <span className="hero-mint">
                {delta >= 0 ? '+' : ''}
                {moeda0((ciclo ? ciclo.atual : cur) - prev)}
              </span>
            </span>
          ) : (
            <span className="hero-chip">
              {ciclo
                ? 'primeiro gasto neste ponto do ciclo'
                : `${mesesCarregados} ${mesesCarregados === 1 ? 'mês carregado' : 'meses carregados'}`}
            </span>
          )}
          {pctRenda !== null && <span className="hero-chip">{pctRenda.toFixed(0)}% da renda</span>}
        </div>
        <div className="hero-cards">
          {cartoes.length ? (
            cartoes.map((c) => (
              <span className="hero-card" key={c.nome + c.cartao}>
                {c.nome}
                {c.cartao ? ` ••${c.cartao}` : ''} <b>{moeda0(c.total)}</b>
              </span>
            ))
          ) : (
            <span className="hero-card">nenhuma fatura neste mês</span>
          )}
        </div>
      </div>

      {comp.tot > 0 && (
        <div>
          <div
            className="hero-bar"
            role="img"
            aria-label={`Já contratado ${moeda0(comp.comprometido)}, escolha do mês ${moeda0(comp.escolha)}`}
          >
            <span style={{ width: `${pcComp}%`, background: 'var(--hero-mint)' }} />
            <span style={{ width: `${100 - pcComp}%`, background: 'rgba(255,255,255,.18)' }} />
          </div>
          <div className="hero-leg">
            <span>
              <i style={{ background: 'var(--hero-mint)' }} />
              Já contratado <b>{moeda0(comp.comprometido)}</b>
            </span>
            <span>
              <i style={{ background: 'rgba(255,255,255,.35)' }} />
              Escolha do mês <b>{moeda0(comp.escolha)}</b>
            </span>
            <span className="hero-fim">
              fixos {moeda0(comp.fixo)} · parcelas {moeda0(comp.parcela)} · juros {moeda0(comp.encargo)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
