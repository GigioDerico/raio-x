/**
 * Números da tela Previsto, as mesmas contas de `renderProjecao` e
 * `renderPrevisto` do app antigo (docs/legado/app-antigo.html, :1380-1399 e
 * :1482-1544), separadas do HTML para serem testadas. As frases ficam no
 * componente; aqui só o que decide qual frase e qual cor.
 */
import type { Contexto } from './base';
import { projecao, type Projecao } from './parcelas';
import { planoSaudavel, type ConfigRenda } from './plano';

export type Veredito = 'compromissos-acima' | 'cabe' | 'cortar';

export type ColunaRenda = {
  teto: number;
  compromissos: number;
  disponivel: number;
  poupanca: number;
  /** teto - total: folga quando o padrão cabe */
  sobra: number;
  /** o que sobra para as escolhas do mês, nunca negativo */
  paraEscolhas: number;
  corte: number;
  pctCorte: number;
  porSemana: number | null;
  porDia: number | null;
  larguras: { contratado: number; paraEscolhas: number; vazio: number };
  estado: 'ok' | 'alerta' | 'ruim';
  veredito: Veredito;
};

export type Previsto = Projecao & {
  dif: number | null;
  pctRenda: number | null;
  padrao: { parcelas: number; fixos: number; variavel: number; vazio: number };
  renda: ColunaRenda | null;
};

export function montarPrevisto(pj: Projecao | null, cfg: ConfigRenda): Previsto | null {
  if (!pj || !pj.total) return null;
  const pl = planoSaudavel(cfg, pj)!;
  // a mesma escala nas duas barras: é o que deixa ver o tamanho do ajuste
  const escala = Math.max(pj.total, pl.teto || 0, 1);
  const larg = (v: number) => (v / escala) * 100;

  let renda: ColunaRenda | null = null;
  if (pl.teto !== null) {
    const disp = pl.disponivel!;
    const paraEscolhas = Math.max(0, disp);
    const corte = pj.variavel - paraEscolhas;
    const estado = pj.total <= pl.teto ? 'ok' : pj.total <= pl.teto * 1.1 ? 'alerta' : 'ruim';
    renda = {
      teto: pl.teto,
      compromissos: pl.compromissos,
      disponivel: disp,
      poupanca: pl.poupanca!,
      sobra: pl.teto - pj.total,
      paraEscolhas,
      corte,
      pctCorte: pj.variavel ? corte / pj.variavel : 0,
      porSemana: disp > 0 ? disp / 4.3 : null,
      porDia: disp > 0 ? disp / 30 : null,
      larguras: {
        contratado: larg(Math.min(pl.compromissos, pl.teto)),
        paraEscolhas: larg(paraEscolhas),
        vazio: Math.max(0, larg(escala - pl.teto)),
      },
      estado: disp < 0 ? 'ruim' : estado,
      veredito: disp < 0 ? 'compromissos-acima' : pj.total <= pl.teto ? 'cabe' : 'cortar',
    };
  }

  return {
    ...pj,
    dif: pj.real !== null ? pj.real / pj.total - 1 : null,
    pctRenda: cfg.renda > 0 ? pj.total / cfg.renda : null,
    padrao: {
      parcelas: larg(pj.parcelas),
      fixos: larg(pj.fixos),
      variavel: larg(pj.variavel),
      vazio: Math.max(0, larg(escala - pj.total)),
    },
    renda,
  };
}

export function previsto(ctx: Contexto): Previsto | null {
  return montarPrevisto(projecao(ctx), ctx);
}
