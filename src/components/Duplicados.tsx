'use client';

import { useEffect, useState } from 'react';
import AvisoDeFalha from '@/components/casca/AvisoDeFalha';
import { buscar, falhaDe, textoDoErro, type Falha } from '@/lib/falha';

export type Suspeito = {
  id: string;
  data: string;
  valor: number;
  nome: string;
  cartao: string;
  candidatos: { id: string; data: string; valor: number; nome: string }[];
};

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

type Props = { suspeitos: Suspeito[]; aoMudar: () => void };

/** Faixa e revisão dos possíveis duplicados, dentro de Lançamentos. */
export default function Duplicados({ suspeitos, aoMudar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<Falha | null>(null);
  const [desfazer, setDesfazer] = useState<{ id: string; candidatoId: string; nome: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // o erro era sobre a lista anterior: com outro recorte ou depois de recarregar, não vale mais
  useEffect(() => setErro(null), [suspeitos]);

  // os mesmos 10 s do desfazer da exclusão
  useEffect(() => {
    if (!desfazer) return;
    const t = setTimeout(() => setDesfazer(null), 10000);
    return () => clearTimeout(t);
  }, [desfazer]);

  async function decidir(id: string, corpo: Record<string, unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await buscar(`/api/txn/${id}/duplicado`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
      if (!r.ok) throw await falhaDe(r);
      aoMudar();
      return true;
    } catch (e) {
      setErro(textoDoErro(e, navigator.onLine));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  if (!suspeitos.length && !desfazer && !erro) return null;

  return (
    <div className="duplicados">
      {suspeitos.length > 0 && (
        <div className="aviso">
          <span>
            {suspeitos.length === 1 ? '1 possível duplicado' : `${suspeitos.length} possíveis duplicados`} — fora dos totais até você decidir.
          </span>
          <button type="button" className="link" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Fechar' : 'Revisar'}
          </button>
        </div>
      )}
      {desfazer && (
        <div className="aviso" role="status">
          <span>&ldquo;{desfazer.nome}&rdquo; do PDF saiu; ficou o do banco.</span>
          <button
            type="button"
            className="link"
            disabled={ocupado}
            onClick={async () => {
              if (await decidir(desfazer.id, { decisao: 'desfazer', candidatoId: desfazer.candidatoId })) setDesfazer(null);
            }}
          >
            Desfazer
          </button>
        </div>
      )}
      {erro && <AvisoDeFalha falha={erro} />}
      {aberto && suspeitos.length > 0 && (
        <ul className="duplicados-lista">
          {suspeitos.map((s) => (
            <li key={s.id} className="cartao duplicado">
              <p>
                <strong>{s.nome}</strong> · {dia(s.data)} · {fmt.format(s.valor)} <span className="suave">· {s.cartao} · do banco</span>
              </p>
              {s.candidatos.length > 0 ? (
                <ul>
                  {s.candidatos.map((c) => (
                    <li key={c.id}>
                      <span>
                        {c.nome} · {dia(c.data)} · {fmt.format(c.valor)} <span className="suave">· do PDF</span>
                      </span>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={async () => {
                          if (await decidir(s.id, { decisao: 'mesmo', candidatoId: c.id })) setDesfazer({ id: s.id, candidatoId: c.id, nome: c.nome });
                        }}
                      >
                        É este
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="suave">O lançamento do PDF parecido não existe mais.</p>
              )}
              <button type="button" className="link" disabled={ocupado} onClick={() => void decidir(s.id, { decisao: 'diferente' })}>
                São diferentes
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
