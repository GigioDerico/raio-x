'use client';

import ErroDaTela from '@/components/casca/ErroDaTela';

/**
 * Pega erro das páginas dentro do grupo `(app)` — painel, lançamentos etc.
 * Falha no layout do grupo (a casca em si) é pega por `src/app/error.tsx`.
 */
export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return <ErroDaTela oQue="esta tela" reset={reset} />;
}
