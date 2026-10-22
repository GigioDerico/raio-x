'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buscar, falhaDe, textoDoErro } from '@/lib/falha';

type Provedor = 'anthropic' | 'openai' | 'openrouter';

type Props = {
  provedorAtual: Provedor;
  temChave: boolean;
};

const DETALHES_PROVEDOR: Record<
  Provedor,
  {
    nome: string;
    subtitulo: string;
    chaveNome: string;
    placeholderChave: string;
    urlChave: string;
    modeloPadrao: string;
  }
> = {
  anthropic: {
    nome: 'Anthropic (Claude Oficial)',
    subtitulo: 'Conexão direta com os modelos Claude 3.5 Sonnet e Haiku.',
    chaveNome: 'ANTHROPIC_API_KEY',
    placeholderChave: 'sk-ant-api03-...',
    urlChave: 'https://console.anthropic.com/settings/keys',
    modeloPadrao: 'claude-3-5-sonnet-20241022',
  },
  openai: {
    nome: 'OpenAI (GPT / Codex Oficial)',
    subtitulo: 'Conexão direta com os modelos GPT-4o e GPT-4o-mini.',
    chaveNome: 'OPENAI_API_KEY',
    placeholderChave: 'sk-proj-...',
    urlChave: 'https://platform.openai.com/api-keys',
    modeloPadrao: 'gpt-4o',
  },
  openrouter: {
    nome: 'OpenRouter (Multi-modelos)',
    subtitulo: 'Acesso unificado a dezenas de modelos de IA.',
    chaveNome: 'OPENROUTER_API_KEY',
    placeholderChave: 'sk-or-v1-...',
    urlChave: 'https://openrouter.ai/keys',
    modeloPadrao: 'anthropic/claude-sonnet-4.5',
  },
};

export default function ConectarIa({ provedorAtual, temChave }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [selecionado, setSelecionado] = useState<Provedor>(provedorAtual);
  const [apiKey, setApiKey] = useState('');
  const [modelo, setModelo] = useState('');
  const [mostrarChave, setMostrarChave] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const info = DETALHES_PROVEDOR[selecionado];
  const ehAtivo = selecionado === provedorAtual && temChave;

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setSucesso(null);
    setErro(null);

    try {
      const r = await buscar('/api/ajustes/ia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provedor: selecionado,
          apiKey,
          modelo: modelo.trim() || undefined,
        }),
      });

      if (!r.ok) throw await falhaDe(r);
      const d = (await r.json()) as { ok: boolean; modelo: string; latenciaMs: number; salvoNoArquivo: boolean };

      setSucesso(
        `✓ Conectado com sucesso! Modelo "${d.modelo}" respondeu em ${(d.latenciaMs / 1000).toFixed(2)}s.` +
          (d.salvoNoArquivo ? ' Configuração gravada no .env.local.' : ''),
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
      <div className="conectar-ia-metodos" role="tablist" aria-label="Métodos de conexão de IA">
        {(['anthropic', 'openai', 'openrouter'] as Provedor[]).map((p) => {
          const item = DETALHES_PROVEDOR[p];
          const ativo = p === selecionado;
          const configurado = p === provedorAtual && temChave;

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
              <span className="conectar-ia-aba-nome">{item.nome.split(' ')[0]}</span>
              {configurado && <span className="conectar-ia-badge-ativo">Ativo</span>}
            </button>
          );
        })}
      </div>

      <div className="conectar-ia-painel">
        <div className="conectar-ia-topo">
          <div>
            <h3 className="conectar-ia-titulo">{info.nome}</h3>
            <p className="suave" style={{ fontSize: '13px', margin: '2px 0 0' }}>
              {info.subtitulo}
            </p>
          </div>
          <a className="botao secundario" href={info.urlChave} target="_blank" rel="noopener noreferrer">
            Obter chave ↗
          </a>
        </div>

        {ehAtivo && !sucesso && (
          <div className="conectar-ia-aviso-ativo">
            ✓ Este provedor já está ativo e configurado. Se desejar atualizar a chave ou o modelo, preencha o formulário abaixo:
          </div>
        )}

        <form onSubmit={(e) => void conectar(e)} className="conectar-ia-form">
          <div className="campo-ajuste">
            <label htmlFor={`chave-${selecionado}`}>Chave de API ({info.chaveNome})</label>
            <div className="conectar-ia-input-grupo">
              <input
                id={`chave-${selecionado}`}
                type={mostrarChave ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={info.placeholderChave}
                required
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="link conectar-ia-btn-visivel" onClick={() => setMostrarChave(!mostrarChave)}>
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
            <button type="submit" disabled={carregando || !apiKey.trim()}>
              {carregando ? 'Testando conexão…' : 'Conectar e Salvar'}
            </button>
          </div>

          {sucesso && (
            <p className="ia-teste-ok" role="status" style={{ marginTop: '8px' }}>
              {sucesso}
            </p>
          )}

          {erro && (
            <p className="erro" role="alert" style={{ marginTop: '8px' }}>
              {erro}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
