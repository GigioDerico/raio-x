/**
 * Sanitização e validação de pares chave-valor e parâmetros de IA para proteção
 * contra injeção de configuração (CRLF Injection) em arquivos locais (.env.local).
 *
 * Puro, sem 'server-only': o teste importa direto.
 */

// Chaves de variáveis de ambiente: letras maiúsculas, dígitos e sublinhados, 1-64 caracteres
const REGEX_CHAVE = /^[A-Z0-9_]{1,64}$/;

// Modelos de IA permitidos: identificadores como 'anthropic/claude-3.5-sonnet', 'gpt-4o-mini', etc.
// Proíbe quebras de linha, espaços e caracteres de controle
const REGEX_MODELO = /^[a-zA-Z0-9_\-\./:]{1,100}$/;

export function ehChaveEnvValida(chave: string): boolean {
  if (typeof chave !== 'string') return false;
  return REGEX_CHAVE.test(chave);
}

/**
 * Garante que o valor não contenha quebra de linha (\r, \n) nem byte nulo (\0),
 * impedindo injeção de novas variáveis ou diretivas no arquivo .env.local.
 */
export function ehValorEnvSeguro(valor: string): boolean {
  if (typeof valor !== 'string') return false;
  return !/[\r\n\0]/.test(valor);
}

/**
 * Valida o identificador de modelo de IA fornecido pelo cliente.
 * Rejeita qualquer quebra de linha (CRLF), caracteres de controle ou formato inválido.
 */
export function ehModeloIaValido(modelo: string): boolean {
  if (typeof modelo !== 'string') return false;
  if (/[\r\n\0]/.test(modelo)) return false;
  const limpo = modelo.trim();
  return limpo.length > 0 && REGEX_MODELO.test(limpo);
}
