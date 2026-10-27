import 'server-only';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ehChaveEnvValida, ehValorEnvSeguro } from './env-sanitizar';

/**
 * Salva variáveis no .env.local de forma segura (preservando o restante do arquivo e fazendo backup).
 * Se o sistema de arquivos for somente leitura (ex.: Vercel), ignora o erro de escrita.
 * Rejeita qualquer chave ou valor que viole os limites de formato ou contenha quebras de linha (CRLF).
 */
export function atualizarEnvLocal(variaveis: Record<string, string>): boolean {
  try {
    // 1. Validação prévia de todas as entradas para impedir CRLF injection
    for (const [chave, valor] of Object.entries(variaveis)) {
      if (!ehChaveEnvValida(chave)) {
        console.warn(`[env] Chave inválida rejeitada por segurança: "${chave}"`);
        return false;
      }
      if (!ehValorEnvSeguro(valor)) {
        console.warn(`[env] Tentativa de CRLF injection bloqueada na chave "${chave}"`);
        return false;
      }
    }

    const envPath = resolve(process.cwd(), '.env.local');
    let conteudo = '';
    if (existsSync(envPath)) {
      try {
        copyFileSync(envPath, resolve(process.cwd(), '.env.local.bak'));
      } catch {
        // backup opcional se o diretório tiver restrições
      }
      conteudo = readFileSync(envPath, 'utf8');
    }

    for (const [chave, valor] of Object.entries(variaveis)) {
      const regex = new RegExp(`^${chave}=.*$`, 'm');
      const linha = `${chave}=${valor}`;
      if (regex.test(conteudo)) {
        conteudo = conteudo.replace(regex, linha);
      } else {
        conteudo = conteudo ? `${conteudo.trimEnd()}\n${linha}\n` : `${linha}\n`;
      }
    }

    writeFileSync(envPath, conteudo, 'utf8');
    return true;
  } catch (e) {
    console.warn('[env] Não foi possível salvar em .env.local (somente leitura ou sem permissão):', e);
    return false;
  }
}
