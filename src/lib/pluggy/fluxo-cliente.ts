import { buscar, falhaDe, textoDoErro } from '@/lib/falha';

export type Cartao = { id: string; nome: string };
export type Resumo = { nome: string; texto: string; falhou: boolean };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
export const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Traz os cartões um a um (uma requisição cada, pelo limite da Vercel); um que falha não para os outros. */
export async function trazerCartoes(
  cartoes: Cartao[],
  janela: 'inicial' | 'atualizar',
  aoProgresso: (aviso: string, resumos: Resumo[]) => void,
): Promise<Resumo[]> {
  const feitos: Resumo[] = [];
  for (let i = 0; i < cartoes.length; i++) {
    const c = cartoes[i]!;
    aoProgresso(`Trazendo ${c.nome} — ${i + 1} de ${cartoes.length}…`, [...feitos]);
    try {
      const r = await buscar(`/api/accounts/${c.id}/sync${janela === 'atualizar' ? '?janela=atualizar' : ''}`, { method: 'POST' });
      if (!r.ok) throw await falhaDe(r);
      const s = (await r.json()) as { novos: number; atualizados: number; promovidos: number; suspeitos: number; ignorados: number; categorizados: number; semCategoria: number };
      const partes = [
        plural(s.novos, 'novo', 'novos'),
        s.ignorados + s.atualizados + s.promovidos > 0 ? `${s.ignorados + s.atualizados + s.promovidos} já estavam` : null,
        s.categorizados > 0 ? plural(s.categorizados, 'categorizado', 'categorizados') : null,
        s.suspeitos > 0 ? plural(s.suspeitos, 'suspeito de duplicado', 'suspeitos de duplicado') : null,
        s.semCategoria > 0 ? `${s.semCategoria} sem categoria` : null,
      ].filter(Boolean);
      feitos.push({ nome: c.nome, texto: partes.join(', '), falhou: false });
    } catch (e) {
      // um cartão que falha não impede os outros
      feitos.push({ nome: c.nome, texto: textoDoErro(e, navigator.onLine).texto, falhou: true });
    }
    aoProgresso(`Trazendo ${c.nome} — ${i + 1} de ${cartoes.length}…`, [...feitos]);
  }
  return feitos;
}

/** A frase do fim, contando falhas — "Pronto." só quando tudo veio. */
export function fraseDoFim(cartoes: number, resumos: Resumo[], aviso: string | null): string {
  const falhas = resumos.filter((r) => r.falhou).length;
  const fim = !cartoes
    ? 'Conectado, mas este banco não tem cartão de crédito — contas correntes entram na fatia 6.'
    : falhas === cartoes
      ? 'Nenhum cartão foi trazido; veja os erros abaixo.'
      : falhas > 0
        ? `Pronto, com falhas em ${plural(falhas, 'cartão', 'cartões')}.`
        : 'Pronto.';
  return aviso && falhas < cartoes ? `${fim} ${aviso}` : fim;
}
