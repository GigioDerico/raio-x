'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AvisoDeFalha from '@/components/casca/AvisoDeFalha';
import ConectarBanco from '@/components/ajustes/ConectarBanco';
import { ErroLocal, buscar, falhaDe, textoDoErro, type Falha } from '@/lib/falha';
import { espera, fraseDoFim, trazerCartoes, type Cartao, type Resumo } from '@/lib/pluggy/fluxo-cliente';

type Props = { conexaoId: string; banco: string; acao: 'atualizar' | 'reconectar' | 'renovar' | null };

/** As ações de uma conexão: atualizar agora (ou reconectar/renovar) e desconectar. */
export default function AcaoConexao({ conexaoId, banco, acao }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [resumos, setResumos] = useState<Resumo[]>([]);
  const [erro, setErro] = useState<Falha | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const [erroDialogo, setErroDialogo] = useState('');
  // "Atualizar agora" pode esperar até 2 min pelo banco; sem isso, sair da tela no meio
  // ainda dispararia setState depois do componente desmontado
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  async function atualizar() {
    setOcupado(true);
    setErro(null);
    setResumos([]);
    try {
      const url = `/api/connections/${conexaoId}/sync`;
      const pedir = async (etapa: 'iniciar' | 'conferir') => {
        const r = await buscar(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ etapa }) });
        if (!r.ok) throw await falhaDe(r);
        return (await r.json()) as { estado: 'ok' | 'atualizando'; cartoes?: Cartao[]; aviso?: string | null };
      };
      setAviso('Pedindo ao banco os dados novos…');
      await pedir('iniciar');
      let d: Awaited<ReturnType<typeof pedir>> | null = null;
      for (let t = 0; t < 40 && montado.current; t++) {
        await espera(3000);
        if (!montado.current) return;
        d = await pedir('conferir');
        if (d.estado === 'ok') break;
        setAviso('O banco ainda está mandando os dados…');
      }
      if (!montado.current) return;
      if (d?.estado !== 'ok') throw new ErroLocal('O banco demorou demais. Tente de novo daqui a pouco.');
      const cartoes = d.cartoes ?? [];
      const feitos = await trazerCartoes(cartoes, 'atualizar', (a, r) => {
        if (montado.current) {
          setAviso(a);
          setResumos(r);
        }
      });
      if (!montado.current) return;
      setResumos(feitos);
      setAviso(fraseDoFim(cartoes.length, feitos, d.aviso ?? null));
    } catch (e) {
      if (!montado.current) return;
      setAviso('');
      setErro(textoDoErro(e, navigator.onLine));
    } finally {
      if (montado.current) {
        setOcupado(false);
        startTransition(() => router.refresh());
      }
    }
  }

  async function confirmarDesconectar() {
    setErroDialogo('');
    try {
      const r = await buscar(`/api/connections/${conexaoId}`, { method: 'DELETE' });
      if (!r.ok) throw await falhaDe(r);
      dialogo.current?.close();
      startTransition(() => router.refresh());
    } catch (e) {
      setErroDialogo(textoDoErro(e, navigator.onLine).texto);
    }
  }

  return (
    <div className="conexao-acoes">
      {acao === 'atualizar' && (
        <button type="button" onClick={() => void atualizar()} disabled={ocupado}>
          {ocupado ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      )}
      {(acao === 'reconectar' || acao === 'renovar') && <ConectarBanco conexaoId={conexaoId} rotulo={acao === 'renovar' ? 'Renovar' : 'Reconectar'} />}
      <button
        type="button"
        className="link"
        onClick={() => {
          setErroDialogo('');
          dialogo.current?.showModal();
        }}
        disabled={ocupado}
      >
        Desconectar
      </button>
      {erro && <AvisoDeFalha falha={erro} />}
      <div role="status" aria-live="polite">
        <span className="suave">{aviso}</span>
        {resumos.length > 0 && (
          <ul className="conectar-resumo">
            {resumos.map((r, i) => (
              <li key={`${i}-${r.nome}`} className={r.falhou ? 'falhou' : undefined}>
                <strong>{r.nome}:</strong> {r.texto}
              </li>
            ))}
          </ul>
        )}
      </div>
      <dialog ref={dialogo} className="dialogo-apagar" aria-labelledby={`desc-${conexaoId}`}>
        <h2 id={`desc-${conexaoId}`}>Desconectar {banco}?</h2>
        <p>Os lançamentos já trazidos ficam. O app para de buscar novos, e a autorização no Pluggy é revogada.</p>
        {erroDialogo && (
          <p className="erro" role="alert">
            {erroDialogo}
          </p>
        )}
        <div className="dialogo-acoes">
          <button type="button" className="link" onClick={() => dialogo.current?.close()}>
            Cancelar
          </button>
          <button type="button" className="perigo" onClick={() => void confirmarDesconectar()}>
            Desconectar
          </button>
        </div>
      </dialog>
    </div>
  );
}
