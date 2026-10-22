import { NextRequest } from 'next/server';
import { registrarUso, reservarChamadaIA } from '@/lib/ia-uso-repo';
import { SemChaveIA, iaConfigurada, pedirJson, provedorAtivo } from '@/lib/openrouter';
import { ErroDeUso, comUsuario } from '@/lib/rota';

export const runtime = 'nodejs';

/**
 * Rota para testar se o provedor de IA configurado está respondendo corretamente.
 * Gasta uma reserva e uma chamada mínima (aprox. 15 tokens).
 */
export async function POST(_req: NextRequest) {
  return comUsuario(async (userId) => {
    if (!iaConfigurada()) throw new ErroDeUso('sem_chave', new SemChaveIA().message);

    const inicio = Date.now();
    const reserva = await reservarChamadaIA(userId, 'botao');
    const r = await pedirJson<{ ok: boolean }>('Responda SOMENTE o JSON: {"ok": true}', { reserva });
    const latenciaMs = Date.now() - inicio;

    await registrarUso(userId, 'diagnostico', r.modelo, r.uso);

    return {
      ok: true,
      provedor: provedorAtivo(),
      modelo: r.modelo,
      latenciaMs,
    };
  });
}
