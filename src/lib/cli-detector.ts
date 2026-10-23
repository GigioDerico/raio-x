import { execSync } from 'node:child_process';

/**
 * Detecta se os executáveis do Claude Code CLI e Codex CLI estão disponíveis no ambiente.
 */
export function detectarClis(): { temClaude: boolean; temCodex: boolean } {
  let temClaude = false;
  let temCodex = false;

  try {
    execSync('command -v claude', { stdio: 'ignore' });
    temClaude = true;
  } catch {
    // claude não instalado ou fora do PATH
  }

  try {
    execSync('command -v codex', { stdio: 'ignore' });
    temCodex = true;
  } catch {
    // codex não instalado ou fora do PATH
  }

  return { temClaude, temCodex };
}

export type UsoSessaoClaude = {
  sessaoPct: number;
  sessaoReset?: string;
  semanaPct?: number;
  semanaReset?: string;
};

export type InfoCli = {
  logado: boolean;
  email?: string;
  plano?: string;
  descricao?: string;
  usoSessao?: UsoSessaoClaude;
};

let cacheClaudeStatus: { info: InfoCli; expiraEm: number } | null = null;
let cacheCodexStatus: { info: InfoCli; expiraEm: number } | null = null;

/**
 * Obtém dados de autenticação e consumo da sessão do Claude Code CLI.
 * Usa cache de 60s em memória para não onerar a abertura da página.
 */
export async function obterInfoClaude(): Promise<InfoCli> {
  const agora = Date.now();
  if (cacheClaudeStatus && agora < cacheClaudeStatus.expiraEm) {
    return cacheClaudeStatus.info;
  }

  const { temClaude } = detectarClis();
  if (!temClaude) {
    return { logado: false, descricao: 'CLI não instalado' };
  }

  let email: string | undefined;
  let plano: string | undefined;
  let logado = false;

  try {
    const authOut = execSync('claude auth status', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 4000,
    });
    const jsonStart = authOut.indexOf('{');
    const jsonEnd = authOut.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(authOut.slice(jsonStart, jsonEnd + 1)) as {
        loggedIn?: boolean;
        email?: string;
        subscriptionType?: string;
      };
      logado = Boolean(parsed.loggedIn);
      email = parsed.email;
      plano = parsed.subscriptionType ? `Claude ${parsed.subscriptionType.toUpperCase()}` : 'Claude Assinatura';
    }
  } catch {
    // falha silenciosa
  }

  let usoSessao: UsoSessaoClaude | undefined;
  if (logado) {
    try {
      const usageOut = execSync('echo "/usage" | claude --tools "" -p', {
        stdio: ['pipe', 'pipe', 'ignore'],
        encoding: 'utf8',
        timeout: 8000,
      });
      const sessaoMatch = /Current session:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^(\n]+(?:\([^)]+\))?))?/i.exec(usageOut);
      const semanaMatch = /Current week[^:]*:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^(\n]+(?:\([^)]+\))?))?/i.exec(usageOut);
      if (sessaoMatch) {
        usoSessao = {
          sessaoPct: parseInt(sessaoMatch[1]!, 10),
          sessaoReset: sessaoMatch[2]?.trim(),
          semanaPct: semanaMatch ? parseInt(semanaMatch[1]!, 10) : undefined,
          semanaReset: semanaMatch?.[2]?.trim(),
        };
      }
    } catch {
      // continua sem o uso da sessão se der timeout
    }
  }

  const res: InfoCli = {
    logado,
    email,
    plano: plano || (logado ? 'Claude Pro / Max' : undefined),
    usoSessao,
  };

  cacheClaudeStatus = { info: res, expiraEm: agora + 60_000 };
  return res;
}

/**
 * Obtém dados de status da sessão do Codex CLI.
 */
export async function obterInfoCodex(): Promise<InfoCli> {
  const agora = Date.now();
  if (cacheCodexStatus && agora < cacheCodexStatus.expiraEm) {
    return cacheCodexStatus.info;
  }

  const { temCodex } = detectarClis();
  if (!temCodex) {
    return { logado: false, descricao: 'CLI não instalado' };
  }

  let logado = false;
  let descricao = 'Codex CLI';

  try {
    const out = execSync('codex login status', {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 4000,
    });
    if (out.includes('Logged in')) {
      logado = true;
      descricao = out.trim();
    }
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string })?.stderr ?? '';
    if (stderr.includes('Logged in')) {
      logado = true;
      descricao = stderr.trim();
    }
  }

  const res: InfoCli = {
    logado,
    plano: 'ChatGPT Plus / Codex',
    descricao,
  };

  cacheCodexStatus = { info: res, expiraEm: agora + 60_000 };
  return res;
}
