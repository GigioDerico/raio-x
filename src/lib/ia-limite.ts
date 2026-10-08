/**
 * Limite de chamadas de IA por usuário (auditoria 4.3, A-10). Puro: o teste
 * importa. Quem conta e grava é `reservarChamadaIA`, em ia-uso-repo.ts.
 *
 * Os números protegem a ordem de grandeza do gasto, não um valor exato: uma
 * importação usa até 8 chamadas e um sync de 3 meses perto de 10.
 */

declare const marca: unique symbol;
/** Prova de que a chamada passou pela trava. Só `reservarChamadaIA` fabrica. */
export type ReservaIA = { readonly [marca]: true };

export const POR_10_MIN = 60;
export const POR_DIA = 400;

const DEZ_MIN_S = 10 * 60;
const DIA_S = 24 * 60 * 60;

/** Chamadas nas duas janelas e a mais antiga de cada uma. */
export type JanelaIA = { n10: number; antiga10: Date | null; n24: number; antiga24: Date | null };

/** Segundos até poder chamar de novo, ou null se pode agora. */
export function limiteDeIA(j: JanelaIA, agora: Date): number | null {
  // quando a mais antiga sai da janela, abre uma vaga. Data inválida dá NaN, e
  // `Math.max(1, NaN)` é NaN, que viraria "pode agora": na dúvida, a janela toda.
  const ate = (antiga: Date, janela: number) => {
    const s = Math.ceil((antiga.getTime() + janela * 1000 - agora.getTime()) / 1000);
    return Number.isNaN(s) ? janela : Math.max(1, s);
  };
  const esperas = [
    j.n10 >= POR_10_MIN && j.antiga10 ? ate(j.antiga10, DEZ_MIN_S) : 0,
    j.n24 >= POR_DIA && j.antiga24 ? ate(j.antiga24, DIA_S) : 0,
  ];
  const maior = Math.max(...esperas);
  return maior > 0 ? maior : null;
}

export function textoLimiteIA(segundos: number): string {
  const min = Math.max(1, Math.ceil(segundos / 60));
  if (min >= 120) return `Muitas chamadas de IA hoje; tente de novo em ${Math.ceil(min / 60)} horas`;
  return `Muitas chamadas de IA em pouco tempo; tente de novo em ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}
