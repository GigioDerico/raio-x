import type { Previsto } from '@/lib/calculos/previsto';
import { rotuloMes } from '@/lib/filtro';
import { moeda0, pct } from '@/lib/formato';

export default function FaixaProjecao({ p }: { p: Previsto }): React.JSX.Element {
  const mes = rotuloMes(p.prox);
  return (
    <section className="cartao proj" aria-label="Projeção da próxima fatura">
      <div className="proj-top">
        <span className="eyebrow">{p.real !== null ? `Previsão feita para ${mes}` : `Sua fatura de ${mes} já começa em`}</span>
        <span className="val">{moeda0(p.total)}</span>
        {p.real !== null && (
          <span className="proj-real">
            real: <b>{moeda0(p.real)}</b>
            {p.dif !== null && ` (${pct(p.dif)} vs previsto)`}
          </span>
        )}
      </div>
      <div className="proj-parts">
        <span>parcelas já compradas <b>{moeda0(p.parcelas)}</b></span>
        <span>fixos <b>{moeda0(p.fixos)}</b></span>
        <span>
          variável, média de {p.meses} {p.meses === 1 ? 'mês' : 'meses'} <b>{moeda0(p.variavel)}</b>
        </span>
      </div>
      <p className="proj-nota">
        {p.real !== null
          ? 'Comparação entre o que dava para prever naquele momento e o que a fatura seguinte trouxe de fato.'
          : 'Parcelas e fixos já estão contratados — só o variável depende do que você fizer daqui para frente.'}
      </p>
    </section>
  );
}
