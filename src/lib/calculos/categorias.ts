/** Resumo das treze categorias para a tela de categorias. */
import { CATS, type Contexto } from './base';
import { baseCategoria, severidade, type Severidade } from './anomalias';
import { categoriasPorMes, lancsDoMes, mesAtual, porCategoria } from './meses';
import { pct } from '../formato';
import { rotuloMes, type Filtro, paraQuery } from '../filtro';

export type LinhaCategoria = {
  cat: string;
  valor: number;
  share: number;
  sev: Severidade;
  varTxt: string;
  largura: number;
};

export type ResumoCategorias = {
  mes: string | null;
  vazio: boolean;
  total: number;
  linhas: LinhaCategoria[];
};

export function resumoDasCategorias(ctx: Contexto): ResumoCategorias {
  const mes = mesAtual(ctx);
  const mapa = categoriasPorMes(ctx);
  const valores = mes ? mapa.get(mes) || porCategoria(ctx, mes) : porCategoria(ctx, null);
  const total = [...valores.values()].reduce((soma, valor) => soma + valor, 0);
  const maiorPositivo = Math.max(0, ...CATS.map((cat) => valores.get(cat) || 0));
  const linhas = CATS.map((cat) => {
    const valor = valores.get(cat) || 0;
    const base = mes ? baseCategoria(ctx, cat, mes, mapa) : null;
    const share = total ? valor / total : 0;
    const sev = base
      ? severidade(valor, base.media, share, cat)
      : { k: '' as const, g: '●', t: 'sem comparação' };
    const referencia = base ? (base.n >= 2 ? `média de ${base.n} meses` : `vs ${rotuloMes(base.ultimo)}`) : '';
    const varTxt = base && base.media > 0 ? `${pct(valor / base.media - 1)} · ${referencia}` : '';
    const largura = valor > 0 && maiorPositivo > 0 ? Math.max(0, Math.min(100, (valor / maiorPositivo) * 100)) : 0;
    return { cat, valor, share, sev, varTxt, largura };
  }).sort((a, b) => b.valor - a.valor);

  return { mes, vazio: lancsDoMes(ctx, mes).length === 0, total, linhas };
}

export function hrefDaCategoria(filtro: Filtro, mes: string | null, cat: string): string {
  const params = new URLSearchParams(paraQuery(filtro));
  params.set('cat', cat);
  params.set('mes', mes ?? 'TODOS');
  return `/lancamentos?${params.toString()}`;
}
