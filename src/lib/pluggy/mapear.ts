/**
 * Pluggy → modelo do app. Puro, sem `server-only`: o teste importa direto.
 *
 * Os tipos de entrada listam só o que é lido. O que o Pluggy entrega e o app
 * não pode guardar — nome e CPF do titular, dados do pagador, CNPJ do
 * estabelecimento — não aparece em nenhum tipo de saída (regra 5 do CLAUDE.md).
 * O saldo da conta corrente pode ser guardado (plano técnico, `account.saldo`);
 * quem o grava é `gravarConexao`, direto do `balance`.
 */
import { normalizarDescricao, pareceTransferenciaParaPessoa } from '../descricao';

export type ConectorPluggy = {
  id: number;
  name: string;
  primaryColor?: string | null;
  imageUrl?: string | null;
  health?: { status?: string | null } | null;
};

export type ItemPluggy = {
  id: string;
  status: string;
  clientUserId?: string | null;
  connector?: ConectorPluggy | null;
  error?: { code?: string | null; message?: string | null } | null;
  consentExpiresAt?: string | null;
};

export type ContaPluggy = {
  id: string;
  type: string;
  subtype?: string | null;
  number?: string | null;
  name?: string | null;
  marketingName?: string | null;
  balance?: number | null;
  owner?: string | null;
  taxNumber?: string | null;
  creditData?: { creditLimit?: number | null } | null;
  bankData?: { transferNumber?: string | null } | null;
};

export type TransacaoPluggy = {
  id?: string;
  description?: string | null;
  descriptionRaw?: string | null;
  amount?: number;
  date?: string;
  status?: string;
  type?: string;
  operationType?: string | null;
  category?: string | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    purchaseDate?: string | null;
    billId?: string | null;
  } | null;
  paymentData?: unknown;
  merchant?: unknown;
};

export type FaturaPluggy = { id: string; dueDate: string; billClosingDate?: string | null; totalAmount: number };

export type StatusConexao = 'ativa' | 'atualizando' | 'erro_login' | 'erro';
export type KindConta = 'cartao_credito' | 'conta_corrente' | 'conta_pagamento' | 'poupanca';

export type ContaMapeada = {
  pluggyAccountId: string;
  kind: KindConta;
  last4: string | null;
  nomeOrigem: string | null;
  limite: number | null;
};

export type Papel = 'gasto' | 'entrada' | 'renda' | 'fora';

export type Recebido = {
  pluggyTxnId: string;
  data: string;
  // a parcela traz em `data` a compra original; só a data do lançamento diz em que fatura ela cai
  dataLancamento: string;
  valor: number;
  descOrigem: string;
  descNorm: string;
  tipo: 'pagamento' | 'parcela' | 'encargo' | 'escolha';
  parcela: { n: number; total: number } | null;
  billId: string | null;
  pendente: boolean;
  // só a conta corrente preenche: no cartão tudo é gasto
  papel?: Papel;
  // conta e cartão: o de pessoa física não vai à IA
  pessoaFisica?: boolean;
};

export type FaturaMapeada = { pluggyBillId: string; mesRef: string; vencimento: string; fechamento: string | null; total: number };

export type ContaExistente = { id: string; kind: string; last4: string | null; pluggyAccountId: string | null };

export function statusDoItem(status: string): StatusConexao {
  if (status === 'UPDATED') return 'ativa';
  if (status === 'UPDATING') return 'atualizando';
  if (status === 'LOGIN_ERROR' || status === 'WAITING_USER_INPUT') return 'erro_login';
  return 'erro';
}

// Código COMPE → nome do banco. Pelo agregador (MeuPluggy) a instituição da
// conexão é o agregador, não o banco: sem isto a conta apareceria como
// "MeuPluggy conta". Só os bancos de varejo comuns; o resto fica sem nome.
const BANCOS: Record<string, string> = {
  '001': 'Banco do Brasil', '033': 'Santander', '077': 'Inter', '104': 'Caixa', '208': 'BTG',
  '212': 'Original', '237': 'Bradesco', '260': 'Nubank', '290': 'PagBank', '323': 'Mercado Pago',
  '336': 'C6', '341': 'Itaú', '380': 'PicPay', '422': 'Safra', '748': 'Sicredi', '756': 'Sicoob',
};

