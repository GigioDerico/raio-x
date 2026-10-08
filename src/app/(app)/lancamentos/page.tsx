import { deParametros, lerFiltro, resolverMes, rotuloMes } from '@/lib/filtro';
import { exigirUsuario } from '@/lib/sessao-servidor';
import { opcoesDoFiltro } from '@/lib/txn-repo';
import { NOMES } from '@/lib/categorias';
import { fraseDoVazio, linksDoVazio, nomesDosCartoes } from '@/lib/vazio';
import TelaLancamentos from './TelaLancamentos';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function PaginaLancamentos({ searchParams }: { searchParams: Params }) {
  const q = deParametros(await searchParams);

  const userId = await exigirUsuario();
  const { meses, cartoes } = await opcoesDoFiltro(userId);
  const f = lerFiltro(q);
  const mes = resolverMes(f.mes, meses);
  const cat = q.get('cat');

  return (
    <TelaLancamentos
      mes={mes}
      contas={f.cartoes}
      categoria={cat && NOMES.includes(cat) ? cat : null}
      abrirImportar={q.get('importar') === '1' || meses.length === 0}
      rotuloRecorte={mes ? rotuloMes(mes) : meses.length ? 'todos os meses' : 'nenhum mês'}
      semDados={meses.length === 0}
      vazio={{
        frase: fraseDoVazio({ mes, nomesCartoes: nomesDosCartoes(f.cartoes, cartoes) }),
        links: linksDoVazio(f, '/lancamentos', meses[0], mes),
      }}
    />
  );
}
