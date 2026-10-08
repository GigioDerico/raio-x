import Link from 'next/link';
import QuestionarioPlano from '@/components/plano/QuestionarioPlano';
import RefinarPlano from '@/components/plano/RefinarPlano';
import TabelaPlano from '@/components/plano/TabelaPlano';
import { mesesDisponiveis } from '@/lib/calculos/meses';
import { PREFS_PADRAO, metasDoPlano, realDoMes } from '@/lib/calculos/plano';
import { deParametros, lerFiltro, paraQuery } from '@/lib/filtro';
import { moeda0 } from '@/lib/formato';
import { feitoPara, fraseSemPlano, notasDoPlano, planoTerminou, subtituloPlano } from '@/lib/plano-texto';
import { contextoDoPlano, planoAtivo } from '@/lib/plano-repo';
import { exigirUsuario } from '@/lib/sessao-servidor';
import { opcoesDoFiltro } from '@/lib/txn-repo';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Plano({ searchParams }: { searchParams: Params }) {
  const userId = await exigirUsuario();
  const filtro = lerFiltro(deParametros(await searchParams));
  const { meses } = await opcoesDoFiltro(userId);
  const query = paraQuery(filtro);

  if (meses.length === 0) {
    const importar = new URLSearchParams(query);
    importar.set('importar', '1');
    return (
      <section className="cartao vazio">
        <h1>Importe uma fatura para começar</h1>
        <p className="suave">O plano aparece assim que houver uma fatura aqui dentro.</p>
        <Link href={`/lancamentos?${importar}`} className="botao">Importar fatura em PDF</Link>
      </section>
    );
  }

  const [ctx, ativo] = await Promise.all([contextoDoPlano(userId, filtro.obra), planoAtivo(userId)]);
  const prefs = ativo?.prefs ?? PREFS_PADRAO;
  const mt = metasDoPlano(ctx, prefs);
  const ms = mesesDisponiveis(ctx);
  const ultimoMes = ms.length ? ms[ms.length - 1]! : null;

  return (
    <div className="tela-plano">
      <header className="plano-cabecalho">
        <h1>Plano de 3 meses</h1>
        {filtro.cartoes.length > 0 && <p className="suave">O plano considera todos os cartões; o filtro de cartões não vale aqui.</p>}
      </header>

      {!mt ? (
        <section className="cartao vazio">
          <p>Informe a renda prevista para eu montar um plano de 3 meses.</p>
          <Link href={`/ajustes?${query}`} className="botao">Informar renda em Ajustes</Link>
        </section>
      ) : !ativo ? (
        <section className="cartao plano-bloco">
          <p className="plano-sub">{fraseSemPlano(mt)}</p>
          <QuestionarioPlano prefs={prefs} categorias={mt.cats.map((c) => c.cat)} query={query} rotulo="Montar plano" />
        </section>
      ) : (
        <section className="cartao plano-bloco">
          <div className="plano-topo">
            <p className="plano-sub">{subtituloPlano(ativo.resultado)}</p>
            <div className="plano-acoes">
              <QuestionarioPlano prefs={ativo.prefs} categorias={mt.cats.map((c) => c.cat)} query={query} rotulo="Refazer plano" secundario />
              <RefinarPlano query={query} />
            </div>
          </div>
          {planoTerminou(ativo.resultado, ultimoMes) && (
            <p className="plano-aviso">Este plano terminou em {planoTerminou(ativo.resultado, ultimoMes)}; refaça para os próximos 3 meses.</p>
          )}
          <TabelaPlano
            plano={ativo.resultado}
            reais={ativo.resultado.cats.map((c) => ativo.resultado.meses.map((m) => realDoMes(ctx, m.mes, c.cat)))}
          />
          {ativo.resultado.fixos.length > 0 && (
            <div className="plano-fixos">
              <p className="eyebrow">Fixos que valem revisar</p>
              {ativo.resultado.fixos.map((f, i) => (
                <div className="plano-fixo" key={i}>
                  <span>
                    {f.desc}
                    <span className="acao">{f.acao}</span>
                  </span>
                  <span>{moeda0(f.economia)}/mês</span>
                </div>
              ))}
            </div>
          )}
          {notasDoPlano(ativo.resultado) && <p className="plano-nota">{notasDoPlano(ativo.resultado)}</p>}
          {ativo.resultado.nota && <p className="plano-nota">{ativo.resultado.nota}</p>}
          <p className="plano-nota plano-feito">{feitoPara(ativo.resultado.prefs)}</p>
        </section>
      )}
    </div>
  );
}
