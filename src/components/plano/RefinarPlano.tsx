'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RefinarPlano({ query }: { query: string }) {
  const router = useRouter();
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState('');

  async function refinar() {
    setPedindo(true);
    setErro('');
    try {
      const r = await fetch(`/api/plan?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refinar: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 400/404/502 trazem mensagem escrita para o usuário ("configure a chave", "a IA não respondeu direito")
        setErro([400, 404, 502].includes(r.status) ? d?.detalhe || 'não deu certo' : 'não consegui falar com a IA, tente de novo');
        return;
      }
      router.refresh();
    } catch {
      setErro('não consegui falar com a IA, tente de novo');
    } finally {
      setPedindo(false);
    }
  }

  return (
    <div className="refinar">
      <button type="button" onClick={refinar} disabled={pedindo}>
        {pedindo ? 'Pedindo à IA… (pode levar meio minuto)' : 'Refinar com IA'}
      </button>
      <span className="refinar-msg" role="status" aria-live="polite">{erro}</span>
    </div>
  );
}
