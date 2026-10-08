/**
 * Decide o que fazer com cada lançamento que veio do Pluggy (plano técnico,
 * seção "Deduplicação"; regras revistas em 03/10/2026 na spec da 4.0). Puro:
 * recebe o que já está gravado e devolve ações; quem grava é sync-repo.ts.
 * Assim a regra inteira é testável sem banco.
 */
import { chaveDedupe, comOrdinais } from '../dedupe';
import { JANELA_DIAS, LIMIAR_PARECIDO, mesmoEstabelecimento, palavrasUteis, parecido } from '../descricao';
import type { Recebido } from './mapear';

export type Existente = {
  id: string;
  data: string;
  valor: number;
  descNorm: string;
  fonte: 'pluggy' | 'pdf' | 'manual';
  pluggyTxnId: string | null;
  dedupeKey: string;
  excluido: boolean;
  tipo: string;
  pendente: boolean;
  parcelaN: number | null;
  statementId: string | null;
  installmentId: string | null;
  // PDF que o dono ligou a uma compra do Pluggy pelo "É este" (4.2b)
  duplicadoDe: string | null;
  pessoaFisica: boolean;
};

export type RecebidoComOrdinal = Recebido & { ordinal: number };

export type Acao =
  | { tipo: 'atualizar'; existenteId: string; recebido: RecebidoComOrdinal }
  | { tipo: 'promover'; existenteId: string; recebido: RecebidoComOrdinal }
  | { tipo: 'ignorar'; existenteId: string; recebido: RecebidoComOrdinal }
  | { tipo: 'inserir'; recebido: RecebidoComOrdinal; dedupeKey: string; suspeitoDuplicado: boolean };

const centavos = (v: number) => Math.round(Math.abs(v) * 100);
const diasEntre = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

// parcelas da mesma compra têm a mesma data e o mesmo valor: só o número separa
const parcelaConflita = (e: Existente, r: Recebido) =>
  e.parcelaN !== null && r.parcela !== null && e.parcelaN !== r.parcela.n;

// o PDF guarda o nome limpo pela IA ("iFood") e a API o texto do extrato
// ("IFOOD *RESTAURANTE SAO PAULO BR"): uma palavra de verdade em comum já basta
function textoRelacionado(a: string, b: string): boolean {
  if (parecido(a, b) >= LIMIAR_PARECIDO || mesmoEstabelecimento(a, b)) return true;
  const B = new Set(palavrasUteis(b));
  return palavrasUteis(a).some((p) => B.has(p));
}

