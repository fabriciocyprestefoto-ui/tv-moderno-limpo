import { logger } from '../utils/logger';
/**
 * cacheService.ts — Cache Inteligente com IndexedDB + Stale-While-Revalidate
 * ════════════════════════════════════════════════════════════════════════════
 * - IndexedDB para cache local (sem dependência externa — usa API nativa)
 * - Stale-While-Revalidate: retorna cache imediato, revalida em background
 * - Cache-first, network-fallback
 * - TTL configurável por tipo de dado
 * - Invalidação inteligente por chave ou prefixo
 * - Compactação de dados grandes
 * - Limites de tamanho para evitar estouro de storage
 *
 * TTLs:
 *   - Metadados de vídeo: 1 hora
 *   - Categorias/gêneros: 24 horas
 *   - Dados do usuário: 5 minutos
 *   - Configurações: 12 horas
 *   - TMDB enriquecido: 6 horas
 */

// ═══════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════

const DB_NAME = 'redx-data-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache_entries';

/** TTLs padrão em milissegundos */
export const CacheTTL = {
  VIDEO_METADATA: 60 * 60 * 1000, // 1 hora
  CATEGORIES: 24 * 60 * 60 * 1000, // 24 horas
  USER_DATA: 5 * 60 * 1000, // 5 minutos
  CONFIG: 12 * 60 * 60 * 1000, // 12 horas
  TMDB_ENRICHED: 6 * 60 * 60 * 1000, // 6 horas
  STREAM_URL: 30 * 60 * 1000, // 30 minutos
  CATALOG_SETTINGS: 2 * 60 * 60 * 1000, // 2 horas
  SHORT: 2 * 60 * 1000, // 2 minutos
  LONG: 48 * 60 * 60 * 1000, // 48 horas
} as const;

/** Limite máximo de entradas no cache */
const MAX_ENTRIES = 2000;

/** Limite de tamanho por entrada (2MB) */
const MAX_ENTRY_SIZE_BYTES = 2 * 1024 * 1024;

// ═══════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════

interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  size: number; // tamanho estimado em bytes
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
}

type _CacheEventType = 'hit' | 'miss' | 'set' | 'evict' | 'invalidate';
void (null as unknown as _CacheEventType);

// ═══════════════════════════════════════════════════════
// INDEXEDDB WRAPPER
// ═══════════════════════════════════════════════════════

class CacheDB {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('lastAccess', 'lastAccess', { unique: false });
          store.createIndex('ttl', 'ttl', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onclose = () => {
          this.db = null;
          this.dbPromise = null;
        };
        resolve(this.db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async put<T>(entry: CacheEntry<T>): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Silenciar erros de storage cheio
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
        const request = store.openCursor(range);
        let count = 0;

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            count++;
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve(count);
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return 0;
    }
  }

  async getAll(): Promise<CacheEntry[]> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async count(): Promise<number> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return 0;
    }
  }

  /** Remove as entradas mais antigas para manter o limite */
  async evictOldest(toRemove: number): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('lastAccess');
        const request = index.openCursor();
        let removed = 0;

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor && removed < toRemove) {
            cursor.delete();
            removed++;
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  /** Remove todas as entradas expiradas */
  async evictExpired(): Promise<number> {
    try {
      const now = Date.now();
      const all = await this.getAll();
      let removed = 0;

      const db = await this.open();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const entry of all) {
        if (now - entry.timestamp > entry.ttl) {
          store.delete(entry.key);
          removed++;
        }
      }

      return new Promise((resolve) => {
        tx.oncomplete = () => resolve(removed);
        tx.onerror = () => resolve(removed);
      });
    } catch {
      return 0;
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
  }

  /** Atualiza apenas lastAccess e accessCount */
  async touch(key: string): Promise<void> {
    try {
      const entry = await this.get(key);
      if (entry) {
        entry.lastAccess = Date.now();
        entry.accessCount++;
        await this.put(entry);
      }
    } catch {}
  }
}

// ═══════════════════════════════════════════════════════
// MEMORY CACHE (L1 — rápido, volátil)
// ═══════════════════════════════════════════════════════

class MemoryCache {
  private cache = new Map<string, { data: unknown; expires: number }>();
  private maxSize = 200;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    // LRU: move ao final para marcar como recentemente usado
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    // LRU: se cheio, remove o mais antigo
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, expires: Date.now() + ttl });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ═══════════════════════════════════════════════════════
// CACHE SERVICE PRINCIPAL
// ═══════════════════════════════════════════════════════

class CacheService {
  private memCache = new MemoryCache();
  private db = new CacheDB();
  private pendingRevalidations = new Set<string>();
  private stats = { hits: 0, misses: 0 };

