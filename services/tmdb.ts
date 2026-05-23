import { Media, SeriesDetail, Episode, HeroBannerAsset } from '../types';
import { getApiKeyV3, getFetchOptions, getFetchOptionsForHome } from './tmdbKeys';
import { logger } from '../utils/logger';
import { toWebP } from '../utils/imageProxy';
import { fetchWithTimeout } from '../utils/fetchUtils';

const TMDB_TIMEOUT_MS = 20_000; // 20 s — necessário para TV Box em 3G/rede lenta
const TMDB_DIRECT_BASE_URL = 'https://api.themoviedb.org/3';

// ─── Roteamento de URL: produção usa Edge Function (token server-side) ──────
//
//  DEV:  /tmdb-proxy/... → vite proxy → api.themoviedb.org (token em .env local)
//  PROD: ${SUPABASE_URL}/functions/v1/tmdb-proxy/... → Edge Function → TMDB
//        (token em Deno.env — nunca no bundle JS do cliente)
//
//  Deploy da Edge Function:
//    supabase functions deploy tmdb-proxy
//    supabase secrets set TMDB_READ_TOKEN=<seu_read_token>
//
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TMDB_PROXY_BASE_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/tmdb-proxy` : '';

// Roteamento:
//  - DEV: proxy local do Vite (/tmdb-proxy).
//  - PROD/APK: proxy Supabase para evitar CORS no WebView/Fire TV.
//  - Fallback: TMDB direto apenas quando o proxy não estiver configurado.
const BASE_URL = import.meta.env.DEV
  ? '/tmdb-proxy'
  : TMDB_PROXY_BASE_URL || TMDB_DIRECT_BASE_URL;

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// ─── Helpers ──────────────────────────────────────────────────

function getClientTmdbFetchOpts(preferHomeToken = false): RequestInit | null {
  try {
    if (preferHomeToken) {
      const homeOpts = getFetchOptionsForHome();
      if (homeOpts) return homeOpts;
    }
    return getFetchOptions();
  } catch (error) {
    if (getApiKeyV3()) {
      return { method: 'GET', headers: { Accept: 'application/json' } };
    }
    logger.warn('[tmdb] Nenhuma credencial local disponível para fallback direto:', error);
    return null;
  }
}

function appendApiKeyV3(url: string, requestInit: RequestInit): string {
  const apiKey = getApiKeyV3();
  const headers = requestInit.headers as Record<string, string> | undefined;
  if (!apiKey || headers?.Authorization) return url;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : TMDB_DIRECT_BASE_URL;
    const parsed = new URL(url, base);
    if (!parsed.searchParams.has('api_key')) parsed.searchParams.set('api_key', apiKey);
    return parsed.toString();
  } catch {
    return url;
  }
}

function toDirectTmdbUrl(url: string): string | null {
  if (!url) return null;
  if (TMDB_PROXY_BASE_URL && url.startsWith(TMDB_PROXY_BASE_URL)) {
    return `${TMDB_DIRECT_BASE_URL}${url.slice(TMDB_PROXY_BASE_URL.length)}`;
  }
  if (url.startsWith('/tmdb-proxy')) {
    return `${TMDB_DIRECT_BASE_URL}${url.slice('/tmdb-proxy'.length)}`;
  }
  return url.startsWith(TMDB_DIRECT_BASE_URL) ? url : null;
}

function shouldFallbackToDirectTmdb(response: Response): boolean {
  return [401, 404, 429, 500, 502, 503, 504].includes(response.status);
}

/** Headers para fetch TMDB — Bearer no cliente em PROD; proxy local em DEV. */
function buildFetchOpts(): RequestInit {
  if (BASE_URL === '/tmdb-proxy') {
    return { method: 'GET', headers: { Accept: 'application/json' } };
  }
  if (TMDB_PROXY_BASE_URL && BASE_URL.startsWith(TMDB_PROXY_BASE_URL)) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }
    return { method: 'GET', headers };
  }
  return getFetchOptions();
}

async function fetchTmdb(url: string, options?: { preferHomeToken?: boolean }): Promise<Response> {
  const preferHomeToken = options?.preferHomeToken ?? false;
  const requestWithRetry = async (
    requestUrl: string,
    requestInit: RequestInit
  ): Promise<Response> => {
    const finalUrl = appendApiKeyV3(requestUrl, requestInit);
    let res = await fetchWithTimeout(finalUrl, requestInit, TMDB_TIMEOUT_MS);

    // ERR-03: retry with backoff for 429 (rate limit) and 503 (service unavailable).
    // Em dev, getFetchOptions() reveza o token; em prod, a Edge Function gerencia.
    if (res.status === 429 || res.status === 503) {
      const delay1 = res.status === 429 ? 1000 : 2000;
      await new Promise((resolve) => setTimeout(resolve, delay1));
      res = await fetchWithTimeout(finalUrl, requestInit, TMDB_TIMEOUT_MS);

      if (res.status === 429 || res.status === 503) {
        const delay2 = res.status === 429 ? 3000 : 5000;
        await new Promise((resolve) => setTimeout(resolve, delay2));
        res = await fetchWithTimeout(finalUrl, requestInit, TMDB_TIMEOUT_MS);
      }
    }

    return res;
  };

  const primaryOpts = buildFetchOpts();
  try {
    const res = await requestWithRetry(url, primaryOpts);
    if (!import.meta.env.PROD || !shouldFallbackToDirectTmdb(res)) {
      return res;
    }

    const directUrl = toDirectTmdbUrl(url);
    const directOpts = getClientTmdbFetchOpts(preferHomeToken);
    if (!directUrl || !directOpts) {
      return res;
    }

    logger.warn(`[tmdb] Proxy indisponível (${res.status}). Tentando TMDB direto: ${directUrl}`);
    return requestWithRetry(directUrl, directOpts);
  } catch (error) {
    if (!import.meta.env.PROD) throw error;

    const directUrl = toDirectTmdbUrl(url);
    const directOpts = getClientTmdbFetchOpts(preferHomeToken);
    if (!directUrl || !directOpts) {
      throw error;
    }

    logger.warn('[tmdb] Falha de rede no proxy. Tentando TMDB direto:', error);
    return requestWithRetry(directUrl, directOpts);
  }
}

async function fetchTmdbForHome(url: string): Promise<Response> {
  if (import.meta.env.PROD) return fetchTmdb(url, { preferHomeToken: true });
  const opts = getFetchOptionsForHome();
  if (opts) return fetchWithTimeout(url, opts, TMDB_TIMEOUT_MS);
  return fetchTmdb(url);
}

const handleResponse = async (response: Response, errorMessage: string) => {
  if (!response.ok) throw new Error(`${errorMessage} (${response.status})`);
  return response.json();
};

// ─── Exports: Core ──────────────────────────────────────────────────

export async function fetchDetails(id: number, type: 'movie' | 'tv' | 'series'): Promise<any> {
  const t = type === 'series' ? 'tv' : type;
  const response = await fetchTmdb(
    `${BASE_URL}/${t}/${id}?append_to_response=images,videos&include_image_language=pt,en,null&language=pt-BR`
  );
  return handleResponse(response, 'Erro ao buscar detalhes');
}

export function getImageUrl(
  path: string | null | undefined,
  size:
    | 'original'
    | 'w500'
    | 'w200'
    | 'w1280'
    | 'w780'
    | 'h632'
    | 'w342'
    | 'w154'
    | 'w300' = 'original',
  /** `logo` = sem proxy WebP (preserva PNG TMDB). */
  role: 'standard' | 'logo' = 'standard'
): string | undefined {
  if (!path) return undefined;
  const raw = `${IMAGE_BASE_URL}/${size}${path}`;
  if (role === 'logo') return toWebP(raw, 'logo');
  return toWebP(
    raw,
    size === 'original' || size === 'w1280' || size === 'w780' ? 'backdrop' : 'poster'
  );
}

export function getBannerWebPUrl(tmdbId: number | undefined, fallbackUrl: string): string {
  if (!tmdbId || tmdbId <= 0) return fallbackUrl;
  const custom = String(import.meta.env.VITE_SUPABASE_IMAGES_URL || '')
    .trim()
    .replace(/\/$/, '');
  const fromProject = String(import.meta.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  const base = custom || fromProject;
  if (!base) return fallbackUrl;
  return `${base}/storage/v1/object/public/posters/webp/${tmdbId}.webp`;
}

// ─── Exports: Media Fetching ──────────────────────────────────────────────────

export async function fetchMovieById(id: number): Promise<Media> {
  try {
    const response = await fetchTmdb(`${BASE_URL}/movie/${id}?language=pt-BR`);
    const data = await handleResponse(response, 'Filme não encontrado');
    return await transformTMDBItem(data, 'movie');
  } catch (error) {
    logger.error('[tmdb] Error fetching movie by ID:', error);
    throw error;
  }
}

export async function fetchSeriesById(id: number): Promise<Media> {
  try {
    const response = await fetchTmdb(`${BASE_URL}/tv/${id}?language=pt-BR`);
    const data = await handleResponse(response, 'Série não encontrada');
    return await transformTMDBItem(data, 'series');
  } catch (error) {
    logger.error('[tmdb] Error fetching series by ID:', error);
    throw error;
  }
}

export async function fetchMoviesByTrending(): Promise<Media[]> {
  try {
    const response = await fetchTmdbForHome(`${BASE_URL}/trending/movie/week?language=pt-BR`);
    const data = await handleResponse(response, 'Erro ao carregar tendências');
    return Promise.all(data.results.map((item: any) => transformTMDBItem(item, 'movie')));
  } catch (error) {
    logger.error('[tmdb] Error fetching trending movies:', error);
    return [];
  }
}

export async function fetchMoviesByGenre(genreId: number): Promise<Media[]> {
  try {
    const response = await fetchTmdbForHome(
      `${BASE_URL}/discover/movie?with_genres=${genreId}&language=pt-BR&sort_by=popularity.desc`
    );
    const data = await handleResponse(response, 'Erro ao carregar filmes por gênero');
    return Promise.all(data.results.map((item: any) => transformTMDBItem(item, 'movie')));
  } catch (error) {
    logger.error('[tmdb] Error fetching movies by genre:', error);
    return [];
  }
}

export async function fetchSeriesByTrending(): Promise<Media[]> {
  try {
    const response = await fetchTmdbForHome(`${BASE_URL}/trending/tv/week?language=pt-BR`);
    const data = await handleResponse(response, 'Erro ao carregar séries em destaque');
    return Promise.all(data.results.map((item: any) => transformTMDBItem(item, 'series')));
  } catch (error) {
    logger.error('[tmdb] Error fetching trending series:', error);
    return [];
  }
}

export async function fetchSeriesByGenre(genreId: number): Promise<Media[]> {
  try {
    const response = await fetchTmdbForHome(
      `${BASE_URL}/discover/tv?with_genres=${genreId}&language=pt-BR&sort_by=popularity.desc`
    );
    const data = await handleResponse(response, 'Erro ao carregar séries por gênero');
    return Promise.all(data.results.map((item: any) => transformTMDBItem(item, 'series')));
  } catch (error) {
    logger.error('[tmdb] Error fetching series by genre:', error);
    return [];
  }
}

// ─── Exports: TMDB Lists (Top 100) ──────────────────────────────────────────

const CACHE_TTL_12H = 12 * 60 * 60 * 1000;

async function fetchMultiPageTmdbList(cacheKey: string, endpoint: string, pages: number = 5): Promise<number[]> {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() < parsed.expiresAt) return parsed.ids;
    }
  } catch (e) {}

  const ids = new Set<number>();
  const promises = [];
  for (let p = 1; p <= pages; p++) {
    const separator = endpoint.includes('?') ? '&' : '?';
    promises.push(
      fetchTmdbForHome(`${BASE_URL}${endpoint}${separator}page=${p}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          data.results?.forEach((item: any) => {
            if (item.id) ids.add(item.id);
          });
        })
        .catch(() => {})
    );
  }
  await Promise.allSettled(promises);
  
  const idArray = Array.from(ids);
  if (idArray.length > 0) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ids: idArray, expiresAt: Date.now() + CACHE_TTL_12H }));
    } catch (e) {}
  }
  return idArray;
}

