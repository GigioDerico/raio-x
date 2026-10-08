'use client';

import { startTransition, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

const assinar = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/**
 * Corpo comum dos error.tsx. O detalhe fica no log do servidor; aqui, o que
 * ajuda a decidir: sem rede é com você, o resto é com o servidor (ou o banco
 * acordando) e tentar de novo costuma resolver.
 */
export default function ErroDaTela({ oQue, reset }: { oQue: string; reset: () => void }) {
  const router = useRouter();
  const online = useSyncExternalStore(assinar, () => navigator.onLine, () => true);

  return (
    <section className="cartao vazio" role="alert">
      <h2>Não consegui carregar {oQue}</h2>
      <p className="suave">
        {online
          ? 'O servidor não respondeu — pode ter sido o banco ou a rede. Tente de novo em instantes.'
          : 'Sem conexão com a internet. Quando ela voltar, tente de novo.'}
      </p>
      <button
        type="button"
        onClick={() =>
          // reset() sozinho só re-renderiza no cliente; o payload com erro fica
          // em cache. router.refresh() busca os dados de novo antes.
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      >
        Tentar de novo
      </button>
    </section>
  );
}
