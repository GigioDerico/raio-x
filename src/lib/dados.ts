/** Sem aparar nem ignorar caixa: é a última barreira antes de apagar tudo. */
export const FRASE_APAGAR = 'APAGAR TUDO';

export function confirmouApagar(texto: unknown): boolean {
  return texto === FRASE_APAGAR;
}