export function bancoDoCodigo(transferNumber: string | null | undefined): string | null {
  const codigo = /^\s*(\d{3})\b/.exec(transferNumber ?? '')?.[1];
  return codigo ? (BANCOS[codigo] ?? null) : null;
}

export function contaDoPluggy(c: ContaPluggy): ContaMapeada {
  const kind: KindConta =
    c.type === 'CREDIT' || c.subtype === 'CREDIT_CARD'
      ? 'cartao_credito'
      : c.subtype === 'CHECKING_ACCOUNT'
        ? 'conta_corrente'
        : c.subtype === 'SAVINGS_ACCOUNT'
          ? 'poupanca'
          : 'conta_pagamento';
  const digitos = String(c.number ?? '').replace(/\D/g, '');
  return {
    pluggyAccountId: c.id,
    kind,
    last4: digitos ? digitos.slice(-4) : null,
    // na conta, o `name` pode ser o nome do titular (regra 5); o banco sai do código COMPE
    nomeOrigem: kind === 'cartao_credito' ? c.marketingName || c.name || null : bancoDoCodigo(c.bankData?.transferNumber),
    limite: typeof c.creditData?.creditLimit === 'number' ? c.creditData.creditLimit : null,
  };
}

const diaSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// o Pluggy manda `date` em UTC; o mês da compra é decidido no fuso de quem gastou.
// Meia-noite UTC em ponto é data de calendário sem hora (a documentação traz
// "2020-06-08T00:00:00.000Z"): converter jogaria a compra para o dia anterior
function diaEmSaoPaulo(iso: string | undefined): string | null {
  if (!iso) return null;
  if (/T00:00:00(\.0+)?Z$/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : diaSP.format(d);
}

function diaValido(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
}

const ENCARGO = /\b(IOF|JUROS|MORA|MULTA|ANUIDADE|ENCARGOS?)\b/i;

export function lancamentoDoPluggy(t: TransacaoPluggy): Recebido | null {
  if (!t.id || typeof t.amount !== 'number' || !Number.isFinite(t.amount)) return null;
  const meta = t.creditCardMetadata ?? null;
  // o PDF registra a data da compra; usar a mesma é o que faz a chave natural colidir
  const data = meta?.purchaseDate ? meta.purchaseDate.slice(0, 10) : diaEmSaoPaulo(t.date);
  if (!data || !diaValido(data)) return null;
  const descOrigem = (t.descriptionRaw || t.description || '').trim();
  const parcela =
    meta?.installmentNumber && meta.totalInstallments && meta.totalInstallments > 1
      ? { n: meta.installmentNumber, total: meta.totalInstallments }
      : null;
  const valor = Math.round(t.amount * 100) / 100;
  // no sandbox real (MeuPluggy/Itaú) só "Pagamento recebido" veio com operationType; "PAGAMENTO
  // COM SALDO" e "PAGAMENTO DEBITO AUTOMATICO" chegaram como compra negativa e derrubavam os totais
  const pagamento =
    t.operationType === 'PAGAMENTO_FATURA' ||
    t.description === 'PAGAMENTO_FATURA' ||
    (valor < 0 && (t.category === 'Credit card payment' || /^pagamento\b/i.test(descOrigem)));
  // juros, IOF e afins são encargo, como na extração do PDF — o painel os separa do gasto escolhido
  const encargo = valor > 0 && ENCARGO.test(descOrigem);
  const lancado = diaEmSaoPaulo(t.date);
  return {
    pluggyTxnId: t.id,
    data,
    dataLancamento: lancado && diaValido(lancado) ? lancado : data,
    valor,
    descOrigem,
    descNorm: normalizarDescricao(descOrigem),
    tipo: pagamento ? 'pagamento' : encargo ? 'encargo' : parcela ? 'parcela' : 'escolha',
    parcela,
    billId: meta?.billId ?? null,
    pendente: t.status === 'PENDING',
    // Pix e TED pagos no cartão também levam o nome de alguém (decisão do dono, 6.0)
    pessoaFisica: ehPessoaFisica(t, valor, descOrigem),
  };
}

export function faturaDaBill(b: FaturaPluggy): FaturaMapeada {
  // vencimento e fechamento são datas de calendário: o dia vem do texto, sem conversão de fuso
  const vencimento = b.dueDate.slice(0, 10);
  return {
    pluggyBillId: b.id,
    mesRef: vencimento.slice(0, 7),
    vencimento,
    fechamento: b.billClosingDate ? b.billClosingDate.slice(0, 10) : null,
    total: b.totalAmount,
  };
}

/**
 * A `dedupe_key` inclui o `account_id`: se o cartão do Pluggy virasse conta
 * nova, nenhuma compra colidiria com o PDF e tudo entraria em dobro.
 *
 * O índice `account_chave (user_id, kind, coalesce(last4, institution_id))`
 * só admite um cartão por last4 por pessoa, então criar outro com o mesmo
 * last4 estouraria. E reconectar o banco gera um item novo, com
 * `pluggyAccountId` novo: o cartão com esse last4 é religado mesmo que já
 * esteja ligado a outro id do Pluggy, senão a reconexão travaria.
 */
export function casarConta(existentes: readonly ContaExistente[], c: ContaMapeada): { usar: string } | { criar: true } {
  const jaLigada = existentes.find((e) => e.pluggyAccountId === c.pluggyAccountId);
  if (jaLigada) return { usar: jaLigada.id };
  if (c.kind !== 'cartao_credito' || !c.last4) return { criar: true };
  const candidatas = existentes.filter((e) => e.kind === 'cartao_credito' && e.last4 === c.last4);
  // mais de uma não acontece com o índice; sem ele, não há como escolher
  return candidatas.length === 1 ? { usar: candidatas[0]!.id } : { criar: true };
}

/**
 * "Banco Itaú S.A." e "ITAÚ" viram "itau": é o que deixa o cartão do PDF e o
 * do Pluggy caírem na mesma instituição. "Nu Pagamentos" × "Nubank" não casam,
 * e tudo bem — juntar bancos diferentes por engano seria pior.
 */
export function normalizarNomeBanco(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bs\.?\s*a\.?(?=\s|$)/g, ' ')
    .replace(/\bbanco\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type InstituicaoExistente = { id: number; nome: string; pluggyConnectorId: number | null };
export type InstituicaoNova = { slug: string; nome: string; pluggyConnectorId: number; cor: string | null; logoUrl: string | null };

export function escolherInstituicao(
  existentes: readonly InstituicaoExistente[],
  c: ConectorPluggy,
): { usar: number } | { criar: InstituicaoNova } {
  const porConector = existentes.find((e) => e.pluggyConnectorId === c.id);
  if (porConector) return { usar: porConector.id };
  const nome = normalizarNomeBanco(c.name);
  const porNome = existentes.find((e) => normalizarNomeBanco(e.nome) === nome);
  if (porNome) return { usar: porNome.id };
  return { criar: { slug: `pluggy-${c.id}`, nome: c.name, pluggyConnectorId: c.id, cor: corDoConector(c), logoUrl: c.imageUrl ?? null } };
}

// o Pluggy manda a cor sem "#"; o CSS precisa dela
export function corDoConector(c: ConectorPluggy): string | null {
  return c.primaryColor ? (c.primaryColor.startsWith('#') ? c.primaryColor : `#${c.primaryColor}`) : null;
}

function mesSeguinte(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

function menosDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// um ciclo de cartão com folga: além disso a compra é de uma fatura que /bills não trouxe
const CICLO_MAXIMO_DIAS = 35;

/** O mesmo dia no mês seguinte, ou o último dia dele (31/jan → 28/fev). */
function mesmoDiaNoMesSeguinte(dia: string): string {
  const mes = mesSeguinte(dia.slice(0, 7));
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(Number(dia.slice(8, 10)), ultimo)).padStart(2, '0')}`;
}

/**
 * A fatura aberta não vem em /bills, e os lançamentos dela chegam sem billId —
 * sem isto cairiam no mês da compra, não no mês em que se paga. Compra depois
 * do fechamento da última fatura conhecida é da seguinte. Sem fechamento, o
 * corte é o vencimento menos 7 dias (o intervalo comum entre os dois).
 *
 * Mais de um ciclo depois do corte, a lista de faturas está incompleta: sem o
 * limite, meses de compras cairiam todos num mês só.
 */
export function mesDaFaturaAberta(faturas: readonly FaturaMapeada[], dataLancamento: string): { mesRef: string; vencimento: string } | null {
  if (!faturas.length) return null;
  const ultima = [...faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento)).at(-1)!;
  const corte = ultima.fechamento ?? menosDias(ultima.vencimento, 7);
  if (dataLancamento <= corte || dataLancamento > menosDias(corte, -CICLO_MAXIMO_DIAS)) return null;
  return { mesRef: mesSeguinte(ultima.mesRef), vencimento: mesmoDiaNoMesSeguinte(ultima.vencimento) };
}

/** Índice do recebido → fatura aberta em que ele cai. Quem já tem billId fica de fora. */
export function faturasAbertasDosRecebidos(
  faturas: readonly FaturaMapeada[],
  recebidos: readonly Recebido[],
): Map<number, { mesRef: string; vencimento: string }> {
  const saida = new Map<number, { mesRef: string; vencimento: string }>();
  recebidos.forEach((r, i) => {
    if (r.billId) return;
    const aberta = mesDaFaturaAberta(faturas, r.dataLancamento);
    if (aberta) saida.set(i, aberta);
  });
  return saida;
}

/**
 * Duas faturas com vencimento no mesmo mês (31/mar e 1º/mar) disputariam o mesmo
 * mes_ref e alternariam total e vencimento a cada sync: a que vence depois vai
 * para o mês seguinte, em cadeia.
 */
export function mesesDasFaturas(faturas: readonly FaturaMapeada[]): FaturaMapeada[] {
  const ordenadas = [...faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const saida: FaturaMapeada[] = [];
  for (const f of ordenadas) {
    const anterior = saida.at(-1);
    saida.push(anterior && f.mesRef <= anterior.mesRef ? { ...f, mesRef: mesSeguinte(anterior.mesRef) } : f);
  }
  return saida;
}

// ---- conta corrente (6.0) ---------------------------------------------------

type Documento = { name?: string | null; documentNumber?: { type?: string | null; value?: string | null } | null } | null | undefined;
type DadosPagamento = { payer?: Documento; receiver?: Documento } | null;

const dadosPagamento = (t: TransacaoPluggy): DadosPagamento =>
  t.paymentData && typeof t.paymentData === 'object' ? (t.paymentData as DadosPagamento) : null;
const digitos = (d: Documento) => String(d?.documentNumber?.value ?? '').replace(/\D/g, '');
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

const ENCARGO_CONTA = /\b(IOF|JUROS|MORA|MULTA|TARIFA|ENCARGOS?)\b/i;
// "FATURA" sozinha não basta: luz, telefone e internet também mandam fatura
// ("DEB AUTOMATICO FATURA VIVO"), e seriam tirados do gasto. Só conta como
// pagamento de cartão quando o cartão aparece junto de pagamento ou de fatura.
// Lido sobre a descrição sem acento e em maiúsculas (`semAcento`).
const PAGOU = String.raw`(?:PG|PGTO|PAGTO|PAG|PAGAMENTO|DEB(?:ITO)?\.?\s+AUT\w*)`;
const PAGAMENTO_DE_FATURA = new RegExp(
  String.raw`\b${PAGOU}\b.*\bCARTAO\b|\bFATURA\b.*\bCARTAO\b|\bCARTAO\b.*\bFATURA\b|\bCARTAO\s+(?:DE\s+)?CRED`,
);
// a categoria do Pluggy vem com sufixo ("Same person transfer - PIX")
const CATEGORIA_MESMA_PESSOA = /^same person transfer\b/i;
// sem paymentData, é o que o banco escreve quando o dinheiro vai para outra conta sua
const MESMA_PESSOA = /\bTRANSF\w*\s+ENTRE\s+CONTAS\b|\bMESMA\s+TITULARIDADE\b/;
const INVESTIMENTO = /\b(APLICA[CÇ][AÃ]O|APLIC|RESGATE)\b/i;
const CATEGORIA_INVESTIMENTO = /^(investments?|fixed income|variable income|mutual funds|pension)\b/i;
// "Transfer - PIX", "Transfers"... A transferência própria começa por "Same
// person" e não casa aqui
const CATEGORIA_TRANSFERENCIA = /^transfer/i;
// Pix pago com o cartão de crédito: o banco credita o valor na conta ("Crédito
// liberado para Pix") e logo debita o Pix ("Pix enviado com cartão"). O gasto
// de verdade é a compra na fatura do cartão; as duas linhas da conta só
// passam o dinheiro adiante e, contadas, dobrariam o gasto
const PIX_NO_CREDITO = /\bPIX\b.*\bCOM\s+CARTAO\b|\bCREDITO\s+LIBERADO\s+PARA\s+PIX\b/;

/**
 * Pagamento de fatura, transferência entre contas do mesmo titular, aplicação e
 * resgate não são gasto nem renda: o gasto já está no cartão ou o dinheiro só
 * mudou de lugar. O documento do pagador e do recebedor só é comparado aqui, na
 * memória: nenhum dos dois sai desta função (regra 5).
 */
export function papelDaConta(t: TransacaoPluggy, valor: number, descOrigem: string): Papel {
  const desc = semAcento(descOrigem);
  if (PIX_NO_CREDITO.test(desc)) return 'fora';
  if (t.operationType === 'PAGAMENTO_FATURA' || t.category === 'Credit card payment' || PAGAMENTO_DE_FATURA.test(desc)) return 'fora';
  const d = dadosPagamento(t);
  const pagador = digitos(d?.payer);
  if (
    (t.category && CATEGORIA_MESMA_PESSOA.test(t.category)) ||
    MESMA_PESSOA.test(desc) ||
    (pagador !== '' && pagador === digitos(d?.receiver))
  )
    return 'fora';
  if ((t.category && CATEGORIA_INVESTIMENTO.test(t.category)) || INVESTIMENTO.test(descOrigem)) return 'fora';
  return valor > 0 ? 'gasto' : 'entrada';
}

/**
 * A outra ponta é pessoa física? No débito é quem recebe; no crédito, quem paga.
 * Sem documento, Pix e TED contam como pessoa física: a descrição deles traz o
 * nome de alguém, e o nome não pode ir à IA (regra 4). A categoria de
 * transferência do Pluggy também: há banco que escreve só o nome, sem "PIX".
 */
export function ehPessoaFisica(t: TransacaoPluggy, valor: number, descOrigem: string): boolean {
  const d = dadosPagamento(t);
  const outro = valor > 0 ? d?.receiver : d?.payer;
  const tipo = outro?.documentNumber?.type;
  const n = digitos(outro).length;
  if (tipo === 'CPF' || n === 11) return true;
  if (tipo === 'CNPJ' || n === 14) return false;
  return pareceTransferenciaParaPessoa(descOrigem) || (!!t.category && CATEGORIA_TRANSFERENCIA.test(t.category));
}

/**
 * Tira um nome da descrição sem olhar acento, caixa nem espaço repetido. A
 * busca é na versão sem acento, mas o corte é na original: o resto da
 * descrição fica como o banco escreveu.
 */
function semNome(desc: string, nome: string | null | undefined): string {
  const partes = semAcento(nome ?? '').split(/\s+/).filter(Boolean);
  if (!partes.length) return desc;
  // cada caractere da original vira um ou mais na comparável; `origem` guarda de onde veio
  let comparavel = '';
  const origem: number[] = [];
  [...desc].reduce((pos, c) => {
    const base = semAcento(c);
    comparavel += base;
    for (let k = 0; k < base.length; k++) origem.push(pos);
    return pos + c.length;
  }, 0);
  origem.push(desc.length);
  const escapado = partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const re = new RegExp(String.raw`(?<![A-Z0-9])${escapado}(?![A-Z0-9])`, 'g');
  let saida = '';
  let ate = 0;
  for (const m of comparavel.matchAll(re)) {
    saida += desc.slice(ate, origem[m.index!]);
    ate = origem[m.index! + m[0].length]!;
  }
  // sem o nome na descrição, ela fica exatamente como o banco escreveu
  return ate === 0 ? desc : (saida + desc.slice(ate)).replace(/\s+/g, ' ').trim();
}

/**
 * O nome do titular não é gravado (regra 5), mas o banco às vezes o escreve na
 * descrição ("PIX ENVIADO FULANO ..." de uma conta sua para outra). O
 * `paymentData` só existe aqui, então é aqui que ele sai: o pagador de um
 * débito e o recebedor de um crédito são o titular, e quem tem o mesmo
 * documento do pagador e do recebedor também.
 */
function descricaoSemTitular(t: TransacaoPluggy, valor: number, descOrigem: string): string {
  const d = dadosPagamento(t);
  const nomes = [valor > 0 ? d?.payer?.name : d?.receiver?.name];
  const pagador = digitos(d?.payer);
  if (pagador !== '' && pagador === digitos(d?.receiver)) nomes.push(d?.payer?.name, d?.receiver?.name);
  const limpa = nomes.reduce<string>((s, n) => semNome(s, n), descOrigem);
  // só o nome na descrição: o que sobra é o tipo da operação, nunca o nome
  return limpa || (descOrigem ? 'TRANSFERENCIA' : '');
}

/**
 * Pluggy → modelo do app, para conta corrente. Mesma convenção do cartão:
 * positivo é dinheiro que sai. O `type` manda sobre o sinal do `amount`, que
 * na conta vem negativo no débito; sem `type`, o sinal invertido.
 */
export function lancamentoDaConta(t: TransacaoPluggy): Recebido | null {
  if (!t.id || typeof t.amount !== 'number' || !Number.isFinite(t.amount)) return null;
  const data = diaEmSaoPaulo(t.date);
  if (!data || !diaValido(data)) return null;
  const centavos = Math.round(t.amount * 100) / 100;
  const valor = t.type === 'DEBIT' ? Math.abs(centavos) : t.type === 'CREDIT' ? -Math.abs(centavos) : -centavos;
  const descOrigem = descricaoSemTitular(t, valor, (t.descriptionRaw || t.description || '').trim());
  return {
    pluggyTxnId: t.id,
    data,
    dataLancamento: data,
    valor,
    descOrigem,
    descNorm: normalizarDescricao(descOrigem),
    tipo: valor > 0 && ENCARGO_CONTA.test(descOrigem) ? 'encargo' : 'escolha',
    parcela: null,
    billId: null,
    pendente: t.status === 'PENDING',
    papel: papelDaConta(t, valor, descOrigem),
    pessoaFisica: ehPessoaFisica(t, valor, descOrigem),
  };
}

/**
 * O que o sync grava e para onde manda um recebido. A renda aprendida da origem
 * só promove uma entrada: o gasto e o que não conta ficam como o mapeamento
 * decidiu. Só gasto vai à IA, e nunca o de pessoa física, que fica em "Outros"
 * até o dono categorizar.
 */
export function destinoNoSync(
  r: Pick<Recebido, 'papel' | 'pessoaFisica'>,
  regraPapel: string | null | undefined,
): { papel: Papel; vaiParaIA: boolean; outros: boolean } {
  const base = r.papel ?? 'gasto';
  const papel: Papel = base === 'entrada' && regraPapel === 'renda' ? 'renda' : base;
  const gasto = papel === 'gasto';
  return { papel, vaiParaIA: gasto && !r.pessoaFisica, outros: gasto && !!r.pessoaFisica };
}
