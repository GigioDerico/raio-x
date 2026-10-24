import Link from 'next/link';
import Lente from '@/components/Lente';

export const metadata = {
  title: 'Raio-X — A verdade sobre o seu dinheiro, sem planilhas',
  description:
    'Painel pessoal de finanças que junta Open Finance brasileiro e faturas em PDF em um só lugar. 100% privado, auto-hospedável e sem mensalidades.',
};

export default function LandingPage() {
  return (
    <div className="landing-container">
      {/* Navbar */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-logo">
            <Lente />
            <span>
              Raio-<em>X</em>
            </span>
          </Link>
          <nav className="landing-nav-links">
            <a href="#diferencial">O que muda</a>
            <a href="#recursos">Recursos</a>
            <a href="#open-finance">Open Finance</a>
            <a href="#comparativo">Comparativo</a>
          </nav>
          <a
            href="https://github.com/GigioDerico/raio-x"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-btn-entrar"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-tag">
          <span>🛡️ 100% Privado</span>
          <span className="dot">·</span>
          <span>Auto-hospedável</span>
          <span className="dot">·</span>
          <span>Zero Mensalidades</span>
        </div>

        <h1 className="landing-titulo">
          A verdade sobre o seu dinheiro,
          <br />
          <span className="landing-destaque">sem planilhas e sem culpa.</span>
        </h1>

        <p className="landing-subtitulo">
          O painel pessoal que conecta seus bancos por <strong>Open Finance</strong>, lê suas faturas em <strong>PDF</strong>{' '}
          e usa inteligência artificial para responder: <em>para onde foi o seu dinheiro, e quanto disso você ainda podia escolher?</em>
        </p>

        <div className="landing-ctas">
          <a
            href="https://github.com/GigioDerico/raio-x"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-btn-primario"
          >
            Ver Código no GitHub <span>↗</span>
          </a>
          <a href="#diferencial" className="landing-btn-secundario">
            Como Funciona <span>↓</span>
          </a>
        </div>

        {/* Mockup Interativo Flutuante do Dashboard */}
        <div className="landing-mockup-wrapper">
          <div className="landing-mockup-glow" />
          <div className="landing-mockup-card">
            <div className="landing-mockup-topo">
              <div className="landing-mockup-dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="landing-mockup-aba">Painel do Mês · Outubro 2026</div>
              <div className="landing-mockup-badge-ia">
                <span className="pulse" />
                Claude Code CLI · R$ 0,00 de tokens
              </div>
            </div>

            <div className="landing-mockup-corpo">
              <div className="landing-mockup-hero-box">
                <span className="eyebrow">Total do Mês</span>
                <div className="landing-mockup-valor">R$ 6.240</div>
                <div className="landing-mockup-subtotal">
                  <span>
                    <strong>R$ 4.400</strong> já decididos (70%)
                  </span>
                  <span className="sep">·</span>
                  <span className="livre">
                    <strong>R$ 1.840</strong> em escolhas (30%)
                  </span>
                </div>
              </div>

              <div className="landing-mockup-kpis">
                <div className="landing-kpi-item">
                  <span className="rotulo">Compromissos Fixos</span>
                  <span className="valor">R$ 2.850</span>
                  <span className="tag">Aluguel, luz, condomínio</span>
                </div>
                <div className="landing-kpi-item">
                  <span className="rotulo">Parcelamentos</span>
                  <span className="valor">R$ 1.550</span>
                  <span className="tag">4 faturas ativas</span>
                </div>
                <div className="landing-kpi-item destaque">
                  <span className="rotulo">Margem Real de Escolha</span>
                  <span className="valor verde">R$ 1.840</span>
                  <span className="tag">Restaurantes, lazer, compras</span>
                </div>
              </div>

              <div className="landing-mockup-ranking">
                <div className="ranking-head">
                  <span>Principais Categorias</span>
                  <span className="suave">Fatia dos gastos</span>
                </div>
                <div className="ranking-bar-item">
                  <div className="ranking-linha">
                    <span>Supermercado & Alimentação</span>
                    <strong>R$ 1.850 (30%)</strong>
                  </div>
                  <div className="bar-bg">
                    <span className="bar-fill" style={{ width: '30%' }} />
                  </div>
                </div>
                <div className="ranking-bar-item">
                  <div className="ranking-linha">
                    <span>Restaurantes & Delivery</span>
                    <strong>R$ 940 (15%)</strong>
                  </div>
                  <div className="bar-bg">
                    <span className="bar-fill warn" style={{ width: '15%' }} />
                  </div>
                </div>
                <div className="ranking-bar-item">
                  <div className="ranking-linha">
                    <span>Assinaturas & Serviços</span>
                    <strong>R$ 380 (6%)</strong>
                  </div>
                  <div className="bar-bg">
                    <span className="bar-fill" style={{ width: '6%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seção O Que Muda */}
      <section id="diferencial" className="landing-secao">
        <div className="landing-secao-cabecalho">
          <span className="landing-secao-tag">A Pergunta Central</span>
          <h2>A diferença entre um extrato bancário e o Raio-X</h2>
          <p className="landing-secao-desc">
            Somar números qualquer aplicativo faz. O que muda comportamento é saber onde você realmente tinha poder de escolha.
          </p>
        </div>

        <div className="landing-comparativo-cards">
          <div className="card-contraste negativo">
            <div className="card-badge">O Extrato Comum</div>
            <h3>“Você gastou R$ 6.240 este mês.”</h3>
            <p>
              Gera culpa e ansiedade sem dar direção prática. Não distingue o que você já devia do que gastou por impulso no fim de semana.
            </p>
            <ul className="lista-pontos">
              <li>✕ Trata aluguel e delivery com o mesmo peso</li>
              <li>✕ Envia seus dados para anunciantes e fintechs</li>
              <li>✕ Planilhas manuais que você cansa de preencher</li>
            </ul>
          </div>

          <div className="card-contraste positivo">
            <div className="card-badge">Com o Raio-X</div>
            <h3>“R$ 4.400 já estavam decididos. Sua briga real era pelos R$ 1.840.”</h3>
            <p>
              Separa compromissos assumidos antes do dia 1 das decisões do dia a dia. Você ganha clareza cirúrgica para planejar os próximos 3 meses.
            </p>
            <ul className="lista-pontos">
              <li>✓ Mostra exatamente a margem que você podia escolher</li>
              <li>✓ 100% privado: seus dados ficam no seu próprio banco</li>
              <li>✓ Sincronização automática via Open Finance e faturas em PDF</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Bento Grid dos Recursos */}
      <section id="recursos" className="landing-secao">
        <div className="landing-secao-cabecalho">
          <span className="landing-secao-tag">Recursos Poderosos</span>
          <h2>Tudo o que você precisa. Sem firulas.</h2>
        </div>

        <div className="landing-bento-grid">
          <div className="bento-card">
            <div className="bento-icone">🏦</div>
            <h3>Open Finance Brasileiro</h3>
            <p>
              Conexão com os principais bancos (Itaú, Nubank, Santander, Sicredi e outros) pelo conector oficial do Meu Pluggy. Lançamentos e faturas chegam direto da instituição.
            </p>
          </div>

          <div className="bento-card">
            <div className="bento-icone">📄</div>
            <h3>Leitura de Faturas em PDF</h3>
            <p>
              Importe faturas antigas com um arrastar de arquivo. A extração é feita localmente no navegador via <code>pdf.js</code> — seu PDF nunca sobe para servidores de terceiros.
            </p>
          </div>

          <div className="bento-card destaque">
            <div className="bento-icone">🧠</div>
            <h3>IA por Assinatura (Custo Zero)</h3>
            <p>
              Conecte aos CLIs do Claude Code ou Codex já autenticados no seu Mac. Categorização, diagnósticos e conversas inteligentes sem gastar um centavo em créditos de API.
            </p>
          </div>

          <div className="bento-card">
            <div className="bento-icone">🎯</div>
            <h3>Plano de 3 Meses & Parcelas</h3>
            <p>
              Previsão de fluxo de caixa futuro. Veja quando as parcelas ativas terminam e ajuste metas trimestrais sem ficar preso a limites rígidos de orçamento.
            </p>
          </div>

          <div className="bento-card">
            <div className="bento-icone">🛡️</div>
            <h3>Privacidade por Princípio</h3>
            <p>
              Não gravamos CPF nem saldo de conta. Nenhuma chave de API vai para o cliente e nenhum script de telemetria ou analytics rastreia seus passos.
            </p>
          </div>

          <div className="bento-card">
            <div className="bento-icone">📱</div>
            <h3>Instalável como PWA</h3>
            <p>
              Adicione à tela de início do seu iPhone ou Android e use em tela cheia com a mesma fluidez e responsividade de um aplicativo nativo da loja.
            </p>
          </div>
        </div>
      </section>

      {/* Seção Fluxo Open Finance (Meu Pluggy) */}
      <section id="open-finance" className="landing-secao">
        <div className="landing-secao-cabecalho">
          <span className="landing-secao-tag">Open Finance Oficial & Gratuito</span>
          <h2>Como funciona a conexão com o Meu Pluggy</h2>
          <p className="landing-secao-desc">
            A Pluggy é autorizada pelo Banco Central. O plano pessoal do Meu Pluggy permite conectar até 5 bancos
            com API gratuita e sem prazo de expiração. Veja como a ponte de dados funciona na prática:
          </p>
        </div>

        <div className="landing-flow-card">
          <div className="landing-flow-top">
            <div className="flow-top-left">
              <span className="flow-pill-title">Arquitetura de Conexão</span>
              <span className="flow-pill-badge">Ponte Oficial MeuPluggy</span>
            </div>
            <span className="flow-pill-status">
              <span className="pulse-green" /> 100% Somente Leitura · Autorizado pelo Banco Central
            </span>
          </div>

          {/* Stepper visual do fluxo */}
          <div className="landing-flow-stepper" aria-hidden="true">
            <div className="stepper-step ativo">
              <span className="step-num">01</span>
              <span className="step-label">Conectar Bancos</span>
            </div>
            <div className="stepper-arrow">
              <span className="arrow-line" />
              <span className="arrow-tag">Open Finance</span>
              <span className="arrow-head">→</span>
            </div>
            <div className="stepper-step ativo">
              <span className="step-num">02</span>
              <span className="step-label">Gerar Chaves & Ponte</span>
            </div>
            <div className="stepper-arrow">
              <span className="arrow-line" />
              <span className="arrow-tag">API Segura</span>
              <span className="arrow-head">→</span>
            </div>
            <div className="stepper-step ativo destaque">
              <span className="step-num">03</span>
              <span className="step-label">Raio-X Sincronizado</span>
            </div>
          </div>

          <div className="landing-flow-grid">
            {/* Bloco 1: meu.pluggy.ai */}
            <div className="flow-col">
              <div className="flow-box">
                <div className="flow-box-header-bar verde">
                  <span className="bar-tag">Passo 1</span>
                  <span className="bar-url">meu.pluggy.ai</span>
                </div>
                <div className="flow-box-body">
                  <h4>Conexão das Contas</h4>
                  <p className="flow-box-sub">Onde você autoriza seus bancos</p>

                  <div className="flow-bancos-chips">
                    <div className="banco-pill">
                      <span className="banco-logo nu-bg">nu</span>
                      <span className="banco-txt">Nubank</span>
                      <span className="banco-check">✓</span>
                    </div>
                    <div className="banco-pill">
                      <span className="banco-logo itau-bg">Itaú</span>
                      <span className="banco-txt">Itaú</span>
                      <span className="banco-check">✓</span>
                    </div>
                    <div className="banco-pill">
                      <span className="banco-logo inter-bg">inter</span>
                      <span className="banco-txt">Inter</span>
                      <span className="banco-check">✓</span>
                    </div>
                    <div className="banco-pill">
                      <span className="banco-logo santander-bg">SAN</span>
                      <span className="banco-txt">Santander</span>
                      <span className="banco-check">✓</span>
                    </div>
                    <div className="banco-pill">
                      <span className="banco-logo bb-bg">BB</span>
                      <span className="banco-txt">Banco do Brasil</span>
                      <span className="banco-check">✓</span>
                    </div>
                  </div>

                  <p className="flow-box-desc">
                    Você conecta até 5 contas com autorização oficial no app do seu banco com segurança total.
                  </p>
                </div>
              </div>
            </div>

            {/* Bloco 2: dashboard.pluggy.ai */}
            <div className="flow-col">
              <div className="flow-box">
                <div className="flow-box-header-bar verde">
                  <span className="bar-tag">Passo 2</span>
                  <span className="bar-url">dashboard.pluggy.ai</span>
                </div>
                <div className="flow-box-body">
                  <h4>Geração de API & Ponte</h4>
                  <p className="flow-box-sub">Onde as credenciais são criadas</p>

                  <div className="flow-keys-card">
                    <div className="key-line">
                      <span className="key-label">CLIENT_ID</span>
                      <span className="key-val">cli_94f83b10...</span>
                    </div>
                    <div className="key-line">
                      <span className="key-label">CLIENT_SECRET</span>
                      <span className="key-val">••••••••••••••••</span>
                    </div>
                  </div>

                  <div className="flow-connector-active">
                    <div className="connector-icon-box">P</div>
                    <div className="connector-info">
                      <strong>Conector "MeuPluggy"</strong>
                      <span>Ponte autorizada para entrega</span>
                    </div>
                    <span className="connector-badge-ok">Ativo</span>
                  </div>

                  <p className="flow-box-desc">
                    No Dashboard você gera as chaves e ativa o conector especial <code>MeuPluggy</code> para liberar o repasse.
                  </p>
                </div>
              </div>
            </div>

            {/* Bloco 3: Seu Raio-X */}
            <div className="flow-col">
              <div className="flow-box destaque">
                <div className="flow-box-header-bar raio">
                  <span className="bar-tag">Resultado</span>
                  <span className="bar-url">Seu Raio-X</span>
                </div>
                <div className="flow-box-body">
                  <h4>Painel 100% Pessoal</h4>
                  <p className="flow-box-sub">Seus dados protegidos no seu banco</p>

                  <div className="flow-raiox-kpis">
                    <div className="raiox-kpi">
                      <span className="rotulo">Atualização Automática</span>
                      <strong>Todo dia às 09:00</strong>
                      <span className="tag">Cron na Vercel</span>
                    </div>
                    <div className="raiox-kpi">
                      <span className="rotulo">Faturas & Lançamentos</span>
                      <strong className="verde">Últimos 90 dias</strong>
                      <span className="tag">Conciliação inteligente</span>
                    </div>
                    <div className="raiox-kpi">
                      <span className="rotulo">Banco de Dados</span>
                      <strong>PostgreSQL (Neon)</strong>
                      <span className="tag">Acesso exclusivo seu</span>
                    </div>
                  </div>

                  <p className="flow-box-desc">
                    O Raio-X puxa despesas e faturas sem nenhuma intervenção manual.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 3 Pilares Rápidos */}
          <div className="landing-flow-beneficios">
            <div className="flow-beneficio">
              <span className="beneficio-icon">🛡️</span>
              <div>
                <strong>Acesso Somente Leitura</strong>
                <p>Nenhuma permissão para movimentar dinheiro, fazer Pix ou transferências.</p>
              </div>
            </div>
            <div className="flow-beneficio">
              <span className="beneficio-icon">⏱️</span>
              <div>
                <strong>Gratuito & Vitalício</strong>
                <p>Plano pessoal oficial da Pluggy para até 5 conexões ativas do mesmo titular.</p>
              </div>
            </div>
            <div className="flow-beneficio">
              <span className="beneficio-icon">🔒</span>
              <div>
                <strong>Chaves 100% Suas</strong>
                <p>As chaves de API ficam salvas exclusivamente na sua Vercel ou servidor local.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparativo de Mercado */}
      <section id="comparativo" className="landing-secao">
        <div className="landing-secao-cabecalho">
          <span className="landing-secao-tag">Tabela Comparativa</span>
          <h2>Por que o Raio-X é diferente</h2>
        </div>

        <div className="landing-tabela-wrapper">
          <table className="landing-tabela">
            <thead>
              <tr>
                <th>Recurso</th>
                <th>Raio-X</th>
                <th>Fintechs Tradicionais</th>
                <th>Planilhas de Excel</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Onde ficam os dados?</td>
                <td className="sim">No seu banco (100% seu)</td>
                <td className="nao">Nos servidores deles</td>
                <td>No seu computador</td>
              </tr>
              <tr>
                <td>Open Finance Automático</td>
                <td className="sim">✓ Sim (Pluggy)</td>
                <td className="sim">✓ Sim</td>
                <td className="nao">✕ Não (digitação manual)</td>
              </tr>
              <tr>
                <td>Importação de Faturas em PDF</td>
                <td className="sim">✓ Sim (Offline no navegador)</td>
                <td className="nao">✕ Quase nenhuma aceita</td>
                <td className="nao">✕ Copiar e colar à mão</td>
              </tr>
              <tr>
                <td>Inteligência Artificial</td>
                <td className="sim">✓ Claude/Codex (Custo R$ 0)</td>
                <td className="nao">✕ Chatbots engessados</td>
                <td className="nao">✕ Não tem</td>
              </tr>
              <tr>
                <td>Custo Mensal</td>
                <td className="sim">R$ 0,00 (Open Source)</td>
                <td className="nao">R$ 20 a R$ 40 / mês</td>
                <td>Grátis</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Banner Final CTA */}
      <section className="landing-cta-final">
        <div className="landing-cta-card">
          <h2>Código aberto, seguro e auto-hospedável</h2>
          <p>Clone o repositório, configure suas chaves e rode em minutos no seu próprio ambiente ou na Vercel.</p>
          <div className="landing-ctas">
            <a
              href="https://github.com/GigioDerico/raio-x"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-primario"
            >
              Ver no GitHub <span>↗</span>
            </a>
            <a
              href="https://github.com/GigioDerico/raio-x#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-secundario"
            >
              Guia de Instalação ↗
            </a>
          </div>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="landing-rodape">
        <div className="landing-rodape-inner">
          <div className="landing-rodape-col">
            <div className="landing-logo">
              <Lente />
              <span>
                Raio-<em>X</em>
              </span>
            </div>
            <p className="suave" style={{ fontSize: '13px', margin: '8px 0 0' }}>
              Painel pessoal de finanças sob licença AGPL-3.0. Código aberto, seguro e transparente.
            </p>
          </div>
          <div className="landing-rodape-links">
            <a href="https://github.com/GigioDerico/raio-x" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="https://meu.pluggy.ai" target="_blank" rel="noopener noreferrer">
              Meu Pluggy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
