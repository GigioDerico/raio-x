/**
 * A escada de espera do login. Puro: o teste importa, e `auth.ts` (que é
 * server-only) interpola as constantes no SQL que reserva a tentativa.
 */

export const LIVRES = 3; // tentativas antes de começar a esperar
export const TETO_S = 15 * 60;

// teto global suave (auditoria 4.3, A-07): passou de tantas falhas na última
// hora, somando todos os IPs, passa uma tentativa por VAGA_GLOBAL_S — mais
// lento durante um ataque, nunca trancado de vez
export const FALHAS_GLOBAIS_HORA = 30;
export const VAGA_GLOBAL_S = 60;

/** Espera depois da tentativa número `n` (o SQL de `reservarTentativa` faz a mesma conta). */
export function esperaSegundos(n: number): number {
  if (n <= LIVRES) return 0;
  return Math.min(2 ** (n - LIVRES), TETO_S);
}
