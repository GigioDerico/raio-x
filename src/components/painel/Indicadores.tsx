import { rotuloMes } from '@/lib/filtro';
import { moeda0 } from '@/lib/formato';
import type { ResumoPainel } from '@/lib/calculos/painel';

/**
 * Os três indicadores abaixo do hero — porta de `renderKpis`
 * (docs/legado/app-antigo.html:1289–1351), só a parte de `.stats`.
 * Componente à parte pelo mesmo motivo do Hero — ver
 * docs/acompanhamento/3.1-painel.md.
 */
export default function Indicadores({ stats }: { stats: ResumoPainel['stats'] }) {
  const { encargos, fixoMensal, fixas, parcelasTotal, proxParcela, comprasParceladas } = stats;

  return (
    <div className="stats">
      <div className={`cartao stat${encargos > 0 ? ' ruim' : ''}`}>
        <span className="s-lab">Juros e encargos</span>
        <span className="s-val">{moeda0(encargos)}</span>
        <span className="s-sub">{encargos > 0 ? 'dinheiro que não virou nada' : 'nenhum no período'}</span>
      </div>
      <div className="cartao stat">
        <span className="s-lab">Fixo todo mês</span>
        <span className="s-val">{moeda0(fixoMensal)}</span>
        <span className="s-sub">{fixas ? `${fixas} cobranças estáveis` : 'nada estável ainda'}</span>
      </div>
      <div className="cartao stat">
        <span className="s-lab">Parcelas a vencer</span>
        <span className="s-val">{moeda0(parcelasTotal)}</span>
        <span className="s-sub">
          {comprasParceladas && proxParcela
            ? `${moeda0(proxParcela.tot)} já em ${rotuloMes(proxParcela.mes)}`
            : 'nenhuma em aberto'}
        </span>
      </div>
    </div>
  );
}
