import 'server-only';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { txn } from '@/db/schema';
import { env } from '@/env';
import { lerCategorias, promptCategorizar, semDocumentos } from '@/lib/ia';
import { registrarUso, reservarChamadaIA } from '@/lib/ia-uso-repo';
import { RespostaNaoJson, pedirJson } from '@/lib/openrouter';
import { idDaCategoria } from '@/lib/txn-repo';

const LOTE = 60;

type Pendente = {
  id: string;
  data: string;
  valor: string;
  descOrigem: string;
  categoryId: number | null;
  categoryFonte: string;
  descLimpa: string | null;
};

// o manual e o da regra nunca são tocados (regra 7): só o 'ia' ainda vazio
const precisaCategoria = (t: Pendente) => t.categoryId === null && t.categoryFonte === 'ia';

/**
 * Pede à IA categoria e nome limpo dos lançamentos que o sync acabou de inserir
 * (`ids`). Só os recém-chegados: o que já estava na conta não volta ao modelo a
 * cada sync (regra 9). Vai também quem já tem categoria (de regra aprendida) mas
 * ainda não tem nome — a mesma chamada serve aos dois, e a categoria dele fica
 * como está.
 */
export async function categorizarPendentes(
  userId: string,
  accountId: string,
  ids: readonly string[],
  modelo?: string,
): Promise<{ categorizados: number; semCategoria: number; nomes: number }> {
  if (!ids.length) return { categorizados: 0, semCategoria: 0, nomes: 0 };
  const pendentes = await db
    .select({
      id: txn.id,
      data: txn.data,
      valor: txn.valor,
      descOrigem: txn.descOrigem,
      categoryId: txn.categoryId,
      categoryFonte: txn.categoryFonte,
      descLimpa: txn.descLimpa,
    })
    .from(txn)
    .where(
      and(
        inArray(txn.id, [...ids]),
        eq(txn.userId, userId),
        eq(txn.accountId, accountId),
        isNull(txn.excluidoEm),
        // o sync já não manda esses ids; a trava fica aqui também porque a descrição traz o nome de alguém (regra 4)
        eq(txn.pessoaFisica, false),
        or(and(isNull(txn.categoryId), eq(txn.categoryFonte, 'ia')), isNull(txn.descLimpa)),
      ),
    );
  const precisam = pendentes.filter(precisaCategoria).length;
  if (!pendentes.length) return { categorizados: 0, semCategoria: 0, nomes: 0 };
  if (!env.OPENROUTER_API_KEY) return { categorizados: 0, semCategoria: precisam, nomes: 0 };

  const lotes = [];
  for (let i = 0; i < pendentes.length; i += LOTE) lotes.push(pendentes.slice(i, i + LOTE));
  // em sequência, três meses de um cartão não cabem nos 60 s da rota
  const porLote = await Promise.all(lotes.map((lote) => categorizarLote(userId, lote, modelo)));
  const categorizados = porLote.reduce((s, r) => s + r.categorizados, 0);
  const nomes = porLote.reduce((s, r) => s + r.nomes, 0);
  return { categorizados, semCategoria: precisam - categorizados, nomes };
}

async function categorizarLote(
  userId: string,
  lote: Pendente[],
  modelo: string | undefined,
): Promise<{ categorizados: number; nomes: number }> {
  let dados: unknown = null;
  try {
    // passou do teto ou do limite: o lote fica como ficaria sem chave
    const reserva = await reservarChamadaIA(userId, 'automatica');
    if (!reserva) return { categorizados: 0, nomes: 0 };
    const r = await pedirJson<unknown>(
      promptCategorizar(lote.map((t) => ({ data: t.data, valor: Number(t.valor), desc: semDocumentos(t.descOrigem) }))),
      { reserva, modelo },
    );
    await registrarUso(userId, 'categorizar', r.modelo, r.uso);
    dados = r.dados;
  } catch (e) {
    // um lote ruim não derruba a carga: esses ficam sem categoria, para o dono corrigir
    if (e instanceof RespostaNaoJson && e.modelo && e.uso) await registrarUso(userId, 'categorizar', e.modelo, e.uso);
    else console.error('[categorizar]', e);
    return { categorizados: 0, nomes: 0 };
  }
  const lidas = lerCategorias(dados, lote.length);
  const porCategoria = new Map<string, string[]>();
  const comNome: { id: string; nome: string }[] = [];
  lidas.forEach((c, j) => {
    const t = lote[j]!;
    if (c.categoria && precisaCategoria(t)) porCategoria.set(c.categoria, [...(porCategoria.get(c.categoria) ?? []), t.id]);
    if (c.nome && t.descLimpa === null) comNome.push({ id: t.id, nome: c.nome });
  });

  let categorizados = 0;
  for (const [nome, ids] of porCategoria) {
    const categoryId = await idDaCategoria(nome);
    if (!categoryId) continue;
    const feitos = await db
      .update(txn)
      .set({ categoryId })
      // de novo as travas: alguém pode ter categorizado à mão enquanto a IA respondia
      .where(and(inArray(txn.id, ids), eq(txn.userId, userId), isNull(txn.categoryId), eq(txn.categoryFonte, 'ia')))
      .returning({ id: txn.id });
    categorizados += feitos.length;
  }

  let nomes = 0;
  if (comNome.length) {
    const [primeiro, ...resto] = comNome.map(({ id, nome }) =>
      db
        .update(txn)
        .set({ descLimpa: nome })
        // nome já dado (por outra chamada) não é trocado
        .where(and(eq(txn.id, id), eq(txn.userId, userId), isNull(txn.descLimpa)))
        .returning({ id: txn.id }),
    );
    const saidas = await db.batch([primeiro!, ...resto]);
    nomes = saidas.reduce((s, l) => s + l.length, 0);
  }
  return { categorizados, nomes };
}
