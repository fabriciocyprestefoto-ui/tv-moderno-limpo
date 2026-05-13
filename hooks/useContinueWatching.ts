import { useState, useEffect, useCallback, useRef } from 'react';
import { Media } from '../types';
import { userService } from '../services/userService';
import {
  clearContinueWatchingProgressMap,
  setProgressMapEntry,
} from '@/utils/continueWatchingProgress';

export interface ContinueWatchingItem extends Media {
  progressSeconds: number;
  totalDuration: number | null;
  progressPercent: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 min — evita revalidações desnecessárias a cada nav
let _cache: ContinueWatchingItem[] | null = null;
let _cacheTs = 0;

/** Invalida o cache local — chamar após salvar progresso */
export function invalidateContinueWatchingCache() {
  _cache = null;
  _cacheTs = 0;
  clearContinueWatchingProgressMap();
}

export function useContinueWatching(
  allMedia: Media[],
  enabled = true
): { items: ContinueWatchingItem[]; loading: boolean; refresh: () => void } {
  const [items, setItems] = useState<ContinueWatchingItem[]>(_cache || []);
  const [loading, setLoading] = useState(enabled && !_cache);
  const refreshIdRef = useRef(0);

  // BUG FIX: usar ref para allMedia evita que `load` seja recriado a cada render
  // do catálogo (allMedia muda toda vez que enriquecimento TMDB termina), o que
  // causava requisições desnecessárias ao Supabase toda vez que o catálogo atualizava.
  const allMediaRef = useRef<Media[]>(allMedia);
  allMediaRef.current = allMedia;

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;
      if (!force && _cache && Date.now() - _cacheTs < CACHE_TTL) {
        setItems(_cache);
        setLoading(false);
        return;
      }

      const id = ++refreshIdRef.current;
      setLoading(true);

      try {
        const progressList = await userService.getContinueWatching();
        if (id !== refreshIdRef.current) return;

        if (progressList.length === 0) {
          _cache = [];
          _cacheTs = Date.now();
          setItems([]);
          return;
        }

        // Cross-reference with catalog media so we have poster/backdrop/etc.
        // BUG FIX: ler allMediaRef.current (valor mais recente) sem capturar allMedia
        // na closure — elimina re-criação do callback quando allMedia muda.
        const mediaByTmdbId = new Map<string, Media>();
        for (const m of allMediaRef.current) {
          if (m.tmdb_id) mediaByTmdbId.set(String(m.tmdb_id), m);
        }

        // BUG FIX: se o catálogo ainda não carregou (allMedia vazio),
        // aguardar evitando cache com lista vazia incorreta.
        if (allMediaRef.current.length === 0) {
          if (id === refreshIdRef.current) setLoading(false);
          return;
        }

        const enriched: ContinueWatchingItem[] = [];
        const seenTmdbIds = new Set<string>();
        for (const p of progressList) {
          if (seenTmdbIds.has(p.tmdb_id)) continue;
          seenTmdbIds.add(p.tmdb_id);

          const catalogItem = mediaByTmdbId.get(p.tmdb_id);
          if (!catalogItem) continue;

          const progressPercent =
            p.total_duration && p.total_duration > 0
              ? Math.min(100, Math.round((p.progress_seconds / p.total_duration) * 100))
              : 0;

          enriched.push({
            ...catalogItem,
            progressSeconds: p.progress_seconds,
            totalDuration: p.total_duration,
            progressPercent,
            seasonNumber: p.season_number,
            episodeNumber: p.episode_number,
          });
        }

        _cache = enriched;
        _cacheTs = Date.now();
        clearContinueWatchingProgressMap();
        for (const item of enriched) {
          const tmdbId = String(item.tmdb_id || item.id);
          if (item.progressPercent > 0 && item.progressPercent < 95) {
            setProgressMapEntry(tmdbId, item.progressPercent);
          }
        }
        setItems(enriched);
      } catch {
        // silent fail — Continue Watching is non-critical
      } finally {
        if (id === refreshIdRef.current) setLoading(false);
      }
      // BUG FIX: removido `allMedia` das deps — lemos via allMediaRef.current para
      // evitar que todo reload do catálogo recriem o callback e disparem nova query.
    },
    [enabled]
  );

  useEffect(() => {
    load();
  }, [load]);

  // BUG FIX: re-carregar quando allMedia passar de vazio para populado
  // (catálogo carregou após o primeiro fetch de progresso ter retornado sem dados)
  const prevAllMediaLengthRef = useRef(allMedia.length);
  useEffect(() => {
    const prev = prevAllMediaLengthRef.current;
    prevAllMediaLengthRef.current = allMedia.length;
    // Se o cache está vazio e o catálogo acabou de carregar, recarregar
    if (prev === 0 && allMedia.length > 0 && enabled && (!_cache || _cache.length === 0)) {
      load(true);
    }
  }, [allMedia.length, enabled, load]);

  const refresh = useCallback(() => load(true), [load]);

  return { items, loading, refresh };
}
