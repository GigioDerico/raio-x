import { NextResponse, type NextRequest } from 'next/server';
import { bloqueioRestante, conferirSenha, limparFalhas, registrarFalha } from '@/lib/auth';
import { obterOuCriarUsuario } from '@/lib/sessao-servidor';
import { COOKIE, DURACAO_S, assinar } from '@/lib/session';
import { env } from '@/env';

// scrypt precisa de node:crypto
export const runtime = 'nodejs';

function ipDaRequisicao(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  return xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'desconhecido';
}

/**
 * A espera por IP e o registro do usuário vivem no banco. Se o banco não
 * responde, o login não acontece — mas o erro devolvido diz isso, em vez de um
 * 500 genérico que manda você procurar bug no lugar errado.
 */
const bancoIndisponivel = () =>
  NextResponse.json({ erro: 'banco_indisponivel' }, { status: 503, headers: { 'Retry-After': '30' } });

export async function POST(req: NextRequest) {
  const ip = ipDaRequisicao(req);

  let faltam: number;
  try {
    faltam = await bloqueioRestante(ip);
  } catch {
    return bancoIndisponivel();
  }
  if (faltam > 0) {
    return NextResponse.json(
      { erro: 'muitas_tentativas', tenteEm: faltam },
      { status: 429, headers: { 'Retry-After': String(faltam) } },
    );
  }

  let senha: unknown;
  try {
    senha = (await req.json())?.senha;
  } catch {
    senha = undefined;
  }
  if (typeof senha !== 'string' || senha.length === 0) {
    return NextResponse.json({ erro: 'senha_obrigatoria' }, { status: 400 });
  }

  const ok = await conferirSenha(senha, env.APP_PASSWORD_HASH);
  if (!ok) {
    try {
      await registrarFalha(ip);
    } catch {
      // a tentativa falhou de todo jeito; não deixar o registro virar 500
    }
    // mensagem genérica de propósito: não conta o que errou
    return NextResponse.json({ erro: 'credencial_invalida' }, { status: 401 });
  }

  let userId: string;
  try {
    await limparFalhas(ip);
    userId = await obterOuCriarUsuario();
  } catch {
    return bancoIndisponivel();
  }
  const exp = Math.floor(Date.now() / 1000) + DURACAO_S;
  const token = await assinar({ sub: userId, exp }, env.SESSION_SECRET);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_S,
  });
  return res;
}
