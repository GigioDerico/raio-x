'use client';

import Link, { useLinkStatus } from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { lerFiltro, paraQuery } from '@/lib/filtro';
import Lente from '@/components/Lente';
import { IconeLancamentos, IconeMais, IconePainel, IconeParcelas, IconePlano } from './Icones';

type Item = { href: string; rotulo: string; icone?: React.ComponentType };

const PAINEL: Item = { href: '/', rotulo: 'Painel', icone: IconePainel };
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'O que aconteceu',
    itens: [
      { href: '/lancamentos', rotulo: 'Lançamentos', icone: IconeLancamentos },
      { href: '/entradas', rotulo: 'Entradas' },
      { href: '/parcelas', rotulo: 'Parcelas', icone: IconeParcelas },
    ],
  },
  {
    titulo: 'Por que aconteceu',
    itens: [
      { href: '/diagnostico', rotulo: 'Diagnóstico e conversa' },
      { href: '/categorias', rotulo: 'Categorias' },
    ],
  },
  {
    titulo: 'O que faço agora',
    itens: [
      { href: '/conexoes', rotulo: 'Conexões' },
      { href: '/plano', rotulo: 'Plano de 3 meses', icone: IconePlano },
      { href: '/ajustes', rotulo: 'Ajustes' },
    ],
  },
];

// no celular cabem cinco; o resto vai para "Mais"
const INFERIOR = ['/', '/lancamentos', '/parcelas', '/plano'];
const TODOS = [PAINEL, ...GRUPOS.flatMap((g) => g.itens)];

/**
 * Sem loading.tsx (ele apagaria a tela a cada troca de filtro), a troca de aba
 * avisa aqui: o ponto no item clicado, e o CSS esmaece o conteúdo pelo :has.
 */
function SinalNavegando() {
  const { pending } = useLinkStatus();
  return pending ? <span data-navegando className="menu-carregando" aria-hidden="true" /> : null;
}

export default function Menu() {
  const caminho = usePathname();
  // o link carrega só o recorte (mês, cartões, obra), não os parâmetros da
  // tela (busca, categoria): trocar de tela nunca perde o filtro nem arrasta
  // um estado que não faz sentido na tela de chegada
  const q = paraQuery(lerFiltro(useSearchParams()));
  const com = (href: string) => (q ? `${href}?${q}` : href);
  const ativo = (href: string) => (href === '/' ? caminho === '/' : caminho.startsWith(href));

  const mais = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (mais.current) mais.current.open = false;
  }, [caminho]);

  // no celular o item vira só ícone; o nome continua no aria-label (leitor de
  // tela) e no title (toque longo), senão o ícone vira adivinhação
  const link = (i: Item, soIcone = false) => {
    const Icone = i.icone;
    return (
      <Link
        key={i.href}
        href={com(i.href)}
        className={ativo(i.href) ? 'ativo' : undefined}
        aria-current={ativo(i.href) ? 'page' : undefined}
        aria-label={soIcone && Icone ? i.rotulo : undefined}
        title={soIcone && Icone ? i.rotulo : undefined}
      >
        {soIcone && Icone ? <Icone /> : i.rotulo}
        <SinalNavegando />
      </Link>
    );
  };

  const sair = (
    <form action="/api/auth/logout" method="post">
      <button type="submit" className="link">
        Sair
      </button>
    </form>
  );

  return (
    <>
      <nav className="menu-lateral" aria-label="Principal">
        <div className="marca">
          <Lente tamanho={24} />
          <span className="marca-nome">
            Raio-<em>X</em>
          </span>
        </div>
        {link(PAINEL)}
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="menu-grupo">
            <span className="eyebrow">{g.titulo}</span>
            {g.itens.map((i) => link(i))}
          </div>
        ))}
        <div className="menu-pe">{sair}</div>
      </nav>

      <nav className="menu-inferior" aria-label="Principal">
        {TODOS.filter((i) => INFERIOR.includes(i.href)).map((i) => link(i, true))}
        <details className="menu-mais" ref={mais}>
          <summary
            className={TODOS.some((i) => !INFERIOR.includes(i.href) && ativo(i.href)) ? 'ativo' : undefined}
            aria-label="Mais"
            title="Mais"
          >
            <IconeMais />
          </summary>
          <div
            className="menu-mais-lista"
            onClick={(e) => {
              // clicar no link da página atual não muda o caminho, então o
              // useEffect acima não dispara: fecha aqui também
              if ((e.target as HTMLElement).closest('a') && mais.current) mais.current.open = false;
            }}
          >
            {TODOS.filter((i) => !INFERIOR.includes(i.href)).map((i) => link(i))}
            {sair}
          </div>
        </details>
      </nav>
    </>
  );
}
