/**
 * Faturas de teste no formato do app antigo: 4 meses, 2 cartões, com tudo o
 * que muda uma conta — fixo, variável, parcela, encargo (pelo `tipo` e pela
 * categoria "Encargos do cartão"), estorno (negativo e positivo), pagamento,
 * categoria renomeada, apelido no lançamento e apelido aprendido (por chave
 * exata e só por `parecido`), nome que encurta de um mês para o outro, o
 * limiar de "fixo" dos dois lados (7% fixa, 9% não fixa), obra e vencimento
 * (para `cartoesInfo` e o "vence dia" do hero).
 * Valores inventados; nenhum dado real.
 */
import type { Fatura, Lanc } from '../src/lib/calculos/base';

export const APELIDOS: Record<string, string> = { 'PIX ADRIANA MARTINS': 'Adriana — faxina' };
export const NOMES_CARTAO: Record<string, string> = { n1111: 'Itaú - Azul' };

const l = (desc: string, val: number, cat: string, extra: Partial<Lanc> = {}): Lanc => ({
  desc,
  apelido: null,
  val,
  cat,
  parc: null,
  tipo: 'compra',
  ...extra,
});

export function faturasDeTeste(): Fatura[] {
  const meses = ['2026-03', '2026-04', '2026-05', '2026-06'];
  const out: Fatura[] = [];
  meses.forEach((m, i) => {
    const a: Lanc[] = [
      l('NETFLIX.COM', 55.9, 'Assinaturas & Apps'),
      l('ASSAI ATACADISTA 4471', [412.3, 530.1, 488.75, 601.2][i]!, i === 0 ? 'Mercado' : 'Mercado & Padaria'),
      l('IFOOD *RESTAURANTE', [120, 180.4, 95.5, 310][i]!, 'Restaurantes & Delivery'),
      l('GELADEIRA BRASTEMP', 300, 'Casa & Contas', { parc: `${i + 1}/10` }),
      l('PAGAMENTO FATURA', -2000, 'Outros', { tipo: 'pagamento' }),
      l('SMARTFIT ACADEMIA', [100, 100, 107, 93][i]!, 'Saúde & Farmácia'), // variação 7% → fixa
      l('ESCOLA INGLES', [200, 200, 218, 182][i]!, 'Educação'), // variação 9% → não fixa
    ];
    if (m === '2026-05') a.push(l('IFOOD *RESTAURANTE', -30, 'Restaurantes & Delivery', { tipo: 'estorno' }));
    if (m === '2026-04') a.push(l('IFOOD *RESTAURANTE', 25, 'Restaurantes & Delivery', { tipo: 'estorno' })); // estorno positivo
    if (m === '2026-06') {
      a.push(
        l('IOF COMPRA EXTERIOR', 12.3, 'Encargos do cartão', { tipo: 'encargo' }),
        l('TARIFA ANUIDADE', 40, 'Outros', { tipo: 'encargo' }), // encargo pelo tipo, categoria não é "Encargos do cartão"
        l('JUROS ROTATIVO', 18.5, 'Encargos do cartão'), // encargo pela categoria, tipo continua "compra"
        // mesma parcela lida duas vezes (ex.: OCR repetiu a linha) — parcelasInfo tem de descartar a repetida
        l('GELADEIRA BRASTEMP', 300, 'Casa & Contas', { parc: `${i + 1}/10` }),
      );
    }
    out.push({ id: `a-${m}`, mesRef: m, banco: 'Itaú', cartao: '1111', lancamentos: a, vencimento: `${m}-10` });

    // o cartão B começa um mês depois. A faxineira alterna entre o apelido no
    // lançamento e o apelido aprendido; em mai/26 (i===2) a descrição vem como
    // transferência, não como o texto da chave aprendida — só casa via
    // `parecido`, não pela chave exata. O SPOTIFY de abr/26 (i===1) tem um
    // sufixo que os outros meses não têm, para exercitar
    // `nome.length < r.desc.length` (o nome mais curto vence em `recorrentes`).
    if (m === '2026-03') return;
    const b: Lanc[] = [
      l(i === 1 ? 'SPOTIFY 99887766' : 'SPOTIFY', 21.9, 'Assinaturas & Apps'),
      l('UBER TRIP', [0, 88.2, 140.6, 61][i]!, 'Transporte'),
      i % 2
        ? l('PAG*ADRIANAMARTINS', 150, 'Serviços & Profissional', { apelido: 'Adriana — faxina' })
        : l(i === 2 ? 'TRANSFERENCIA PARA ADRIANA MARTINS' : 'PIX ADRIANA MARTINS 8821', 150, 'Serviços & Profissional'),
    ];
    if (m === '2026-06') {
      b.push(
        l('LEROY MERLIN', 800, 'Construção / Obras', { parc: '1/3' }),
        l('CIMENTO VOTORAN', 245.5, 'Construção / Obras'),
      );
    }
    out.push({ id: `b-${m}`, mesRef: m, banco: 'Nubank', cartao: '2222', lancamentos: b, vencimento: `${m}-05` });
  });
  return out;
}
