import Link from 'next/link';
import { deParametros, lerFiltro, resolverMes, rotuloMes } from '@/lib/filtro';
import { exigirUsuario } from '@/lib/sessao-servidor';
import { listarEntradas, opcoesDoFiltro, temContaCorrente } from '@/lib/txn-repo';
import { linksDoVazio } from '@/lib/vazio';
import TelaEntradas from './TelaEntradas';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function PaginaEntradas({ searchParams }: { searchParams: Params }) {
  const q = deParametros(await searchParams);
  const userId = await exigirUsuario();

  if (!(await temContaCorrente(userId))) {
    return (
      <>
        <h1>Entradas</h1>
        <section className="cartao vazio">
          <p>Entradas vêm da conta corrente, e nenhuma está conectada.</p>
          <Link href="/conexoes" className="botao">
            Conectar banco
          </Link>
        </section>
      </>
    );
  }

  const { meses } = await opcoesDoFiltro(userId);
  const f = lerFiltro(q);
  const mes = resolverMes(f.mes, meses);
  const linhas = await listarEntradas(userId, { mes, accountIds: f.cartoes });
  const rotuloRecorte = mes ? rotuloMes(mes) : 'todos os meses';

  // o filtro global escolhe cartões e contas juntos; escolhendo só cartão de
  // crédito, Entradas fica vazia, e o vazio precisa dizer que é por isso
  const dica = f.cartoes.length
    ? 'Entradas só mostra conta corrente; se o filtro escolheu só cartões de crédito, não sobra nada aqui.'
    : undefined;

  return (
    <TelaEntradas
      linhas={linhas}
      rotuloRecorte={rotuloRecorte}
      vazio={{ frase: mes ? `Nada entrou na conta em ${rotuloRecorte}` : 'Nada entrou na conta', dica, links: linksDoVazio(f, '/entradas', meses[0], mes) }}
    />
  );
}