  // ── Estimativa de tamanho ──
  private estimateSize(data: unknown): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 0;
    }
  }

  // ── Garantir limite de entradas ──
  private async ensureCapacity(): Promise<void> {
    const count = await this.db.count();
    if (count > MAX_ENTRIES) {
      const toRemove = count - MAX_ENTRIES + 50; // remove 50 extras
      await this.db.evictOldest(toRemove);
    }
  }

  /**
   * GET — Cache-first com SWR
   * 1. Tenta L1 (memória)
   * 2. Tenta L2 (IndexedDB)
   * 3. Se expirado, retorna stale + revalida em background
   * 4. Se miss total, retorna null
   */
  async get<T>(key: string): Promise<T | null> {
    // L1: memória
    const memResult = this.memCache.get<T>(key);
    if (memResult !== null) {
      this.stats.hits++;
      return memResult;
    }

    // L2: IndexedDB
    const dbEntry = await this.db.get<T>(key);
    if (!dbEntry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    const isExpired = now - dbEntry.timestamp > dbEntry.ttl;

    // Atualizar L1 cache com dados do DB
    this.memCache.set(key, dbEntry.data, isExpired ? 30000 : dbEntry.ttl);

    // Touch: atualizar acesso
    this.db.touch(key).catch(() => {});

    if (isExpired) {
      this.stats.misses++;
      return null; // Expirado — forçar revalidação
    }

    this.stats.hits++;
    return dbEntry.data;
  }

  /**
   * GET com Stale-While-Revalidate
   * Retorna cache (mesmo expirado) + revalida em background
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = CacheTTL.VIDEO_METADATA
  ): Promise<T> {
    // L1 check
    const memResult = this.memCache.get<T>(key);
    if (memResult !== null) {
      this.stats.hits++;
      return memResult;
    }

    // L2 check
    const dbEntry = await this.db.get<T>(key);
    const now = Date.now();

    if (dbEntry) {
      const isExpired = now - dbEntry.timestamp > dbEntry.ttl;

      if (!isExpired) {
        // Fresh — retornar diretamente
        this.memCache.set(key, dbEntry.data, dbEntry.ttl);
        this.stats.hits++;
        this.db.touch(key).catch(() => {});
        return dbEntry.data;
      }

      // Stale — retornar stale mas revalidar em background
      this.memCache.set(key, dbEntry.data, 30000); // L1 temporário
      this.stats.hits++;

      // Revalidação em background (apenas uma vez por chave)
      if (!this.pendingRevalidations.has(key)) {
        this.pendingRevalidations.add(key);
        fetcher()
          .then((freshData) => {
            this.set(key, freshData, ttl);
          })
          .catch(() => {})
          .finally(() => {
            this.pendingRevalidations.delete(key);
          });
      }

      return dbEntry.data;
    }

    // Cache miss — fetch
    this.stats.misses++;
    const data = await fetcher();
    await this.set(key, data, ttl);
    return data;
  }

  /**
   * SET — Salvar em L1 + L2
   */
  async set<T>(key: string, data: T, ttl: number = CacheTTL.VIDEO_METADATA): Promise<void> {
    const size = this.estimateSize(data);

    // Rejeitar entradas muito grandes
    if (size > MAX_ENTRY_SIZE_BYTES) {
      logger.warn(
        `[CacheService] Entrada muito grande para "${key}" (${(size / 1024).toFixed(0)}KB). Ignorando.`
      );
      return;
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: now,
      ttl,
      accessCount: 1,
      lastAccess: now,
      size,
    };

    // L1
    this.memCache.set(key, data, ttl);

    // L2
    await this.db.put(entry);
    await this.ensureCapacity();
  }

  /**
   * INVALIDATE — Remove por chave exata
   */
  async invalidate(key: string): Promise<void> {
    this.memCache.delete(key);
    await this.db.delete(key);
  }

  /**
   * INVALIDATE por prefixo — ex: invalidateByPrefix('catalog:')
   */
  async invalidateByPrefix(prefix: string): Promise<number> {
    this.memCache.deleteByPrefix(prefix);
    return this.db.deleteByPrefix(prefix);
  }

  /**
   * CLEANUP — Remove entradas expiradas
   */
  async cleanup(): Promise<number> {
    return this.db.evictExpired();
  }

  /**
   * CLEAR — Limpa todo o cache
   */
  async clear(): Promise<void> {
    this.memCache.clear();
    await this.db.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * STATS — Estatísticas de uso
   */
  async getStats(): Promise<CacheStats> {
    const all = await this.db.getAll();
    const totalSize = all.reduce((sum, e) => sum + (e.size || 0), 0);
    const timestamps = all.map((e) => e.timestamp);
    const total = this.stats.hits + this.stats.misses;

    return {
      totalEntries: all.length,
      totalSize,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    };
  }

  /** Hit rate como porcentagem */
  getHitRatePercent(): string {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return '0%';
    return `${((this.stats.hits / total) * 100).toFixed(1)}%`;
  }
}

// ═══════════════════════════════════════════════════════
// CHAVES DE CACHE PADRONIZADAS
// ═══════════════════════════════════════════════════════

export const CacheKeys = {
  /** Catálogo completo de filmes */
  movies: () => 'catalog:movies',
  /** Catálogo completo de séries */
  series: () => 'catalog:series',
  /** Filmes por gênero */
  moviesByGenre: (genre: string) => `catalog:movies:genre:${genre}`,
  /** Séries por gênero */
  seriesByGenre: (genre: string) => `catalog:series:genre:${genre}`,
  /** Trending movies */
  trendingMovies: () => 'tmdb:trending:movies',
  /** Trending series */
  trendingSeries: () => 'tmdb:trending:series',
  /** Detalhes de mídia TMDB */
  tmdbDetails: (id: number, type: string) => `tmdb:details:${type}:${id}`,
  /** Imagens TMDB */
  tmdbImages: (id: number, type: string) => `tmdb:images:${type}:${id}`,
  /** Configurações do catálogo */
  catalogSettings: () => 'config:catalog_settings',
  /** Stream URL resolvida */
  streamUrl: (title: string, type: string) => `stream:${type}:${title.toLowerCase().trim()}`,
  /** Progresso do usuário */
  userProgress: (tmdbId: number | string) => `user:progress:${tmdbId}`,
  /** Watchlist */
  userWatchlist: () => 'user:watchlist',
  /** Watch later */
  userWatchLater: () => 'user:watchlater',
  /** Perfis do usuário */
  userProfiles: () => 'user:profiles',
  /** EPG data */
  epgData: (date: string) => `epg:${date}`,
  /** Canais */
  channels: () => 'channels:list',
} as const;

// ═══════════════════════════════════════════════════════
// HOOKS — React integration
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useCachedData — Hook para dados cacheados com SWR
 *
 * @example
 * const { data, isLoading, error, refetch } = useCachedData(
 *   CacheKeys.movies(),
 *   () => getAllMovies(),
 *   CacheTTL.VIDEO_METADATA
 * );
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CacheTTL.VIDEO_METADATA,
  options?: {
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    staleWhileRevalidate?: boolean;
  }
): {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  invalidate: () => Promise<void>;
} {
  const fetcherRef = useRef(fetcher);
  const optionsRef = useRef(options);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const fetchedRef = useRef(false);

  const enabled = options?.enabled !== false;
  const swr = options?.staleWhileRevalidate !== false; // default true

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);

    try {
      const cache = getCacheService();
      const currentFetcher = fetcherRef.current;
      const currentOptions = optionsRef.current;

      if (swr) {
        const result = await cache.getOrFetch(key, currentFetcher, ttl);
        if (mountedRef.current) {
          setData(result);
          currentOptions?.onSuccess?.(result);
        }
      } else {
        // Cache-first sem SWR
        const cached = await cache.get<T>(key);
        if (cached !== null) {
          if (mountedRef.current) {
            setData(cached);
            currentOptions?.onSuccess?.(cached);
          }
        } else {
          const fresh = await currentFetcher();
          await cache.set(key, fresh, ttl);
          if (mountedRef.current) {
            setData(fresh);
            currentOptions?.onSuccess?.(fresh);
          }
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        optionsRef.current?.onError?.(e);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [key, enabled, swr, ttl]);

  useEffect(() => {
    mountedRef.current = true;
    fetchedRef.current = false; // reset ao mudar de key para garantir re-fetch
    void fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  const refetch = useCallback(async () => {
    fetchedRef.current = false;
    await fetchData();
  }, [fetchData]);

  const invalidate = useCallback(async () => {
    await getCacheService().invalidate(key);
    setData(null);
    fetchedRef.current = false;
    await fetchData();
  }, [key, fetchData]);

  return { data, isLoading, error, refetch, invalidate };
}

// ═══════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════

let _instance: CacheService | null = null;
let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function getCacheService(): CacheService {
  if (!_instance) {
    _instance = new CacheService();

    // Cleanup periódico (a cada 10 min) — guardado para evitar duplicatas
    if (typeof window !== 'undefined' && !_cleanupTimer) {
      _cleanupTimer = setInterval(
        () => {
          _instance?.cleanup().catch(() => {});
        },
        10 * 60 * 1000
      );
    }
  }
  return _instance;
}

export { CacheService };
export default getCacheService;
