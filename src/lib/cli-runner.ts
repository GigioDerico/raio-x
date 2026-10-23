import { spawn } from 'node:child_process';
import type { Mensagem } from './ia';
import type { EventoStream, Uso } from './openrouter';

function formatarEntradaParaTexto(entrada: string | Mensagem[]): string {
  if (typeof entrada === 'string') return entrada;
  return entrada
    .map((m) => {
      const rotulo = m.role === 'user' ? 'Usuário: ' : 'Assistente: ';
      return `${rotulo}${m.content}`;
    })
    .join('\n\n');
}

/**
 * Executa Claude Code CLI localmente usando a assinatura ativa do usuário.
 */
export async function executarClaudeCli(
  prompt: string,
  sinal?: AbortSignal,
): Promise<{ texto: string; modelo: string; uso: Uso }> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--tools', '', '-p'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    if (sinal) {
      if (sinal.aborted) {
        child.kill();
        return reject(sinal.reason || new Error('Requisição cancelada'));
      }
      sinal.addEventListener('abort', () => child.kill(), { once: true });
    }

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.stdin.on('error', () => {});

    child.on('error', (err) => {
      reject(new Error(`Falha ao executar Claude CLI: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Claude CLI saiu com código ${code}: ${stderr.trim() || 'sem detalhes'}`));
      }
      const texto = stdout.trim();
      const tokensIn = Math.ceil(prompt.length / 4);
      const tokensOut = Math.ceil(texto.length / 4);
      resolve({
        texto,
        modelo: 'claude-code-cli',
        uso: { tokensIn, tokensOut, custoUsd: 0 },
      });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Executa OpenAI Codex CLI localmente usando a assinatura ativa do usuário.
 */
export async function executarCodexCli(
  prompt: string,
  sinal?: AbortSignal,
): Promise<{ texto: string; modelo: string; uso: Uso }> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['exec', '--json', '-s', 'read-only', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    if (sinal) {
      if (sinal.aborted) {
        child.kill();
        return reject(sinal.reason || new Error('Requisição cancelada'));
      }
      sinal.addEventListener('abort', () => child.kill(), { once: true });
    }

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.stdin.on('error', () => {});

    child.on('error', (err) => {
      reject(new Error(`Falha ao executar Codex CLI: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Codex CLI saiu com código ${code}: ${stderr.trim() || 'sem detalhes'}`));
      }

      let textoFinal = '';
      let tokensIn = Math.ceil(prompt.length / 4);
      let tokensOut = 0;

      const linhas = stdout.trim().split('\n');
      for (const linha of linhas) {
        try {
          const ev = JSON.parse(linha) as {
            type?: string;
            item?: { type?: string; text?: string };
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
            textoFinal = ev.item.text;
          }
          if (ev.type === 'turn.completed' && ev.usage) {
            tokensIn = ev.usage.input_tokens ?? tokensIn;
            tokensOut = ev.usage.output_tokens ?? tokensOut;
          }
        } catch {
          // ignora linhas que não sejam JSON
        }
      }

      tokensOut = tokensOut || Math.ceil(textoFinal.length / 4);

      resolve({
        texto: textoFinal.trim(),
        modelo: 'codex-cli',
        uso: { tokensIn, tokensOut, custoUsd: 0 },
      });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Streaming para Claude Code CLI local.
 */
export async function* streamClaudeCli(
  entrada: string | Mensagem[],
  sinal?: AbortSignal,
): AsyncGenerator<EventoStream> {
  const prompt = formatarEntradaParaTexto(entrada);
  const res = await executarClaudeCli(prompt, sinal);
  yield { tipo: 'texto', t: res.texto };
  yield { tipo: 'fim', modelo: res.modelo, uso: res.uso };
}

/**
 * Streaming para Codex CLI local.
 */
export async function* streamCodexCli(
  entrada: string | Mensagem[],
  sinal?: AbortSignal,
): AsyncGenerator<EventoStream> {
  const prompt = formatarEntradaParaTexto(entrada);
  const res = await executarCodexCli(prompt, sinal);
  yield { tipo: 'texto', t: res.texto };
  yield { tipo: 'fim', modelo: res.modelo, uso: res.uso };
}
