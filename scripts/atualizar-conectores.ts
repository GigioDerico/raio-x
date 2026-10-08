/**
 * Gera a lista de instituições suportadas a partir do próprio Pluggy.
 *
 *   npm run conectores
 *
 * Escreve docs/conectores.md (lista completa) e injeta um resumo no README
 * entre os marcadores <!-- conectores:inicio --> e <!-- conectores:fim -->.
 *
 * Por que gerado e não digitado: são ~270 instituições e a lista muda sozinha.
 * Lista escrita à mão envelhece em semanas e vira promessa quebrada.
 *
 * Precisa de PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET. Forks sem essas chaves
 * não conseguem regerar — leem o snapshot commitado, e por isso a data de
 * geração fica visível no README.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.pluggy.ai';

type Conector = {
  id: number;
  name: string;
  type: string;
  country: string;
  isOpenFinance: boolean;
  products: string[];
  imageUrl?: string;
  primaryColor?: string;
};

async function apiKey(): Promise<string> {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente.');
  }

  const r = await fetch(`${API}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) throw new Error(`POST /auth respondeu ${r.status}`);

  const { apiKey } = (await r.json()) as { apiKey: string };
  return apiKey;
}

async function buscarConectores(chave: string): Promise<Conector[]> {
  const url = new URL(`${API}/connectors`);
  url.searchParams.set('countries', 'BR');
  url.searchParams.set('sandbox', 'false');

  const r = await fetch(url, { headers: { 'X-API-KEY': chave } });
  if (!r.ok) throw new Error(`GET /connectors respondeu ${r.status}`);

  const corpo = (await r.json()) as { results: Conector[] };
  return corpo.results.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

const temProduto = (c: Conector, p: string) => c.products?.includes(p);
const marca = (b: boolean) => (b ? '✓' : '—');

function tabela(lista: Conector[]): string {
  const linhas = lista.map((c) => {
    const via = c.isOpenFinance ? 'Open Finance' : 'Direto';
    return `| ${c.name} | ${via} | ${marca(temProduto(c, 'ACCOUNTS'))} | ${marca(
      temProduto(c, 'CREDIT_CARDS'),
    )} | ${marca(temProduto(c, 'TRANSACTIONS'))} |`;
  });

  return [
    '| Instituição | Conexão | Contas | Cartão | Lançamentos |',
    '| --- | --- | :-: | :-: | :-: |',
    ...linhas,
  ].join('\n');
}

async function main() {
  const hoje = new Date().toISOString().slice(0, 10);
  const conectores = await buscarConectores(await apiKey());

  const pessoais = conectores.filter((c) => c.type === 'PERSONAL_BANK');
  const openFinance = conectores.filter((c) => c.isOpenFinance).length;

  const doc = [
    '# Instituições suportadas',
    '',
    `Gerado por \`npm run conectores\` em ${hoje}. Não edite à mão.`,
    '',
    `São ${conectores.length} conectores no Brasil, ${openFinance} deles por Open Finance.`,
    'A lista viva aparece na tela de conexão do app — esta é um retrato do dia acima.',
    '',
    '## Pessoa física',
    '',
    tabela(pessoais),
    '',
    '## Todos os conectores',
    '',
    tabela(conectores),
    '',
  ].join('\n');

  await writeFile(join(raiz, 'docs', 'conectores.md'), doc, 'utf8');

  const resumo = [
    '<!-- conectores:inicio -->',
    '',
    `**${conectores.length} instituições** conectáveis no Brasil, ${openFinance} delas pelo Open Finance —`,
    'incluindo Santander, Sicredi, Itaú, Nubank e Mercado Pago.',
    `Lista completa em [docs/conectores.md](docs/conectores.md) (retrato de ${hoje}).`,
    'A lista que vale é a que aparece na tela de conexão: ela vem da API na hora.',
    '',
    '<!-- conectores:fim -->',
  ].join('\n');

  const caminhoReadme = join(raiz, 'README.md');
  const readme = await readFile(caminhoReadme, 'utf8');
  const novo = readme.replace(
    /<!-- conectores:inicio -->[\s\S]*?<!-- conectores:fim -->/,
    resumo,
  );

  if (novo === readme && !readme.includes('<!-- conectores:inicio -->')) {
    console.warn('README sem os marcadores de conectores; só docs/conectores.md foi escrito.');
  } else {
    await writeFile(caminhoReadme, novo, 'utf8');
  }

  console.log(`ok — ${conectores.length} conectores, ${pessoais.length} de pessoa física.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
