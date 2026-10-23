import Link from 'next/link';
import ApagarTudo from '@/components/ajustes/ApagarTudo';
import CampoAjuste from '@/components/ajustes/CampoAjuste';
import ConectarIa from '@/components/ajustes/ConectarIa';
import TestarIa from '@/components/ajustes/TestarIa';
import { formatarCampo, linhaDoCartao } from '@/lib/ajustes';
import { lerConfig, listarCartoes, listarContasCorrentes } from '@/lib/ajustes-repo';
import { env } from '@/env';
import { gastoDoMes } from '@/lib/ia-uso-repo';
import { resumoGasto } from '@/lib/ia-gasto';
import { iaConfigurada, modelosPadrao, provedorAtivo } from '@/lib/openrouter';
import { detectarClis, obterInfoClaude, obterInfoCodex } from '@/lib/cli-detector';
import { exigirUsuario } from '@/lib/sessao-servidor';

export const dynamic = 'force-dynamic';

export default async function Ajustes() {
  const userId = await exigirUsuario();
  const prov = provedorAtivo();
  const ehAssinatura = prov === 'claude-cli' || prov === 'codex-cli';

  const [config, cartoes, contas, gasto, infoCli] = await Promise.all([
    lerConfig(userId),
    listarCartoes(userId),
    listarContasCorrentes(userId),
    gastoDoMes(userId),
    prov === 'claude-cli'
      ? obterInfoClaude()
      : prov === 'codex-cli'
        ? obterInfoCodex()
        : Promise.resolve(null),
  ]);

  const resumo = resumoGasto(gasto, config.tetoIaUsd ?? env.AI_BUDGET_USD_MONTH);
  const usd = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
  const temChave = iaConfigurada();
  const padrao = modelosPadrao();
  const clis = detectarClis();
  const nomeProv =
    prov === 'claude-cli'
      ? 'Claude Code (Assinatura Local)'
      : prov === 'codex-cli'
        ? 'Codex CLI (Assinatura Local)'
        : prov === 'anthropic'
          ? 'Anthropic Claude'
          : prov === 'openai'
            ? 'OpenAI GPT'
            : 'OpenRouter';

  return (
    <div className="tela-ajustes">
      <header className="ajustes-cabecalho">
        <h1>Ajustes</h1>
        <p className="suave">Cada campo salva sozinho quando você sai dele.</p>
      </header>

      <section className="cartao ajustes-bloco" aria-labelledby="aj-renda">
        <h2 id="aj-renda">Renda e meta</h2>
        <div className="ajustes-campos iguais">
          <CampoAjuste url="/api/ajustes" campo="renda" rotulo="Renda mensal (R$)" tipo="dinheiro" valor={formatarCampo('dinheiro', config.renda)} placeholder="0,00" />
          <CampoAjuste url="/api/ajustes" campo="metaPoupanca" rotulo="Guardar por mês (%)" tipo="percentual" valor={formatarCampo('percentual', config.metaPoupanca)} placeholder="20" />
        </div>
        <p className="ajustes-nota">
          A renda é o que você informa aqui — o app não a tira dos lançamentos. Os gastos da conta corrente (Pix, boleto,
          débito) já entram nos totais pelas contas conectadas. Projeção é estimativa, não recomendação financeira
          profissional.
        </p>
        <Link href="/parcelas" className="ajustes-link">Ver o previsto em Parcelas</Link>
      </section>

      <section className="cartao ajustes-bloco" aria-labelledby="aj-cartoes">
        <h2 id="aj-cartoes">Cartões</h2>
        {cartoes.length === 0 ? (
          <p className="suave">
            Nenhum cartão ainda — <Link href="/lancamentos?importar=1">importe uma fatura</Link>.
          </p>
        ) : (
          cartoes.map((c) => (
            <div className="ajustes-cartao" key={c.id}>
              <div className="ajustes-campos">
                <CampoAjuste
                  url={`/api/accounts/${c.id}`}
                  campo="apelido"
                  rotulo={`Apelido · ${c.banco}${c.last4 ? ` ••${c.last4}` : ''}`}
                  tipo="texto"
                  valor={formatarCampo('texto', c.apelido)}
                  placeholder={c.banco}
                  atualizarTela
                />
                <CampoAjuste url={`/api/accounts/${c.id}`} campo="diaFechamento" rotulo="Dia de fechamento" tipo="dia" valor={formatarCampo('dia', c.diaFechamento)} placeholder="—" />
                <CampoAjuste url={`/api/accounts/${c.id}`} campo="diaVencimento" rotulo="Dia de vencimento" tipo="dia" valor={formatarCampo('dia', c.diaVencimento)} placeholder="—" />
              </div>
              <p className="ajustes-meta">{linhaDoCartao(c)}</p>
            </div>
          ))
        )}
      </section>

      {contas.length > 0 && (
        <section className="cartao ajustes-bloco" aria-labelledby="aj-contas">
          <h2 id="aj-contas">Contas correntes</h2>
          {contas.map((c) => (
            <div className="ajustes-cartao" key={c.id}>
              <div className="ajustes-campos">
                <CampoAjuste
                  url={`/api/accounts/${c.id}`}
                  campo="apelido"
                  rotulo={`Apelido · ${c.banco}${c.last4 ? ` conta ••${c.last4}` : ''}`}
                  tipo="texto"
                  valor={formatarCampo('texto', c.apelido)}
                  placeholder={c.banco}
                  atualizarTela
                />
              </div>
            </div>
          ))}
          <p className="ajustes-nota">Só os gastos da conta contam; o saldo não é guardado nem mostrado.</p>
        </section>
      )}

      <section className="cartao ajustes-bloco" aria-labelledby="aj-bancos">
        <h2 id="aj-bancos">Bancos conectados</h2>
        <p className="ajustes-nota">
          Conectar banco, atualizar e desconectar ficam em <Link href="/conexoes">Conexões</Link>.
        </p>
      </section>

      <section className="cartao ajustes-bloco" aria-labelledby="aj-ia">
        <h2 id="aj-ia">Inteligência artificial</h2>
        <div className="ia-provedor-status">
          <p>
            Provedor ativo: <strong>{nomeProv}</strong> {temChave ? '· ✓ Conectado e operacional' : '· ⚠️ Nenhuma chave conectada'}
          </p>
        </div>

        <ConectarIa provedorAtual={prov} temChave={temChave} clisDisponiveis={clis} />

        <div className="ajustes-campos" style={{ marginTop: '16px' }}>
          <CampoAjuste
            url="/api/ajustes"
            campo="modeloIa"
            rotulo={`Modelo (${nomeProv})`}
            tipo="texto"
            max={100}
            valor={formatarCampo('texto', config.modeloIa)}
            placeholder={padrao.principal}
          />
          {!ehAssinatura && (
            <CampoAjuste
              url="/api/ajustes"
              campo="tetoIaUsd"
              rotulo="Teto mensal (US$)"
              tipo="numero"
              valor={formatarCampo('numero', config.tetoIaUsd)}
              placeholder={`${env.AI_BUDGET_USD_MONTH} (padrão)`}
              atualizarTela
            />
          )}
        </div>
        <TestarIa />
        {ehAssinatura ? (
          <div className="ia-gasto ia-gasto-assinatura">
            <div className="ia-assinatura-cabecalho">
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '13.5px' }}>
                  {infoCli?.plano || 'Assinatura ativa'} {infoCli?.email ? `· ${infoCli.email}` : ''}
                </p>
                <p className="suave" style={{ fontSize: '12px', margin: '2px 0 0' }}>
                  {infoCli?.logado ? '✓ Sessão CLI conectada localmente' : '⚠️ Sessão local pendente de login'} · R$ 0,00 de tokens de API
                </p>
              </div>
            </div>

            {infoCli?.usoSessao && (
              <div className="ia-sessao-bloco">
                <div className="ia-sessao-linha">
                  <span>
                    Cota da sessão: <strong>{infoCli.usoSessao.sessaoPct}% utilizada</strong>
                  </span>
                  {infoCli.usoSessao.sessaoReset && (
                    <span className="suave" style={{ fontSize: '11.5px' }}>
                      Reseta: {infoCli.usoSessao.sessaoReset.replace(/\s*\(America\/Sao_Paulo\)/i, ' (SP)')}
                    </span>
                  )}
                </div>
                <div className="ia-barra" role="img" aria-label={`${infoCli.usoSessao.sessaoPct}% da sessão utilizada`}>
                  <span
                    style={{
                      width: `${Math.min(100, infoCli.usoSessao.sessaoPct)}%`,
                      background:
                        infoCli.usoSessao.sessaoPct >= 85
                          ? 'var(--crit)'
                          : infoCli.usoSessao.sessaoPct >= 65
                            ? 'var(--warn, #eab308)'
                            : 'var(--good, #10b981)',
                    }}
                  />
                </div>

                {typeof infoCli.usoSessao.semanaPct === 'number' && (
                  <div style={{ marginTop: '10px' }}>
                    <div className="ia-sessao-linha">
                      <span style={{ fontSize: '12px' }}>
                        Uso semanal: <strong>{infoCli.usoSessao.semanaPct}% utilizado</strong>
                      </span>
                      {infoCli.usoSessao.semanaReset && (
                        <span className="suave" style={{ fontSize: '11.5px' }}>
                          Reseta: {infoCli.usoSessao.semanaReset.replace(/\s*\(America\/Sao_Paulo\)/i, ' (SP)')}
                        </span>
                      )}
                    </div>
                    <div className="ia-barra" role="img" aria-label={`${infoCli.usoSessao.semanaPct}% da semana utilizada`}>
                      <span
                        style={{
                          width: `${Math.min(100, infoCli.usoSessao.semanaPct)}%`,
                          background: 'var(--accent)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="suave" style={{ fontSize: '12.5px', margin: '8px 0 0' }}>
              Volume no Raio-X: {resumo.chamadas} {resumo.chamadas === 1 ? 'chamada' : 'chamadas'} este mês
              {(gasto.tokensIn ?? 0) + (gasto.tokensOut ?? 0) > 0 ? ` · ${((gasto.tokensIn ?? 0) + (gasto.tokensOut ?? 0)).toLocaleString('pt-BR')} tokens processados` : ''} · Sem custo por token
            </p>
          </div>
        ) : (
          <div className={`ia-gasto${resumo.acima ? ' acima' : ''}`}>
            <p>
              <b>{usd(resumo.gasto)}</b>
              {resumo.teto ? ` de ${usd(resumo.teto)}` : ''} este mês · {resumo.chamadas} {resumo.chamadas === 1 ? 'chamada' : 'chamadas'}
            </p>
            {resumo.pct !== null && (
              <div className="ia-barra" role="img" aria-label={`${Math.round(resumo.pct)}% do teto`}>
                <span style={{ width: `${resumo.pct}%` }} />
              </div>
            )}
            {resumo.acima && <p className="ia-aviso">Passou do teto deste mês. A categorização automática parou; o que você pede por botão continua.</p>}
            {resumo.semCusto > 0 && (
              <p className="ajustes-nota">
                {resumo.semCusto} {resumo.semCusto === 1 ? 'chamada' : 'chamadas'} sem custo informado pelo provedor.
              </p>
            )}
          </div>
        )}
        <p className="ajustes-nota">
          {ehAssinatura
            ? 'O modelo vale para leitura de faturas, categorização e plano. As chamadas são processadas diretamente no seu terminal local sem custos adicionais de API.'
            : 'O modelo vale para leitura de faturas, categorização e plano. Teto 0 = sem teto; vazio = padrão do servidor. Para trocar de método ou provedor, use as opções acima ou execute npm run setup:ia.'}
        </p>
      </section>

      <section className="cartao ajustes-bloco" aria-labelledby="aj-dados">
        <h2 id="aj-dados">Seus dados</h2>
        <p className="ajustes-nota">
          Um app que promete que o dado é seu precisa deixar você levar e destruir esse dado sem pedir por favor.
        </p>
        <div className="ajustes-dados-acoes">
          <a href="/api/export/csv" className="botao" download>Baixar CSV dos lançamentos</a>
          <ApagarTudo />
        </div>
      </section>

      <section className="cartao ajustes-bloco" aria-labelledby="aj-sessao">
        <h2 id="aj-sessao">Sessão</h2>
        <form action="/api/auth/logout" method="post">
          <button type="submit">Sair</button>
        </form>
        <p className="ajustes-nota">
          Trocar o <code>SESSION_SECRET</code> do servidor encerra todas as sessões abertas — é o “sair de todos os lugares”
          de quem auto-hospeda.
        </p>
      </section>
    </div>
  );
}
