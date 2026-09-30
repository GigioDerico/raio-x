import 'server-only';
import { NextResponse } from 'next/server';
import { usuarioAtual } from './sessao-servidor';

/**
 * Casca comum das rotas: exige sessão, traduz falha de banco em 503 e nunca
 * deixa detalhe interno vazar na resposta.
 */
export async function comUsuario<T>(
  fn: (userId: string) => Promise<T>,
): Promise<NextResponse> {
  try {
    // a leitura do cookie fica DENTRO do try: um cookie estragado é um 401,
    // não um 500 com stack no log
    const userId = await usuarioAtual();
    if (!userId) return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });

    return NextResponse.json(await fn(userId));
  } catch (e) {
    if (e instanceof ErroDeUso) {
      return NextResponse.json({ erro: e.codigo, detalhe: e.message }, { status: e.status });
    }
    // o corpo do erro fica no log do servidor, não na resposta
    console.error('[rota]', e);
    return NextResponse.json({ erro: 'indisponivel' }, { status: 503 });
  }
}

/** Erro cuja mensagem PODE ser mostrada: veio do que o usuário mandou. */
export class ErroDeUso extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly status = 400,
  ) {
    super(mensagem);
    this.name = 'ErroDeUso';
  }
}

export async function corpoJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErroDeUso('json_invalido', 'corpo da requisição não é JSON');
  }
}

export function exigirTexto(v: unknown, campo: string, max = 200): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new ErroDeUso('campo_obrigatorio', `${campo} é obrigatório`);
  }
  return v.trim().slice(0, max);
}
