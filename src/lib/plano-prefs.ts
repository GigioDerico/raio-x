/**
 * Validação das respostas do questionário do plano. Devolve resultado em vez
 * de lançar, como `ajustes.ts`: `ErroDeUso` é `server-only` e o teste importa
 * este módulo.
 */
import type { Validado } from './ajustes';
import { CATS } from './calculos/base';
import { ASSINA, COMIDAS, OBJETIVOS, RITMOS, type Prefs } from './calculos/plano';

const erro = (codigo: string, mensagem: string) => ({ ok: false as const, codigo, mensagem });

// Object.hasOwn: "toString" e "constructor" existem em todo objeto e não são opção
const escolha = (v: unknown, opcoes: Record<string, unknown>) =>
  typeof v === 'string' && Object.hasOwn(opcoes, v) ? v : null;

function categorias(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && (CATS as readonly string[]).includes(x))) return null;
  return [...new Set(v as string[])];
}

export function validarPrefs(corpo: unknown): Validado<Prefs> {
  const c = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : {};
  const p = c.prefs && typeof c.prefs === 'object' && !Array.isArray(c.prefs) ? (c.prefs as Record<string, unknown>) : null;
  if (!p) return erro('prefs_ausente', 'responda o questionário');

  const objetivo = escolha(p.objetivo, OBJETIVOS);
  if (!objetivo) return erro('objetivo_invalido', 'objetivo fora da lista');
  const ritmo = escolha(p.ritmo, RITMOS);
  if (!ritmo) return erro('ritmo_invalido', 'ritmo fora da lista');
  const comida = escolha(p.comida, COMIDAS);
  if (!comida) return erro('comida_invalida', 'resposta sobre comida fora da lista');
  const assinaturas = escolha(p.assinaturas, ASSINA);
  if (!assinaturas) return erro('assinaturas_invalidas', 'resposta sobre assinaturas fora da lista');

  const intocaveis = categorias(p.intocaveis);
  const cortarTudo = categorias(p.cortar);
  if (!intocaveis || !cortarTudo) return erro('categoria_invalida', 'categoria fora da lista');
  const cortar = cortarTudo.filter((x) => !intocaveis.includes(x));

  if (typeof p.evento !== 'string') return erro('evento_invalido', 'evento precisa ser texto');
  const evento = p.evento.trim();
  if (evento.length > 120) return erro('evento_longo', 'evento até 120 caracteres');

  return { ok: true, mudanca: { objetivo, ritmo, intocaveis, cortar, comida, assinaturas, evento } };
}

/**
 * Sem lista de categorias, `ajustarPlano` devolve o plano calculado e a
 * resposta seria gravada como se a IA tivesse refinado — e `null` quebraria
 * o insert de `ai_output.conteudo`, que é not null.
 */
export function respostaTemCategorias(dados: unknown): boolean {
  return Boolean(dados) && typeof dados === 'object' && Array.isArray((dados as { categorias?: unknown }).categorias);
}

/**
 * `ajustarPlano` (porta literal) não limita a economia que a IA promete num
 * fixo: 1e30 iria para a tela e para o banco. Fica fora da porta, aqui.
 */
export function limparFixos<T extends { desc: string; economia: number }>(fixos: T[], teto: number): T[] {
  return fixos
    .filter((f) => f.desc && Number.isFinite(f.economia) && f.economia > 0)
    .map((f) => ({ ...f, economia: Math.min(f.economia, teto) }));
}
