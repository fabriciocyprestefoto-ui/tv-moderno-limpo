/**
 * Cache em memória para respostas do TMDB.
 * Evita refetch de dados que já foram buscados recentemente.
 */

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutos
const MAX_ENTRIES = 500;

/**
 * Busca dado do cache. Retorna null se não existe ou expirou.
 */
export function getCachedTmdb<T = any>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DEFAULT_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Armazena dado no cache com timestamp.
 * Faz eviction LRU quando excede MAX_ENTRIES.
 */
export function setCachedTmdb(key: string, data: any): void {
  // Eviction: remove a entrada mais antiga
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Limpa todo o cache (ex: ao mudar de perfil)
 */
export function clearTmdbCache(): void {
  cache.clear();
}

/**
 * Helper: fetch com cache integrado.
 * Se o dado está no cache e válido, retorna sem fazer request.
 */
export async function fetchWithCache<T = any>(
  cacheKey: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = getCachedTmdb<T>(cacheKey);
  if (cached !== null) return cached;

  const data = await fetchFn();
  setCachedTmdb(cacheKey, data);
  return data;
}
