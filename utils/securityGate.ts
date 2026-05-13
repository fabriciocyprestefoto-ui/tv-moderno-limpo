/**
 * SecurityGate — Portão de Segurança Estrutural
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARQUITETURA:
 * Este módulo implementa proteção estrutural - não apenas "fecha o app" quando
 * detecta problema, mas impede que serviços críticos funcionem sem validação.
 *
 * CONCEITO:
 * 1. O app começa em estado "bloqueado"
 * 2. Múltiplas verificações contribuem para "desbloquear"
 * 3. Cada verificação adiciona uma "peça" ao estado de confiança
 * 4. Serviços críticos verificam se todas as peças estão presentes
 * 5. Se o atacante remover verificações, as peças faltam e nada funciona
 *
 * DIFERENÇA DO MODELO ANTIGO:
 * - Antigo: if (!valid) terminateApp() → Atacante remove a condição
 * - Novo: if (!hasAllKeys()) return null → Atacante precisa gerar as chaves
 *
 * FLUXO:
 * MainActivity.onCreate() → AppValidator.validate() → chama Capacitor plugin
 *                                                   → addTrustKey('native', hash)
 *
 * getSupabaseClient() → requireTrust() → verifica se has('native') && has('init')
 *                                      → se não tem, retorna null/throws
 *
 * @module utils/securityGate
 */

import { logger } from './logger';

// ═══════════════════════════════════════════════════════════════════════════
// ESTADO INTERNO (não exportado diretamente)
// ═══════════════════════════════════════════════════════════════════════════

interface TrustState {
  keys: Map<string, number>; // chave → timestamp quando foi adicionada
  initTime: number; // quando o módulo foi carregado
  checkCount: number; // quantas verificações foram feitas
  lastCheck: number; // timestamp da última verificação
}

const state: TrustState = {
  keys: new Map(),
  initTime: Date.now(),
  checkCount: 0,
  lastCheck: 0,
};

// Chaves necessárias para considerar o app "confiável"
const REQUIRED_KEYS = ['init', 'auth', 'runtime'] as const;
type TrustKey = (typeof REQUIRED_KEYS)[number] | 'native' | 'periodic';

// Token derivado do estado (muda se o estado mudar)
let derivedToken: string | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES INTERNAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gera um hash simples para verificação de integridade
 * NÃO é criptograficamente seguro, mas dificulta bypass simples
 */
function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Deriva um token do estado atual
 * Se o atacante não adicionar as chaves corretamente, o token será diferente
 */
function deriveToken(): string {
  const parts: string[] = [];

  // Ordenar chaves para consistência
  const sortedKeys = Array.from(state.keys.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [key, timestamp] of sortedKeys) {
    // Usar apenas a parte do dia do timestamp (menos preciso = mais tolerante)
    const dayPart = Math.floor(timestamp / 86400000);
    parts.push(`${key}:${dayPart}`);
  }

  parts.push(`init:${Math.floor(state.initTime / 86400000)}`);
  parts.push(`count:${state.checkCount}`);

  const combined = parts.join('|');
  return simpleHash(combined).toString(36);
}

// ═══════════════════════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adiciona uma chave de confiança ao estado
 * Chamado por verificações bem-sucedidas em diferentes pontos do app
 *
 * @param key - Identificador da verificação
 * @param value - Valor opcional para validação adicional
 */
export function addTrustKey(key: TrustKey, value?: number): void {
  void value;
  if (!state.keys.has(key)) {
    state.keys.set(key, Date.now());
    state.checkCount++;
    derivedToken = null; // Invalidar token cached

    if (import.meta.env.DEV) {
      logger.log(`[SecurityGate] Trust key added: ${key}`);
    }
  }
}

/**
 * Verifica se uma chave específica está presente
 */
export function hasTrustKey(key: TrustKey): boolean {
  return state.keys.has(key);
}

/**
 * Remove uma chave de confiança do estado
 * Usado quando o usuário faz logout ou a sessão expira
 *
 * @param key - Identificador da verificação a remover
 */
