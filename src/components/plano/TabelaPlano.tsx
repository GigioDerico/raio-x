import type { ResultadoPlano } from '@/lib/calculos/plano';
import { rotuloMes } from '@/lib/filtro';
import { moeda0 } from '@/lib/formato';

type Props = { plano: ResultadoPlano; reais: (number | null)[][] };

export default function TabelaPlano({ plano, reais }: Props) {
  const meta = plano.metaPoupancaValor || 0;
  return (
    <div className="tabela-plano-rolagem">
      <table className="tabela-plano">
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col">hoje</th>
            {plano.meses.map((m) => <th scope="col" key={m.mes}>{rotuloMes(m.mes)}</th>)}
          </tr>
        </thead>
        <tbody>
          {plano.cats.map((c, k) => (
            <tr key={c.cat}>
              <th scope="row">
                {c.cat}
                {c.travada && <span className="tag-intocada">intocada</span>}
                {c.acao && !c.travada && <span className="acao">{c.acao}</span>}
              </th>
              <td>{moeda0(c.atual)}</td>
              {c.alvos.map((a, i) => (
                <td key={i}>
                  <span className={a >= c.atual - 1 ? 'sem-corte' : undefined}>{moeda0(a)}</span>
                  {reais[k]?.[i] != null && (
                    <span className={`real ${reais[k]![i]! <= a ? 'bateu' : 'passou'}`}>real {moeda0(reais[k]![i]!)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr className="tot">
            <th scope="row">Total do variável</th>
            <td>{moeda0(plano.variavelHoje)}</td>
            {plano.meses.map((m) => <td key={m.mes}>{moeda0(m.alvo)}</td>)}
          </tr>
          <tr className="poup">
            <th scope="row">
              Guardado no mês
              {meta > 0 && <span className="acao">meta: {moeda0(meta)}</span>}
            </th>
            <td />
            {plano.meses.map((m) => (
              <td key={m.mes} className={m.poupanca >= meta - 1 ? 'bateu' : 'parcial'}>{moeda0(Math.max(0, m.poupanca))}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
