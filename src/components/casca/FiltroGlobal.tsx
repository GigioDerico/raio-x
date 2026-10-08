'use client';

import { useEffect, useOptimistic } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { COOKIE_FILTRO, filtroParaLembrar, lerFiltro, paraQuery, resolverMes, rotuloMes, type Filtro } from '@/lib/filtro';
import type { OpcoesFiltro } from '@/lib/txn-repo';
import Dica from '@/components/Dica';

function gravarFiltro(filtroQuery: string) {
  document.cookie = `${COOKIE_FILTRO}=${encodeURIComponent(filtroQuery)}; path=/; max-age=31536000; samesite=lax`;
}

type Props = OpcoesFiltro & { iniciarTransicao: (fn: () => void) => void };

export default function FiltroGlobal({ meses, cartoes, iniciarTransicao }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  // otimista: o controle reflete o clique na hora, sem esperar a transição
  // terminar — senão um segundo clique rápido acha o valor antigo ainda ali.
  const [f, setF] = useOptimistic(lerFiltro(params));
  const mesEmFoco = f.mes === 'TODOS' ? 'TODOS' : (resolverMes(f.mes, meses) ?? '');

  const paraLembrar = filtroParaLembrar(params, meses[0]);
  useEffect(() => {
    // links que mudam o filtro (vazio) não passam por aplicar(): o cookie segue
    // a URL, senão a próxima página sem filtro volta ao recorte velho
    if (paraLembrar !== null) gravarFiltro(paraLembrar);
  }, [paraLembrar]);

  function aplicar(novo: Filtro) {
    const filtro = paraQuery(novo);
    // o resto da URL (busca, categoria) é da tela, não do filtro: fica como está
    const q = new URLSearchParams(params);
    for (const k of ['mes', 'cartoes', 'obra']) q.delete(k);
    for (const [k, v] of new URLSearchParams(filtro)) q.set(k, v);
    // grava antes de navegar também: voltar ao mês mais recente deixa a URL sem
    // chave, e o middleware reaplicaria o cookie velho antes de o efeito rodar
    gravarFiltro(filtroParaLembrar(new URLSearchParams(filtro), meses[0]) ?? '');
    const s = q.toString();
    iniciarTransicao(() => {
      setF(novo);
      router.replace(s ? `${caminho}?${s}` : caminho, { scroll: false });
    });
  }

  function alternarCartao(id: string) {
    const tem = f.cartoes.includes(id);
    aplicar({ ...f, cartoes: tem ? f.cartoes.filter((c) => c !== id) : [...f.cartoes, id] });
  }

  const rotuloCartoes =
    f.cartoes.length === 0
      ? 'Cartões e contas'
      : f.cartoes.length === 1
        ? (cartoes.find((c) => c.id === f.cartoes[0])?.nome ?? '1 selecionado')
        : `${f.cartoes.length} selecionados`;

  return (
    <div className="filtro-global" role="group" aria-label="Recorte">
      <select
        aria-label="Mês"
        value={mesEmFoco}
        // o mês mais recente grava null ("o mais recente", como mesAtual() do
        // legado): no mês seguinte o app abre sozinho no mês novo
        onChange={(e) => aplicar({ ...f, mes: e.target.value === meses[0] ? null : e.target.value })}
        disabled={meses.length === 0}
      >
        {meses.map((m) => (
          <option key={m} value={m}>
            {rotuloMes(m)}
          </option>
        ))}
        <option value="TODOS">Todos os meses</option>
      </select>

      {cartoes.length > 1 && (
        <details className="filtro-cartoes">
          <summary>{rotuloCartoes}</summary>
          <div className="filtro-cartoes-lista">
            {cartoes.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={f.cartoes.includes(c.id)} onChange={() => alternarCartao(c.id)} />
                {c.nome}
              </label>
            ))}
            {f.cartoes.length > 0 && (
              <button type="button" className="link" onClick={() => aplicar({ ...f, cartoes: [] })}>
                Todos
              </button>
            )}
          </div>
        </details>
      )}

      <label className="filtro-obra">
        <input type="checkbox" checked={f.obra} onChange={(e) => aplicar({ ...f, obra: e.target.checked })} />
        separar obra
      </label>
      <Dica rotulo="O que é separar obra?">
        Tira “Construção / Obras” dos totais, das médias e do plano, e mostra o gasto da obra numa linha à
        parte — para um mês de reforma não parecer um mês de gastança. Passa a valer quando o painel ganhar os
        números.
      </Dica>
    </div>
  );
}
