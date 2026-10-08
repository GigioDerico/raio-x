import Link from 'next/link';
import VazioPorFiltro from '@/components/casca/VazioPorFiltro';
import ListaCategorias from '@/components/categorias/ListaCategorias';
import { resumoDasCategorias } from '@/lib/calculos/categorias';
import { CONFIG_PADRAO, type Contexto } from '@/lib/calculos/base';
import { deParametros, lerFiltro, paraQuery, rotuloMes } from '@/lib/filtro';
import { moeda } from '@/lib/formato';
import { carregarContexto } from '@/lib/painel-repo';
import { exigirUsuario } from '@/lib/sessao-servidor';
import { opcoesDoFiltro } from '@/lib/txn-repo';
import { fraseDoVazio, linksDoVazio, nomesDosCartoes } from '@/lib/vazio';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Categorias({ searchParams }: { searchParams: Params }) {
  const userId = await exigirUsuario();
  const filtro = lerFiltro(deParametros(await searchParams));
  const { meses, cartoes } = await opcoesDoFiltro(userId);
  const primeiroUso = meses.length === 0;
  const { ctx, obraPorMes }: { ctx: Contexto; obraPorMes: Record<string, number> } = primeiroUso
    ? { ctx: { faturas: [], apelidos: {}, mesFiltro: filtro.mes, nomesCartao: {}, ...CONFIG_PADRAO }, obraPorMes: {} }
    : await carregarContexto(userId, filtro);
  const resumo = resumoDasCategorias(ctx);
  const obra = filtro.obra
    ? resumo.mes
      ? obraPorMes[resumo.mes] ?? 0
      : Object.values(obraPorMes).reduce((soma, valor) => soma + valor, 0)
    : 0;
  const importar = new URLSearchParams(paraQuery(filtro));
  importar.set('importar', '1');

  return (
    <div className="tela-categorias">
      <header className="categorias-cabecalho">
        <h1>Categorias</h1>
        {!primeiroUso && <p className="suave">{resumo.mes ? rotuloMes(resumo.mes) : 'todos os meses'}</p>}
        <p>Clique numa categoria para abrir os lançamentos dela.</p>
      </header>

      {primeiroUso ? (
        <section className="cartao vazio">
          <h2>Importe uma fatura para começar</h2>
          <p className="suave">As categorias aparecem assim que houver uma fatura aqui dentro.</p>
          <Link href={`/lancamentos?${importar}`} className="botao">Importar fatura em PDF</Link>
        </section>
      ) : resumo.vazio ? (
        <VazioPorFiltro
          nivel="h2"
          frase={fraseDoVazio({ mes: resumo.mes, nomesCartoes: nomesDosCartoes(filtro.cartoes, cartoes) })}
          links={linksDoVazio(filtro, '/categorias', meses[0], resumo.mes)}
        />
      ) : null}

      {obra !== 0 && (
        <p className="painel-obra">Construção / Obras: {moeda(obra)}, fora dos números abaixo.</p>
      )}

      <ListaCategorias linhas={resumo.linhas} filtro={filtro} mes={resumo.mes} />
    </div>
  );
}
