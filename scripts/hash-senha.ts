/**
 * Gera os valores de APP_PASSWORD_HASH e SESSION_SECRET.
 *
 *   npm run hash-senha              (pergunta no terminal, sem eco)
 *   echo 'minha senha' | npm run hash-senha   (CI, Docker)
 *
 * A senha nunca é escrita em disco. Em modo interativo também não vai para o
 * histórico do shell.
 */
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { gerarHash } from '../src/lib/senha';

const MINIMO = 12;

function perguntarSenha(rotulo: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const saida = process.stdout;
    const write = saida.write.bind(saida);
    // silencia o eco enquanto digita
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(rotulo)) write(s);
    };
    rl.question(rotulo, (resposta) => {
      write('\n');
      rl.close();
      resolve(resposta);
    });
  });
}

/** Sem terminal (CI, Docker, pipe): lê a primeira linha da entrada. */
function lerDaEntrada(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (p) => (buf += p));
    process.stdin.on('end', () => resolve(buf.split('\n')[0]?.trim() ?? ''));
    process.stdin.on('error', reject);
  });
}

function falhar(msg: string): never {
  process.stderr.write(`\n${msg}\n`);
  throw new Error(msg);
}

async function main() {
  const interativo = process.stdin.isTTY === true;

  const senha = interativo ? await perguntarSenha('Senha: ') : await lerDaEntrada();
  if (senha.length < MINIMO) {
    falhar(`Use pelo menos ${MINIMO} caracteres — é a única barreira do app.`);
  }
  if (interativo) {
    const confirma = await perguntarSenha('Repita: ');
    if (senha !== confirma) falhar('As senhas não batem.');
  }

  const hash = await gerarHash(senha);

  process.stdout.write('\nCole isto no seu .env.local (e nas variáveis da Vercel):\n\n');
  process.stdout.write(`APP_PASSWORD_HASH=${hash}\n`);
  process.stdout.write(`SESSION_SECRET=${randomBytes(32).toString('base64url')}\n\n`);
}

// falhar() já escreveu a mensagem legível; o stack não acrescenta nada aqui.
main().catch(() => {
  process.exitCode = 1;
});