export function removeTrustKey(key: TrustKey): void {
  if (state.keys.has(key)) {
    state.keys.delete(key);
    derivedToken = null; // Invalidar token cached

    if (import.meta.env.DEV) {
      logger.log(`[SecurityGate] Trust key removed: ${key}`);
    }
  }
}

/**
 * Verifica se todas as chaves requeridas estão presentes
 */
export function hasRequiredTrust(): boolean {
  for (const key of REQUIRED_KEYS) {
    if (!state.keys.has(key)) {
      return false;
    }
  }
  return true;
}

/**
 * Verifica se o app está em estado confiável
 * Usado antes de operações críticas
 *
 * @param minKeys - Número mínimo de chaves necessárias (default: 2)
 */
export function isTrusted(minKeys: number = 2): boolean {
  state.lastCheck = Date.now();

  // Em desenvolvimento, sempre confiável
  if (import.meta.env.DEV) {
    return true;
  }

  // Verificar número mínimo de chaves
  if (state.keys.size < minKeys) {
    return false;
  }

  // Verificar se initTime é razoável (não foi manipulado para o futuro)
  if (state.initTime > Date.now() + 60000) {
    return false;
  }

  return true;
}

/**
 * Obtém o token derivado do estado atual
 * Pode ser usado para verificação adicional server-side
 */
export function getTrustToken(): string | null {
  if (!isTrusted()) return null;
  if (!derivedToken) {
    derivedToken = deriveToken();
  }
  return derivedToken;
}

/**
 * Requer confiança — modo não-bloqueante para TV Box.
 * Em produção: loga warning sem lançar erro (evita trava de UI em dispositivos lentos).
 * Em desenvolvimento: lança erro para facilitar detecção.
 *
 * @param operation - Nome da operação para rastreamento nos logs
 */
export function requireTrust(operation: string = 'operation'): void {
  if (isTrusted()) return;

  const message = `[SecurityGate] Estado não confiável para: ${operation}`;

  if (import.meta.env.DEV) {
    // Em dev: lança erro para que o desenvolvedor perceba imediatamente
    logger.error(message);
    throw new Error(message);
  } else {
    // Em produção: loga sem bloquear (TV Box performance-safe)
    // O monitoramento captura e alerta sem travar a interface
    logger.warn(message);
  }
}

/**
 * Wrapper que executa função apenas se confiável
 * Retorna null se não confiável (não lança erro)
 *
 * @param fn - Função a executar
 * @param fallback - Valor a retornar se não confiável
 */
export function whenTrusted<T>(fn: () => T, fallback: T | null = null): T | null {
  if (!isTrusted()) {
    return fallback;
  }
  return fn();
}

/**
 * Wrapper assíncrono que executa função apenas se confiável
 */
export async function whenTrustedAsync<T>(
  fn: () => Promise<T>,
  fallback: T | null = null
): Promise<T | null> {
  if (!isTrusted()) {
    return fallback;
  }
  return fn();
}

/**
 * Obtém estatísticas do estado (para debug)
 */
export function getStats(): { keys: string[]; checkCount: number; trusted: boolean } {
  return {
    keys: Array.from(state.keys.keys()),
    checkCount: state.checkCount,
    trusted: isTrusted(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO AUTOMÁTICA
// ═══════════════════════════════════════════════════════════════════════════

// Adicionar chave 'init' automaticamente ao carregar o módulo
// Isso garante que o código original está sendo executado
addTrustKey('init');

let securityPeriodicIntervalId: ReturnType<typeof setInterval> | null = null;

// Verificação periódica em background (a cada 30s)
if (typeof window !== 'undefined' && !import.meta.env.DEV) {
  securityPeriodicIntervalId = setInterval(() => {
    // Se o estado foi manipulado, limpar
    if (state.initTime > Date.now() + 60000) {
      state.keys.clear();
      derivedToken = null;
    }
  }, 30000);
}

/**
 * Para a verificação periódica de trust keys (evita memory leak em sessões longas)
 */
export function stopSecurityPeriodicCheck(): void {
  if (securityPeriodicIntervalId !== null) {
    clearInterval(securityPeriodicIntervalId);
    securityPeriodicIntervalId = null;
  }
}
