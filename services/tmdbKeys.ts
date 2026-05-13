import { logger } from '../utils/logger';
/**
 * TMDB API — Pool de tokens (ex.: 3 APIs) com revezamento automático
 * - Cada chamada a getFetchOptions() usa o próximo token (round-robin).
 * - Em 429, o próximo retry já pega o token seguinte naturalmente.
 * - nextToken() força pular um token (recuperação manual / compatibilidade).
 */

function readTokensFromEnv(): string[] {
  const single = import.meta.env.VITE_TMDB_READ_TOKEN?.trim();
  const pool =
    import.meta.env.VITE_TMDB_READ_TOKENS?.split(',')
      .map((token) => token.trim())
      .filter(Boolean) || [];

  const tokens = [...pool, ...(single ? [single] : [])];
  return Array.from(new Set(tokens));
}

/** Tokens de leitura (Bearer) vindos exclusivamente do ambiente */
const READ_TOKENS: string[] = readTokensFromEnv();

/** Contador monotônico de round-robin (persistido para distribuir carga entre reloads) */
const TMDB_RR_KEY = 'redx_tmdb_token_rr';

function loadRoundRobin(): number {
  try {
    const saved = sessionStorage.getItem(TMDB_RR_KEY);
    if (saved !== null) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n >= 0) return n;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

let roundRobin = loadRoundRobin();

function persistRoundRobin(): void {
  try {
    sessionStorage.setItem(TMDB_RR_KEY, String(roundRobin));
  } catch {
    /* ignore */
  }
}

/**
 * Próximo token na fila (sem avançar o contador).
 * Útil para montar headers manualmente alinhados ao próximo getFetchOptions.
 */
export function getCurrentToken(): string {
  if (READ_TOKENS.length === 0) {
    throw new Error(
      'TMDB: Nenhum token configurado. Defina VITE_TMDB_READ_TOKENS (vários separados por vírgula) ou VITE_TMDB_READ_TOKEN no .env'
    );
  }
  return READ_TOKENS[roundRobin % READ_TOKENS.length];
}

/** Força usar o próximo token na próxima requisição (pula um slot) */
export function nextToken(): void {
  if (READ_TOKENS.length === 0) return;
  roundRobin++;
  persistRoundRobin();
  const idx = roundRobin % READ_TOKENS.length;
  logger.warn(`[TMDB] Avançando pool — próximo slot ${idx + 1}/${READ_TOKENS.length}`);
}

/** Headers para fetch TMDB: revezamento automático entre todos os tokens do .env */
export function getFetchOptions(): { method: string; headers: Record<string, string> } {
  if (READ_TOKENS.length === 0) {
    throw new Error(
      'TMDB: Nenhum token configurado. Defina VITE_TMDB_READ_TOKENS (ex.: token1,token2,token3) ou VITE_TMDB_READ_TOKEN'
    );
  }
  const n = READ_TOKENS.length;
  const idx = roundRobin % n;
  const token = READ_TOKENS[idx];
  roundRobin++;
  persistRoundRobin();
  return {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

/** Quantidade de tokens disponíveis */
export function getTokenCount(): number {
  return READ_TOKENS.length;
}

/** Token exclusivo para a Home (banners) — evita consumir o pool do resto do app */
export function getHomeToken(): string {
  return (import.meta.env.VITE_TMDB_READ_TOKEN_HOME as string | undefined)?.trim() || '';
}

/** Headers para fetch TMDB usando APENAS o token da Home */
export function getFetchOptionsForHome(): {
  method: string;
  headers: Record<string, string>;
} | null {
  const token = getHomeToken();
  if (!token) return null;
  return {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

/** Indica se há token dedicado para a Home */
export function hasHomeToken(): boolean {
  return getHomeToken().length > 0;
}
