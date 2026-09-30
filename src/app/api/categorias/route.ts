import { CATEGORIAS } from '@/lib/categorias';
import { comUsuario } from '@/lib/rota';

export const runtime = 'nodejs';

/** A lista é fixa no código; a rota existe para a tela não duplicá-la. */
export async function GET() {
  return comUsuario(async () => ({ categorias: CATEGORIAS }));
}