export async function fetchTop100PopularIds(): Promise<number[]> {
  return fetchMultiPageTmdbList('tmdb_popular_ids', '/trending/all/week?language=pt-BR', 5);
}

export async function fetchTop100TopRatedIds(): Promise<number[]> {
  const [movies, series] = await Promise.all([
    fetchMultiPageTmdbList('tmdb_top_rated_movies', '/movie/top_rated?language=pt-BR', 3),
    fetchMultiPageTmdbList('tmdb_top_rated_series', '/tv/top_rated?language=pt-BR', 3)
  ]);
  return [...new Set([...movies, ...series])];
}

export async function fetchTop100NewestIds(): Promise<number[]> {
  const [movies, series] = await Promise.all([
    fetchMultiPageTmdbList('tmdb_newest_movies', '/discover/movie?sort_by=primary_release_date.desc&vote_count.gte=50&language=pt-BR', 3),
    fetchMultiPageTmdbList('tmdb_newest_series', '/discover/tv?sort_by=first_air_date.desc&vote_count.gte=50&language=pt-BR', 3)
  ]);
  return [...new Set([...movies, ...series])];
}

export async function searchMedia(query: string): Promise<Media[]> {
  try {
    const response = await fetchTmdb(
      `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=pt-BR`
    );
    const data = await handleResponse(response, 'Erro na busca');
    return Promise.all(
      data.results
        .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
        .map((item: any) => transformTMDBItem(item, item.media_type === 'tv' ? 'series' : 'movie'))
    );
  } catch (error) {
    logger.error('[tmdb] Error searching media:', error);
    return [];
  }
}

