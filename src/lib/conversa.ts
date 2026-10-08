/**
 * Regras puras da conversa (7.3). Sem `server-only`: a rota, a página, o
 * componente e o teste importam daqui.
 */
export const LIMITE_PERGUNTA = 500;
export const LIMITE_RESPOSTA = 2000;

// as do app antigo (docs/legado/app-antigo.html:2847)
export const SUGESTOES = [
  'Onde eu mais gastei?',
  'O que dá para cortar?',
  'Quanto vou pagar de parcelas?',
  'Tem cobrança repetida ou suspeita?',
  'O que mudou vs o mês anterior?',
] as const;

export type FalaGuardada = { papel: 'pessoa' | 'ia'; texto: string; dadosHash: string };

export function validarPergunta(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= LIMITE_PERGUNTA ? t : null;
}

/**
 * Onde entra "Os números mudaram depois daqui": logo depois da última resposta
 * dada sobre números diferentes dos atuais. Pergunta não conta — quem fala de
 * números é a resposta.
 */
export function divisoriaEm(falas: readonly FalaGuardada[], dadosHash: string): number | null {
  for (let i = falas.length - 1; i >= 0; i--) {
    const f = falas[i]!;
    if (f.papel === 'ia' && f.dadosHash !== dadosHash) return i + 1;
  }
  return null;
}
