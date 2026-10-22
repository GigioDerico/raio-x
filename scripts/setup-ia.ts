/**
 * Assistente de terminal para configuração do provedor de IA no .env.local.
 *
 * Suporta:
 * 1) Anthropic (Claude oficial)
 * 2) OpenAI (GPT oficial)
 * 3) OpenRouter (Multi-modelos)
 *
 * Valida a chave na hora com uma chamada real ao modelo antes de gravar.
 */
import { exec } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const URLS_CHAVES = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
};

async function abrirNavegador(url: string) {
  try {
    const cmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  } catch {
    // se falhar ao abrir automático, o link já está exibido no terminal
  }
}

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
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Diga "ok"' }],
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const err = (await r.text().catch(() => '')) || `HTTP ${r.status}`;
    throw new Error(`Anthropic recusou a chave (${r.status}): ${err.slice(0, 200)}`);
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
      max_tokens: 20,
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const err = (await r.text().catch(() => '')) || `HTTP ${r.status}`;
    throw new Error(`OpenAI recusou a chave (${r.status}): ${err.slice(0, 200)}`);
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
      'x-title': 'Raio-X Setup',
    },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: 'Diga "ok"' }],
      max_tokens: 20,
    }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    const err = (await r.text().catch(() => '')) || `HTTP ${r.status}`;
    throw new Error(`OpenRouter recusou a chave (${r.status}): ${err.slice(0, 200)}`);
  }
  return { ms };
}

function salvarEnv(variaveis: Record<string, string>) {
  const envPath = resolve(process.cwd(), '.env.local');
  let conteudo = '';
  if (existsSync(envPath)) {
    copyFileSync(envPath, resolve(process.cwd(), '.env.local.bak'));
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
}

async function main() {
  const rl = createInterface({ input, output });

  try {
    console.log('\n===========================================');
    console.log('  Configuração do Provedor de IA — Raio-X  ');
    console.log('===========================================\n');
    console.log('Escolha qual provedor você deseja usar:\n');
    console.log('  [1] Anthropic (Claude 3.5 Sonnet / Haiku - Oficial)');
    console.log('  [2] OpenAI (GPT-4o / GPT-4o-mini - Oficial)');
    console.log('  [3] OpenRouter (Multi-modelos)\n');

    let escolha = '';
    while (!['1', '2', '3'].includes(escolha)) {
      escolha = (await rl.question('Digite o número da opção (1, 2 ou 3): ')).trim();
    }

    const provedor = escolha === '1' ? 'anthropic' : escolha === '2' ? 'openai' : 'openrouter';
    const nomeProvedor = provedor === 'anthropic' ? 'Anthropic' : provedor === 'openai' ? 'OpenAI' : 'OpenRouter';
    const chaveVar = provedor === 'anthropic' ? 'ANTHROPIC_API_KEY' : provedor === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
    const modeloPadrao = provedor === 'anthropic' ? 'claude-3-5-sonnet-20241022' : provedor === 'openai' ? 'gpt-4o' : 'anthropic/claude-sonnet-4.5';
    const urlChave = URLS_CHAVES[provedor];

    console.log(`\nVocê escolheu: ${nomeProvedor}`);
    console.log(`Para obter sua chave de API, acesse: ${urlChave}\n`);

    const abrir = (await rl.question('Deseja abrir esse link no seu navegador agora? (S/n): ')).trim().toLowerCase();
    if (abrir === '' || abrir === 's' || abrir === 'sim' || abrir === 'y') {
      await abrirNavegador(urlChave);
      console.log('Navegador aberto!\n');
    }

    let chave = '';
    while (!chave) {
      chave = (await rl.question(`Cole sua ${chaveVar}: `)).trim();
      if (!chave) console.log('A chave não pode ficar vazia.');
    }

    const modeloEscolhido = (await rl.question(`Modelo principal [padrão: ${modeloPadrao}]: `)).trim() || modeloPadrao;

    console.log(`\nTestando conexão com ${nomeProvedor} usando o modelo "${modeloEscolhido}"...`);
    try {
      let resultado: { ms: number };
      if (provedor === 'anthropic') resultado = await testarAnthropic(chave, modeloEscolhido);
      else if (provedor === 'openai') resultado = await testarOpenAI(chave, modeloEscolhido);
      else resultado = await testarOpenRouter(chave, modeloEscolhido);

      console.log(`✓ Sucesso! O modelo respondeu em ${(resultado.ms / 1000).toFixed(2)}s.\n`);
    } catch (e) {
      console.error(`\n⚠️  Falha no teste: ${e instanceof Error ? e.message : e}`);
      const salvarMesmo = (await rl.question('Deseja salvar mesmo assim no .env.local? (s/N): ')).trim().toLowerCase();
      if (salvarMesmo !== 's' && salvarMesmo !== 'sim' && salvarMesmo !== 'y') {
        console.log('Operação cancelada. Nenhuma alteração foi feita.');
        return;
      }
    }

    salvarEnv({
      IA_PROVEDOR: provedor,
      [chaveVar]: chave,
      IA_MODEL: modeloEscolhido,
    });

    console.log('✓ Configurações salvas com sucesso no arquivo .env.local!');
    console.log('  (Um backup do arquivo anterior foi salvo como .env.local.bak)\n');
    console.log('Próximo passo: se o servidor "npm run dev" já estiver rodando,');
    console.log('ele atualizará as variáveis ou você pode reiniciá-lo.\n');
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error('\nErro inesperado:', e);
  process.exit(1);
});
