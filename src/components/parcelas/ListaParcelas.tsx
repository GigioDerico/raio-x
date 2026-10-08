import type { ParcelasInfo } from '@/lib/calculos/parcelas';
import { rotuloMes } from '@/lib/filtro';
import { moeda, moeda0 } from '@/lib/formato';

export default function ListaParcelas({ pi }: { pi: ParcelasInfo }): React.JSX.Element {
  return (
    <section className="block">
      <div className="block-head">
        <h2>Parcelas já compradas</h2>
        <p>O que os próximos meses já têm reservado, mesmo sem você gastar mais nada.</p>
      </div>
      <div className="cartao lista-parcelas">
        {pi.compras.length === 0 ? (
          <p className="empty">Nenhuma compra parcelada em aberto nas faturas mais recentes.</p>
        ) : (
          <>
            {pi.compras.map((c, i) => (
              <div className="li" key={`${c.cartao}-${c.desc}-${c.n}-${i}`}>
                <span className="d">{c.desc}</span>
                <span className="m">
                  {c.cartao} · faltam {c.restantes} de {c.N} · {moeda(c.val)}/mês
                </span>
                <span className="v">{moeda(c.total)}</span>
              </div>
            ))}
            {/* <details> abre por clique, toque e teclado sem JS — o `title` do legado só abria no mouse */}
            <div className="fichas-mes">
              {pi.porMes.map(([m, e]) => (
                <details className="ficha-mes" key={m}>
                  <summary>
                    {rotuloMes(m)} <b>{moeda0(e.tot)}</b>
                  </summary>
                  <ul>
                    {e.itens.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
            <div className="sum-row">
              <span>
                Já comprometido · lido das faturas mais recentes de {pi.cartoes} {pi.cartoes === 1 ? 'cartão' : 'cartões'}
              </span>
              <span className="v">{moeda(pi.total)}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
