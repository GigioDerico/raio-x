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
