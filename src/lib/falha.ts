/**
 * Falha → texto que diz o que aconteceu e o que fazer (guia, "Estados que
 * toda tela precisa ter"). Puro: o teste importa, os componentes também.
 */
export type Falha = { tipo: 'rede' | 'sessao' | 'uso' | 'servidor'; texto: string };

const TEXTOS = {
  rede: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  sessao: 'Sua sessão expirou. Entre de novo.',
  servidor: 'O servidor não respondeu. Tente de novo em instantes.',
} as const;

// status em que a rota escreve o `detalhe` para o usuário (ErroDeUso). 501 e 502
// também: só saem de ErroDeUso ("configure a chave", "a IA não respondeu direito");
// 429 só sai do limite de chamadas de IA. Erro não previsto vira 503, sem detalhe
const DE_USO = new Set([400, 404, 409, 415, 429, 501, 502]);

export function mensagemDeFalha(e: { status?: number; detalhe?: unknown; online?: boolean }): Falha {
  if (e.online === false) return { tipo: 'rede', texto: TEXTOS.rede };
  if (e.status === 401) return { tipo: 'sessao', texto: TEXTOS.sessao };
  if (e.status && DE_USO.has(e.status) && typeof e.detalhe === 'string' && e.detalhe.trim()) {
    return { tipo: 'uso', texto: e.detalhe.trim().slice(0, 200) };
  }
  return { tipo: 'servidor', texto: TEXTOS.servidor };
}

/** Resposta não-ok de uma rota do app, com o status e o `detalhe` que ela mandou. */
export class FalhaHttp extends Error {
  constructor(
    readonly status: number,
    readonly detalhe: unknown,
  ) {
    super(`falha ${status}`);
    this.name = 'FalhaHttp';
  }
}

/**
 * O pedido nem chegou ao servidor. Só `buscar` lança: TypeError solto pode ser
 * bug do próprio cliente, e chamá-lo de "sem conexão" mandaria conferir a
 * internet à toa.
 */
export class FalhaRede extends Error {
  constructor(causa?: unknown) {
    super('sem conexão', { cause: causa });
    this.name = 'FalhaRede';
  }
}

/** Erro do próprio cliente com a mensagem já escrita para o usuário. */
export class ErroLocal extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroLocal';
  }
}

/** `fetch` que separa "não chegou ao servidor" de qualquer outro erro. */
export async function buscar(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    // cancelamento é pedido do próprio cliente, não falta de conexão
    if ((e as { name?: string } | null)?.name === 'AbortError') throw e;
    throw new FalhaRede(e);
  }
}

export async function falhaDe(r: Response): Promise<FalhaHttp> {
  const d = (await r.json().catch(() => null)) as { detalhe?: unknown } | null;
  return new FalhaHttp(r.status, d?.detalhe);
}

/**
 * O que um `catch` pegou → Falha. Só `ErroLocal` mostra a própria mensagem;
 * qualquer outro erro (bug, resposta que não é JSON, chunk que não carregou)
 * tem texto de máquina e vira a falha genérica do servidor. `online` só pesa
 * quando o erro veio de um pedido: offline não explica um bug.
 */
export function textoDoErro(e: unknown, online = true): Falha {
  if (e instanceof FalhaHttp) return mensagemDeFalha({ status: e.status, detalhe: e.detalhe, online });
  if (e instanceof FalhaRede) return mensagemDeFalha({ online: false });
  if (e instanceof ErroLocal && e.message) return { tipo: 'uso', texto: e.message };
  return mensagemDeFalha({});
}

export function avisoIgnorados(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? '1 trecho não pôde ser lido e ficou de fora.' : `${n} trechos não puderam ser lidos e ficaram de fora.`;
}
