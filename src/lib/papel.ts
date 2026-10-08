/**
 * O papel de um lançamento da conta corrente quando o dono o corrige (6.1).
 * Puro, sem `server-only`: o teste importa direto.
 */
import { normalizarDescricao, pareceTransferenciaParaPessoa } from './descricao';
import type { Papel } from './pluggy/mapear';

/**
 * A chave da regra de papel: a descrição inteira, sem dígitos. Não as três
 * palavras de `chaveAprendizado` — ali "PAGAMENTO DE BOLETO" ou "PIX ENVIADO CP"
 * juntam emissores e pessoas diferentes, o que numa categoria é um palpite, mas
 * num "não conta" some com dinheiro dos totais. Os dígitos saem porque mudam
 * entre meses (código, data) no mesmo emissor.
 */
export function chavePapel(descNorm: string): string {
  return normalizarDescricao(descNorm).replace(/[0-9]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim();
}

/**
 * O prefixo separa a regra de papel da de categoria em `learned_label`: a chave
 * de `chaveAprendizado` nunca começa assim, então uma não pinta a outra.
 */
export const PREFIXO_PAPEL = 'papel:';

/**
 * A linha de `learned_label` que guarda o papel desta descrição; vazia se não há o que aprender.
 * Pix/TED/DOC não ensina: "Pix enviado" ou "Pix recebido <nome>" repete a mesma
 * descrição para destinos e origens diferentes, e a regra arrastaria todos.
 */
export function chaveDaRegraDePapel(descNorm: string): string {
  if (pareceTransferenciaParaPessoa(descNorm)) return '';
  const chave = chavePapel(descNorm);
  return chave ? PREFIXO_PAPEL + chave : '';
}

/**
 * Débito é dinheiro que sai: gasto ou não conta. Crédito é dinheiro que entra:
 * a marcar, renda ou não conta. Renda num débito somaria saída como entrada.
 */
export function papelAceito(valor: number, papel: Papel): boolean {
  if (papel === 'fora') return true;
  if (valor > 0) return papel === 'gasto';
  if (valor < 0) return papel === 'entrada' || papel === 'renda';
  return false;
}

/** O que a marcação ensina à origem: renda e "não conta" viram regra; voltar apaga a regra. */
export function regraDoPapel(papel: Papel): 'renda' | 'fora' | null {
  return papel === 'renda' || papel === 'fora' ? papel : null;
}

/**
 * De que papel saem as outras linhas automáticas da mesma descrição quando o
 * dono marca uma. Voltar também as leva: com a chave exata, as irmãs são a mesma
 * descrição, e o que a regra mudou nelas a regra desfeita devolve. O sinal
 * (`papelAceito`) separa o crédito do débito — um `fora` de crédito volta a
 * entrada, não a gasto.
 */
export function origensDoPapel(papel: Papel): Papel[] {
  if (papel === 'renda') return ['entrada'];
  if (papel === 'entrada') return ['renda', 'fora'];
  if (papel === 'fora') return ['gasto', 'entrada'];
  return ['fora'];
}

/**
 * O aviso depois de marcar: diz o que mudou junto e o que acontece com os
 * próximos. Sem aprender (Pix para pessoa física), não promete os próximos.
 */
export function textoDoPapel(papel: Papel, outros: number, aprendeu = true): string {
  if (!aprendeu) {
    if (papel === 'renda') return 'Marcado como renda.';
    if (papel === 'fora') return 'Fora dos totais.';
    if (papel === 'entrada') return 'Desmarcado.';
    return 'Volta a contar como gasto.';
  }
  const junto = outros > 0 ? `, com mais ${outros} da mesma origem` : '';
  if (papel === 'renda') return outros > 0 ? `Marcado como renda${junto}. Os próximos já chegam marcados.` : 'Marcado como renda. Os próximos da mesma origem já chegam marcados.';
  if (papel === 'fora') return `Fora dos totais${junto}. Os próximos também ficam fora.`;
  if (papel === 'entrada') return `Desmarcado${junto}. Os próximos chegam para você marcar.`;
  return `Volta a contar como gasto${junto}.`;
}
