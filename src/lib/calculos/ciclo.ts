/**
 * Comparação "dia contra dia" e projeção de fechamento da fatura aberta (fatia 4).
 * O painel agrupa pelo mês em que se paga, então o ponto de comparação é o dia
 * do ciclo (desde o fechamento anterior), não o dia do mês. Conta nova: o app
 * antigo nunca teve fatura aberta.
 */
import { addMonths, chaveCartao, gastos, totalFatura, type Contexto, type Fatura } from './base';

const DIA = 86_400_000;

/** 'YYYY-MM-DD' do dia de calendário em São Paulo — o servidor roda em UTC e, à noite, já seria amanhã. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const somaDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);

/** Dia seguinte ao fechamento da fatura anterior; sem fechamento, o vencimento menos 7 (a mesma regra da 4.2a). */
export function inicioDoCiclo(anterior: Fatura | undefined): string | null {
  if (!anterior) return null;
  const corte = anterior.fechamento ?? (anterior.vencimento ? somaDias(anterior.vencimento, -7) : null);
  return corte ? somaDias(corte, 1) : null;
}

/** Gasto da fatura até `limite`; lançamento sem data conta (parcela antiga conta nos dois ciclos, o que é justo). */
export function ateDia(f: Fatura, limite: string): number {
  return gastos(f).reduce((s, l) => s + (!l.data || l.data <= limite ? +l.val || 0 : 0), 0);
}

/**
 * Uma fatura por cartão e mês, em ordem de mês. O Pluggy pode entregar duas
 * faturas no mesmo mês (4.2a); sem juntar, a segunda passaria por "ciclo
 * anterior" da primeira.
 */
function porCartao(ctx: Contexto): Map<string, Fatura[]> {
  const m = new Map<string, Map<string, Fatura>>();
  for (const f of ctx.faturas) {
    const k = chaveCartao(f);
    const meses = m.get(k) ?? new Map<string, Fatura>();
    const j = meses.get(f.mesRef);
    meses.set(
      f.mesRef,
      j
        ? {
            ...j,
            lancamentos: [...j.lancamentos, ...f.lancamentos],
            aberta: j.aberta || f.aberta,
            fechamento: j.fechamento ?? f.fechamento,
            vencimento: j.vencimento ?? f.vencimento,
          }
        : f,
    );
    m.set(k, meses);
  }
  const saida = new Map<string, Fatura[]>();
  for (const [k, meses] of m) saida.set(k, [...meses.values()].sort((a, b) => a.mesRef.localeCompare(b.mesRef)));
  return saida;
}

type PontoCartao = { chave: string; atual: number; anteriorMesmoPonto: number; dias: number; anteriores: Fatura[]; inicios: string[] };

/**
 * Um ponto por cartão com fatura aberta em `mes`. O cartão precisa das faturas
 * dos dois meses anteriores: a do mês anterior dá o início do ciclo atual, e a
 * de dois meses antes o início do ciclo anterior — sem isso não há "mesmo
 * ponto", e o cartão fica fora da comparação e da projeção. Um buraco de mês
 * esticaria o "ciclo" por dois meses.
 */
function pontos(ctx: Contexto, mes: string, hoje: string): PontoCartao[] {
  const saida: PontoCartao[] = [];
  for (const [chave, lista] of porCartao(ctx)) {
    const i = lista.findIndex((f) => f.mesRef === mes && f.aberta);
    if (i < 2 || lista[i - 1]!.mesRef !== addMonths(mes, -1) || lista[i - 2]!.mesRef !== addMonths(mes, -2)) continue;
    const inicio = inicioDoCiclo(lista[i - 1]);
    const inicioAnt = inicioDoCiclo(lista[i - 2]);
    if (!inicio || !inicioAnt) continue;
    const dias = Math.max(0, diasEntre(inicio, hoje));
    // fatura "aberta" velha ou esquecida: passado um ciclo inteiro, não há mesmo ponto no anterior
    if (dias > diasEntre(inicioAnt, inicio)) continue;
    // cada ciclo anterior precisa do próprio início para cortar no mesmo ponto
    const anteriores: Fatura[] = [];
    const inicios: string[] = [];
    for (let k = i - 1; k >= 1 && anteriores.length < 3; k--) {
      if (lista[k - 1]!.mesRef !== addMonths(lista[k]!.mesRef, -1)) break;
      const ini = inicioDoCiclo(lista[k - 1]);
      if (!ini) break;
      anteriores.push(lista[k]!);
      inicios.push(ini);
    }
    saida.push({ chave, atual: ateDia(lista[i]!, hoje), anteriorMesmoPonto: ateDia(lista[i - 1]!, somaDias(inicioAnt, dias)), dias, anteriores, inicios });
  }
  return saida;
}

/** `cartoes` são as `chaveCartao` comparadas: o resto do mês fica fora da comparação e entra na projeção como está. */
export function compararCiclo(
  ctx: Contexto,
  mes: string,
  hoje: string,
): { atual: number; anterior: number; dias: number | null; cartoes: string[] } | null {
  const p = pontos(ctx, mes, hoje);
  if (!p.length) return null;
  const dias = p.every((x) => x.dias === p[0]!.dias) ? p[0]!.dias : null;
  return {
    atual: p.reduce((s, x) => s + x.atual, 0),
    anterior: p.reduce((s, x) => s + x.anteriorMesmoPonto, 0),
    dias,
    cartoes: p.map((x) => x.chave),
  };
}

/** O que já entrou mais a média do que costumou entrar deste ponto até o fechamento nos últimos ciclos. */
export function projetarFechamento(ctx: Contexto, mes: string, hoje: string): number | null {
  const p = pontos(ctx, mes, hoje);
  if (!p.length) return null;
  let total = 0;
  for (const x of p) {
    const restos = x.anteriores.map((f, j) => totalFatura(f) - ateDia(f, somaDias(x.inicios[j]!, x.dias)));
    total += x.atual + (restos.length ? restos.reduce((a, b) => a + b, 0) / restos.length : 0);
  }
  return total;
}
