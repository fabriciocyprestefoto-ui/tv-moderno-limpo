import { userService } from '../services/userService';

/**
 * Caches do MediaCard em módulo isolado — evita AuthContext importar o componente
 * (ciclo app-hooks ↔ app-ui no Rollup).
 */

const _prefetchCache = new Map<string | number, unknown>();
const MAX_PREFETCH_CACHE = 150;

const _statusCache = new Map<string | number, { inWatchlist: boolean; inWatchLater: boolean }>();

export function getPrefetchedDetails(id: string | number): unknown {
  return _prefetchCache.get(id) || null;
}

export function hasPrefetchedDetails(id: string | number): boolean {
  return _prefetchCache.has(id);
}

export function setPrefetchedDetails(id: string | number, value: unknown): void {
  if (_prefetchCache.size >= MAX_PREFETCH_CACHE) {
    const first = _prefetchCache.keys().next().value;
    if (first !== undefined) _prefetchCache.delete(first);
  }
  _prefetchCache.set(id, value);
}

export function clearMediaCaches(): void {
  _prefetchCache.clear();
  _statusCache.clear();
}

export function cacheStatusSet(
  id: string | number,
  v: { inWatchlist: boolean; inWatchLater: boolean }
): void {
  _statusCache.set(id, v);
}

export function cacheStatusUpdate(
  id: string | number,
  key: 'inWatchlist' | 'inWatchLater',
  value: boolean
): void {
  const existing = _statusCache.get(id);
  if (existing) _statusCache.set(id, { ...existing, [key]: value });
}

export function cacheStatusGet(
  id: string | number
): { inWatchlist: boolean; inWatchLater: boolean } | undefined {
  return _statusCache.get(id);
}

/**
 * Pré-aquece o cache de status para uma lista de IDs em uma única query Supabase.
 * Chame antes de renderizar uma lista de MediaCards para eliminar o padrão N+1.
 *
 * @example
 *   await prefetchBatchLibraryStatus(movies.map(m => m.tmdb_id || m.id))
 */
export async function prefetchBatchLibraryStatus(ids: (string | number)[]): Promise<void> {
  if (ids.length === 0) return;

  // Filtra apenas IDs que ainda não estão em cache
  const missing = ids.filter((id) => id && !_statusCache.has(id));
  if (missing.length === 0) return;

  try {
    const batchResult = await userService.batchCheckStatus(missing);
    batchResult.forEach((status, id) => {
      _statusCache.set(id, status);
    });
  } catch {
    // Falha silenciosa — MediaCard.tsx fará checkStatus individual como fallback
  }
}
