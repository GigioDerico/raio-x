import Link from 'next/link';
import VazioPorFiltro from '@/components/casca/VazioPorFiltro';
import Conversa from '@/components/diagnostico/Conversa';
import Diagnostico from '@/components/diagnostico/Diagnostico';
import { chaveRecorte } from '@/lib/calculos/resumo';
import { divisoriaEm } from '@/lib/conversa';
import { falasDoRecorte } from '@/lib/conversa-repo';
import { lancsDoMes, mesAtual } from '@/lib/calculos/meses';
import { deParametros, lerFiltro, paraQuery, rotuloMes } from '@/lib/filtro';
import { dadosDiagnostico, promptDiagnostico } from '@/lib/ia';
import { carregarContexto } from '@/lib/painel-repo';
import { planoAtivo } from '@/lib/plano-repo';
import { hashDoPrompt, saidaGuardada } from '@/lib/resumo-repo';
import { exigirUsuario } from '@/lib/sessao-servidor';
import { opcoesDoFiltro } from '@/lib/txn-repo';
import { fraseDoVazio, linksDoVazio, nomesDosCartoes } from '@/lib/vazio';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function PaginaDiagnostico({ searchParams }: { searchParams: Params }) {
  const userId = await exigirUsuario();
  const f = lerFiltro(deParametros(await searchParams));
  const { meses, cartoes } = await opcoesDoFiltro(userId);

  if (meses.length === 0) {
    return (
      <section className="cartao vazio">
        <h1>Importe uma fatura para começar</h1>
        <p className="suave">O diagnóstico precisa de pelo menos um mês aqui dentro.</p>
        <Link href="/lancamentos?importar=1" className="botao">
          Importar fatura em PDF
        </Link>
      </section>
    );
  }

  const { ctx } = await carregarContexto(userId, f);
  const m = mesAtual(ctx);
  const recorte = m ? rotuloMes(m) : 'todos os meses';
  if (!lancsDoMes(ctx, m).length) {
    return <VazioPorFiltro frase={fraseDoVazio({ mes: m, nomesCartoes: nomesDosCartoes(f.cartoes, cartoes) })} links={linksDoVazio(f, '/diagnostico', meses[0], m)} />;
  }

  // só conta: montar o pedido para saber se o guardado ainda vale não chama a IA (regra 9)
  const plano = await planoAtivo(userId);
  const dados = dadosDiagnostico(ctx, f.cartoes.length > 0, plano?.resultado ?? null);
  const hash = hashDoPrompt(promptDiagnostico(dados));
  const dadosHash = hashDoPrompt(dados);
  const escopo = chaveRecorte(f, m);
  const [guardado, falas] = await Promise.all([saidaGuardada(userId, 'diagnostico', escopo, hash), falasDoRecorte(userId, escopo)]);
  const estado = !guardado ? 'nenhum' : guardado.atual ? 'atual' : 'desatualizado';
  const q = paraQuery(f);

  return (
    <>
      {/* a chave zera o texto recém-gerado quando o recorte ou os números mudam */}
      <Diagnostico key={`${q}|${hash}`} titulo={`Diagnóstico de ${recorte}`} texto={guardado?.texto ?? null} estado={estado} query={q} />
      {/* id da última fala na chave: depois do refresh, o par gravado substitui o balão provisório —
          o número de falas não serve, ele para em 50 */}
      <Conversa key={`${q}|${dadosHash}|${falas.at(-1)?.id ?? 0}`} falas={falas} divisoria={divisoriaEm(falas, dadosHash)} query={q} />
    </>
  );
}
