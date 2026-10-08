'use client';

import { useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { consumirNdjson } from '@/lib/ndjson';
import TextoIA from './TextoIA';

type Estado = 'atual' | 'desatualizado' | 'nenhum';
type Props = { titulo: string; texto: string | null; estado: Estado; query: string };

const FALHA = 'não consegui falar com a IA, tente de novo';

export default function Diagnostico({ titulo, texto, estado, query }: Props) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [atualizando, startTransition] = useTransition();
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  // o texto que está chegando ou acabou de chegar; sem ele a tela piscaria o antigo até o refresh
  const [novo, setNovo] = useState('');
  const [concluido, setConcluido] = useState(false);
  const [interrompido, setInterrompido] = useState(false);
  const controle = useRef<AbortController | null>(null);
  const pararRef = useRef<HTMLButtonElement>(null);
  const refazerRef = useRef<HTMLButtonElement>(null);
  const acaoRef = useRef<HTMLButtonElement>(null);

  const ocupado = gerando || atualizando;
  const textoVisto = novo || texto;
  const parcial = interrompido && !!novo;
  // texto parcial não pode parecer o diagnóstico atual completo: oferece "Refazer", não "↻"
  const estadoVisto: Estado = concluido ? 'atual' : parcial ? 'desatualizado' : estado;

  async function gerar(forcar: boolean) {
    const ac = new AbortController();
    controle.current = ac;
    // o botão clicado some neste render; sem levar o foco ao "Parar", ele cai no body
    flushSync(() => setGerando(true));
    pararRef.current?.focus();
    setInterrompido(false);
    setErro('');
    setAviso('Gerando o diagnóstico…');
    setNovo('');
    setConcluido(false);
    // objeto: o TS não acompanha o que o callback do stream muda
    const st = { acumulado: '', fim: false, falhou: false };
    let atualizar = false;
    try {
      const r = await fetch(`/api/diagnostico?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ forcar }),
        signal: ac.signal,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        // 400 traz mensagem escrita para o usuário ("configure a chave", "sem lançamentos")
        setErro(r.status === 400 ? d?.detalhe || 'não deu certo' : FALHA);
        return;
      }
      if ((r.headers.get('content-type') ?? '').includes('application/json')) {
        // mesmo recorte e mesmos números: a rota devolveu o guardado sem chamar a IA
        const d = await r.json().catch(() => ({}));
        if (typeof d?.texto === 'string') setNovo(d.texto);
        st.fim = true;
      } else if (r.body) {
        await consumirNdjson(r.body, (e) => {
          if (typeof e.t === 'string') {
            st.acumulado += e.t;
            setNovo(st.acumulado);
          } else if (e.fim === true) st.fim = true;
          else if (typeof e.erro === 'string') {
            st.falhou = true;
            setErro(e.erro);
          }
        });
      }
      if (st.fim) {
        setConcluido(true);
        setAviso('Diagnóstico pronto.');
        atualizar = true;
      } else if (!st.falhou) {
        setErro('a resposta chegou pela metade; tente de novo');
      }
    } catch {
      if (ac.signal.aborted) {
        setInterrompido(true);
        setAviso('Interrompido. O texto parcial não foi guardado.');
      } else setErro(FALHA);
    } finally {
      // só devolve o foco se ele ainda estava no "Parar": não rouba de quem foi ler outra coisa
      const devolverFoco = document.activeElement === pararRef.current;
      flushSync(() => setGerando(false));
      if (devolverFoco) (refazerRef.current ?? acaoRef.current)?.focus();
      controle.current = null;
      if (!st.fim && !ac.signal.aborted) setAviso('');
      if (atualizar) startTransition(() => router.refresh());
    }
  }

  return (
    <section className="cartao diagnostico" aria-labelledby="diag-titulo">
      <div className="diag-topo">
        <h1 id="diag-titulo">{titulo}</h1>
        {estadoVisto === 'atual' && !gerando && (
          // sem disabled durante o refresh: o foco volta para cá ao terminar, e botão desabilitado não recebe foco
          <button ref={refazerRef} type="button" className="link diag-refazer" onClick={() => gerar(true)} aria-label="Gerar o diagnóstico de novo" title="Gerar o diagnóstico de novo">
            ↻
          </button>
        )}
      </div>
      {!gerando && parcial && <p className="diag-nota">Texto parcial, não guardado.</p>}
      {!gerando && !parcial && estadoVisto === 'desatualizado' && <p className="diag-nota">Os números mudaram desde este diagnóstico.</p>}
      {/* sem aria-live aqui: anunciar cada pedaço do stream seria ruído; quem anuncia é o status abaixo */}
      <div className="diag-corpo" aria-busy={ocupado}>
        {gerando && !novo ? (
          <p className="suave">Lendo seus números…</p>
        ) : textoVisto ? (
          <TextoIA texto={textoVisto} />
        ) : (
          <p className="suave">Nenhum diagnóstico deste recorte ainda. Ele só é gerado quando você pede.</p>
        )}
      </div>
      <div className="diag-acoes">
        {gerando ? (
          <button ref={pararRef} type="button" className="link" onClick={() => controle.current?.abort()}>
            Parar
          </button>
        ) : (
          estadoVisto !== 'atual' && (
            <button ref={acaoRef} type="button" onClick={() => gerar(false)} disabled={ocupado}>
              {estadoVisto === 'nenhum' ? 'Gerar diagnóstico' : 'Refazer'}
            </button>
          )
        )}
      </div>
      <span className={erro ? 'diag-status diag-erro' : 'diag-status'} role="status" aria-live="polite">
        {erro || aviso}
      </span>
    </section>
  );
}
