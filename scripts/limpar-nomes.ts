/**
 * Uma vez só: dá nome limpo aos lançamentos do Pluggy gravados antes da 4.2a.
 * Reprocessa dado antigo (custa IA), então só roda com autorização do dono.
 * Não mexe em categoria — só em desc_limpa, onde ainda está vazio.
 *
 *   npm run limpar-nomes
 *
 * Repete o transporte de src/lib/openrouter.ts em vez de importá-lo: roda fora
 * do Next, e aquele módulo é `server-only`.
 */
import { neon } from '@neondatabase/serverless';
import { lerCategorias, promptCategorizar, semDocumentos } from '../src/lib/ia';

const sql = neon(process.env.DATABASE_URL!);
const LOTE = 60;

async function pedir(prompt: string, modelo: string) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0, usage: { include: true } }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
  return (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    error?: { message?: string };
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL vazia');
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY vazia');
  const usuarios = await sql`select distinct user_id from txn where fonte = 'pluggy' and desc_limpa is null and excluido_em is null`;
  for (const { user_id } of usuarios) {
    const [cfg] = await sql`select modelo_ia from user_setting where user_id = ${user_id}`;
    const modelo = (cfg?.modelo_ia as string | undefined) || process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5';
    const pendentes = await sql`select id, data::text as data, valor::text as valor, desc_origem from txn where user_id = ${user_id} and fonte = 'pluggy' and desc_limpa is null and excluido_em is null order by data`;
    let feitos = 0;
    for (let i = 0; i < pendentes.length; i += LOTE) {
      const lote = pendentes.slice(i, i + LOTE);
      const corpo = await pedir(promptCategorizar(lote.map((t) => ({ data: t.data as string, valor: Number(t.valor), desc: semDocumentos(t.desc_origem as string) }))), modelo);
      // o OpenRouter devolve 200 com `error` quando o provedor falha no meio: não houve resposta para gravar nem gasto a contar
      if (corpo.error) {
        console.error(`lote ${i / LOTE + 1}: OpenRouter devolveu erro, pulando`);
        continue;
      }
      const u = corpo.usage ?? {};
      // o gasto do mês em Ajustes sai do ai_uso: esta chamada também conta
      await sql`insert into ai_uso (user_id, kind, modelo, tokens_in, tokens_out, custo_usd) values (${user_id}, 'categorizar', ${modelo}, ${u.prompt_tokens ?? 0}, ${u.completion_tokens ?? 0}, ${typeof u.cost === 'number' ? u.cost.toFixed(6) : null})`;
      let dados: unknown = null;
      try {
        const texto = corpo.choices?.[0]?.message?.content ?? '';
        dados = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
      } catch {
        console.error(`lote ${i / LOTE + 1}: resposta não é JSON, pulando`);
        continue;
      }
      const lidos = lerCategorias(dados, lote.length);
      for (let j = 0; j < lote.length; j++) {
        const nome = lidos[j]!.nome;
        if (!nome) continue;
        const feito = await sql`update txn set desc_limpa = ${nome} where id = ${lote[j]!.id} and user_id = ${user_id} and desc_limpa is null returning id`;
        feitos += feito.length;
      }
    }
    console.log(`usuário ${String(user_id).slice(0, 8)}…: ${feitos} de ${pendentes.length} com nome limpo`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