const detailsCache = new Map<string, Promise<any>>();
const MAX_DETAILS_CACHE = 200;

export async function fetchSeriesDetail(id: number): Promise<SeriesDetail | null> {
  const cacheKey = `series-detail-${id}`;
  if (detailsCache.has(cacheKey)) return detailsCache.get(cacheKey);

  const promise = (async () => {
    try {
      const response = await fetchTmdb(
        `${BASE_URL}/tv/${id}?append_to_response=credits,similar,videos&language=pt-BR`
      );
      const data = await handleResponse(response, 'Série não encontrada');
      const trailer =
        data.videos?.results?.find((v: any) => v.type === 'Trailer') || data.videos?.results?.[0];
      return {
        ...data,
        id: data.id,
        name: data.name,
        overview: data.overview,
        first_air_date: data.first_air_date,
        vote_average: data.vote_average,
        genres: data.genres,
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        number_of_seasons: data.number_of_seasons,
        number_of_episodes: data.number_of_episodes,
        credits: data.credits,
        similar: data.similar,
        videos: data.videos,
        trailerKey: trailer?.key,
      };
    } catch (error) {
      logger.error('[tmdb] Error fetching series detail:', error);
      detailsCache.delete(cacheKey);
      return null;
    }
  })();

  if (detailsCache.size >= MAX_DETAILS_CACHE) {
    const oldest = detailsCache.keys().next().value;
    if (oldest !== undefined) detailsCache.delete(oldest);
  }
  detailsCache.set(cacheKey, promise);
  return promise;
}

export async function fetchMovieDetail(id: number): Promise<any> {
  const cacheKey = `movie-detail-${id}`;
  if (detailsCache.has(cacheKey)) return detailsCache.get(cacheKey);

  const promise = (async () => {
    try {
      const response = await fetchTmdb(
        `${BASE_URL}/movie/${id}?append_to_response=credits,similar,videos&language=pt-BR`
      );
      const data = await handleResponse(response, 'Filme não encontrado');
      return {
        ...data,
        name: data.title,
        first_air_date: data.release_date,
        number_of_seasons: 0,
        number_of_episodes: 0,
      };
    } catch (error) {
      logger.error('[tmdb] Error fetching movie detail:', error);
      detailsCache.delete(cacheKey);
      return null;
    }
  })();

  if (detailsCache.size >= MAX_DETAILS_CACHE) {
    const oldest = detailsCache.keys().next().value;
    if (oldest !== undefined) detailsCache.delete(oldest);
  }
  detailsCache.set(cacheKey, promise);
  return promise;
}

