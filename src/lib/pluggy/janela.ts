const diaSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Primeira carga depois de conectar: o mês de hoje e os dois anteriores, do
 * dia 1 — a fatura aberta e as duas fechadas, onde o dedupe com os PDFs já
 * importados é posto à prova. "Hoje" no fuso de quem usa o app.
 */
export function janelaInicial(agora: Date): { de: string; ate: string } {
  const ate = diaSP.format(agora);
  const ano = Number(ate.slice(0, 4));
  const mes = Number(ate.slice(5, 7)) - 2; // 1–12 menos 2
  const anoDe = mes < 1 ? ano - 1 : ano;
  const mesDe = mes < 1 ? mes + 12 : mes;
  return { de: `${anoDe}-${String(mesDe).padStart(2, '0')}-01`, ate };
}

// o cron roda uma vez por dia; 12 h deixa de fora o que o webhook ou o botão já trouxeram hoje
const INTERVALO_MIN_MS = 12 * 60 * 60 * 1000;

/** O cron deve sincronizar esta conexão agora? */
export function precisaSincronizar(ultimoSyncEm: Date | null, agora: Date): boolean {
  if (!ultimoSyncEm) return true;
  return agora.getTime() - ultimoSyncEm.getTime() >= INTERVALO_MIN_MS;
}

/**
 * "Atualizar agora": do dia 1 do mês do último sync, menos um mês, até hoje —
 * pega o pendente que virou postado e a fatura que fechou sem repetir 3 meses.
 */
export function janelaAtualizar(ultimoSyncEm: Date | null, agora: Date): { de: string; ate: string } {
  if (!ultimoSyncEm) return janelaInicial(agora);
  const ultimo = diaSP.format(ultimoSyncEm);
  const ano = Number(ultimo.slice(0, 4));
  const mes = Number(ultimo.slice(5, 7)) - 1;
  const anoDe = mes < 1 ? ano - 1 : ano;
  const mesDe = mes < 1 ? mes + 12 : mes;
  return { de: `${anoDe}-${String(mesDe).padStart(2, '0')}-01`, ate: diaSP.format(agora) };
}
