import { comUsuario } from '@/lib/rota';
import { nomesNaTela } from '@/lib/txn-repo';

export const runtime = 'nodejs';

export async function GET() {
  return comUsuario(async (userId) => ({ nomes: await nomesNaTela(userId) }));
}
