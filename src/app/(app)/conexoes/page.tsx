import AcaoConexao from '@/components/conexoes/AcaoConexao';
import GuiaMeuPluggy from '@/components/conexoes/GuiaMeuPluggy';
import { listarConexoes } from '@/lib/pluggy/conexao-repo';
import { estadoDaConexao } from '@/lib/pluggy/estado';
import { CONECTOR_MEU_PLUGGY } from '@/lib/pluggy/meu-pluggy';
import { exigirUsuario } from '@/lib/sessao-servidor';

export const dynamic = 'force-dynamic';

const QUINZE_DIAS = 15 * 24 * 60 * 60 * 1000;

export default async function Conexoes() {
  const userId = await exigirUsuario();
  const conexoes = await listarConexoes(userId);
  const agora = new Date();
  const temMeuPluggy = conexoes.some((c) => c.conectorId === CONECTOR_MEU_PLUGGY);

  return (
    <div className="tela-conexoes">
      <header className="ajustes-cabecalho">
        <h1>Conexões</h1>
        <p className="suave">Os bancos que mandam lançamentos para cá pelo Open Finance. O app só lê — nunca paga nem transfere.</p>
      </header>

      <section className="cartao conexoes-seguranca-aviso" aria-label="Segurança e Privacidade das Conexões">
        <div className="conexoes-seguranca-topo">
          <span className="seguranca-icone-mini" aria-hidden="true">🛡️</span>
          <div>
            <strong>Privacidade e Proteção de Dados de Cartão</strong>
            <p className="suave" style={{ margin: '3px 0 0', fontSize: '13px' }}>
              O Raio-X conecta via Open Finance oficial (100% somente leitura). O app <strong>nunca</strong> vê nem armazena senhas ou números de cartão (guarda apenas os últimos 4 dígitos para identificação). Nenhum dado bruto ou CPF é enviado para IAs.
            </p>
          </div>
        </div>
        <div className="conexoes-seguranca-rodape-local">
          💡 <strong>Dica de privacidade máxima:</strong> A opção mais segura é executar o Raio-X localmente no seu computador (<code>npm run dev</code>), onde você pode usar IAs locais via CLI sem tráfego de dados na nuvem.
        </div>
      </section>

      {conexoes.length === 0 ? (
        <>
          <section className="cartao vazio">
            <h2>Nenhum banco conectado</h2>
            <p className="suave">Conecte seus bancos para os lançamentos chegarem sem PDF. A senha fica com o banco e o Pluggy.</p>
          </section>
          <GuiaMeuPluggy titulo="Como conectar" temMeuPluggy={false} />
        </>
      ) : (
        <>
          <ul className="conexoes-lista">
            {conexoes.map((c) => {
              const e = estadoDaConexao({ banco: c.banco, status: c.status, saude: c.saudeConector, consentExpiraEm: c.consentExpiraEm, ultimoSyncEm: c.ultimoSyncEm, agora });
              // com consentimento_perto o texto do estado já diz quando vence; a data repetida embaixo sobraria
              const vence = e.chave !== 'consentimento_perto' && c.consentExpiraEm && c.consentExpiraEm.getTime() > agora.getTime() && c.consentExpiraEm.getTime() - agora.getTime() <= QUINZE_DIAS;
              return (
                <li key={c.id} className="cartao conexao">
                  <div className="conexao-topo">
                    {c.logoUrl ? (
                      // logo vem do CDN do Pluggy, já liberado na CSP (img-src)
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt="" width={32} height={32} className="conexao-logo" />
                    ) : (
                      <span className="conexao-logo inicial" style={{ background: c.cor ?? 'var(--line)' }} aria-hidden="true">
                        {c.banco.slice(0, 1)}
                      </span>
                    )}
                    <div>
                      <h2 className="conexao-nome">{c.banco}</h2>
                      <p className={`conexao-estado-texto ${e.chave}`}>{e.texto}</p>
                      {vence && <p className="suave">Autorização vale até {c.consentExpiraEm!.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
                    </div>
                  </div>
                  {c.cartoes.length > 0 && (
                    <ul className="conexao-cartoes">
                      {c.cartoes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                  <AcaoConexao conexaoId={c.id} banco={c.banco} acao={e.acao} />
                </li>
              );
            })}
          </ul>
          <GuiaMeuPluggy titulo="Conectar outro banco" temMeuPluggy={temMeuPluggy} />
        </>
      )}
    </div>
  );
}
