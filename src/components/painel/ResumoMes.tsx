'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Estado = 'atual' | 'desatualizado' | 'nenhum';
type Props = { titulo: string; texto: string | null; estado: Estado; query: string };

export default function ResumoMes({ titulo, texto, estado, query }: Props) {
  const router = useRouter();
  const [pedindo, setPedindo] = useState(false);
  const [atualizando, startTransition] = useTransition();
  const [erro, setErro] = useState('');
  // o texto que a rota acabou de devolver; sem ele, o cartão piscaria o estado antigo até o refresh chegar
  const [novo, setNovo] = useState<string | null>(null);

  const ocupado = pedindo || atualizando;
  const textoVisto = novo ?? texto;
  const estadoVisto: Estado = novo ? 'atual' : estado;

  async function pedir(forcar: boolean) {
    setPedindo(true);
    setErro('');
    try {
      const r = await fetch(`/api/resumo?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ forcar }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 400 e 502 trazem mensagem escrita para o usuário ("configure a chave", "não respondeu direito")
        setErro([400, 502].includes(r.status) ? d?.detalhe || 'não deu certo' : 'não consegui falar com a IA, tente de novo');
        return;
      }
      if (typeof d?.texto === 'string') setNovo(d.texto);
      startTransition(() => router.refresh());
    } catch {
      setErro('não consegui falar com a IA, tente de novo');
    } finally {
      setPedindo(false);
    }
  }

  return (
    <section className="cartao resumo-mes" aria-labelledby="resumo-titulo">
      <div className="resumo-topo">
        <span id="resumo-titulo" className="eyebrow">{titulo}</span>
        {estadoVisto === 'atual' && (
          <button type="button" className="link resumo-refazer" onClick={() => pedir(true)} disabled={ocupado} aria-label="Gerar o resumo de novo" title="Gerar o resumo de novo">
            ↻
          </button>
        )}
      </div>
      {/* aria-busy aqui, não na section: status dentro de ancestral ocupado pode não ser anunciado */}
      <div aria-live="polite" aria-busy={ocupado}>
        {pedindo ? (
          <p className="resumo-texto suave">Resumindo o mês…</p>
        ) : textoVisto ? (
          <p className="resumo-texto">{textoVisto}</p>
        ) : null}
      </div>
      {estadoVisto === 'desatualizado' && !pedindo && <p className="resumo-nota">Os dados mudaram desde este resumo.</p>}
      {estadoVisto !== 'atual' && (
        <button type="button" className="resumo-pedir" onClick={() => pedir(false)} disabled={ocupado}>
          {estadoVisto === 'nenhum' ? 'Resumir o mês' : 'Refazer'}
        </button>
      )}
      <span className="resumo-erro" role="status" aria-live="polite">{erro}</span>
    </section>
  );
}