export async function fetchSeriesCredits(id: number, type: 'movie' | 'series') {
  try {
    const t = type === 'series' ? 'tv' : 'movie';
    const response = await fetchTmdb(`${BASE_URL}/${t}/${id}/credits?language=pt-BR`);
    return handleResponse(response, 'Erro ao buscar créditos');
  } catch (error) {
    logger.error('[tmdb] Error fetching credits:', error);
    return { cast: [], crew: [] };
  }
}

export async function fetchSeriesProviders(id: number, type: 'movie' | 'series') {
  try {
    const t = type === 'series' ? 'tv' : 'movie';
    const response = await fetchTmdb(`${BASE_URL}/${t}/${id}/watch/providers`);
    return handleResponse(response, 'Erro ao buscar provedores');
  } catch (error) {
    logger.error('[tmdb] Error fetching providers:', error);
    return null;
  }
}

export async function fetchSeasonEpisodes(
  seriesId: number,
  seasonNumber: number
): Promise<Episode[]> {
  try {
    const response = await fetchTmdb(
      `${BASE_URL}/tv/${seriesId}/season/${seasonNumber}?language=pt-BR`
    );
    const data = await handleResponse(response, 'Temporada não encontrada');
    return data.episodes;
  } catch (error) {
    logger.error('[tmdb] Error fetching season episodes:', error);
    return [];
  }
}

export async function fetchSimilar(
  id: number,
  type: 'movie' | 'series'
): Promise<Partial<Media>[]> {
  try {
    const t = type === 'series' ? 'tv' : 'movie';
    const response = await fetchTmdb(`${BASE_URL}/${t}/${id}/similar?language=pt-BR&page=1`);
    if (!response.ok) return [];
    const data = await response.json();
    return ((data.results ?? []) as any[]).slice(0, 6).map((r) => ({
      id: String(r.id),
      tmdb_id: r.id as number,
      title: (r.title || r.name || '') as string,
      poster: r.poster_path ? `${IMAGE_BASE_URL}/w200${r.poster_path}` : undefined,
      type,
    }));
  } catch {
    return [];
  }
}

// ─── Exports: Hero Banner Assets ──────────────────────────────────────────────────

const heroBannerAssetCache = new Map<string, Promise<any>>();
const MAX_HERO_BANNER_CACHE = 100;

function pickPngLogoForHero(logos: any[]): any | null {
  if (!logos || logos.length === 0) return null;
  const ptLogos = logos.filter((l: any) => l.iso_639_1 === 'pt');
  const enLogos = logos.filter((l: any) => l.iso_639_1 === 'en');
  const pool = ptLogos.length > 0 ? ptLogos : enLogos.length > 0 ? enLogos : logos;
  return pool.sort((a: any, b: any) => b.vote_count - a.vote_count)[0];
}

export async function getOfficialHeroBannerAsset(
  tmdbId: number,
  type: 'movie' | 'series'
): Promise<HeroBannerAsset | null> {
  if (!tmdbId || tmdbId <= 0) return null;
  const cacheKey = `${type}-${tmdbId}`;
  let promise = heroBannerAssetCache.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      try {
        const path = type === 'series' ? 'tv' : 'movie';
        const response = await fetchTmdb(
          `${BASE_URL}/${path}/${tmdbId}?append_to_response=images,videos&include_image_language=pt,en,null&language=pt-BR`
        );
        const data = await handleResponse(response, 'Erro ao carregar assets oficiais');
        const backdropPath = data.backdrop_path || data.images?.backdrops?.[0]?.file_path;
        if (!backdropPath) return null;
        const trailer =
          (data.videos?.results || []).find(
            (v: any) => v.type === 'Trailer' && v.site === 'YouTube'
          ) || data.videos?.results?.[0];
        const logo = pickPngLogoForHero(data?.images?.logos || []);
        return {
          backdrop: getImageUrl(backdropPath, 'w1280')!,
          logo:
            typeof logo?.file_path === 'string' && logo.file_path.startsWith('/')
              ? getImageUrl(logo.file_path, 'original', 'logo') || null
              : null,
          trailerKey: trailer?.key ? String(trailer.key).trim() : null,
          description:
            typeof data?.overview === 'string' && data.overview.trim().length > 0
              ? data.overview.trim()
              : null,
        };
      } catch (error) {
        logger.warn('[tmdb] Falha ao montar asset oficial do hero banner:', error);
        return null;
      }
    })();
    if (heroBannerAssetCache.size >= MAX_HERO_BANNER_CACHE) {
      const oldest = heroBannerAssetCache.keys().next().value;
      if (oldest !== undefined) heroBannerAssetCache.delete(oldest);
    }
    heroBannerAssetCache.set(cacheKey, promise);
  }
  return promise;
}

// ─── Exports: Catalog Enrichement (from tmdbCatalog) ───────────────────

const TITLE_TO_TMDB_ID: Record<string, number> = {
  'bob esponja: o incrível resgate': 400160,
  'bob esponja o incrível resgate': 400160,
  'bob esponja - o incrível resgate': 400160,
  'bob esponja o incrivel resgate': 400160,
  'spongebob: sponge on the run': 400160,
  'the spongebob movie: sponge on the run': 400160,
  luca: 508943,
};

export async function fetchTrendingForBanner(): Promise<Media[]> {
  try {
    const response = await fetchTmdb(`${BASE_URL}/trending/all/week?language=pt-BR`);
    const data = await handleResponse(response, 'Failed to fetch trending for banner');

    return Promise.all(
      data.results
        .slice(0, 15)
        .map((item: any) =>
          transformTMDBItem(item, item.media_type === 'movie' ? 'movie' : 'series')
        )
    );
  } catch (error) {
    logger.error('[tmdb] Error fetching trending for banner:', error);
    return [];
  }
}

