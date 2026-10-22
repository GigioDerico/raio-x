'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import AvisoDeFalha from '@/components/casca/AvisoDeFalha';
import { ErroLocal, buscar, falhaDe, textoDoErro, type Falha } from '@/lib/falha';
import { espera, fraseDoFim, trazerCartoes, type Cartao, type Resumo } from '@/lib/pluggy/fluxo-cliente';

// o widget mexe em window/document ao montar: só no navegador
const PluggyConnect = dynamic(() => import('react-pluggy-connect').then((m) => m.PluggyConnect), { ssr: false });

type Props = { conexaoId?: string; rotulo?: string; conectorId?: number; secundario?: boolean };

/**
 * Abre o widget do Pluggy. O token é pedido no clique, não ao abrir a tela:
 * ele expira em minutos e nem toda visita a Ajustes vai conectar banco. Com
 * `conexaoId`, o widget abre no item existente (reconectar/renovar, chamado
 * por `AcaoConexao`) em vez de criar uma conexão nova. Com `conectorId`, pula a
 * lista de bancos e vai direto ao login daquele conector (ex.: Meu Pluggy).
 */
export default function ConectarBanco({ conexaoId, rotulo, conectorId, secundario }: Props) {
  const [token, setToken] = useState('');
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<Falha | null>(null);
  const [aviso, setAviso] = useState('');
  const [resumos, setResumos] = useState<Resumo[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  async function abrir() {
    setPedindo(true);
    setErro(null);
    setAviso('');
    try {
      const r = await buscar('/api/connect/token', {
        method: 'POST',
        ...(conexaoId ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conexaoId }) } : {}),
      });
      if (!r.ok) throw await falhaDe(r);
      const d = (await r.json()) as { accessToken?: string };
      if (!d.accessToken) throw new Error('sem token');
      setToken(d.accessToken);
    } catch (e) {
      setErro(textoDoErro(e, navigator.onLine));
    } finally {
      setPedindo(false);
    }
  }

  async function gravar(itemId: string) {
    setToken('');
    setOcupado(true);
    setErro(null);
    setResumos([]);
    try {
      // o banco pode ainda estar mandando os dados: pergunta de novo a cada 3 s, por até 2 min
      let d: { estado: 'ok' | 'atualizando'; cartoes?: Cartao[]; aviso?: string | null } | null = null;
      for (let t = 0; t < 40; t++) {
        // quem saiu da tela não espera mais: os cartões não são trazidos, e conectar de novo retoma
        if (!montado.current) return;
        setAviso(t === 0 ? 'Gravando a conexão…' : 'O banco ainda está mandando os dados…');
        const r = await buscar('/api/connect/callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemId }),
        });
        if (!r.ok) throw await falhaDe(r);
        d = await r.json();
        if (d?.estado === 'ok') break;
        await espera(3000);
      }
      if (d?.estado !== 'ok') throw new ErroLocal('O banco demorou demais para mandar os dados. Tente "Conectar banco" de novo daqui a pouco.');

      const cartoes = d.cartoes ?? [];
      const feitos = await trazerCartoes(cartoes, 'inicial', (a, r) => {
        setAviso(a);
        setResumos(r);
      });
      setAviso(fraseDoFim(cartoes.length, feitos, d.aviso ?? null));
      startTransition(() => router.refresh());
    } catch (e) {
      setAviso('');
      setErro(textoDoErro(e, navigator.onLine));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <button type="button" className={secundario ? 'secundario' : undefined} onClick={() => void abrir()} disabled={pedindo || !!token || ocupado}>
        {pedindo ? 'Abrindo…' : rotulo ?? 'Conectar banco'}
      </button>
      {erro && <AvisoDeFalha falha={erro} />}
      {/* o resumo de cada cartão chega aos poucos: precisa ser anunciado junto com o aviso */}
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
      {token && (
        <PluggyConnect
          connectToken={token}
          // conectores de teste do Pluggy só fora de produção
          includeSandbox={process.env.NODE_ENV !== 'production'}
          {...(conectorId !== undefined ? { selectedConnectorId: conectorId } : {})}
          onSuccess={({ item }) => void gravar(item.id)}
          onError={(e) => {
            // erro que traz o item (ex.: o banco recusou o login depois de criá-lo): o callback
            // confere a posse no Pluggy e devolve a mensagem certa para o estado do item
            const existente = e?.data?.item?.id;
            if (existente) {
              void gravar(existente);
              return;
            }
            setToken('');
            const msg = typeof e?.message === 'string' && e.message.trim() ? e.message.trim().slice(0, 200) : '';
            setErro({ tipo: 'uso', texto: msg ? `O Pluggy não conseguiu conectar: ${msg}` : 'O Pluggy não conseguiu conectar. Tente de novo.' });
          }}
          onClose={() => setToken('')}
        />
      )}
    </div>
  );
}
