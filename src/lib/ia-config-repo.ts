import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSetting } from '@/db/schema';
import { decriptar, encriptar } from './cripto';
import { detectarClis } from './cli-detector';

export type AmbienteIa = 'local' | 'online';
export type ModoIa = 'auto' | 'local' | 'cloud';
export type ChavesIa = {
  openrouter?: string;
  anthropic?: string;
  openai?: string;
};

type ConfigIaUsuario = {
  chaves: ChavesIa;
  modo: ModoIa;
  provedor: string;
};

// Cache particionado por userId em memória para isolar segredos por inquilino (Regra 1)
const cachePorUsuario = new Map<string, ConfigIaUsuario>();
let cacheUltimo: ConfigIaUsuario | null = null;

export function detectarAmbiente(): AmbienteIa {
  // 1. Variáveis explícitas de plataformas em nuvem (Vercel, Railway, Render, etc.)
  if (process.env.VERCEL === '1' || process.env.RAIOX_AMBIENTE === 'online') {
    return 'online';
  }
  // 2. Se tiver qualquer CLI funcional no sistema operacional da máquina
  const clis = detectarClis();
  if (clis.temClaude || clis.temCodex) {
    return 'local';
  }
  // 3. Sem CLI instalado no sistema de arquivos => ambiente online / container
  return 'online';
}

/**
 * Carrega a configuração de IA do usuário.
 * Isolamento de inquilino (Regra 1): quando userId é informado, busca exclusivamente as configurações
 * pertencentes ao usuário autenticado, sem ler registros de outros usuários.
 */
export async function carregarConfigIaBanco(userId?: string): Promise<{
  chaves: ChavesIa;
  modo: ModoIa;
  provedor: string;
}> {
  try {
    const padrao: ConfigIaUsuario = {
      chaves: {},
      modo: 'auto',
      provedor: 'openrouter',
    };

    let linha:
      | {
          iaProvedor: string | null;
          iaChavesEncrypted: string | null;
          iaModo: string | null;
        }
      | undefined;

    if (userId) {
      const res = await db
        .select({
          iaProvedor: userSetting.iaProvedor,
          iaChavesEncrypted: userSetting.iaChavesEncrypted,
          iaModo: userSetting.iaModo,
        })
        .from(userSetting)
        .where(eq(userSetting.userId, userId))
        .limit(1);
      linha = res[0];
    } else {
      const res = await db
        .select({
          iaProvedor: userSetting.iaProvedor,
          iaChavesEncrypted: userSetting.iaChavesEncrypted,
          iaModo: userSetting.iaModo,
        })
        .from(userSetting)
        .limit(1);
      linha = res[0];
    }

    if (!linha) {
      const cfg = userId && cachePorUsuario.has(userId) ? cachePorUsuario.get(userId)! : (cacheUltimo ?? padrao);
      return cfg;
    }

    let chaves: ChavesIa = {};
    if (linha.iaChavesEncrypted) {
      const dec = decriptar(linha.iaChavesEncrypted);
      if (dec) {
        try {
          chaves = JSON.parse(dec) as ChavesIa;
        } catch {
          chaves = {};
        }
      }
    }

    const cfg: ConfigIaUsuario = {
      chaves,
      modo: (linha.iaModo as ModoIa) || 'auto',
      provedor: linha.iaProvedor || 'openrouter',
    };

    if (userId) {
      cachePorUsuario.set(userId, cfg);
    }
    cacheUltimo = cfg;

    return cfg;
  } catch (e) {
    console.warn('[ia-config-repo] Falha ao carregar configuração de IA do banco:', e);
    const fallback = (userId ? cachePorUsuario.get(userId) : null) ?? cacheUltimo ?? { chaves: {}, modo: 'auto', provedor: 'openrouter' };
    return fallback;
  }
}

export function obterChaveEmMemoria(prov: 'openrouter' | 'anthropic' | 'openai', userId?: string): string | undefined {
  const chaveVar = prov === 'anthropic' ? 'ANTHROPIC_API_KEY' : prov === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
  const chaves = userId && cachePorUsuario.has(userId) ? cachePorUsuario.get(userId)!.chaves : cacheUltimo?.chaves;
  return process.env[chaveVar] || chaves?.[prov] || undefined;
}

export function obterModoEmMemoria(userId?: string): ModoIa {
  if (userId && cachePorUsuario.has(userId)) {
    return cachePorUsuario.get(userId)!.modo;
  }
  return cacheUltimo?.modo ?? 'auto';
}

export async function salvarConfigIaBanco(params: {
  userId: string;
  provedor: string;
  chave?: string;
  modelo?: string;
  modo?: ModoIa;
}): Promise<void> {
  const { userId, provedor, chave, modelo, modo } = params;

  // Garante que as chaves atuais DO USUÁRIO foram carregadas antes de mesclar
  const configAtual = await carregarConfigIaBanco(userId);
  const chavesAtuais = { ...configAtual.chaves };

  if (['openrouter', 'anthropic', 'openai'].includes(provedor) && chave && chave.trim()) {
    chavesAtuais[provedor as keyof ChavesIa] = chave.trim();
  }

  const payloadCriptografado = encriptar(JSON.stringify(chavesAtuais));

  const updates: Partial<typeof userSetting.$inferInsert> = {
    iaProvedor: provedor,
    iaChavesEncrypted: payloadCriptografado,
  };

  if (modelo) updates.modeloIa = modelo;
  if (modo) updates.iaModo = modo;

  await db
    .insert(userSetting)
    .values({
      userId,
      ...updates,
    })
    .onConflictDoUpdate({
      target: userSetting.userId,
      set: updates,
    });

  // Atualiza cache em memória particionado por usuário
  const novaConfig: ConfigIaUsuario = {
    chaves: chavesAtuais,
    modo: modo ?? configAtual.modo,
    provedor,
  };
  cachePorUsuario.set(userId, novaConfig);
  cacheUltimo = novaConfig;

  if (chave) {
    const chaveVar = provedor === 'anthropic' ? 'ANTHROPIC_API_KEY' : provedor === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
    process.env[chaveVar] = chave;
  }
  process.env.IA_PROVEDOR = provedor;
  if (modelo) process.env.IA_MODEL = modelo;
}
