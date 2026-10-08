/**
 * De quem é o pedido de login. Puro: o teste importa.
 *
 * O X-Forwarded-For é do cliente até um proxy de confiança reescrevê-lo: lido
 * sem essa garantia, cada tentativa vem de um "IP" novo e a espera nunca chega
 * (auditoria 4.3, A-07). Sem fonte confiável, todo pedido cai num balde só —
 * mais lento para o dono num ataque, mas forjar cabeçalho não ajuda.
 */

export const SEM_IP = 'sem-ip';

type Cabecalhos = { get(nome: string): string | null };

export function ipDaRequisicao(h: Cabecalhos, o: { vercel: boolean; ipHeader?: string }): string {
  // a borda da Vercel escreve o x-real-ip; o que o cliente mandou não passa
  if (o.vercel) return h.get('x-real-ip')?.trim() || SEM_IP;
  // o proxy de confiança acrescenta à direita; o que está antes veio do cliente
  if (o.ipHeader) return h.get(o.ipHeader)?.split(',').map((s) => s.trim()).filter(Boolean).at(-1) || SEM_IP;
  return SEM_IP;
}
