import { paraQuery, rotuloMes, type Filtro } from './filtro';

/** "Nada em jul/26 nos cartões Itaú e Nubank" — diz qual filtro esvaziou a tela. */
export function fraseDoVazio(o: { mes: string | null; nomesCartoes: string[] }): string {
  const n = o.nomesCartoes;
  const cartoes =
    n.length === 0
      ? ''
      : n.length === 1
        ? ` no cartão ${n[0]}`
        : n.length <= 3
          ? ` nos cartões ${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`
          : ` em ${n.length} cartões`;
  if (o.mes) return `Nada em ${rotuloMes(o.mes)}${cartoes}`;
  return cartoes ? `Nada${cartoes}` : 'Nada por aqui';
}

/**
 * Query do link do vazio, mantendo o resto do filtro. Nunca vazia: sem nenhuma
 * chave na URL o middleware reaplica o filtro do cookie — justamente o que o
 * link quer trocar. `mes=` é lido como "o mais recente".
 */
export function queryDoVazio(f: Filtro, mudanca: 'todos-cartoes' | 'mes-recente'): string {
  const novo = mudanca === 'todos-cartoes' ? { ...f, cartoes: [] } : { ...f, mes: null };
  return paraQuery(novo) || 'mes=';
}

export type LinkVazio = { href: string; rotulo: string };

/**
 * `maisRecente` é o mês mais recente com dado; `mesNaTela`, o mês que a frase
 * nomeia. Voltar ao mais recente só ajuda se o mês fixado é outro e é ele que
 * esvaziou a tela: quando o cartão não tem o mês fixado, `mesAtual` já caiu no
 * mais recente do cartão, e o link levaria ao mesmo vazio.
 */
export function linksDoVazio(f: Filtro, caminho: string, maisRecente?: string, mesNaTela?: string | null): LinkVazio[] {
  const links: LinkVazio[] = [];
  if (f.cartoes.length) links.push({ href: `${caminho}?${queryDoVazio(f, 'todos-cartoes')}`, rotulo: 'Ver todos os cartões' });
  const mesFixo = f.mes && f.mes !== 'TODOS' && f.mes !== maisRecente;
  if (mesFixo && (mesNaTela === undefined || mesNaTela === f.mes)) {
    links.push({ href: `${caminho}?${queryDoVazio(f, 'mes-recente')}`, rotulo: 'Voltar ao mês mais recente' });
  }
  return links;
}

/** Os rótulos do filtro (apelido ou banco, com ••last4 quando há), na ordem do filtro. */
export function nomesDosCartoes(ids: string[], opcoes: { id: string; nome: string }[]): string[] {
  const nome = new Map(opcoes.map((c) => [c.id, c.nome]));
  return ids.flatMap((id) => (nome.has(id) ? [nome.get(id)!] : []));
}
