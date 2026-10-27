'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buscar, falhaDe, textoDoErro } from '@/lib/falha';

export type ProvedorIa = 'claude-cli' | 'codex-cli' | 'anthropic' | 'openai' | 'openrouter';

type Props = {
  provedorAtual: ProvedorIa;
  temChave: boolean;
  clisDisponiveis?: {
    temClaude: boolean;
    temCodex: boolean;
  };
  ambiente?: 'local' | 'online';
  modoAtual?: 'auto' | 'local' | 'cloud';
  chavesSalvas?: {
    openrouter?: boolean;
    anthropic?: boolean;
    openai?: boolean;
  };
};

type DetalhesMetodo = {
  nome: string;
  rotuloAba: string;
  tag: string;
  subtitulo: string;
  tipo: 'cli' | 'api';
  chaveNome?: string;
  placeholderChave?: string;
  urlChave?: string;
  modeloPadrao: string;
  comandoInstalacao?: string;
  comandoLogin?: string;
  descricaoCli?: string;
};

const DETALHES_PROVEDOR: Record<ProvedorIa, DetalhesMetodo> = {
  'claude-cli': {
    nome: 'Claude Code (Assinatura Local)',
    rotuloAba: 'Claude Code',
    tag: 'Assinatura',
    subtitulo: 'Usa a sua assinatura Claude Pro/Max já conectada no terminal do seu Mac.',
    tipo: 'cli',
    modeloPadrao: 'claude-code-cli',
    comandoInstalacao: 'npm install -g @anthropic-ai/claude-code',
    comandoLogin: 'claude login',
    descricaoCli:
      'O Raio-X executa as tarefas de IA (leitura de faturas, categorização de lançamentos e diagnóstico) diretamente através do Claude Code CLI no seu Mac. Nenhuma chave de API necessária e zero custo por token.',
  },
  'codex-cli': {
    nome: 'Codex CLI (Assinatura Local)',
    rotuloAba: 'Codex CLI',
    tag: 'Assinatura',
    subtitulo: 'Usa a sua assinatura ChatGPT Plus / Codex já conectada no terminal do seu Mac.',
    tipo: 'cli',
    modeloPadrao: 'codex-cli',
    comandoInstalacao: 'npm install -g @openai/codex',
    comandoLogin: 'codex login',
    descricaoCli:
      'O Raio-X executa chamadas através do CLI oficial do Codex autenticado localmente, em modo de leitura seguro e sem cobrança de tokens na API.',
  },
  anthropic: {
    nome: 'Anthropic Claude (API Oficial)',
    rotuloAba: 'Anthropic',
    tag: 'API Cloud',
    subtitulo: 'Conexão direta com a API da Anthropic (pago por token consumido).',
    tipo: 'api',
    chaveNome: 'ANTHROPIC_API_KEY',
    placeholderChave: 'sk-ant-api03-...',
    urlChave: 'https://console.anthropic.com/settings/keys',
    modeloPadrao: 'claude-3-5-sonnet-20241022',
  },
  openai: {
    nome: 'OpenAI GPT (API Oficial)',
    rotuloAba: 'OpenAI',
    tag: 'API Cloud',
    subtitulo: 'Conexão direta com a API da OpenAI (pago por token consumido).',
    tipo: 'api',
    chaveNome: 'OPENAI_API_KEY',
    placeholderChave: 'sk-proj-...',
    urlChave: 'https://platform.openai.com/api-keys',
    modeloPadrao: 'gpt-4o',
  },
  openrouter: {
    nome: 'OpenRouter (Multi-modelos)',
    rotuloAba: 'OpenRouter',
    tag: 'API Cloud',
    subtitulo: 'Acesso unificado a diversos modelos através de uma única chave.',
    tipo: 'api',
    chaveNome: 'OPENROUTER_API_KEY',
    placeholderChave: 'sk-or-v1-...',
    urlChave: 'https://openrouter.ai/keys',
    modeloPadrao: 'anthropic/claude-sonnet-4.5',
  },
};

