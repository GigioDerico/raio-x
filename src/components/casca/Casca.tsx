'use client';

import Link from 'next/link';
import { Suspense, useTransition } from 'react';
import type { OpcoesFiltro } from '@/lib/txn-repo';
import FiltroGlobal from './FiltroGlobal';
import Menu from './Menu';

/**
 * Menu, filtro e conteúdo. A transição fica aqui porque é o conteúdo que
 * esmaece: trocar o filtro mantém os números antigos visíveis até os novos
 * chegarem, em vez de piscar a tela em branco.
 *
 * useSearchParams exige Suspense acima de quem o chama (Menu e FiltroGlobal);
 * cada um tem o seu, em vez de um só por cima de tudo, porque o conteúdo
 * (children) não pode sumir junto se um dos dois suspender.
 *
 * `aviso` é a conexão que precisa do dono (senha, autorização vencendo):
 * fica acima de tudo, em todas as telas, porque sem isso o app para de
 * receber lançamentos sem ninguém perceber.
 */
export default function Casca({
  opcoes,
  aviso,
  children,
}: {
  opcoes: OpcoesFiltro;
  aviso: { texto: string; href: string } | null;
  children: React.ReactNode;
}) {
  const [pendente, iniciar] = useTransition();

  return (
    <div className="casca">
      <Suspense>
        <Menu />
      </Suspense>
      <div className="casca-conteudo">
        {aviso && (
          <p className="faixa-conexao" role="status">
            <span>{aviso.texto}</span> — <Link href={aviso.href}>Resolver</Link>
          </p>
        )}
        <Suspense>
          <FiltroGlobal {...opcoes} iniciarTransicao={iniciar} />
        </Suspense>
        <main className={pendente ? 'esmaecido' : undefined} aria-busy={pendente}>
          {children}
        </main>
      </div>
    </div>
  );
}
