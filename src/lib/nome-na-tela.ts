/**
 * O nome que a lista mostra e a chave com que ele é comparado. Puro: o teste
 * importa, a tela também. A chave tem espelho em SQL (`chaveDoNomeSql`, em
 * txn-repo.ts) — mudou aqui, muda lá.
 */

type ComNome = { apelido: string | null; descLimpa: string | null; descOrigem: string };

// `||` e não `??`: apelido apagado vira string vazia e tem de passar adiante
export const nomeNaTela = (l: ComNome): string => l.apelido || l.descLimpa || l.descOrigem;

export const chaveDoNome = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function textoMudouJunto(n: number, nome: string | null, categoria: string): string | null {
  if (n <= 0) return null;
  const qtd = `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`;
  return nome ? `Também mudei ${qtd} de “${nome}” para ${categoria}.` : `Também mudei ${qtd} com os mesmos nomes para ${categoria}.`;
}

// o mesmo teto do apelido no PATCH: renomear grava no mesmo campo
export const LIMITE_NOME = 60;

export type NovoNome =
  | { ok: true; nome: string }
  | { ok: false; codigo: 'nome_vazio' | 'nome_longo' | 'nome_igual'; mensagem: string };

export function validarNovoNome(de: string, para: string): NovoNome {
  const nome = para.trim();
  if (!nome) return { ok: false, codigo: 'nome_vazio', mensagem: 'escreva o nome novo' };
  if (nome.length > LIMITE_NOME) return { ok: false, codigo: 'nome_longo', mensagem: `no máximo ${LIMITE_NOME} caracteres` };
  // pela chave e não pelo texto: "a  FERREIRA" já é o mesmo grupo, renomear não juntaria nada
  if (chaveDoNome(nome) === chaveDoNome(de)) return { ok: false, codigo: 'nome_igual', mensagem: 'o nome novo é o mesmo de agora' };
  return { ok: true, nome };
}

export type ContagemCategoria = { categoryId: number; n: number; ultima: string };

/**
 * Quem já tinha o nome de destino diz a categoria: a mais usada; no empate, a
 * usada por último, que é a decisão mais recente sua. `ultima` é 'YYYY-MM-DD',
 * então comparar texto é comparar data.
 */
export function categoriaHerdada(contagens: readonly ContagemCategoria[]): number | null {
  let melhor: ContagemCategoria | null = null;
  for (const c of contagens) {
    if (!melhor || c.n > melhor.n || (c.n === melhor.n && c.ultima > melhor.ultima)) melhor = c;
  }
  return melhor?.categoryId ?? null;
}

export function textoRenomeado(n: number, de: string, para: string, categoria: string | null): string {
  const qtd = n === 1 ? '1 lançamento' : `${n} lançamentos`;
  const verbo = n === 1 ? 'é' : 'são';
  return `${qtd} de “${de}” agora ${verbo} “${para}”${categoria ? ` (${categoria})` : ''}.`;
}