const ORDEM_METODOS: ProvedorIa[] = ['openrouter', 'anthropic', 'openai', 'claude-cli', 'codex-cli'];

export default function ConectarIa({
  provedorAtual,
  temChave,
  clisDisponiveis,
  ambiente = 'local',
  modoAtual = 'auto',
  chavesSalvas,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [selecionado, setSelecionado] = useState<ProvedorIa>(provedorAtual);
  const [modo, setModo] = useState<'auto' | 'local' | 'cloud'>(modoAtual);
  const [apiKey, setApiKey] = useState('');
  const [modelo, setModelo] = useState('');
  const [mostrarChave, setMostrarChave] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const info = DETALHES_PROVEDOR[selecionado];
  const ehAtivo = selecionado === provedorAtual && temChave;
  const ehCli = info.tipo === 'cli';
  const chaveJaSalva = Boolean(
    !ehCli && chavesSalvas?.[selecionado as 'openrouter' | 'anthropic' | 'openai'],
  );

  const cliDetectado =
    selecionado === 'claude-cli'
      ? (clisDisponiveis?.temClaude ?? true)
      : selecionado === 'codex-cli'
        ? (clisDisponiveis?.temCodex ?? true)
        : false;

  async function trocarModo(novoModo: 'auto' | 'local' | 'cloud') {
    setModo(novoModo);
    setCarregando(true);
    setSucesso(null);
    setErro(null);
    try {
      const r = await buscar('/api/ajustes/ia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provedor: selecionado,
          modo: novoModo,
        }),
      });

      if (!r.ok) throw await falhaDe(r);
      const modoDesc =
        novoModo === 'auto'
          ? 'Automático (Inteligente)'
          : novoModo === 'local'
            ? 'Forçar Local (CLI)'
            : 'Forçar Nuvem (API)';
      setSucesso(`✓ Modo alterado para "${modoDesc}".`);
      startTransition(() => router.refresh());
    } catch (err) {
      setErro(textoDoErro(err, navigator.onLine).texto);
    } finally {
      setCarregando(false);
    }
  }

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setSucesso(null);
    setErro(null);

    try {
      const chaveParaEnvio = ehCli ? undefined : apiKey.trim() || undefined;
      const r = await buscar('/api/ajustes/ia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provedor: selecionado,
          apiKey: chaveParaEnvio,
          modelo: modelo.trim() || undefined,
          modo,
        }),
      });

      if (!r.ok) throw await falhaDe(r);
      const d = (await r.json()) as {
        ok: boolean;
        modelo: string;
        latenciaMs: number;
        salvoNoArquivo: boolean;
        salvoNoBanco?: boolean;
      };

      const msgCusto = ehCli
        ? 'Custo de API: R$ 0,00 (coberto pela sua assinatura).'
        : 'Chave gravada com criptografia militar (AES-256) no seu banco de dados.';
      setSucesso(
        `✓ Conectado com sucesso! ${info.nome} respondeu em ${(d.latenciaMs / 1000).toFixed(2)}s. ${msgCusto}`,
      );
      setApiKey('');
      startTransition(() => router.refresh());
    } catch (err) {
      setErro(textoDoErro(err, navigator.onLine).texto);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="conectar-ia-container">
      {/* Bloco de Ambiente e Modo de Conexão */}
      <div className="conectar-ia-ambiente-card">
        <div className="conectar-ia-ambiente-header">
          <div className="conectar-ia-ambiente-status">
            <span className={`conectar-ia-ambiente-ponto ${ambiente === 'local' ? 'local' : 'nuvem'}`} />
            <strong>
              {ambiente === 'local' ? 'Ambiente Detectado: Local (Mac)' : 'Ambiente Detectado: Nuvem (Vercel / Online)'}
            </strong>
          </div>
          <p className="suave" style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
            {ambiente === 'local'
              ? 'Você está rodando no seu Mac. Pode usar o Claude/Codex CLI com custo zero ou alternar para APIs na nuvem.'
              : 'Executando na nuvem. A conexão usa as chaves de API salvas com criptografia no seu banco de dados Neon.'}
          </p>
        </div>

        <div className="conectar-ia-seletor-linha">
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>Comportamento:</span>
          <div className="conectar-ia-seletor-botoes" role="radiogroup" aria-label="Modo de conexão de IA">
            <button
              type="button"
              className={`conectar-ia-seletor-btn${modo === 'auto' ? ' ativo' : ''}`}
              onClick={() => void trocarModo('auto')}
              disabled={carregando}
              title="No Mac usa o CLI (R$ 0), no Online usa a chave em nuvem"
            >
              🟢 Automático (Recomendado)
            </button>
            <button
              type="button"
              className={`conectar-ia-seletor-btn${modo === 'local' ? ' ativo' : ''}`}
              onClick={() => void trocarModo('local')}
              disabled={carregando}
              title="Sempre tenta o CLI do seu Mac"
            >
              💻 Forçar Local (CLI)
            </button>
            <button
              type="button"
              className={`conectar-ia-seletor-btn${modo === 'cloud' ? ' ativo' : ''}`}
              onClick={() => void trocarModo('cloud')}
              disabled={carregando}
              title="Sempre usa API na nuvem (OpenRouter, Anthropic ou OpenAI)"
            >
              ☁️ Forçar Nuvem (API)
            </button>
          </div>
        </div>
      </div>

      <div className="conectar-ia-metodos" role="tablist" aria-label="Métodos de conexão de IA">
        {ORDEM_METODOS.map((p) => {
          const item = DETALHES_PROVEDOR[p];
          const ativo = p === selecionado;
          const configurado = p === provedorAtual && temChave;
          const temChaveSalva = !['claude-cli', 'codex-cli'].includes(p) && Boolean(chavesSalvas?.[p as 'openrouter' | 'anthropic' | 'openai']);

          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={ativo}
              className={`conectar-ia-aba${ativo ? ' ativa' : ''}`}
              onClick={() => {
                setSelecionado(p);
                setSucesso(null);
                setErro(null);
              }}
            >
              <span className="conectar-ia-aba-nome">{item.rotuloAba}</span>
              <span className={`conectar-ia-badge-tipo${item.tipo === 'cli' ? ' assinatura' : ''}`}>
                {item.tag}
              </span>
              {configurado && <span className="conectar-ia-badge-ativo">Ativo</span>}
              {!configurado && temChaveSalva && <span className="conectar-ia-badge-tipo" title="Chave guardada no banco">🔒 Salvo</span>}
            </button>
          );
        })}
      </div>

      <div className="conectar-ia-painel">
        <div className="conectar-ia-topo">
          <div>
            <h3 className="conectar-ia-titulo">{info.nome}</h3>
            <p className="suave" style={{ fontSize: '13px', margin: '4px 0 0' }}>
              {info.subtitulo}
            </p>
          </div>
          {info.urlChave && (
            <a className="botao secundario" href={info.urlChave} target="_blank" rel="noopener noreferrer">
              Obter chave ↗
            </a>
          )}
        </div>

        {ehAtivo && !sucesso && (
          <div className="conectar-ia-aviso-ativo">
            ✓ Este método está ativo e operacional no Raio-X.
          </div>
        )}

        {ehCli ? (
          <form onSubmit={(e) => void conectar(e)} className="conectar-ia-form">
            <div className={`conectar-ia-status-box ${cliDetectado ? 'ok' : 'alerta'}`}>
              {cliDetectado ? (
                <>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    ✓ CLI instalado e detectado no seu Mac
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                    O binário local está pronto. O Raio-X usará a sua assinatura ativa sem exigir chaves de API.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    ⚠️ CLI local não disponível neste ambiente
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
                    As assinaturas locais via CLI só funcionam com o app rodando diretamente no seu Mac (terminal local). Quando o app roda em servidor na nuvem (como Vercel) ou fora do Mac, use uma conexão de API em nuvem (OpenRouter, Anthropic ou OpenAI).
                  </p>
                </>
              )}
            </div>

            <p style={{ fontSize: '13px', color: 'var(--ink)', margin: '0 0 8px' }}>
              {info.descricaoCli}
            </p>

            <ul className="conectar-ia-cli-vantagens">
              <li>
                <strong>Custo Zero por Token:</strong> Chamadas ilimitadas incluídas na sua mensalidade.
              </li>
              <li>
                <strong>Segurança e Isolamento:</strong> Executado como processo local em modo restrito de consulta, sem permissão de alterar arquivos.
              </li>
              <li>
                <strong>Privacidade:</strong> Nenhum intermediário na nuvem ou agregador de terceiros.
              </li>
            </ul>

            <div className="campo-ajuste">
              <label htmlFor={`modelo-${selecionado}`}>Identificador do modelo (opcional)</label>
              <input
                id={`modelo-${selecionado}`}
                type="text"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder={`Padrão: ${info.modeloPadrao}`}
              />
            </div>

            <div className="conectar-ia-acoes">
              <button type="submit" disabled={carregando || !cliDetectado}>
                {carregando
                  ? 'Testando conexão com o CLI local…'
                  : ehAtivo
                    ? 'Retestar Conexão CLI'
                    : 'Ativar Conexão com Assinatura'}
              </button>
            </div>

            {sucesso && (
              <p className="ia-teste-ok" role="status" style={{ marginTop: '10px' }}>
                {sucesso}
              </p>
            )}

            {erro && (
              <p className="erro" role="alert" style={{ marginTop: '10px' }}>
                {erro}
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={(e) => void conectar(e)} className="conectar-ia-form">
            {chaveJaSalva && (
              <div className="conectar-ia-status-box ok" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>🔒</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>Chave de API salva com criptografia militar (AES-256) no banco</p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                    Sua chave já está protegida no banco Neon. Para alterar o modelo ou reativar, clique no botão abaixo sem precisar digitá-la novamente. Preencha o campo apenas se desejar substituir a chave.
                  </p>
                </div>
              </div>
            )}

            <div className="campo-ajuste">
              <label htmlFor={`chave-${selecionado}`}>
                Chave de API ({info.chaveNome}) {chaveJaSalva && <span className="suave">(já configurada no banco)</span>}
              </label>
              <div className="conectar-ia-input-grupo">
                <input
                  id={`chave-${selecionado}`}
                  type={mostrarChave ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={chaveJaSalva ? '•••••••••••••••••••••••••••••••••••••••• (Chave gravada)' : info.placeholderChave}
                  required={!chaveJaSalva}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="link conectar-ia-btn-visivel"
                  onClick={() => setMostrarChave(!mostrarChave)}
                >
                  {mostrarChave ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div className="campo-ajuste">
              <label htmlFor={`modelo-${selecionado}`}>Modelo (opcional)</label>
              <input
                id={`modelo-${selecionado}`}
                type="text"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder={`Padrão recomendado: ${info.modeloPadrao}`}
              />
            </div>

            <div className="conectar-ia-acoes">
              <button type="submit" disabled={carregando || (!chaveJaSalva && !apiKey.trim())}>
                {carregando
                  ? 'Testando conexão…'
                  : apiKey.trim()
                    ? 'Testar e Gravar Nova Chave no Banco'
                    : chaveJaSalva
                      ? 'Confirmar Conexão'
                      : 'Conectar e Salvar'}
              </button>
            </div>

            {sucesso && (
              <p className="ia-teste-ok" role="status" style={{ marginTop: '10px' }}>
                {sucesso}
              </p>
            )}

            {erro && (
              <p className="erro" role="alert" style={{ marginTop: '10px' }}>
                {erro}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
