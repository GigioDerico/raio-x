import 'server-only';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appUser, userSetting } from '@/db/schema';
import { env } from '@/env';
import { COOKIE, verificar } from './session';

/**
 * O id do usuário SEMPRE sai daqui — nunca de parâmetro de rota, query ou
 * corpo. Mesmo com um usuário só: é o hábito que evita o furo no dia em que
 * houver dois.
 */
export async function usuarioAtual(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const sessao = await verificar(token, env.SESSION_SECRET);
  return sessao?.sub ?? null;
}

export async function exigirUsuario(): Promise<string> {
  const id = await usuarioAtual();
  if (!id) throw new Error('nao_autenticado');
  return id;
}

/** Este app é de uma pessoa: existe no máximo uma linha em app_user. */
export async function obterOuCriarUsuario(): Promise<string> {
  const [existente] = await db.select({ id: appUser.id }).from(appUser).limit(1);
  if (existente) return existente.id;

  const [criado] = await db.insert(appUser).values({}).returning({ id: appUser.id });
  if (!criado) throw new Error('nao_foi_possivel_criar_usuario');

  await db.insert(userSetting).values({ userId: criado.id }).onConflictDoNothing();
  return criado.id;
}

export async function configuracoes(userId: string) {
  const [linha] = await db.select().from(userSetting).where(eq(userSetting.userId, userId)).limit(1);
  return linha ?? null;
}
