/**
 * Parser para linhas do stream SSE da Anthropic (api.anthropic.com/v1/messages).
 * Puro, sem `server-only`: o teste importa direto.
 */

export type LinhaSseAnthropic = {
  texto: string;
  tokensIn?: number;
  tokensOut?: number;
  fim: boolean;
  erro: string | null;
};

export function lerLinhaSseAnthropic(linha: string): LinhaSseAnthropic | null {
  const l = linha.trim();
  if (!l.startsWith('data:')) return null;
  const dado = l.slice(5).trim();
  if (!dado) return null;
  try {
    const obj = JSON.parse(dado) as {
      type?: string;
      error?: { message?: string };
      message?: { usage?: { input_tokens?: number } };
      delta?: { type?: string; text?: string };
      usage?: { output_tokens?: number };
    };

    if (obj.type === 'error') {
      return { texto: '', fim: false, erro: String(obj.error?.message ?? 'erro na Anthropic') };
    }
    if (obj.type === 'message_start') {
      const tin = obj.message?.usage?.input_tokens ?? 0;
      return { texto: '', tokensIn: tin, fim: false, erro: null };
    }
    if (obj.type === 'content_block_delta') {
      const t = obj.delta?.text ?? '';
      return { texto: t, fim: false, erro: null };
    }
    if (obj.type === 'message_delta') {
      const tout = obj.usage?.output_tokens ?? 0;
      return { texto: '', tokensOut: tout, fim: false, erro: null };
    }
    if (obj.type === 'message_stop') {
      return { texto: '', fim: true, erro: null };
    }
    return null;
  } catch {
    return null;
  }
}
