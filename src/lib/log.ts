/**
 * O que de um erro vai ao log das rotas sem sessão (cron e webhook). Puro: o
 * teste importa.
 *
 * Só o nome e a primeira linha, cortada: o erro do Drizzle traz os parâmetros
 * da consulta nas linhas de baixo, e o log da Vercel não é lugar de dado.
 */
export function resumoDoErro(e: unknown): string {
  if (!(e instanceof Error)) return 'erro desconhecido';
  return `${e.name}: ${e.message.split('\n')[0]!.slice(0, 200)}`;
}