// ─── Cache provider → tmdb_ids ─────────────────────────────────────────────
const providerTmdbIdCache = new Map<string, { ids: Set<number>; expiresAt: number }>();
const PROVIDER_CACHE_TTL_MS = 60 * 60_000; // 1 hora

/**
 * Retorna um Set com todos os TMDB IDs de filmes + séries disponíveis para um
 * provedor de streaming (ex.: Netflix = 8) na região BR via TMDB Discover API.
 */
export async function getProviderTmdbIds(providerId: number, pages = 5): Promise<Set<number>> {
  const cacheKey = `${providerId}`;
  const cached = providerTmdbIdCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.ids;

  const ids = new Set<number>();
  const params = `with_watch_providers=${providerId}&watch_region=BR&language=pt-BR`;

  const fetchPage = async (type: 'movie' | 'tv', page: number) => {
    try {
      const res = await fetchTmdb(`${BASE_URL}/discover/${type}?${params}&page=${page}`);
      if (!res.ok) return;
      const data = (await res.json()) as { results?: Array<{ id: number }> };
      (data.results ?? []).forEach((item) => ids.add(item.id));
    } catch {
      /* ignora erros de rede */
    }
  };

  const tasks: Promise<void>[] = [];
  for (let p = 1; p <= pages; p++) {
    tasks.push(fetchPage('movie', p));
    tasks.push(fetchPage('tv', p));
  }
  await Promise.allSettled(tasks);

  providerTmdbIdCache.set(cacheKey, { ids, expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS });
  return ids;
}

export async function enrichWithTMDB(items: Media[]): Promise<Media[]> {
  const batchSize = 8;
  const enriched: Media[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        let tmdbData: any = null;
        const titleKey = (item.title || '').toLowerCase().trim();
        const normalizedKey = titleKey
          .replace(/[:\-–—]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const knownId = TITLE_TO_TMDB_ID[titleKey] || TITLE_TO_TMDB_ID[normalizedKey];

        if (knownId) {
          tmdbData = await fetchDetails(knownId, item.type === 'series' ? 'tv' : 'movie');
        } else if (item.tmdb_id && item.tmdb_id > 0) {
          tmdbData = await fetchDetails(item.tmdb_id, item.type === 'series' ? 'tv' : 'movie');
        }

        if (tmdbData) {
          const poster = tmdbData.poster_path
            ? getImageUrl(tmdbData.poster_path, 'w500')
            : undefined;
          const backdrop = tmdbData.backdrop_path
            ? getImageUrl(tmdbData.backdrop_path, 'w1280')
            : undefined;

          // Extrair gêneros do TMDB para classificação correta (deduplicar nomes)
          let tmdbGenres: string[] = [];
          if (tmdbData.genres && Array.isArray(tmdbData.genres)) {
            const genreList = tmdbData.genres as Array<{ name?: string | null }>;
            const names = genreList
              .map((g) => g?.name)
              .filter(
                (name: string | null | undefined): name is string =>
                  typeof name === 'string' && name.length > 0
              );
            tmdbGenres = [...new Set(names)];
          } else if (tmdbData.genre_ids && Array.isArray(tmdbData.genre_ids)) {
            const idList = tmdbData.genre_ids as number[];
            const names = idList
              .map((id: number) => GENRE_MAP[id])
              .filter(
                (label: string | undefined): label is string =>
                  typeof label === 'string' && label.length > 0
              );
            tmdbGenres = [...new Set(names)];
          }

          // Usar gêneros TMDB se disponíveis, senão manter os existentes
          const finalGenres = tmdbGenres.length > 0 ? tmdbGenres : item.genre || [];

          return {
            ...item,
            // TMDB sempre tem prioridade — Supabase guarda URL mas TMDB enriquece
            poster: poster || item.poster,
            backdrop: backdrop || item.backdrop,
            // poster_path e backdrop_path crus do TMDB para getMediaPoster/getMediaBackdrop
            // Vertical (poster_path) = imagem 2:3 portrait
            // Horizontal (backdrop_path) = imagem 16:9 landscape
            poster_path: tmdbData.poster_path || (item as any).poster_path,
            backdrop_path: tmdbData.backdrop_path || (item as any).backdrop_path,
            // Logo do TMDB (se disponível nas images)
            logo_url: (() => {
              const logos = tmdbData.images?.logos;
              if (logos && logos.length > 0) {
                const ptLogo = logos.find((l: any) => l.iso_639_1 === 'pt');
                const enLogo = logos.find((l: any) => l.iso_639_1 === 'en');
                const bestLogo = ptLogo || enLogo || logos[0];
                return bestLogo?.file_path
                  ? getImageUrl(bestLogo.file_path, 'w500', 'logo')
                  : (item as any).logo_url;
              }
              return (item as any).logo_url;
            })(),
            tmdb_id: tmdbData.id || item.tmdb_id,
            description: item.description || tmdbData.overview || '',
            year:
              item.year ||
              (tmdbData.release_date || tmdbData.first_air_date
                ? new Date(tmdbData.release_date || tmdbData.first_air_date).getFullYear()
                : undefined),
            genre: finalGenres,
            rating:
              typeof tmdbData.vote_average === 'number' && tmdbData.vote_average > 0
                ? tmdbData.vote_average
                : typeof item.rating === 'number'
                  ? item.rating
                  : undefined,
          };
        }
        return item;
      })
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        enriched.push(r.value);
      } else {
        // TMDB call falhou (404, rate limit, rede) — usar item original do DB.
        // O item tem stream_url real e poster do Supabase; não deve ser dropado.
        enriched.push(batch[idx]);
      }
    });
  }
  return enriched;
}

