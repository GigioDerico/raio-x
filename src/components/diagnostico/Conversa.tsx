'use client';

import { Fragment, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import TextoIA from './TextoIA';
import { LIMITE_PERGUNTA, SUGESTOES, type FalaGuardada } from '@/lib/conversa';
import { consumirNdjson } from '@/lib/ndjson';

type Props = { falas: FalaGuardada[]; divisoria: number | null; query: string };

const FALHA = 'não consegui falar com a IA, tente de novo';

// limpar troca a chave do componente e o remonta; o pedido de foco precisa sobreviver a isso
let focarAoMontar = false;

function Divisoria() {
  return (
    <li className="conv-divisoria" role="separator">
      Os números mudaram depois daqui.
    </li>
  );
}

export default function Conversa({ falas, divisoria, query }: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  // a pergunta em andamento e a resposta crescendo; somem no refresh, que traz o par gravado
  const [enviada, setEnviada] = useState<string | null>(null);
  const [resposta, setResposta] = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [interrompida, setInterrompida] = useState(false);
  const [atualizando, startTransition] = useTransition();
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');
  // o diálogo modal torna o resto da página inerte: o erro do Limpar precisa morar dentro dele
  const [erroLimpar, setErroLimpar] = useState('');
  const [limpando, setLimpando] = useState(false);
  const controle = useRef<AbortController | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focarAoMontar) return;
    focarAoMontar = false;
    campo.current?.focus();
  }, []);

  const ocupado = respondendo || atualizando;

  async function perguntar(bruta: string) {
    const pergunta = bruta.trim();
    if (!pergunta || ocupado) return;
    const ac = new AbortController();
    controle.current = ac;
    setEnviada(pergunta);
    setResposta('');
    setTexto('');
    setErro('');
    setInterrompida(false);
    setRespondendo(true);
    setStatus('A IA está respondendo…');
    // objeto: o TS não acompanha o que o callback do stream muda
    const st = { fim: false, falhou: false, texto: '' };
    try {
      const r = await fetch(`/api/conversa?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pergunta }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        st.falhou = true;
        // 400 traz mensagem escrita para o usuário ("configure a chave", "pergunta longa")
        setErro(r.status === 400 ? d?.detalhe || 'não deu certo' : FALHA);
        return;
      }
      await consumirNdjson(r.body, (e) => {
        if (typeof e.t === 'string') {
          st.texto += e.t;
          setResposta(st.texto);
        } else if (e.fim === true) st.fim = true;
        else if (typeof e.erro === 'string') {
          st.falhou = true;
          setErro(e.erro);
        }
      });
      if (!st.fim && !st.falhou) {
        st.falhou = true;
        setErro('a resposta chegou pela metade; tente de novo');
      }
    } catch {
      if (ac.signal.aborted) setInterrompida(true);
      else {
        st.falhou = true;
        setErro(FALHA);
      }
    } finally {
      setRespondendo(false);
      controle.current = null;
      if (st.fim) {
        setStatus('Resposta pronta.');
        startTransition(() => router.refresh());
      } else {
        setTexto(pergunta);
        setStatus(ac.signal.aborted ? 'Interrompido.' : '');
        // o Parar pode ter chegado depois do [DONE], com o par já gravado: o refresh traz o que ficou
        if (ac.signal.aborted) startTransition(() => router.refresh());
        if (st.falhou) {
          setEnviada(null);
          setResposta('');
        }
      }
    }
  }

  async function limpar() {
    setErroLimpar('');
    setLimpando(true);
    try {
      const r = await fetch(`/api/conversa?${query}`, { method: 'DELETE' });
      if (!r.ok) {
        setErroLimpar('não consegui limpar, tente de novo');
        return;
      }
      dialogo.current?.close();
      // o botão que abriu o diálogo some com as falas; sem isto o foco cairia no body
      focarAoMontar = true;
      campo.current?.focus();
      setStatus('Conversa limpa.');
      startTransition(() => router.refresh());
    } catch {
      setErroLimpar('não consegui limpar, tente de novo');
    } finally {
      setLimpando(false);
    }
  }

  function abrirLimpar() {
    setErroLimpar('');
    dialogo.current?.showModal();
  }

  const vazia = falas.length === 0 && !enviada;

  return (
    <section className="cartao conversa" aria-labelledby="conv-titulo">
      <div className="conv-topo">
        <h2 id="conv-titulo">Conversa</h2>
        {falas.length > 0 && (
          <button type="button" className="link" onClick={abrirLimpar} disabled={ocupado}>
            Limpar conversa
          </button>
        )}
      </div>

      {vazia ? (
        <p className="suave">Pergunte o que quiser sobre o recorte que está na tela.</p>
      ) : (
        <ol className="conv-falas">
          {falas.map((f, i) => (
            <Fragment key={i}>
              {divisoria === i && <Divisoria />}
              <li className={`bolha ${f.papel}`}>
                {f.papel === 'pessoa' ? <p>{f.texto}</p> : <TextoIA texto={f.texto} />}
              </li>
            </Fragment>
          ))}
          {divisoria !== null && divisoria === falas.length && <Divisoria />}
          {enviada && (
            <>
              <li className="bolha pessoa">
                <p>{enviada}</p>
              </li>
              <li className="bolha ia">
                {resposta ? <TextoIA texto={resposta} /> : <p className="suave">Pensando…</p>}
                {interrompida && <p className="conv-nota">Interrompida.</p>}
              </li>
            </>
          )}
        </ol>
      )}

      {falas.length < 2 && !ocupado && (
        <div className="conv-sugestoes">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" className="conv-sugestao" onClick={() => perguntar(s)} disabled={ocupado}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="conv-form"
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(texto);
        }}
      >
        <textarea
          ref={campo}
          aria-label="Sua pergunta"
          value={texto}
          maxLength={LIMITE_PERGUNTA}
          rows={2}
          placeholder="Ex.: por que restaurantes subiu tanto?"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra linha; composição de acento (IME) não envia.
            // O Safari solta o Enter que fecha a composição já com isComposing falso; o 229 o denuncia
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              perguntar(texto);
            }
          }}
          // readOnly, não disabled: campo desabilitado perde o foco
          readOnly={respondendo}
        />
        <div className="conv-form-rodape">
          <span className="conv-contador" aria-hidden="true">
            {texto.length}/{LIMITE_PERGUNTA}
          </span>
          {respondendo ? (
            <button type="button" className="link" onClick={() => controle.current?.abort()}>
              Parar
            </button>
          ) : (
            <button type="submit" disabled={!texto.trim() || ocupado}>
              Enviar
            </button>
          )}
        </div>
      </form>

      <span className={erro ? 'conv-status conv-erro' : 'conv-status'} role="status" aria-live="polite">
        {erro || status}
      </span>

      <dialog ref={dialogo} className="dialogo-apagar" aria-labelledby="limpar-titulo">
        <h2 id="limpar-titulo">Limpar a conversa deste recorte?</h2>
        <p>As perguntas e respostas somem. O diagnóstico continua.</p>
        {erroLimpar && (
          <p className="conv-erro" role="alert">
            {erroLimpar}
          </p>
        )}
        <div className="dialogo-acoes">
          <button type="button" className="link" onClick={() => dialogo.current?.close()}>
            Cancelar
          </button>
          <button type="button" className="perigo" onClick={limpar} disabled={ocupado || limpando}>
            Limpar
          </button>
        </div>
      </dialog>
    </section>
  );
}
