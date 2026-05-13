/**
 * cacheUtils.ts — Cache localStorage com TTL real
 *
 * Uso:
 *   cacheSet('key', data, 7 * 24 * 3600 * 1000); // TTL 7 dias
 *   const data = cacheGet<MyType>('key');          // null se expirado
 */

export interface CacheEntry<T> {
  data: T;
  ts: number; // timestamp de escrita (ms)
  ttl: number; // TTL em ms
}

const DEFAULT_TTL_MS = 7 * 24 * 3600 * 1000; // 7 dias

/**
 * Persiste `data` no localStorage com TTL.
 * Falha silenciosamente se o storage estiver cheio.
 */
export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now(), ttl: ttlMs };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage cheio — ignorar sem quebrar
  }
}

/**
 * Lê do localStorage; retorna `null` se ausente ou expirado.
 */
export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.ts > entry.ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Remove a entrada do cache (independente de TTL).
 */
export function cacheInvalidate(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}
