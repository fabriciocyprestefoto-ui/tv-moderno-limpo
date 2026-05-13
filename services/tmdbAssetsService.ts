import { Media } from '@/types';
import { supabase } from '@/services/supabaseService';
import { logger } from '@/utils/logger';
import { getMediaBackdrop, getMediaLogo, getMediaPoster } from '@/utils/mediaUtils';

type ContentType = 'movie' | 'series';

type TmdbAssetRow = {
  tmdb_id: number;
  type: ContentType;
  poster_url: string | null;
  backdrop_url: string | null;
  logo_url: string | null;
  cached_at?: string;
  last_sync_status?: 'cached' | 'error' | 'pending';
};

const isNonEmpty = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isTmdbImageUrl = (value?: string | null): boolean =>
  isNonEmpty(value) && value.includes('image.tmdb.org');

const getAssetKey = (type: ContentType, tmdbId: number): string => `${type}:${tmdbId}`;

async function fetchTmdbAssetsForType(
  type: ContentType,
  tmdbIds: number[]
): Promise<TmdbAssetRow[]> {
  const uniqueIds = Array.from(
    new Set(tmdbIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  );

  if (uniqueIds.length === 0) return [];

  const chunkSize = 150;
  const rows: TmdbAssetRow[] = [];

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);

    const { data, error } = await supabase
      .from('tmdb_assets')
      .select('tmdb_id,type,poster_url,backdrop_url,logo_url,cached_at,last_sync_status')
      .eq('type', type)
      .in('tmdb_id', chunk);

    if (error) {
      logger.warn(`[tmdbAssetsService] Falha ao buscar assets (${type}):`, error.message);
      continue;
    }

    if (Array.isArray(data)) {
      rows.push(...(data as TmdbAssetRow[]));
    }
  }

  return rows;
}

async function fetchAssetsMap(
  movies: Media[],
  series: Media[]
): Promise<Map<string, TmdbAssetRow>> {
  const movieIds = movies.map((m) => Number(m.tmdb_id));
  const seriesIds = series.map((s) => Number(s.tmdb_id));

  const [movieRows, seriesRows] = await Promise.all([
    fetchTmdbAssetsForType('movie', movieIds),
    fetchTmdbAssetsForType('series', seriesIds),
  ]);

  const map = new Map<string, TmdbAssetRow>();

  for (const row of [...movieRows, ...seriesRows]) {
    map.set(getAssetKey(row.type, Number(row.tmdb_id)), row);
  }

  return map;
}

function normalizeTmdbOnly(item: Media): Media {
  return {
    ...item,
    poster: getMediaPoster(item),
    backdrop: getMediaBackdrop(item),
    logo_url: getMediaLogo(item),
  };
}

function applyAssetToItem(
  item: Media,
  map: Map<string, TmdbAssetRow>,
  expectedType: ContentType
): Media {
  const tmdbId = Number(item.tmdb_id);
  const fallbackPoster = getMediaPoster(item);
  const fallbackBackdrop = getMediaBackdrop(item);
  const fallbackLogo = getMediaLogo(item);

  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return {
      ...item,
      poster: fallbackPoster,
      backdrop: fallbackBackdrop,
      logo_url: fallbackLogo,
    };
  }

  const asset = map.get(getAssetKey(expectedType, tmdbId));

  if (!asset) {
    return {
      ...item,
      poster: fallbackPoster,
      backdrop: fallbackBackdrop,
      logo_url: fallbackLogo,
    };
  }

  const poster = isTmdbImageUrl(asset.poster_url)
    ? (asset.poster_url ?? undefined)
    : fallbackPoster;
  const backdrop = isTmdbImageUrl(asset.backdrop_url)
    ? (asset.backdrop_url ?? undefined)
    : fallbackBackdrop;
  const logo_url = isTmdbImageUrl(asset.logo_url) ? (asset.logo_url ?? undefined) : fallbackLogo;

  return {
    ...item,
    poster,
    backdrop,
    logo_url,
  };
}

export async function applyImageCdnToCatalog(
  movies: Media[],
  series: Media[]
): Promise<{ movies: Media[]; series: Media[] }> {
  if ((movies?.length || 0) === 0 && (series?.length || 0) === 0) {
    return { movies, series };
  }

  try {
    const assetsMap = await fetchAssetsMap(movies, series);

    const moviesWithAssets = movies.map((item) => applyAssetToItem(item, assetsMap, 'movie'));
    const seriesWithAssets = series.map((item) => applyAssetToItem(item, assetsMap, 'series'));

    return {
      movies: moviesWithAssets,
      series: seriesWithAssets,
    };
  } catch (error) {
    logger.warn(
      '[tmdbAssetsService] applyImageCdnToCatalog falhou, usando somente URLs TMDB:',
      error
    );
    return {
      movies: movies.map(normalizeTmdbOnly),
      series: series.map(normalizeTmdbOnly),
    };
  }
}
