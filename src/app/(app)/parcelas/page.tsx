import Link from 'next/link';
import VazioPorFiltro from '@/components/casca/VazioPorFiltro';
import ColunasPrevisto from '@/components/parcelas/ColunasPrevisto';
import FaixaProjecao from '@/components/parcelas/FaixaProjecao';
import ListaParcelas from '@/components/parcelas/ListaParcelas';
import { mesAtual } from '@/lib/calculos/meses';
import { parcelasInfo } from '@/lib/calculos/parcelas';
import { previsto } from '@/lib/calculos/previsto';
import { deParametros, lerFiltro, paraQuery, rotuloMes } from '@/lib/filtro';
import { moeda } from '@/lib/formato';
import { carregarContexto } from '@/lib/painel-repo';
import { exigirUsuario } from '@/lib/sessao-servidor';
import { opcoesDoFiltro } from '@/lib/txn-repo';
import { fraseDoVazio, linksDoVazio, nomesDosCartoes } from '@/lib/vazio';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Parcelas({ searchParams }: { searchParams: Params }) {
  const userId = await exigirUsuario();
  const filtro = lerFiltro(deParametros(await searchParams));
  const { meses, cartoes } = await opcoesDoFiltro(userId);

  if (meses.length === 0) {
    const importar = new URLSearchParams(paraQuery(filtro));
    importar.set('importar', '1');
    return (
      <section className="cartao vazio">
        <h1>Importe uma fatura para começar</h1>
        <p className="suave">A projeção e as parcelas aparecem assim que houver uma fatura aqui dentro.</p>
        <Link href={`/lancamentos?${importar}`} className="botao">Importar fatura em PDF</Link>
      </section>
    );
  }

  const { ctx, obraPorMes } = await carregarContexto(userId, filtro);

  if (ctx.faturas.length === 0) {
    // o contexto só filtra por cartão: sem fatura, o cartão não tem dado em mês
    // nenhum, e nomear um mês ou oferecer outro seria mentira
    return (
      <VazioPorFiltro
        frase={fraseDoVazio({ mes: null, nomesCartoes: nomesDosCartoes(filtro.cartoes, cartoes) })}
        links={linksDoVazio({ ...filtro, mes: null }, '/parcelas')}
      />
    );
  }

  const mes = mesAtual(ctx);
  const p = previsto(ctx);
  const pi = parcelasInfo(ctx);
  const obra = filtro.obra
    ? mes
      ? obraPorMes[mes] ?? 0
      : Object.values(obraPorMes).reduce((soma, valor) => soma + valor, 0)
    : 0;

  return (
    <div className="tela-parcelas">
      <header className="parcelas-cabecalho">
        <h1>Parcelas</h1>
        <p className="suave">a partir de {mes ? rotuloMes(mes) : 'todos os meses'}</p>
      </header>

      {obra !== 0 && <p className="painel-obra">Construção / Obras: {moeda(obra)}, fora dos números abaixo.</p>}

      {p ? (
        <>
          <FaixaProjecao p={p} />
          <ColunasPrevisto p={p} cfg={ctx} hrefAjustes={`/ajustes?${paraQuery(filtro)}`} />
        </>
      ) : (
        <section className="cartao">
          <p className="empty">Sem dados suficientes para projetar o próximo mês.</p>
        </section>
      )}

      <ListaParcelas pi={pi} />
    </div>
  );
}
