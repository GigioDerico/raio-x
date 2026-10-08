'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { lerFiltro, paraQuery } from '@/lib/filtro';
import Importar from '@/components/Importar';
import Lancamentos from '@/components/Lancamentos';
import type { LinkVazio } from '@/lib/vazio';

type Props = {
  mes: string | null;
  contas: string[];
  categoria: string | null;
  abrirImportar: boolean;
  rotuloRecorte: string;
  semDados: boolean;
  vazio: { frase: string; links: LinkVazio[] };
};

/** Importar abre por cima da lista e, ao terminar, recarrega lista e filtro. */
export default function TelaLancamentos({ mes, contas, categoria, abrirImportar, rotuloRecorte, semDados, vazio }: Props) {
  const router = useRouter();
  const [importando, setImportando] = useState(abrirImportar);
  const [recarga, setRecarga] = useState(0);
  // chegou aqui por uma categoria do painel: o caminho de volta leva o mesmo
  // recorte (mês e cartões), senão o painel reabriria em outro mês
  const q = paraQuery(lerFiltro(useSearchParams()));

  return (
    <>
      {categoria && (
        <Link href={q ? `/?${q}` : '/'} className="voltar">
          ← Voltar ao painel
        </Link>
      )}
      <div className="topo">
        <h1>Lançamentos</h1>
        <button type="button" onClick={() => setImportando((v) => !v)} style={{ marginTop: 0 }}>
          {importando ? 'Fechar' : 'Importar fatura'}
        </button>
      </div>

      {importando && (
        <Importar
          aoImportar={() => {
            setRecarga((n) => n + 1);
            // o filtro global ganha o mês novo
            router.refresh();
          }}
        />
      )}

      {/* `?cat=` novo remonta a lista, senão o estado interno de categoria ficaria com o valor antigo */}
      <Lancamentos
        key={categoria ?? ''}
        mes={mes}
        contas={contas}
        categoriaInicial={categoria}
        recarga={recarga}
        rotuloRecorte={rotuloRecorte}
        semDados={semDados}
        vazio={vazio}
      />
    </>
  );
}
