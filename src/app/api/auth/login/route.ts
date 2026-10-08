import { NextResponse, type NextRequest } from 'next/server';
import { conferirSenha, esperaDoIp, limparFalhas, registrarFalhaGlobal, reservarTentativa, reservarVagaGlobal } from '@/lib/auth';
import { ipDaRequisicao } from '@/lib/ip';
import { obterOuCriarUsuario } from '@/lib/sessao-servidor';
import { COOKIE, DURACAO_S, assinar } from '@/lib/session';
import { env } from '@/env';

// scrypt precisa de node:crypto
export const runtime = 'nodejs';

/**
 * A espera por IP e o registro do usuário vivem no banco. Se o banco não
 * responde, o login não acontece — mas o erro devolvido diz isso, em vez de um
 * 500 genérico que manda você procurar bug no lugar errado.
 */
const bancoIndisponivel = () =>
  NextResponse.json({ erro: 'banco_indisponivel' }, { status: 503, headers: { 'Retry-After': '30' } });

export async function POST(req: NextRequest) {
  // o corpo antes da reserva: pedido sem senha não gasta tentativa
  let senha: unknown;
  try {
    senha = (await req.json())?.senha;
  } catch {
    senha = undefined;
  }
  if (typeof senha !== 'string' || senha.length === 0) {
    return NextResponse.json({ erro: 'senha_obrigatoria' }, { status: 400 });
  }

  const ip = ipDaRequisicao(req.headers, { vercel: env.VERCEL === '1', ipHeader: env.IP_HEADER });
  let faltam: number;
  try {
    // Sob o teto global há uma vaga por minuto para todos. Um IP que já está em
    // espera não pode gastá-la e ser barrado logo depois: tomaria a única vaga
    // do minuto de quem podia tentar. Por isso a leitura vem antes; a reserva
    // por IP, atômica, continua por último e fecha a corrida.
    faltam = (await esperaDoIp(ip)) || (await reservarVagaGlobal()) || (await reservarTentativa(ip));
  } catch {
    return bancoIndisponivel();
  }
  if (faltam > 0) {
    return NextResponse.json(
      { erro: 'muitas_tentativas', tenteEm: faltam },
      { status: 429, headers: { 'Retry-After': String(faltam) } },
    );
  }

  const ok = await conferirSenha(senha, env.APP_PASSWORD_HASH);
  if (!ok) {
    try {
      await registrarFalhaGlobal();
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