/**
 * Retorna o nome da plataforma de streaming principal para o Brasil (BR).
 * Consulta flatrate (assinatura) > ads > buy, retorna a primeira encontrada.
 */
export async function getWatchProviderName(
  tmdbId: number,
  type: 'movie' | 'series'
): Promise<string | null> {
  try {
    const endpoint = type === 'movie' ? 'movie' : 'tv';
    const response = await fetchTmdb(`${BASE_URL}/${endpoint}/${tmdbId}/watch/providers`);
    if (!response.ok) return null;
    const data = await response.json();
    const br = data.results?.BR;
    if (!br) return null;
    // Preferência: assinatura > ads > compra/aluguel
    const provider = br.flatrate?.[0] || br.ads?.[0] || br.rent?.[0] || br.buy?.[0];
    return provider?.provider_name || null;
  } catch {
    return null;
  }
}

/**
 * Busca múltipla pt-BR e en-US para garantir melhores resultados
 */
export async function searchAnyLang(query: string): Promise<any[]> {
  if (!query) return [];
  try {
    const [ptRes, enRes] = await Promise.all([
      fetchTmdb(
        `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=pt-BR&include_adult=false`
      ),
      fetchTmdb(
        `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=en-US&include_adult=false`
      ),
    ]);
    const ptData = await handleResponse(ptRes, 'Erro na busca (pt-BR)');
    const enData = await handleResponse(enRes, 'Erro na busca (en-US)');

    const combined = [...(ptData.results || []), ...(enData.results || [])];
    const seen = new Set<string>();
    return combined.filter((r: any) => {
      const key = `${r.media_type}-${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err) {
    logger.error('[tmdb] Error in searchAnyLang:', err);
    return [];
  }
}

export async function getTrailer(
  id: number,
  type: 'movie' | 'series'
): Promise<string | undefined> {
  try {
    const res = await fetchTmdb(
      `${BASE_URL}/${type === 'movie' ? 'movie' : 'tv'}/${id}/videos?language=pt-BR`
    );
    const data = await res.json();
    const trailer = data.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
    return trailer?.key;
  } catch {
    return undefined;
  }
}

export async function getMediaDetailsByID(id: number, type: 'movie' | 'series') {
  try {
    const res = await fetchTmdb(
      `${BASE_URL}/${type === 'movie' ? 'movie' : 'tv'}/${id}?append_to_response=videos,images&language=pt-BR&include_image_language=pt-BR,pt,en,null`
    );
    const data = await handleResponse(res, 'Erro ao buscar detalhes complementares');

    const trailer =
      data.videos?.results?.find(
        (v: any) =>
          v.type === 'Trailer' &&
          v.site === 'YouTube' &&
          (v.iso_639_1 === 'pt' || v.name.toLowerCase().includes('dublado'))
      ) || data.videos?.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');

    const logo = pickPngLogoForHero(data.images?.logos || []);

    return {
      backdrop: data.backdrop_path ? getImageUrl(data.backdrop_path, 'w1280') : undefined,
      poster: data.poster_path ? getImageUrl(data.poster_path, 'w500') : undefined,
      logo: logo?.file_path ? getImageUrl(logo.file_path, 'original', 'logo') : undefined,
      trailer: trailer?.key,
      description:
        typeof data.overview === 'string' && data.overview.trim().length > 0
          ? data.overview.trim()
          : undefined,
      year: Number.isNaN(new Date(data.release_date || data.first_air_date).getFullYear())
        ? undefined
        : new Date(data.release_date || data.first_air_date).getFullYear(),
      rating: data.vote_average?.toFixed(1),
    };
  } catch (error) {
    logger.error('[tmdb] Error fetching details by ID:', error);
    return null;
  }
}

export async function getLogo(id: number, type: 'movie' | 'series'): Promise<string | undefined> {
  try {
    const res = await fetchTmdb(
      `${BASE_URL}/${type === 'movie' ? 'movie' : 'tv'}/${id}/images?language=pt-BR&include_image_language=pt-BR,pt,en,null`
    );
    const data = await handleResponse(res, 'Erro ao buscar logo');
    const logo = pickPngLogoForHero(data.logos || []);
    return logo?.file_path ? getImageUrl(logo.file_path, 'original', 'logo') : undefined;
  } catch (error) {
    logger.error('[tmdb] Error fetching logo:', error);
    return undefined;
  }
}

/** Logo horizontal (cards / detalhes) — mesmo pipeline que `getLogo`. */
export async function getHorizontalCardLogo(
  tmdbId: number,
  mediaType: 'movie' | 'series'
): Promise<string | undefined> {
  return getLogo(tmdbId, mediaType);
}

/** Preferência pt → en → melhor votado (PNG/SVG do TMDB). */
export function pickLogoEnPtOrNull(
  logos:
    | Array<{ iso_639_1?: string | null; file_path?: string | null; vote_count?: number }>
    | null
    | undefined
): { file_path: string } | null {
  if (!logos?.length) return null;
  const pt = logos.find((l) => l.iso_639_1 === 'pt' && l.file_path);
  const en = logos.find((l) => l.iso_639_1 === 'en' && l.file_path);
  const fallback = pickPngLogoForHero(logos as any);
  const chosen = pt || en || fallback;
  if (chosen?.file_path && typeof chosen.file_path === 'string')
    return { file_path: chosen.file_path };
  return null;
}

export async function fetchTMDBCatalog(movies: Media[], series: Media[]) {
  try {
    const [tMovies, tSeries, enrichedMovies, enrichedSeries] = await Promise.all([
      fetchTrendingMedia('movie'),
      fetchTrendingMedia('tv'),
      enrichWithTMDB(movies),
      enrichWithTMDB(series),
    ]);

    return {
      trendingMovies: tMovies,
      trendingSeries: tSeries,
      enrichedMovies,
      enrichedSeries,
    };
  } catch (error) {
    logger.error('[tmdb] Error fetching TMDB catalog:', error);
    return {
      trendingMovies: [],
      trendingSeries: [],
      enrichedMovies: movies,
      enrichedSeries: series,
    };
  }
}

async function fetchTrendingMedia(type: 'movie' | 'tv'): Promise<Media[]> {
  try {
    // Trending: 3 páginas (60 candidatos) + Discover popular: 3 páginas (60 extras) = 120 candidatos totais
    // Usando tokens em rotação para não exceder rate limit de nenhuma chave individual
    const trendingUrls = [1, 2, 3].map(
      (p) => `${BASE_URL}/trending/${type}/week?language=pt-BR&page=${p}`
    );
    const discoverUrls = [1, 2, 3].map(
      (p) =>
        `${BASE_URL}/discover/${type}?language=pt-BR&sort_by=popularity.desc&vote_count.gte=50&page=${p}`
    );

    const allUrls = [...trendingUrls, ...discoverUrls];
    const responses = await Promise.allSettled(allUrls.map((url) => fetchTmdbForHome(url)));

    const allItems: any[] = [];
    for (const r of responses) {
      if (r.status === 'fulfilled') {
        try {
          const data = await r.value.json();
          if (data?.results) allItems.push(...data.results);
        } catch {
          /* ignora página com erro */
        }
      }
    }

    // Deduplicar por id (trending tem prioridade — já vem primeiro)
    const seen = new Set<number>();
    const unique = allItems.filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    return Promise.all(
      unique.map((item: any) => transformTMDBItem(item, type === 'tv' ? 'series' : 'movie'))
    );
  } catch {
    return [];
  }
}

// ─── Private: Transformations ──────────────────────────────────────────────────

async function transformTMDBItem(item: any, type: 'movie' | 'series'): Promise<Media> {
  const backdrop = item.backdrop_path ? getImageUrl(item.backdrop_path, 'w1280') : undefined;
  const poster = item.poster_path ? getImageUrl(item.poster_path, 'w500') : undefined;
  const genreIds = item.genre_ids || [];
  let genreNames: string[] = [];
  try {
    const maps = await getGenreMaps();
    const map = type === 'movie' ? maps.movie : maps.tv;
    genreNames = genreIds.map((id: number) => map.get(id)).filter(Boolean) as string[];
  } catch {
    /* ignore */
  }
  return {
    id: `${type}-${item.id}`,
    tmdb_id: item.id,
    title: item.title || item.name,
    type,
    description: item.overview,
    rating: undefined, // Classificação etária não é vote_average — não mapear para rating numérico
    year: new Date(item.release_date || item.first_air_date).getFullYear(),
    genre: genreNames,
    backdrop: backdrop || poster,
    poster,
    stars: [],
    duration: type === 'movie' ? (item.runtime ? `${item.runtime}m` : undefined) : undefined,
    seasons: item.number_of_seasons,
  };
}

// ─── Exports: Genre Mapping ──────────────────────────────────────────

const GENRE_MAP: Record<number, string> = {
  28: 'Ação',
  12: 'Aventura',
  16: 'Animação',
  35: 'Comédia',
  80: 'Crime',
  99: 'Documentário',
  18: 'Drama',
  10751: 'Família',
  14: 'Fantasia',
  36: 'História',
  27: 'Terror',
  10402: 'Música',
  9648: 'Mistério',
  10749: 'Romance',
  878: 'Ficção Científica',
  10770: 'Cinema TV',
  53: 'Suspense',
  10752: 'Guerra',
  37: 'Faroeste',
  10759: 'Ação & Aventura',
  10762: 'Kids',
  10763: 'Notícias',
  10764: 'Reality',
  10765: 'Ficção Científica & Fantasia',
  10766: 'Novela',
  10767: 'Talk Show',
  10768: 'Guerra & Política',
};

export function getGenreName(id: number): string {
  return GENRE_MAP[id] || 'Outros';
}

// ─── Exports: Advanced Search / Discover ──────────────────────────────

export async function discoverContent(
  type: 'movie' | 'series',
  params: { year?: number; genreId?: string; page?: number }
): Promise<Media[]> {
  try {
    const t = type === 'series' ? 'tv' : 'movie';
    const queryParams = new URLSearchParams({
      language: 'pt-BR',
      sort_by: 'popularity.desc',
      page: (params.page || 1).toString(),
      'vote_count.gte': '50',
    });
    if (params.year) {
      if (type === 'movie') queryParams.append('primary_release_year', params.year.toString());
      else queryParams.append('first_air_date_year', params.year.toString());
    }
    if (params.genreId && params.genreId !== 'Todos') {
      queryParams.append('with_genres', params.genreId);
    }
    const res = await fetchTmdb(`${BASE_URL}/discover/${t}?${queryParams.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Promise.all(data.results.map((item: any) => transformTMDBItem(item, type)));
  } catch (err) {
    logger.warn('[tmdb] Error in discoverContent:', err);
    return [];
  }
}

// ─── Exports: tmdbService compatibility ──────────────────────────────

const serviceCache = new Map<string, Promise<any>>();
const MAX_SERVICE_CACHE = 500;

export async function getTMDBImageSet(
  tmdbId: number | string | undefined | null,
  type: 'movie' | 'series'
) {
  const id = Number(tmdbId);
  if (!id || id <= 0) return null;
  const cacheKey = `set:${type}:${id}`;
  if (serviceCache.has(cacheKey)) return serviceCache.get(cacheKey)!;
  // LRU eviction: remove oldest entry when cache is full
  if (serviceCache.size >= MAX_SERVICE_CACHE) {
    const oldest = serviceCache.keys().next().value;
    if (oldest) serviceCache.delete(oldest);
  }

  const promise = (async () => {
    try {
      const data = await fetchDetails(id, type === 'series' ? 'tv' : 'movie');
      if (!data) return null;
      const trailer =
        data.videos?.results?.find((v: any) => v.type === 'Trailer') || data.videos?.results?.[0];
      const logoPick = pickPngLogoForHero(data.images?.logos || []);
      return {
        poster: getImageUrl(data.poster_path, 'w500'),
        backdrop: getImageUrl(data.backdrop_path, 'w1280'),
        logo:
          logoPick?.file_path && typeof logoPick.file_path === 'string'
            ? getImageUrl(logoPick.file_path, 'original', 'logo') || null
            : null,
        releaseDate: data.release_date || data.first_air_date || null,
        year:
          data.release_date || data.first_air_date
            ? new Date(data.release_date || data.first_air_date).getFullYear()
            : null,
        overview: data.overview || null,
        genres: (data.genres || []).map((g: any) => g.name),
        runtime: data.runtime || data.episode_run_time?.[0] || null,
        trailerKey: trailer?.key || null,
      };
    } catch {
      return null;
    }
  })();
  serviceCache.set(cacheKey, promise);
  return promise;
}

export async function getTMDBLogo(
  tmdbId: number | string | undefined | null,
  type: 'movie' | 'series'
): Promise<string | null> {
  const set = await getTMDBImageSet(tmdbId, type);
  return set?.logo || null;
}

export async function getTMDBPosters(
  tmdbId: number | string | undefined | null,
  type: 'movie' | 'series'
) {
  const set = await getTMDBImageSet(tmdbId, type);
  return { poster: set?.poster || null, backdrop: set?.backdrop || null };
}

/** Busca a classificação etária (certificação) de um título no TMDB.
 *  Retorna o rating BR (ex.: "L", "10", "12", "14", "16", "18") ou null. */
const _certCache = new Map<string, string | null>();
export async function getCertification(
  id: number,
  type: 'movie' | 'series'
): Promise<string | null> {
  const key = `${type}-${id}`;
  if (_certCache.has(key)) return _certCache.get(key) ?? null;
  try {
    const endpoint = type === 'movie' ? `movie/${id}/release_dates` : `tv/${id}/content_ratings`;
    const res = await fetchTmdb(`${BASE_URL}/${endpoint}`);
    if (!res.ok) {
      _certCache.set(key, null);
      return null;
    }
    const data = await res.json();
    let cert: string | null = null;
    if (type === 'movie') {
      const br = (data.results || []).find((r: any) => r.iso_3166_1 === 'BR');
      cert = br?.release_dates?.[0]?.certification || null;
    } else {
      const br = (data.results || []).find((r: any) => r.iso_3166_1 === 'BR');
      cert = br?.rating || null;
    }
    _certCache.set(key, cert);
    return cert;
  } catch {
    _certCache.set(key, null);
    return null;
  }
}

/** Filmes com lançamento em breve (TMDB /movie/upcoming, região BR). */
export async function fetchUpcomingMovies(): Promise<any[]> {
  try {
    const res = await fetchTmdbForHome(`${BASE_URL}/movie/upcoming?language=pt-BR&region=BR`);
    const data = await handleResponse(res, 'Erro ao carregar próximos lançamentos');
    return (data.results || []).filter((r: any) => r.backdrop_path).slice(0, 15);
  } catch {
    return [];
  }
}

/** Séries em exibição agora (TMDB /tv/on_the_air). */
export async function fetchOnAirSeries(): Promise<any[]> {
  try {
    const res = await fetchTmdbForHome(`${BASE_URL}/tv/on_the_air?language=pt-BR`);
    const data = await handleResponse(res, 'Erro ao carregar séries em exibição');
    return (data.results || []).filter((r: any) => r.backdrop_path).slice(0, 15);
  } catch {
    return [];
  }
}

// PERF-01 fix: deduplicar chamadas a getGenreMaps() — uma única promise in-flight
let genreMapsCache: { movie: Map<number, string>; tv: Map<number, string> } | null = null;
let genreMapsInFlight: Promise<{ movie: Map<number, string>; tv: Map<number, string> }> | null =
  null;
async function getGenreMaps() {
  if (genreMapsCache) return genreMapsCache;
  if (genreMapsInFlight) return genreMapsInFlight;
  genreMapsInFlight = (async () => {
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetchTmdb(`${BASE_URL}/genre/movie/list?language=pt-BR`),
        fetchTmdb(`${BASE_URL}/genre/tv/list?language=pt-BR`),
      ]);
      const movieData = await movieRes.json();
      const tvData = await tvRes.json();
      genreMapsCache = {
        movie: new Map(movieData.genres.map((g: any) => [g.id, g.name])),
        tv: new Map(tvData.genres.map((g: any) => [g.id, g.name])),
      };
      return genreMapsCache;
    } catch (error) {
      logger.error('[tmdb] Error fetching genre maps:', error);
      return { movie: new Map(), tv: new Map() };
    } finally {
      genreMapsInFlight = null;
    }
  })();
  return genreMapsInFlight;
}
