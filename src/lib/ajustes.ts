/**
 * Validação e formatação dos campos de Ajustes. Devolve resultado em vez de
 * lançar `ErroDeUso`: ele mora em rota.ts, que é `server-only`, e este módulo
 * precisa ser importável pelos testes.
 */
import { parseValor } from './descricao';
import { rotuloMes } from './filtro';

export type Validado<T> = { ok: true; mudanca: T } | { ok: false; codigo: string; mensagem: string };
export type MudancaConfig = {
  renda?: number | null;
  metaPoupanca?: number;
  modeloIa?: string | null;
  tetoIaUsd?: number | null;
};
export type MudancaConta = { apelido?: string | null; diaFechamento?: number | null; diaVencimento?: number | null };
export type TipoCampo = 'dinheiro' | 'percentual' | 'numero' | 'dia' | 'texto';

export type CartaoAjuste = {
  id: string;
  banco: string;
  last4: string | null;
  apelido: string | null;
  nomeOrigem: string | null;
  diaFechamento: number | null;
  diaVencimento: number | null;
  faturas: number;
  /** 'YYYY-MM-DD' de statement.mes_ref; null sem fatura */
  primeiroMes: string | null;
  ultimoMes: string | null;
};

const erro = (codigo: string, mensagem: string) => ({ ok: false as const, codigo, mensagem });
const vazio = (v: unknown) => v === null || (typeof v === 'string' && v.trim() === '');
const objeto = (c: unknown): Record<string, unknown> => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {});

// numeric(14,2): doze dígitos inteiros; acima disso o Postgres estoura e o
// erro do usuário viraria 503
const TETO = 1e12;

function lerNumero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  const t = String(v).trim().replace(/[R$\s]/g, '');
  // só formas inteiras: `parseValor` usa parseFloat, que leria o prefixo de
  // "12abc" ou de "1,234.56" (1,23) e gravaria valor errado sem avisar
  if (!/\d/.test(t) || !/^-?(\d{1,3}(\.\d{3})+(,\d+)?|\d*([.,]\d+)?)$/.test(t)) return NaN;
  // "8.000" é oito mil para quem digita em reais; parseValor leria 8
  const n = parseValor(/^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
  return Math.round(n * 100) / 100;
}

export function validarConfig(corpo: unknown): Validado<MudancaConfig> {
  const c = objeto(corpo);
  const m: MudancaConfig = {};
  if ('renda' in c) {
    if (vazio(c.renda)) m.renda = null;
    else {
      const n = lerNumero(c.renda);
      if (Number.isNaN(n)) return erro('valor_invalido', 'renda não é um número');
      if (n < 0) return erro('renda_negativa', 'renda não pode ser negativa');
      if (n >= TETO) return erro('valor_grande', 'valor grande demais');
      m.renda = n;
    }
  }
  if ('metaPoupanca' in c) {
    const n = lerNumero(c.metaPoupanca);
    if (Number.isNaN(n)) return erro('valor_invalido', 'meta não é um número');
    if (n < 0 || n > 80) return erro('meta_fora', 'meta entre 0 e 80%');
    m.metaPoupanca = n;
  }
  if ('modeloIa' in c) {
    if (vazio(c.modeloIa)) m.modeloIa = null;
    else {
      const t = typeof c.modeloIa === 'string' ? c.modeloIa.trim() : '';
      // o slug do OpenRouter: provedor/modelo, com sufixo opcional como ":free"
      if (t.length > 100 || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/.test(t))
        return erro('modelo_invalido', 'modelo no formato provedor/modelo');
      m.modeloIa = t;
    }
  }
  if ('tetoIaUsd' in c) {
    if (vazio(c.tetoIaUsd)) m.tetoIaUsd = null;
    else {
      const n = lerNumero(c.tetoIaUsd);
      if (Number.isNaN(n)) return erro('valor_invalido', 'teto não é um número');
      if (n < 0 || n >= 10000) return erro('teto_fora', 'teto entre 0 e 9.999');
      m.tetoIaUsd = n;
    }
  }
  if (Object.keys(m).length === 0) return erro('sem_mudanca', 'nenhum campo para salvar');
  return { ok: true, mudanca: m };
}

export function validarConta(corpo: unknown): Validado<MudancaConta> {
  const c = objeto(corpo);
  const m: MudancaConta = {};
  if ('apelido' in c) {
    if (c.apelido === null) m.apelido = null;
    else if (typeof c.apelido !== 'string') return erro('apelido_invalido', 'apelido precisa ser texto');
    else {
      const t = c.apelido.trim();
      if (t.length > 40) return erro('apelido_longo', 'apelido até 40 caracteres');
      m.apelido = t || null;
    }
  }
  for (const campo of ['diaFechamento', 'diaVencimento'] as const) {
    if (!(campo in c)) continue;
    const v = c[campo];
    if (vazio(v)) {
      m[campo] = null;
      continue;
    }
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d{1,2}\s*$/.test(v) ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 31) return erro('dia_invalido', 'dia entre 1 e 31');
    m[campo] = n;
  }
  if (Object.keys(m).length === 0) return erro('sem_mudanca', 'nenhum campo para salvar');
  return { ok: true, mudanca: m };
}

/** Texto que o campo mostra. Dinheiro zerado fica vazio: o placeholder "0,00" já diz isso. */
export function formatarCampo(tipo: TipoCampo, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (tipo === 'texto' || tipo === 'dia') return String(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (tipo === 'dinheiro') return n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  // percentual e número: zero aparece, porque teto 0 quer dizer "sem teto"
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function linhaDoCartao(c: CartaoAjuste): string {
  if (!c.faturas || !c.primeiroMes || !c.ultimoMes) return 'nenhuma fatura importada';
  const de = rotuloMes(c.primeiroMes.slice(0, 7));
  const ate = rotuloMes(c.ultimoMes.slice(0, 7));
  const periodo = de === ate ? de : `${de} a ${ate}`;
  return `na fatura: ${c.nomeOrigem || c.banco} · ${c.faturas} ${c.faturas === 1 ? 'fatura' : 'faturas'} · ${periodo}`;
}
