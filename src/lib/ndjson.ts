/**
 * A rota do diagnóstico responde uma linha JSON por evento. Puro: a rota
 * escreve com `linhaNdjson`, o cliente lê com `lerNdjson`, e o teste usa os dois.
 */
export type EventoDiagnostico = { t: string } | { fim: true } | { erro: string };
export type EventoLido = { t?: unknown; fim?: unknown; erro?: unknown };

export const linhaNdjson = (e: EventoDiagnostico) => JSON.stringify(e) + '\n';

/** Devolve os eventos das linhas completas; o pedaço sem `\n` fica para o próximo. */
export function lerNdjson(buffer: string): { eventos: EventoLido[]; resto: string } {
  const linhas = buffer.split('\n');
  const resto = linhas.pop() ?? '';
  const eventos: EventoLido[] = [];
  for (const linha of linhas) {
    const s = linha.trim();
    if (!s) continue;
    try {
      const v: unknown = JSON.parse(s);
      if (v && typeof v === 'object' && !Array.isArray(v)) eventos.push(v as EventoLido);
    } catch {
      // uma linha estragada não derruba o texto que já chegou
    }
  }
  return { eventos, resto };
}

/** Lê um corpo NDJSON até o fim; o decoder em stream não parte caractere acentuado entre pedaços. */
export async function consumirNdjson(corpo: ReadableStream<Uint8Array>, aoEvento: (e: EventoLido) => void): Promise<void> {
  const leitor = corpo.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      const lido = lerNdjson(buf + dec.decode(value, { stream: true }));
      buf = lido.resto;
      lido.eventos.forEach(aoEvento);
    }
    lerNdjson(buf + dec.decode() + '\n').eventos.forEach(aoEvento);
  } finally {
    leitor.releaseLock();
  }
}
