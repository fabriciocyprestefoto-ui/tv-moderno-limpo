/**
 * Prefetch de detalhes ao focar card com D-pad.
 * Armazena resultado em cache para Details carregar instantaneamente.
 */
import { fetchMovieDetail, fetchSeriesDetail, getLogo } from './tmdb';

const cache = new Map<string, { detail: unknown; logo: string | null; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function cacheKey(tmdbId: number, type: 'movie' | 'series'): string {
  return `${type}-${tmdbId}`;
}

export function getCachedDetails(
  tmdbId: number,
  type: 'movie' | 'series'
): { detail: unknown; logo: string | null } | null {
  const key = cacheKey(tmdbId, type);
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.timestamp > CACHE_TTL) return null;
  return { detail: entry.detail, logo: entry.logo };
}

export function prefetchDetails(tmdbId: number, type: 'movie' | 'series'): void {
  const key = cacheKey(tmdbId, type);
  if (cache.has(key)) return;

  const fetchDetail = type === 'series' ? fetchSeriesDetail : fetchMovieDetail;
  const tmdbType = type === 'series' ? 'series' : 'movie';

  Promise.all([fetchDetail(tmdbId), getLogo(tmdbId, tmdbType)])
    .then(([detail, logo]) => {
      cache.set(key, { detail, logo: logo || null, timestamp: Date.now() });
    })
    .catch(() => {});
}
