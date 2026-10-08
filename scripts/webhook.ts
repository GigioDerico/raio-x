/**
 * Cadastra no Pluggy o webhook desta instalação.
 *
 *   npm run webhook -- https://seu-dominio.vercel.app
 *
 * Cria `event: 'all'` para `<url>/api/webhook/pluggy`, com o cabeçalho
 * `x-raio-x-segredo` que a rota confere, e só depois apaga os webhooks que já
 * apontavam para a mesma URL: rodar de novo (segredo trocado, por exemplo)
 * substitui em vez de duplicar — dois cadastros dariam dois avisos por evento.
 * Nessa ordem, se a criação falhar, o cadastro antigo continua de pé.
 *
 * Roda depois do deploy, com PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e
 * PLUGGY_WEBHOOK_SECRET no .env.local (os mesmos da Vercel). Nunca imprime
 * segredo nem apiKey: o terminal pode estar sendo gravado ou compartilhado.
 */
const API = 'https://api.pluggy.ai';

type Webhook = { id: string; event: string; url: string };

// o Pluggy pode devolver a URL com ou sem barra no fim; as duas apontam para a mesma rota
const mesmaUrl = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

function urlDoWebhook(base: string | undefined): string {
  if (!base) throw new Error('Uso: npm run webhook -- https://seu-dominio');
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error('URL inválida.');
  }
  // o cabeçalho secreto viaja em cada aviso: em http ele iria aberto
  if (u.protocol !== 'https:') throw new Error('A URL precisa ser https.');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}/api/webhook/pluggy`;
}

async function apiKey(): Promise<string> {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente.');
  const r = await fetch(`${API}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) throw new Error(`POST /auth respondeu ${r.status}`);
  const { apiKey } = (await r.json()) as { apiKey?: string };
  if (!apiKey) throw new Error('POST /auth não devolveu apiKey');
  return apiKey;
}

async function main() {
  const destino = urlDoWebhook(process.argv[2]);
  const segredo = process.env.PLUGGY_WEBHOOK_SECRET;
  if (!segredo) throw new Error('Falta PLUGGY_WEBHOOK_SECRET no ambiente (o mesmo valor da Vercel).');

  const chave = await apiKey();
  const cabecalhos = { 'X-API-KEY': chave, 'content-type': 'application/json' };

  const r = await fetch(`${API}/webhooks`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({ event: 'all', url: destino, headers: { 'x-raio-x-segredo': segredo } }),
  });
  if (!r.ok) throw new Error(`POST /webhooks respondeu ${r.status}`);
  const criado = (await r.json()) as { id?: string };
  // sem o id não há como poupar o novo na limpeza: parar antes de apagar algo
  if (!criado.id) throw new Error('POST /webhooks não devolveu id; os cadastros antigos ficaram como estavam.');
  console.log(`ok — webhook ${criado.id} para ${destino}`);

  const lista = await fetch(`${API}/webhooks`, { headers: cabecalhos });
  if (!lista.ok) throw new Error(`GET /webhooks respondeu ${lista.status}; confira se sobrou cadastro antigo para a mesma URL`);
  const { results = [], totalPages = 1 } = (await lista.json()) as { results?: Webhook[]; totalPages?: number };
  // uma instalação tem um ou dois; se um dia passar de uma página, avisar em vez de deixar duplicado em silêncio
  if (totalPages > 1) console.warn('Aviso: o Pluggy devolveu mais de uma página de webhooks; só a primeira foi conferida.');

  for (const w of results.filter((w) => w.id !== criado.id && mesmaUrl(w.url, destino))) {
    const d = await fetch(`${API}/webhooks/${encodeURIComponent(w.id)}`, { method: 'DELETE', headers: cabecalhos });
    if (!d.ok) throw new Error(`DELETE /webhooks respondeu ${d.status}; o novo está cadastrado, mas sobrou um antigo`);
    console.log(`removido o cadastro anterior (${w.event})`);
  }
}

main().catch((e) => {
  // só a mensagem: as nossas nunca levam segredo, e o objeto de erro do fetch poderia levar os cabeçalhos
  console.error(e instanceof Error ? e.message : 'falhou');
  process.exit(1);
});
