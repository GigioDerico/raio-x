/**
 * Cliente HTTP do Pluggy. Recebe credenciais, `fetch` e espera por parâmetro
 * — sem `server-only` e sem ler `env` — para o teste rodar com respostas
 * simuladas. Quem usa de verdade é cliente.ts, que é `server-only`.
 *
 * Erros nunca carregam credencial nem apiKey na mensagem.
 */
import type { ContaPluggy, FaturaPluggy, ItemPluggy, TransacaoPluggy } from './mapear';

const BASE = 'https://api.pluggy.ai';
// a apiKey vale 2 h; renovar antes evita uma chamada morrer no meio
const VALIDADE_MS = 110 * 60 * 1000;

export class SemChavePluggy extends Error {
  constructor() {
    super('PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não configurados');
    this.name = 'SemChavePluggy';
  }
}

type Opcoes = {
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
  timeoutMs?: number;
};

export function criarClientePluggy(o: Opcoes) {
  const f = o.fetch ?? fetch;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const agora = o.agora ?? Date.now;
  const timeoutMs = o.timeoutMs ?? 20_000;
  let chave: { valor: string; ate: number } | null = null;

  // instabilidade do Pluggy ou do banco não é assunto do dono: primeira tentativa
  // e mais três, com espera de 1 s, 2 s e 4 s. Cada fetch tem prazo próprio: um
  // pendurado consumiria sozinho o limite de tempo da função na Vercel
  async function comTentativas(pedir: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
    let ultimo: unknown;
    for (let i = 0; i < 4; i++) {
      if (i > 0) await esperar(1000 * 2 ** (i - 1));
      try {
        const r = await pedir(AbortSignal.timeout(timeoutMs));
        // 429 é o Pluggy pedindo calma, não recusa: passa com a espera
        if (r.status < 500 && r.status !== 429) return r;
        ultimo = new Error(`Pluggy respondeu ${r.status}`);
      } catch (e) {
        ultimo = e;
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error('falha ao falar com o Pluggy');
  }

  async function autenticar(): Promise<string> {
    if (!o.clientId || !o.clientSecret) throw new SemChavePluggy();
    if (chave && chave.ate > agora()) return chave.valor;
    const r = await comTentativas((signal) =>
      f(`${BASE}/auth`, {
        signal,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: o.clientId, clientSecret: o.clientSecret }),
      }),
    );
    if (!r.ok) throw new Error(`Pluggy /auth respondeu ${r.status}`);
    const { apiKey } = (await r.json()) as { apiKey?: string };
    if (!apiKey) throw new Error('Pluggy /auth não devolveu apiKey');
    chave = { valor: apiKey, ate: agora() + VALIDADE_MS };
    return apiKey;
  }

  async function get<T>(caminho: string): Promise<T> {
    const pedir = (k: string) => comTentativas((signal) => f(`${BASE}${caminho}`, { signal, headers: { 'X-API-KEY': k } }));
    let r = await pedir(await autenticar());
    if (r.status === 401) {
      // a apiKey guardada pode ter sido revogada antes do prazo: uma renovação só
      chave = null;
      r = await pedir(await autenticar());
    }
    if (!r.ok) throw new Error(`Pluggy GET ${caminho.split('?')[0]} respondeu ${r.status}`);
    return (await r.json()) as T;
  }

  async function post<T>(caminho: string, corpo: unknown): Promise<T> {
    // repetir um POST de connect_token só cria outro token descartável: a mesma política de tentativas vale
    const pedir = (k: string) =>
      comTentativas((signal) =>
        f(`${BASE}${caminho}`, {
          signal,
          method: 'POST',
          headers: { 'X-API-KEY': k, 'content-type': 'application/json' },
          body: JSON.stringify(corpo),
        }),
      );
    let r = await pedir(await autenticar());
    if (r.status === 401) {
      chave = null;
      r = await pedir(await autenticar());
    }
    if (!r.ok) throw new Error(`Pluggy POST ${caminho} respondeu ${r.status}`);
    return (await r.json()) as T;
  }

  async function enviar(metodo: 'PATCH' | 'DELETE', caminho: string): Promise<Response> {
    const pedir = (k: string) =>
      comTentativas((signal) => f(`${BASE}${caminho}`, { signal, method: metodo, headers: { 'X-API-KEY': k, 'content-type': 'application/json' }, body: metodo === 'PATCH' ? '{}' : undefined }));
    let r = await pedir(await autenticar());
    if (r.status === 401) {
      chave = null;
      r = await pedir(await autenticar());
    }
    return r;
  }

  return {
    /**
     * Token curto e descartável para o widget abrir no navegador — é a única
     * credencial do Pluggy que sai do servidor. `clientUserId` liga o item ao
     * dono no painel do Pluggy; com `itemId`, o widget abre para renovar o
     * consentimento daquele item.
     */
    async connectToken(clientUserId: string, itemId?: string): Promise<string> {
      const r = await post<{ accessToken?: string }>('/connect_token', {
        ...(itemId ? { itemId } : {}),
        // sem avoidDuplicates: com ele, reconectar o mesmo banco falha com
        // ITEM_USER_ALREADY_EXISTS sem devolver o item, e o app não teria como achá-lo.
        // Um item novo é religado aos mesmos cartões por casarConta (last4)
        options: { clientUserId },
      });
      if (!r.accessToken) throw new Error('Pluggy /connect_token não devolveu accessToken');
      return r.accessToken;
    },
    /** O item (conexão) no Pluggy; `null` se não existe — quem chama trata como 404. */
    async item(itemId: string): Promise<ItemPluggy | null> {
      try {
        return await get<ItemPluggy>(`/items/${encodeURIComponent(itemId)}`);
      } catch (e) {
        if (e instanceof Error && /respondeu 404/.test(e.message)) return null;
        throw e;
      }
    },
    async conta(accountId: string): Promise<ContaPluggy | null> {
      try {
        return await get<ContaPluggy>(`/accounts/${encodeURIComponent(accountId)}`);
      } catch (e) {
        if (e instanceof Error && /respondeu 404/.test(e.message)) return null;
        throw e;
      }
    },
    async contasDoItem(itemId: string): Promise<ContaPluggy[]> {
      const r = await get<{ results?: ContaPluggy[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
      return r.results ?? [];
    },
    async transacoes(accountId: string, de: string, ate: string): Promise<TransacaoPluggy[]> {
      // o /transactions por página responde 410 para aplicações novas: o v2 pagina por
      // cursor, e o `next` vem pronto como query string — usar como veio, sem montar o cursor
      const todas: TransacaoPluggy[] = [];
      let caminho: string | null = `/v2/transactions?${new URLSearchParams({ accountId, dateFrom: de, dateTo: ate })}`;
      // trava contra um `next` que nunca acaba: 200 páginas é muito além de 3 meses de cartão
      for (let i = 0; caminho && i < 200; i++) {
        const r: { results?: TransacaoPluggy[]; next?: string | null } = await get(caminho);
        todas.push(...(r.results ?? []));
        caminho = r.next ? `/v2/transactions${r.next.startsWith('?') ? r.next : `?${r.next}`}` : null;
      }
      return todas;
    },
    async faturas(accountId: string): Promise<FaturaPluggy[]> {
      const r = await get<{ results?: FaturaPluggy[] }>(`/bills?accountId=${encodeURIComponent(accountId)}`);
      return r.results ?? [];
    },
    /** Pede ao Pluggy para buscar no banco de novo, com as credenciais guardadas. */
    async atualizarItem(itemId: string): Promise<ItemPluggy> {
      const r = await enviar('PATCH', `/items/${encodeURIComponent(itemId)}`);
      if (!r.ok) throw new Error(`Pluggy PATCH /items respondeu ${r.status}`);
      return (await r.json()) as ItemPluggy;
    },
    /** Revoga o item no Pluggy. 404 = já não existe, e o efeito desejado está feito. */
    async apagarItem(itemId: string): Promise<void> {
      const r = await enviar('DELETE', `/items/${encodeURIComponent(itemId)}`);
      if (!r.ok && r.status !== 404) throw new Error(`Pluggy DELETE /items respondeu ${r.status}`);
    },
  };
}

export type ClientePluggy = ReturnType<typeof criarClientePluggy>;
