import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, verificar } from '@/lib/session';
import { COOKIE_FILTRO, completarComCookie } from '@/lib/filtro';

/**
 * Tudo é privado por padrão. A lista abaixo é o que fica de fora — e é curta
 * de propósito: rota nova nasce protegida sem ninguém precisar lembrar.
 */
const PUBLICAS = ['/login', '/api/auth/login', '/api/health'];

// Rotas com segredo próprio, que não usam cookie (cron e webhook, fatia 5).
// Caminho exato, não prefixo: rota nova debaixo de /api/cron/ não pode nascer sem sessão por engano.
const COM_SEGREDO_PROPRIO = ['/api/cron/sync', '/api/webhook/pluggy'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLICAS.includes(pathname)) return NextResponse.next();
  if (COM_SEGREDO_PROPRIO.includes(pathname)) return NextResponse.next();

  const sessao = await verificar(
    req.cookies.get(COOKIE)?.value,
    process.env.SESSION_SECRET ?? '',
  );
  if (sessao) {
    // página sem filtro na URL volta ao último recorte usado; API não, porque
    // uma chamada sem mês quer dizer "todos"
    if (!pathname.startsWith('/api/') && req.method === 'GET') {
      const nova = completarComCookie(req.nextUrl.search, req.cookies.get(COOKIE_FILTRO)?.value);
      if (nova) {
        const url = req.nextUrl.clone();
        url.search = nova;
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  // API responde 401; página manda para o login
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
