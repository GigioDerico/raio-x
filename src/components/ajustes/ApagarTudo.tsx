'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FRASE_APAGAR } from '@/lib/dados';
import { COOKIE_FILTRO } from '@/lib/filtro';

export default function ApagarTudo() {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState('');
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  function irParaOInicio() {
    // o filtro guardado aponta para cartões que não existem mais: sem limpar, o
    // middleware reaplicaria o recorte e a próxima importação pareceria vazia
    document.cookie = `${COOKIE_FILTRO}=; path=/; max-age=0; samesite=lax`;
    router.push('/');
    router.refresh();
  }

  async function apagar(e: React.FormEvent) {
    e.preventDefault();
    setApagando(true);
    setErro('');
    try {
      const r = await fetch('/api/dados/apagar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmacao: texto }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(r.status === 400 ? d?.detalhe || 'confirmação inválida' : 'não consegui apagar, tente de novo');
        return;
      }
      if (d.conexoesApagadas > 0) {
        setAviso('Dados apagados. As autorizações no banco podem continuar ativas; revogue pelo app do banco.');
        return;
      }
      irParaOInicio();
    } catch {
      setErro('não consegui apagar, tente de novo');
    } finally {
      setApagando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="link perigo-texto"
        onClick={() => {
          setTexto('');
          setErro('');
          dialogo.current?.showModal();
        }}
      >
        Apagar tudo…
      </button>
      <dialog
        ref={dialogo}
        className="dialogo-apagar"
        aria-labelledby="apagar-titulo"
        // fechar com Esc depois de apagar deixaria Ajustes mostrando dados que não existem mais
        onClose={() => {
          if (aviso) irParaOInicio();
        }}
      >
        {aviso ? (
          <div>
            <h2 id="apagar-titulo">Pronto</h2>
            <p>{aviso}</p>
            <button type="button" onClick={irParaOInicio}>Ir para o início</button>
          </div>
        ) : (
          <form onSubmit={apagar}>
            <h2 id="apagar-titulo">Apagar todos os seus dados?</h2>
            <p>
              Somem lançamentos, faturas, cartões, regras aprendidas, planos, as conversas e o histórico de IA. Os ajustes voltam ao
              padrão. Sua senha continua valendo. <b>Não tem volta</b> — se quiser, baixe o CSV antes.
            </p>
            <label htmlFor="apagar-confirmacao">
              Digite <b>{FRASE_APAGAR}</b> para confirmar
            </label>
            <input id="apagar-confirmacao" type="text" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
            {erro && <p className="erro" role="alert">{erro}</p>}
            <div className="dialogo-acoes">
              <button type="button" className="link" onClick={() => dialogo.current?.close()}>Cancelar</button>
              <button type="submit" className="perigo" disabled={texto !== FRASE_APAGAR || apagando}>
                {apagando ? 'Apagando…' : 'Apagar tudo'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
