import Link from 'next/link';
import { hrefDaCategoria, type LinhaCategoria } from '@/lib/calculos/categorias';
import type { Filtro } from '@/lib/filtro';
import { moeda } from '@/lib/formato';

type Props = { linhas: LinhaCategoria[]; filtro: Filtro; mes: string | null };

export default function ListaCategorias({ linhas, filtro, mes }: Props): React.JSX.Element {
  return (
    <div className="cartao rank">
      {linhas.map((linha) => {
        const obraSeparada = filtro.obra && linha.cat === 'Construção / Obras';
        const corPill = obraSeparada
          ? 'var(--line)'
          : linha.sev.k === 'crit'
            ? 'var(--crit)'
            : linha.sev.k === 'warn'
              ? 'var(--warn)'
              : linha.sev.k === 'good'
                ? 'var(--good)'
                : 'var(--line)';

        return (
          <Link key={linha.cat} className="rank-row" href={hrefDaCategoria(filtro, mes, linha.cat)}>
            <span className="rank-name">
              <span>{linha.cat}</span>
              <span className="rank-meta">
                {obraSeparada ? (
                  <span className="chip">fora deste recorte · abrir lançamentos</span>
                ) : (
                  <>
                    <span className={`chip ${linha.sev.k}`}>
                      <span className="g">{linha.sev.g}</span>
                      {linha.sev.t}
                    </span>
                    <span>{(linha.share * 100).toFixed(0)}%</span>
                    {linha.varTxt && <span>{linha.varTxt}</span>}
                  </>
                )}
              </span>
            </span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${linha.largura}%` }} />
            </span>
            <span className={`rank-val${linha.valor < 0 ? ' credito' : ''}`}>{moeda(linha.valor)}</span>
            <span className="rank-pill" aria-hidden="true" style={{ background: corPill }} />
          </Link>
        );
      })}
    </div>
  );
}
