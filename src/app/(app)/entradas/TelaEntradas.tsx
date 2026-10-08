'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AvisoDeFalha from '@/components/casca/AvisoDeFalha';
import VazioPorFiltro from '@/components/casca/VazioPorFiltro';
import { buscar, falhaDe, textoDoErro, type Falha } from '@/lib/falha';
import { blocosDeEntradas, textoDoPapel, type LinhaEntrada } from '@/lib/papel';
import type { Papel } from '@/lib/pluggy/mapear';
import type { LinkVazio } from '@/lib/vazio';

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v: string | number) => fmt.format(Math.abs(Number(v)) || 0);
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

type Props = {
  linhas: LinhaEntrada[];
  rotuloRecorte: string;
  vazio: { frase: string; dica?: string; links: LinkVazio[] };
};

/**
 * Triagem dos créditos da conta, não extrato: sem saldo, por valor. Marcar
 * "É renda" ou "Não conta" aprende pela origem; a página recarrega do servidor.
 */
export default function TelaEntradas({ linhas, rotuloRecorte, vazio }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  // o refresh vem depois do PATCH; até ele chegar a lista ainda é a velha, e um
  // segundo clique marcaria uma linha que já mudou de bloco junto com a origem
  const [recarregando, recarregar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<Falha | null>(null);
  const b = blocosDeEntradas(linhas);
  const travado = ocupado !== null || recarregando;

  async function marcar(id: string, papel: Papel) {
    setOcupado(id);
    setErro(null);
    try {
      const r = await buscar('/api/txn/papel', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [id], papel }),
      });
      if (!r.ok) throw await falhaDe(r);
      const d = (await r.json()) as { outros?: unknown; aprendeu?: unknown };
      setAviso(textoDoPapel(papel, Number(d.outros) || 0, d.aprendeu !== false));
      recarregar(() => router.refresh());
    } catch (e) {
      setErro(textoDoErro(e, navigator.onLine));
    } finally {
      setOcupado(null);
    }
  }

  const linha = (l: LinhaEntrada, acoes: { papel: Papel; rotulo: string }[]) => (
    <li key={l.id} className="ent-lin">
      <span className="ent-data">{dia(l.data)}</span>
      <span className="ent-nome" title={l.nome}>
        {l.nome}
      </span>
      <span className="ent-conta">{l.conta}</span>
      <span className="ent-val">{moeda(l.valor)}</span>
      <span className="ent-acoes">
        {acoes.map((a) => (
          <button key={a.papel} type="button" className="link" disabled={travado} onClick={() => void marcar(l.id, a.papel)}>
            {a.rotulo}
          </button>
        ))}
      </span>
    </li>
  );

  return (
    <div className="tela-entradas">
      <h1>Entradas</h1>
      <p className="suave">O que entrou na conta em {rotuloRecorte}. Marque o que é renda; uma vez basta para cada origem.</p>

      {erro && <AvisoDeFalha falha={erro} />}
      {aviso && (
        <div className="aviso" role="status">
          <span>{aviso}</span>
          <button type="button" className="link" onClick={() => setAviso(null)}>
            OK
          </button>
        </div>
      )}

      {linhas.length === 0 ? (
        <VazioPorFiltro nivel="h2" frase={vazio.frase} dica={vazio.dica} links={vazio.links} />
      ) : (
        <>
          <section className="cartao ent-bloco" aria-busy={recarregando}>
            <h2 className="eyebrow">Renda</h2>
            <p className="ent-total">{moeda(b.totalRenda)}</p>
            {b.renda.length === 0 ? (
              <p className="suave">
                Nenhuma renda marcada em {rotuloRecorte}.
                {b.aMarcar.length > 0 && ' Marque uma entrada abaixo: as próximas da mesma origem já chegam marcadas.'}
              </p>
            ) : (
              <ul className="ent-lista">{b.renda.map((l) => linha(l, [{ papel: 'entrada', rotulo: 'Não é renda' }]))}</ul>
            )}
          </section>

          {b.aMarcar.length > 0 && (
            <section className="cartao ent-bloco" aria-busy={recarregando}>
              <h2 className="eyebrow">A marcar</h2>
              <ul className="ent-lista">
                {b.aMarcar.map((l) => linha(l, [{ papel: 'renda', rotulo: 'É renda' }, { papel: 'fora', rotulo: 'Não conta' }]))}
              </ul>
            </section>
          )}

          {b.fora.length > 0 && (
            <section className="cartao ent-bloco" aria-busy={recarregando}>
              <h2 className="eyebrow">Não conta</h2>
              <ul className="ent-lista">{b.fora.map((l) => linha(l, [{ papel: 'entrada', rotulo: 'Voltar' }]))}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
