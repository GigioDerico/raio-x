'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

/**
 * O error.tsx de (app) fica dentro do layout de (app) e não pega falha do
 * próprio layout (ex.: banco frio em opcoesDoFiltro) — esta cópia na raiz
 * cobre esse caso.
 *
 * A casca some nesse caso (o layout que a monta é quem falhou), por isso o
 * `<main>` aqui: sem ele a seção fica colada direto no body.
 */
export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <ErroDaTela oQue="o app" reset={reset} />
    </main>
  );
}
