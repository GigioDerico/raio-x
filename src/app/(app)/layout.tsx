import { redirect } from 'next/navigation';
import Casca from '@/components/casca/Casca';
import { listarConexoes } from '@/lib/pluggy/conexao-repo';
import { avisoDasConexoes } from '@/lib/pluggy/estado';
import { usuarioAtual } from '@/lib/sessao-servidor';
import { opcoesDoFiltro } from '@/lib/txn-repo';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const userId = await usuarioAtual();
  if (!userId) redirect('/login');
  const [opcoes, conexoes] = await Promise.all([opcoesDoFiltro(userId), listarConexoes(userId)]);
  // o layout roda na carga completa e em router.refresh(), não a cada navegação (o Next reaproveita o
  // layout entre páginas): a faixa acompanha o estado nesses momentos, sem consulta extra por clique
  const aviso = avisoDasConexoes(conexoes, new Date());

  return (
    <Casca opcoes={opcoes} aviso={aviso}>
      {children}
    </Casca>
  );
}
