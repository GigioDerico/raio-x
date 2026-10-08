/**
 * Dinheiro: centavos onde se confere (lista), arredondado onde se compreende
 * (totais do painel). Os mesmos formatos do app antigo.
 */
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const moeda = (n: number) => brl.format(n || 0);
export const moeda0 = (n: number) => brl0.format(n || 0);
export function pct(n: number): string {
  // arredonda antes de olhar o sinal: senão -0.004 (que arredonda para 0)
  // virava "-0%" — diferente do legado, que mostrava "-0%" (só aparência)
  const r = Math.round(n * 100);
  return (r > 0 ? '+' : '') + r + '%';
}
