import { Fragment } from 'react';
import { markdownLeve, type Parte } from '@/lib/markdown-leve';

function Partes({ partes }: { partes: Parte[] }) {
  return (
    <>
      {partes.map((p, i) => {
        let n: React.ReactNode = p.texto;
        if (p.dinheiro) n = <span className="dinheiro">{n}</span>;
        if (p.forte) n = <strong>{n}</strong>;
        return <Fragment key={i}>{n}</Fragment>;
      })}
    </>
  );
}

/** Texto da IA como elementos React: nada de `dangerouslySetInnerHTML`. */
export default function TextoIA({ texto }: { texto: string }) {
  return (
    <div className="texto-ia">
      {markdownLeve(texto).map((b, i) =>
        b.tipo === 'titulo' ? (
          <h2 key={i}><Partes partes={b.partes} /></h2>
        ) : b.tipo === 'lista' ? (
          <ul key={i}>
            {b.itens.map((it, j) => (
              <li key={j}><Partes partes={it} /></li>
            ))}
          </ul>
        ) : (
          <p key={i}><Partes partes={b.partes} /></p>
        ),
      )}
    </div>
  );
}
