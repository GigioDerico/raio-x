/**
 * Estado de uma conexão na tela: o texto e a ação que o guia ("Conexões") pede
 * para cada caso. Puro: o teste importa, a página também.
 *
 * `EstadoBanco` duplica de propósito os valores de `EstadoConexao`
 * (`conexao-repo.ts`, `server-only`): este arquivo precisa ser importável
 * pelo teste puro, e `conexao-repo.ts` não pode.
 */
export type EstadoBanco = 'ativa' | 'atualizando' | 'erro_login' | 'consentimento_expirado' | 'desconectada' | 'erro';

export type EntradaEstado = {
  banco: string;
  status: EstadoBanco;
  saude: string | null;
  consentExpiraEm: Date | null;
  ultimoSyncEm: Date | null;
  agora: Date;
};

export type EstadoTela = {
  chave: 'ativa' | 'atualizando' | 'erro_login' | 'consentimento' | 'consentimento_perto' | 'instavel' | 'erro';
  texto: string;
  acao: 'atualizar' | 'reconectar' | 'renovar' | null;
};

export function haQuanto(quando: Date, agora: Date): string {
  const min = Math.floor((agora.getTime() - quando.getTime()) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

// avisar com duas semanas dá tempo de renovar antes de o sync parar
const DIAS_AVISO_CONSENTIMENTO = 14;
const diaSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dias de calendário (em São Paulo) de `agora` até `quando`: "vence hoje" é o dia de quem lê, não o UTC. */
function diasAte(quando: Date, agora: Date): number {
  return Math.round((Date.parse(diaSP.format(quando)) - Date.parse(diaSP.format(agora))) / 86_400_000);
}

function textoVence(dias: number): string {
  if (dias <= 0) return 'A autorização vence hoje.';
  if (dias === 1) return 'A autorização vence amanhã.';
  return `A autorização vence em ${dias} dias.`;
}

export function estadoDaConexao(e: EntradaEstado): EstadoTela {
  const instavel = e.saude === 'UNSTABLE' || e.saude === 'OFFLINE';
  // o prazo do consentimento é do dono e não espera o banco voltar: vem antes da instabilidade, que passa sozinha
  if (e.status === 'consentimento_expirado' || (e.consentExpiraEm && e.consentExpiraEm.getTime() <= e.agora.getTime())) {
    return { chave: 'consentimento', texto: 'A autorização expirou.', acao: 'renovar' };
  }
  // com o banco instável o pedido de senha pode ser efeito da instabilidade: só vale com ele estável
  if (e.status === 'erro_login' && !instavel) return { chave: 'erro_login', texto: 'O banco pediu sua senha de novo.', acao: 'reconectar' };
  // antes de instável/atualizando/erro: esses passam sozinhos, o prazo não — sem data (o normal no Pluggy), nada
  if (e.consentExpiraEm) {
    const dias = diasAte(e.consentExpiraEm, e.agora);
    if (dias <= DIAS_AVISO_CONSENTIMENTO) return { chave: 'consentimento_perto', texto: textoVence(dias), acao: 'renovar' };
  }
  // banco fora do ar é deles: mandar "reconectar" faria a pessoa procurar defeito onde não há
  if (instavel) return { chave: 'instavel', texto: `O ${e.banco} está instável agora — é deles, não seu.`, acao: null };
  if (e.status === 'atualizando') return { chave: 'atualizando', texto: 'Atualizando…', acao: null };
  if (e.status === 'erro') return { chave: 'erro', texto: 'A última atualização falhou.', acao: 'atualizar' };
  return {
    chave: 'ativa',
    texto: e.ultimoSyncEm ? `Atualizado ${haQuanto(e.ultimoSyncEm, e.agora)}` : 'Ainda sem lançamentos',
    acao: 'atualizar',
  };
}

/** Conexões que ficaram sem conta (os cartões foram religados a um item novo). */
export function conexoesOrfas(conexoes: { id: string; status: string }[], comConta: string[], atual: string): string[] {
  const usadas = new Set(comConta);
  return conexoes.filter((c) => c.id !== atual && c.status !== 'desconectada' && !usadas.has(c.id)).map((c) => c.id);
}

export type ConexaoParaAviso = {
  banco: string;
  status: EstadoBanco;
  saudeConector: string | null;
  consentExpiraEm: Date | null;
  ultimoSyncEm: Date | null;
};

// só o que pede a mão do dono vira faixa; instável, erro e atualizando se resolvem sem ele
const PEDEM_O_DONO = new Set<EstadoTela['chave']>(['erro_login', 'consentimento', 'consentimento_perto']);

/** A faixa do topo do app: a primeira conexão que precisa do dono, ou nada. */
export function avisoDasConexoes(conexoes: ConexaoParaAviso[], agora: Date): { texto: string; href: string } | null {
  for (const c of conexoes) {
    const e = estadoDaConexao({ banco: c.banco, status: c.status, saude: c.saudeConector, consentExpiraEm: c.consentExpiraEm, ultimoSyncEm: c.ultimoSyncEm, agora });
    if (PEDEM_O_DONO.has(e.chave)) return { texto: `${c.banco}: ${e.texto}`, href: '/conexoes' };
  }
  return null;
}
