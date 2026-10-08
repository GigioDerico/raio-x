import Link from 'next/link';
import type { LinkVazio } from '@/lib/vazio';

type Props = { frase: string; links: LinkVazio[]; nivel?: 'h1' | 'h2'; dica?: string };

/** Diz qual filtro esvaziou a tela e oferece o caminho de volta (guia, "Vazio por filtro"). */
export default function VazioPorFiltro({ frase, links, nivel = 'h1', dica }: Props) {
  const Titulo = nivel;
  return (
    <section className="cartao vazio">
      <Titulo>{frase}</Titulo>
      <p className="suave">{dica ?? (links.length ? 'Mude o filtro acima ou:' : 'Mude o filtro acima.')}</p>
      {links.length > 0 && (
        <div className="vazio-acoes">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="botao">
              {l.rotulo}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
