/**
 * Frases da tela do plano, as do `renderPlano` do app antigo
 * (docs/legado/app-antigo.html:1417-1465), separadas para serem testadas.
 */
import { OBJETIVOS, RITMOS, type Metas, type Prefs, type ResultadoPlano } from './calculos/plano';
import { rotuloMes } from './filtro';
import { moeda0 } from './formato';

export function fraseSemPlano(mt: Metas): string {
  if (mt.impossivel)
    return 'Seus compromissos já passam do teto em algum dos próximos meses — o plano vai ter que mexer em fixos, não só no variável.';
  if (mt.precisa)
    return `Hoje o variável está em ${moeda0(mt.variavelHoje)}/mês e precisa chegar a ${moeda0(mt.meses[2]!.alvo)} em ${rotuloMes(mt.meses[2]!.mes)}. O plano distribui esse corte entre as categorias.`;
  return 'Seu padrão já cabe no teto. Ainda assim posso montar um plano para acelerar a poupança.';
}

export function subtituloPlano(r: ResultadoPlano): string {
  return `Variável de ${moeda0(r.variavelHoje)}/mês até caber em ${moeda0(r.meses[2]!.alvo)}, dentro do teto de ${moeda0(r.teto)}.`;
}

export function notasDoPlano(r: ResultadoPlano): string {
  const meta = r.metaPoupancaValor || 0;
  const parciais = r.meses.filter((m) => m.poupanca < meta - 1);
  let txt = '';
  if (parciais.length)
    txt += `Tudo cabe dentro da renda nos três meses. Nos ${parciais.length === 1 ? 'primeiros dias' : 'meses de transição'} você guarda menos do que a meta (${parciais.map((m) => `${rotuloMes(m.mes)} ${moeda0(Math.max(0, m.poupanca))}`).join(', ')}) e chega à meta cheia em ${rotuloMes(r.meses[2]!.mes)}.`;
  if (r.avisos.length)
    txt += ` ${r.avisos.map((a) => `Em ${rotuloMes(a.mes)} faltam ${moeda0(a.falta)} para fechar sem mexer no que você travou`).join('; ')} — aqui só reduzindo fixos, adiando parcelas ou liberando uma categoria travada.`;
  return txt.trim();
}

export function feitoPara(p: Prefs): string {
  return `Feito para: ${OBJETIVOS[p.objetivo] || ''} · ${(RITMOS[p.ritmo] || RITMOS.equilibrado!).rotulo.toLowerCase()}${p.intocaveis.length ? ` · sem mexer em ${p.intocaveis.join(', ')}` : ''}${p.evento ? ` · reservando espaço para ${p.evento}` : ''}`;
}

/** o terceiro mês do plano já ficou para trás: devolve o rótulo dele */
export function planoTerminou(r: ResultadoPlano, ultimoMes: string | null): string | null {
  const fim = r.meses[2]!.mes;
  return ultimoMes && ultimoMes > fim ? rotuloMes(fim) : null;
}
