/**
 * O papel de um lançamento da conta corrente quando o dono o corrige (6.1).
 * Puro, sem `server-only`: o teste importa direto.
 */
import type { Papel } from './pluggy/mapear';

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
 * De que papel saem as outras linhas automáticas da mesma origem quando o dono
 * marca uma. Voltar a gasto não mexe nelas: o `fora` automático pode ter vindo
 * do mapeamento (pagamento de fatura, aplicação), não de uma regra.
 */
export function origensDoPapel(papel: Papel): Papel[] {
  if (papel === 'renda') return ['entrada'];
  if (papel === 'entrada') return ['renda'];
  if (papel === 'fora') return ['gasto', 'entrada'];
  return [];
}

export type LinhaEntrada = {
  id: string;
  data: string;
  valor: string;
  nome: string;
  conta: string;
  papel: Papel;
  pessoaFisica: boolean;
};

/** Os três blocos da tela Entradas, cada um do maior valor para o menor. */
export function blocosDeEntradas(linhas: readonly LinhaEntrada[]) {
  const porValor = (a: LinhaEntrada, b: LinhaEntrada) => Math.abs(Number(b.valor)) - Math.abs(Number(a.valor));
  const de = (p: Papel) => linhas.filter((l) => l.papel === p).sort(porValor);
  const renda = de('renda');
  return {
    renda,
    aMarcar: de('entrada'),
    fora: de('fora'),
    // crédito é gravado negativo; a renda aparece positiva
    totalRenda: Math.round(-renda.reduce((s, l) => s + Number(l.valor), 0) * 100) / 100,
  };
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
  return 'Volta a contar como gasto.';
}
