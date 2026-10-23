import 'server-only';
import type { NextRequest } from 'next/server';
import { salvarConfig } from '@/lib/ajustes-repo';
import { executarClaudeCli, executarCodexCli } from '@/lib/cli-runner';
import { ErroDeUso, comUsuario, corpoJson } from '@/lib/rota';
import { atualizarEnvLocal } from '@/lib/salvar-env';

export const runtime = 'nodejs';

type CorpoRequisicao = {
  provedor?: unknown;
  apiKey?: unknown;
  modelo?: unknown;
};

const MODELOS_PADRAO: Record<string, string> = {
  'claude-cli': 'claude-code-cli',
  'codex-cli': 'codex-cli',
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o',
  openrouter: 'anthropic/claude-sonnet-4.5',
};

async function testarAnthropic(apiKey: string, modelo: string) {
  const t0 = Date.now();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 15,
      messages: [{ role: 'user', content: 'Diga "ok"' }],
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const err = (await r.text().catch(() => '')) || `HTTP ${r.status}`;
    throw new Error(`Anthropic recusou a chave (${r.status}): ${err.slice(0, 150)}`);
  }
  return { ms };
}

async function testarOpenAI(apiKey: string, modelo: string) {
  const t0 = Date.now();
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: 'Diga "ok"' }],
      max_tokens: 15,
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const err = (await r.text().catch(() => '')) || `HTTP ${r.status}`;
    throw new Error(`OpenAI recusou a chave (${r.status}): ${err.slice(0, 150)}`);
  }
  return { ms };
}

async function testarOpenRouter(apiKey: string, modelo: string) {
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'x-title': 'Raio-X Teste',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: 'Diga "ok"' }],
      max_tokens: 15,
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const err = (await r.text().catch(() => '')) || `HTTP ${r.status}`;
    throw new Error(`OpenRouter recusou a chave (${r.status}): ${err.slice(0, 150)}`);
  }
  return { ms };
}

export async function POST(req: NextRequest) {
  return comUsuario(async (userId) => {
    const corpo = await corpoJson<CorpoRequisicao>(req);
    const prov = typeof corpo?.provedor === 'string' ? corpo.provedor.trim().toLowerCase() : '';
    if (!['claude-cli', 'codex-cli', 'anthropic', 'openai', 'openrouter'].includes(prov)) {
      throw new ErroDeUso('provedor_invalido', 'Escolha um provedor válido');
    }

    const padrao = MODELOS_PADRAO[prov]!;
    const modelo = typeof corpo?.modelo === 'string' && corpo.modelo.trim() ? corpo.modelo.trim() : padrao;

    let ms = 0;

    if (prov === 'claude-cli') {
      const t0 = Date.now();
      try {
        await executarClaudeCli('Responda apenas "ok"');
      } catch (e) {
        throw new ErroDeUso('falha_cli', e instanceof Error ? e.message : 'Claude CLI indisponível');
      }
      ms = Date.now() - t0;

      process.env.IA_PROVEDOR = 'claude-cli';
      process.env.IA_MODEL = modelo;

      const salvoNoArquivo = atualizarEnvLocal({
        IA_PROVEDOR: 'claude-cli',
        IA_MODEL: modelo,
      });

      await salvarConfig(userId, { modeloIa: modelo });
      return { ok: true, provedor: prov, modelo, latenciaMs: ms, salvoNoArquivo };
    }

    if (prov === 'codex-cli') {
      const t0 = Date.now();
      try {
        await executarCodexCli('Responda apenas "ok"');
      } catch (e) {
        throw new ErroDeUso('falha_cli', e instanceof Error ? e.message : 'Codex CLI indisponível');
      }
      ms = Date.now() - t0;

      process.env.IA_PROVEDOR = 'codex-cli';
      process.env.IA_MODEL = modelo;

      const salvoNoArquivo = atualizarEnvLocal({
        IA_PROVEDOR: 'codex-cli',
        IA_MODEL: modelo,
      });

      await salvarConfig(userId, { modeloIa: modelo });
      return { ok: true, provedor: prov, modelo, latenciaMs: ms, salvoNoArquivo };
    }

    const apiKey = typeof corpo?.apiKey === 'string' ? corpo.apiKey.trim() : '';
    if (!apiKey) {
      throw new ErroDeUso('chave_obrigatoria', 'Cole a chave de API para conectar');
    }

    try {
      if (prov === 'anthropic') {
        const res = await testarAnthropic(apiKey, modelo);
        ms = res.ms;
      } else if (prov === 'openai') {
        const res = await testarOpenAI(apiKey, modelo);
        ms = res.ms;
      } else {
        const res = await testarOpenRouter(apiKey, modelo);
        ms = res.ms;
      }
    } catch (e) {
      throw new ErroDeUso('falha_autenticacao', e instanceof Error ? e.message : 'Falha ao testar chave');
    }

    const chaveVar = prov === 'anthropic' ? 'ANTHROPIC_API_KEY' : prov === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';

    process.env.IA_PROVEDOR = prov;
    process.env[chaveVar] = apiKey;
    process.env.IA_MODEL = modelo;

    const salvoNoArquivo = atualizarEnvLocal({
      IA_PROVEDOR: prov,
      [chaveVar]: apiKey,
      IA_MODEL: modelo,
    });

    await salvarConfig(userId, { modeloIa: modelo });

    return {
      ok: true,
      provedor: prov,
      modelo,
      latenciaMs: ms,
      salvoNoArquivo,
    };
  });
}