export function planejarSync(
  accountId: string,
  existentes: readonly Existente[],
  recebidos: readonly Recebido[],
  statementDoBill: (billId: string | null) => string | null,
): Acao[] {
  // a paginação do Pluggy pode repetir item; dois iguais virariam dois inserts
  // com o mesmo pluggy_txn_id e a `unique` derrubaria o lote
  const vistos = new Set<string>();
  const lote = comOrdinais(
    recebidos.filter((r) => {
      if (vistos.has(r.pluggyTxnId)) return false;
      vistos.add(r.pluggyTxnId);
      return true;
    }),
  );

  const porPluggy = new Map(existentes.filter((e) => e.pluggyTxnId).map((e) => [e.pluggyTxnId!, e]));
  const porChave = new Map(existentes.map((e) => [e.dedupeKey, e]));
  const chavesTomadas = new Set(existentes.map((e) => e.dedupeKey));
  // um existente casa com um recebido só: sem isso, dois lançamentos do Pluggy
  // promoveriam a mesma linha do PDF e um deles sumiria. O PDF ligado pelo "É
  // este" já é a compra do Pluggy a que aponta: casar com ele (chave, parcela ou
  // aproximado) ignoraria em silêncio outra compra de mesmo valor e data vizinha
  const usados = new Set<string>(existentes.filter((e) => e.duplicadoDe).map((e) => e.id));

  const casou = (e: Existente, r: RecebidoComOrdinal, senaoExcluido: 'atualizar' | 'promover'): Acao => {
    usados.add(e.id);
    // o que o dono apagou não volta (regra 6)
    if (e.excluido) return { tipo: 'ignorar', existenteId: e.id, recebido: r };
    return { tipo: senaoExcluido, existenteId: e.id, recebido: r };
  };

  // parcelas da mesma compra chegam em syncs de meses diferentes com a mesma
  // data da compra: o ordinal do lote recomeça em 0 e a chave colidiria com a
  // do mês anterior, estourando a `unique(user_id, dedupe_key)`
  const inserir = (r: RecebidoComOrdinal, suspeitoDuplicado: boolean): Acao => {
    let ordinal = r.ordinal;
    let chave = chaveDedupe(accountId, r.data, r.valor, r.descNorm, ordinal);
    while (chavesTomadas.has(chave)) chave = chaveDedupe(accountId, r.data, r.valor, r.descNorm, ++ordinal);
    chavesTomadas.add(chave);
    return { tipo: 'inserir', recebido: { ...r, ordinal }, dedupeKey: chave, suspeitoDuplicado };
  };

  // passada 1, antes de qualquer outra regra: se a API devolve [B, A], B não
  // pode tomar pela chave a linha que já é de A
  const acoes: Array<Acao | null> = lote.map((r) => {
    const mesmoId = porPluggy.get(r.pluggyTxnId);
    return mesmoId && !usados.has(mesmoId.id) ? casou(mesmoId, r, 'atualizar') : null;
  });

  // passada 2, casamentos exatos: parcela pela fatura e chave natural
  const exato = (r: RecebidoComOrdinal): Acao | null => {
    // a fatura diz de que mês é a parcela; data e valor são iguais em todas
    const statementId = r.parcela ? statementDoBill(r.billId) : null;
    if (r.parcela && statementId) {
      const n = r.parcela.n;
      const cand = existentes.filter(
        (e) =>
          !usados.has(e.id) &&
          !e.pluggyTxnId &&
          e.parcelaN === n &&
          e.statementId === statementId &&
          centavos(e.valor) === centavos(r.valor),
      );
      if (cand.length === 1) return casou(cand[0]!, r, 'promover');
      if (cand.length > 1) return inserir(r, true);
    }

    const mesmaChave = porChave.get(chaveDedupe(accountId, r.data, r.valor, r.descNorm, r.ordinal));
    if (mesmaChave && !usados.has(mesmaChave.id) && !parcelaConflita(mesmaChave, r))
      return casou(mesmaChave, r, mesmaChave.fonte === 'pdf' ? 'promover' : 'atualizar');
    return null;
  };
  lote.forEach((r, i) => {
    acoes[i] ??= exato(r);
  });

  // a fatura em PDF traz a data da compra e o nome limpo; a API pode trazer
  // outro dia e o texto bruto do extrato. Valor e data mandam; o texto só
  // desempata. Fatura conhecida dos dois lados e diferente é outra compra
  const elegivel = (e: Existente, r: Recebido) => {
    const fatura = statementDoBill(r.billId);
    return (
      !usados.has(e.id) &&
      e.fonte === 'pdf' &&
      !e.pluggyTxnId &&
      centavos(e.valor) === centavos(r.valor) &&
      diasEntre(e.data, r.data) <= JANELA_DIAS &&
      !parcelaConflita(e, r) &&
      !(e.statementId !== null && fatura !== null && e.statementId !== fatura)
    );
  };
  const maisPerto = (cand: Existente[], r: Recebido): Existente | null => {
    const d = cand.map((e) => diasEntre(e.data, r.data));
    const min = Math.min(...d);
    return d.filter((x) => x === min).length === 1 ? cand[d.indexOf(min)]! : null;
  };
  // um empate de distância deixa a linha disputada: quem mais a quiser entra suspeito
  const disputadas = new Set<string>();

  // perto do fechamento, dois Uber de mesmo valor em dias vizinhos: o primeiro da
  // lista não pode levar a linha do PDF que é do outro dia. Os mais perto de uma
  // candidata escolhem primeiro, e só leva quem também é o mais perto dela
  const distancia = (r: Recebido) =>
    Math.min(...existentes.filter((e) => elegivel(e, r)).map((e) => diasEntre(e.data, r.data)));
  const ordem = lote
    .flatMap((r, i) => (acoes[i] ? [] : [{ i, d: distancia(r) }]))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .map(({ i }) => i);

  for (const i of ordem) {
    const r = lote[i]!;
    const cand = existentes.filter((e) => elegivel(e, r));
    if (!cand.length) {
      acoes[i] = inserir(r, false);
      continue;
    }
    const comTexto = cand.length === 1 ? cand : cand.filter((e) => textoRelacionado(e.descNorm, r.descNorm));
    const e = comTexto.length ? maisPerto(comTexto, r) : null;
    if (!e || disputadas.has(e.id)) {
      acoes[i] = inserir(r, true);
      continue;
    }
    const d = diasEntre(e.data, r.data);
    const rivais = ordem
      .filter((j) => j !== i && !acoes[j] && elegivel(e, lote[j]!))
      .map((j) => diasEntre(e.data, lote[j]!.data));
    if (rivais.some((x) => x < d)) acoes[i] = inserir(r, cand.length > 1);
    else if (rivais.some((x) => x === d)) {
      disputadas.add(e.id);
      acoes[i] = inserir(r, true);
    } else acoes[i] = casou(e, r, 'promover');
  }

  return acoes as Acao[];
}

export type CamposDoUpdate = {
  valor?: string;
  tipo?: 'pagamento' | 'parcela' | 'encargo';
  parcelaN?: number;
  pendente: boolean;
  pluggyTxnId?: string;
  fonte?: 'pluggy';
  pessoaFisica?: true;
};

/**
 * O que um `atualizar` ou `promover` pode mudar na linha. Apelido, categoria,
 * data, descrição e `dedupe_key` nunca: são do dono, ou são o que faz o PDF
 * daquele mês continuar colidindo.
 */
export function camposDaAcao(acao: Acao, existente: Existente | undefined): CamposDoUpdate {
  const r = acao.recebido;
  // linha postada não volta a pendente: o PDF ou um sync anterior já a viram
  // fechada, e um PENDING atrasado não desfaz isso
  const campos: CamposDoUpdate = { pendente: existente ? existente.pendente && r.pendente : r.pendente };
  // depois de postado, o valor fica o que o dono viu na fatura ou o que o banco
  // fechou; só o pendente ainda pode mudar
  if (existente?.pendente) campos.valor = r.valor.toFixed(2);
  // só "escolha" é classificação fraca o bastante para o Pluggy corrigir:
  // encargo parcelado, fixo, pagamento e parcela vieram do PDF ou do dono
  if (r.tipo !== 'escolha' && (!existente || existente.tipo === 'escolha')) campos.tipo = r.tipo;
  if (r.parcela) campos.parcelaN = r.parcela.n;
  // só sobe: a linha do PDF (que não sabe quem recebeu) ou um sync anterior sem
  // o paymentData podem tê-la gravado como não privada; o contrário não vale —
  // um sync que deixe de ver o CPF não devolve o nome à IA
  if (r.pessoaFisica && !existente?.pessoaFisica) campos.pessoaFisica = true;
  if (acao.tipo === 'promover') {
    campos.pluggyTxnId = r.pluggyTxnId;
    campos.fonte = 'pluggy';
  }
  return campos;
}
