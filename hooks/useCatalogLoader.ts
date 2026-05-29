/**
 * useCatalogLoader.ts — Hook responsavel pelo carregamento, cache e atualizacao em
 * background do catalogo de filmes e series.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Media } from '../types';
import { getCatalogWithFilters } from '../services/supabaseService';
import { getCatalogSettings } from '../services/catalogService';
import { enrichPlatformFromTmdbBackground } from '../services/platformEnrichment';
import { enrichWithTMDB } from '../services/tmdb';
import { filterOutSeasons, hasValidVideoUrl, hasPosterAndVideo } from '../utils/mediaUtils';
import { removeDuplicates, sortByRating } from '../utils/catalogUtils';
import { logger } from '../utils/logger';
import { setSignal } from '../utils/appSignals';
import {
  PAGE_MIN_MOVIES,
  PAGE_MIN_SERIES,
  PAGE_MIN_KIDS,
  countWithTmdbId,
  buildHomeGenreMap,
} from '../config/homeCatalog';
import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';
import { pickFirstRealStreamUrlFromRow } from '../utils/streamUrlGuards';

const CACHE_KEY = 'redx-catalog-cache-v9';
const BACKGROUND_FETCH_MIN_AGE = 30 * 60 * 1000; // 30 min (TV Box: evita refetch frequente em rede lenta)
const DEFAULT_CATALOG_MIN_YEAR = 1900;
// Primeira carga enlarged para 200 para networks mais rápida em TV Box (evita loading gap)
const INITIAL_LIMIT = 200;

const CATALOG_PATHS = [
  '/',
  '/generos',
  '/filmes',
  '/series',
  '/kids',
  '/lista',
  '/busca',
  '/search',
];

const GENRE_TRANSLATIONS_PT: Record<string, string> = {
  action: 'Ação',
  acao: 'Ação',
  adventure: 'Aventura',
  animation: 'Animação',
  animacao: 'Animação',
  comedy: 'Comédia',
  comedia: 'Comédia',
  crime: 'Crime',
  documentary: 'Documentário',
  documentario: 'Documentário',
  drama: 'Drama',
  family: 'Família',
  familia: 'Família',
  fantasy: 'Fantasia',
  history: 'História',
  historia: 'História',
  horror: 'Terror',
  music: 'Música',
  musica: 'Música',
  mystery: 'Mistério',
  misterio: 'Mistério',
  romance: 'Romance',
  'science fiction': 'Ficção Científica',
  'ficcao cientifica': 'Ficção Científica',
  thriller: 'Suspense',
  war: 'Guerra',
  western: 'Faroeste',
  'action & adventure': 'Ação e Aventura',
  'action e adventure': 'Ação e Aventura',
  'acao e aventura': 'Ação e Aventura',
  kids: 'Infantil',
  infantil: 'Infantil',
  news: 'Notícias',
  noticias: 'Notícias',
  reality: 'Reality',
  'sci-fi & fantasy': 'Ficção Científica e Fantasia',
  'sci fi e fantasy': 'Ficção Científica e Fantasia',
  'ficcao cientifica e fantasia': 'Ficção Científica e Fantasia',
  soap: 'Novela',
  novela: 'Novela',
  'talk show': 'Talk Show',
  'war & politics': 'Guerra e Política',
  'war e politics': 'Guerra e Política',
  'guerra e politica': 'Guerra e Política',
};

// Piso de catálogo: filme/série de 2015 pra frente. Admin pode subir via min_year
// (ex.: 2020), nunca descer abaixo de 2015. Itens sem ano definido passam (não barrados).
const CATALOG_YEAR_FLOOR = 2015;
const resolveCatalogMinYear = (settings?: { min_year?: number } | null): number => {
  const raw = Number(settings?.min_year);
  const base = Number.isFinite(raw) && raw > 1900 ? raw : DEFAULT_CATALOG_MIN_YEAR;
  return Math.max(base, CATALOG_YEAR_FLOOR);
};

const normalizeText = (value: string): string =>
  stripDiacriticsSafe(String(value || ''))
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/\band\b/g, 'e')
    .replace(/[/|]+/g, ' ')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeGenrePt = (genre: string): string => {
  const cleaned = String(genre || '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const normalized = normalizeText(cleaned);
  const translated = GENRE_TRANSLATIONS_PT[normalized] || cleaned;
  return translated
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const normalizeGenresInList = (list: Media[]): Media[] =>
  list.map((item) => {
    let rawGenres: string[] = [];
    if (Array.isArray(item.genre)) {
      rawGenres = item.genre.map(String);
    } else if (typeof item.genre === 'string') {
      rawGenres = (item.genre as string)
        .split(/[,|]/)
        .map((g) => g.trim())
        .filter(Boolean);
    }
    const normalized = Array.from(new Set(rawGenres.map(normalizeGenrePt).filter(Boolean)));
    return normalized.length > 0 ? { ...item, genre: normalized } : item;
  });

const mergeEnrichedById = (base: Media[], enriched: Media[]): Media[] => {
  const byId = new Map<string, Media>();
  enriched.forEach((item) => byId.set(item.id, item));
  return base.map((item) => byId.get(item.id) || item);
};

/** Junta listas do Supabase sem duplicar por id (mantém a ordem de `base`). */
const mergeUniqueById = <T extends { id: string }>(base: T[], extra: T[]): T[] => {
  const seen = new Set(base.map((m) => m.id));
  const out = [...base];
  for (const m of extra) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
};

const resolvePlayableUrl = (item: Media | Record<string, unknown>): string =>
  pickFirstRealStreamUrlFromRow(item as Record<string, unknown>);

const hasPlayableCatalogEntry = (item: Media): boolean => {
  // Agora usa a regra centralizada que exige Poster TMDB + Vídeo/Episódios
  return hasPosterAndVideo(item);
};

const sanitizeCatalogLoose = (items: Media[]): Media[] =>
  removeDuplicates(items)
    .filter((item) => !!item && !!item.id && !!String(item.title || '').trim())
    .map((item) => {
      const stream_url = resolvePlayableUrl(item);
      return {
        ...item,
        stream_url,
        video_url: item.video_url || undefined,
        poster: item.poster || '',
        backdrop: item.backdrop || '',
        description: item.description || '',
        rating: item.rating || 'N/A',
        genre: Array.isArray(item.genre) ? item.genre : [],
        stars: Array.isArray(item.stars) ? item.stars : [],
      } as Media;
    })
    .filter(hasPlayableCatalogEntry);

interface UseCatalogLoaderOptions {
  userId: string | undefined;
  profileId: string | undefined;
  authLoading: boolean;
  isAuthenticated: boolean;
  disabled?: boolean;
  currentPath?: string;
}

interface CatalogState {
  movies: Media[];
  series: Media[];
  loading: boolean;
  enrichmentError: boolean;
  catalogErrorMessage: string | null;
  usingCachedCatalog: boolean;
  trendingMovies: Media[];
  trendingSeries: Media[];
  moviesByGenre: Map<string, Media[]>;
  seriesByGenre: Map<string, Media[]>;
}

function catalogRowKey(m: Media): string {
  return `${m.type}:${m.id}`;
}

/**
 * Quando o Supabase devolve itens sem poster_path (antes do TMDB), a Home filtra tudo e a UI “some”.
 * Reaproveita artwork/gênero já presentes no estado anterior para o mesmo id+tipo.
 */
function mergePreservedCatalogArtwork(
  prevMovies: Media[],
  prevSeries: Media[],
  next: Media[]
): Media[] {
  const prevMap = new Map<string, Media>();
  for (const x of [...prevMovies, ...prevSeries]) {
    prevMap.set(catalogRowKey(x), x);
  }
  return next.map((n) => {
    const old = prevMap.get(catalogRowKey(n));
    if (!old) return n;
    const np = (n as { poster_path?: string | null }).poster_path;
    const op = (old as { poster_path?: string | null }).poster_path;
    const nb = (n as { backdrop_path?: string | null }).backdrop_path;
    const ob = (old as { backdrop_path?: string | null }).backdrop_path;
    const newPosterPath = typeof np === 'string' && np.startsWith('/');
    const newBackdropPath = typeof nb === 'string' && nb.startsWith('/');
    return {
      ...n,
      poster_path: newPosterPath ? np : (op ?? np),
      backdrop_path: newBackdropPath ? nb : (ob ?? nb),
      poster: n.poster || old.poster,
      backdrop: n.backdrop || old.backdrop,
      logo_url: n.logo_url || old.logo_url,
      genre: n.genre?.length ? n.genre : old.genre,
      genre_ids: n.genre_ids?.length ? n.genre_ids : old.genre_ids,
    };
  });
}

export function useCatalogLoader({
  userId,
  profileId,
  authLoading,
  isAuthenticated,
  disabled = false,
  currentPath = '/',
}: UseCatalogLoaderOptions): CatalogState {
  const [movies, setMovies] = useState<Media[]>([]);
  const [series, setSeries] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrichmentError, setEnrichmentError] = useState(false);
  const [catalogErrorMessage, setCatalogErrorMessage] = useState<string | null>(null);
  const [usingCachedCatalog, setUsingCachedCatalog] = useState(false);

  const loadKeyRef = useRef<string>('');
  const hadDataRef = useRef(false);
  const catalogPrefetchRef = useRef<Promise<{ movies: any[]; series: any[] }> | null>(null);
  /** Evita “sumiço” da UI: fetch cru do Supabase muitas vezes vem sem poster_path até o TMDB enriquecer. */
  const moviesRef = useRef<Media[]>([]);
  const seriesRef = useRef<Media[]>([]);

  const applyCatalog = useCallback((cleanMovies: Media[], cleanSeries: Media[]) => {
    moviesRef.current = cleanMovies;
    seriesRef.current = cleanSeries;
    setMovies(cleanMovies);
    setSeries(cleanSeries);
    if (cleanMovies.length > 0 || cleanSeries.length > 0) hadDataRef.current = true;
  }, []);

  useEffect(() => {
    if (disabled) {
      logger.log('Catalogo desabilitado (pagina nao requer filmes/series)');
      setLoading(false);
      return;
    }

    if (authLoading) {
      setLoading(false);
      return;
    }

    const loadKey = `${userId ?? 'trial'}:${profileId ?? ''}`;
    const isCatalogPath = CATALOG_PATHS.includes(currentPath.replace(/\/$/, '') || '/');
    const skipForSameKey = loadKeyRef.current === loadKey;
    const needsReload = !hadDataRef.current;

    if (skipForSameKey && !needsReload) {
      setLoading(false);
      return;
    }

    if (skipForSameKey && needsReload && isCatalogPath) {
      loadKeyRef.current = '';
    }

    loadKeyRef.current = loadKey;
    setLoading(true);
    setCatalogErrorMessage(null);
    setUsingCachedCatalog(false);

    const controller = new AbortController();
    const signal = controller.signal;

    const timerId = 'Catalogo-' + Date.now();
    // Timeout de segurança: libera o loading se a API não responder em 12s
    const loadTimeout = setTimeout(() => {
      if (!signal.aborted) setLoading(false);
    }, 12000);

    const safeSetLoading = (value: boolean) => {
      if (!signal.aborted) setLoading(value);
    };

    const safeApply = (m: Media[], s: Media[]) => {
      if (signal.aborted) return;
      const pm = mergePreservedCatalogArtwork(moviesRef.current, seriesRef.current, m);
      const ps = mergePreservedCatalogArtwork(moviesRef.current, seriesRef.current, s);
      applyCatalog(pm, ps);
    };

    const applyAdminFilters = (
      dbMovies: any[],
      dbSeries: any[],
      catalogSettings: any
    ): { movies: Media[]; series: Media[] } => {
      const minYear = resolveCatalogMinYear(catalogSettings);
      let dbMoviesTyped = (dbMovies || []).map((m) => ({
        ...m,
        type: 'movie' as const,
      })) as Media[];
      let dbSeriesTyped = (dbSeries || []).map((s) => {
        // seasons_count é coluna do DB ausente na tipagem Media; seasons é tipado.
        const sx = s as Media & { seasons_count?: number };
        const seasonsRaw = Number(sx.seasons ?? sx.seasons_count);
        return {
          ...s,
          type: 'series' as const,
          seasons: Number.isFinite(seasonsRaw) && seasonsRaw > 0 ? seasonsRaw : undefined,
        };
      }) as Media[];

      // Sempre aplicar filtro de ano mínimo (2020+ por padrão)
      dbMoviesTyped = dbMoviesTyped.filter((m) => (m.year ? m.year >= minYear : true));
      dbSeriesTyped = dbSeriesTyped.filter((s) => (s.year ? s.year >= minYear : true));

      if (catalogSettings?.max_year) {
        dbMoviesTyped = dbMoviesTyped.filter((m) => !m.year || m.year <= catalogSettings.max_year);
        dbSeriesTyped = dbSeriesTyped.filter((s) => !s.year || s.year <= catalogSettings.max_year);
      }

      dbMoviesTyped = normalizeGenresInList(sanitizeCatalogLoose(dbMoviesTyped)).filter(
        (m) =>
          !Array.isArray(m.genre) ||
          !m.genre.some((g) => typeof g === 'string' && g.toLowerCase().includes('adult'))
      );
      dbSeriesTyped = filterOutSeasons(
        normalizeGenresInList(sanitizeCatalogLoose(dbSeriesTyped))
      ).filter(
        (m) =>
          !Array.isArray(m.genre) ||
          !m.genre.some((g) => typeof g === 'string' && g.toLowerCase().includes('adult'))
      );

      return {
        movies: dbMoviesTyped,
        series: dbSeriesTyped,
      };
    };

    // PERF-02: track enriched IDs to avoid re-enriching overlapping datasets
    const enrichedIds = new Set<string>();

    const enrichProgressively = async (baseMovies: Media[], baseSeries: Media[]) => {
      let priorityFailed = false;
      let remainingFailed = false;
      const priorityMovies = baseMovies.slice(0, 120);
      const prioritySeries = baseSeries.slice(0, 120);
      const priorityItems = [...priorityMovies, ...prioritySeries].filter(
        (item) => !enrichedIds.has(item.id)
      );

      if (priorityItems.length > 0) {
        try {
          const enrichedPriority = await enrichWithTMDB(priorityItems);
          if (signal.aborted) return;

          enrichedPriority.forEach((item) => enrichedIds.add(item.id));
          const enrichedMovies = mergeEnrichedById(baseMovies, enrichedPriority);
          const enrichedSeries = mergeEnrichedById(baseSeries, enrichedPriority);
          safeApply(normalizeGenresInList(enrichedMovies), normalizeGenresInList(enrichedSeries));
        } catch (err) {
          logger.warn('[Catalog] Enriquecimento prioritario falhou:', err);
          priorityFailed = true;
        }
      }

      const remainingMovies = baseMovies.slice(120);
      const remainingSeries = baseSeries.slice(120);
      const remainingItems = [...remainingMovies, ...remainingSeries].filter(
        (item) => !enrichedIds.has(item.id)
      );

      if (remainingItems.length > 0) {
        try {
          const enrichedRemaining = await enrichWithTMDB(remainingItems);
          if (signal.aborted) return;

          enrichedRemaining.forEach((item) => enrichedIds.add(item.id));
          const allEnriched = [
            ...priorityItems.filter((i) => enrichedIds.has(i.id)),
            ...enrichedRemaining,
          ];
          const enrichedMovies = mergeEnrichedById(baseMovies, allEnriched);
          const enrichedSeries = mergeEnrichedById(baseSeries, allEnriched);
          safeApply(normalizeGenresInList(enrichedMovies), normalizeGenresInList(enrichedSeries));
        } catch (err) {
          logger.warn('[Catalog] Enriquecimento completo falhou:', err);
          remainingFailed = true;
        }
      }

      // ERR-01: set error state when both enrichment phases fail
      if (priorityFailed && (remainingFailed || remainingItems.length === 0)) {
        if (!signal.aborted) setEnrichmentError(true);
      }
    };

    const loadData = async () => {
      let usedCachedCatalog = false;
      try {
        logger.time(timerId);

        // SWR (stale-while-revalidate): mostra cache imediatamente, atualiza em background
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const { movies: cm, series: cs, timestamp } = JSON.parse(cached);
            if (cm?.length > 0 || cs?.length > 0) {
              const cachedMovies = normalizeGenresInList(
                sanitizeCatalogLoose(
                  (cm || []).map((m: any) => ({ ...m, type: 'movie' as const })) as Media[]
                )
              );
              const cachedSeries = normalizeGenresInList(
                sanitizeCatalogLoose(
                  (cs || []).map((s: any) => ({ ...s, type: 'series' as const })) as Media[]
                )
              );
              safeApply(cachedMovies, cachedSeries);
              usedCachedCatalog = true;
              setUsingCachedCatalog(true);
              safeSetLoading(false); // UI desbloqueada imediatamente
              setSignal('homeReady', true);

              // Cache fresco: não revalidar
              if (Date.now() - timestamp < BACKGROUND_FETCH_MIN_AGE) {
                try {
                  logger.timeEnd(timerId);
                } catch {}
                return;
              }
              // Cache dentro do TTL mas > 10min: continua para revalidar em background (SWR)
              // Cache expirado (> TTL): continua para fetch completo
            }
          }
        } catch {
          // ignore cache parse errors
        }

        const prefetchResult = catalogPrefetchRef.current ? await catalogPrefetchRef.current : null;
        catalogPrefetchRef.current = null;

        // Paraleliza getCatalogSettings + fetch inicial — independentes entre si.
        // applyAdminFilters aplica o minYear correto depois que ambos chegam.
        const [catalogSettings, fetchedInitial] = await Promise.all([
          getCatalogSettings(signal),
          prefetchResult
            ? Promise.resolve(prefetchResult)
            : getCatalogWithFilters(
                { minYear: DEFAULT_CATALOG_MIN_YEAR },
                INITIAL_LIMIT,
                { fetchAll: false },
                signal
              ),
        ]);
        const minYearResolved = resolveCatalogMinYear(catalogSettings);
        /** Catálogo completo por ano (sem filtro de género no Supabase) — Filmes, Séries e Kids partilham a mesma base. */
        const baseFilters = { minYear: minYearResolved };
        const initialCatalog = prefetchResult ?? fetchedInitial;

        if (signal.aborted) return;

        const initial = applyAdminFilters(
          initialCatalog.movies || [],
          initialCatalog.series || [],
          catalogSettings
        );
        safeApply(initial.movies, initial.series);
        setUsingCachedCatalog(false);
        setCatalogErrorMessage(null);
        safeSetLoading(false);
        setSignal('homeReady', true);

        void enrichProgressively(initial.movies, initial.series);

        const fullPrimary = await getCatalogWithFilters(
          baseFilters,
          undefined,
          { fetchAll: true },
          signal
        );
        if (signal.aborted) return;

        let fullMovies = fullPrimary.movies || [];
        let fullSeries = fullPrimary.series || [];

        const countProbe = () => {
          const pm = applyAdminFilters(fullMovies, [], catalogSettings).movies;
          const ps = applyAdminFilters([], fullSeries, catalogSettings).series;
          return { pm, ps, mc: countWithTmdbId(pm), sc: countWithTmdbId(ps) };
        };

        let { mc, sc } = countProbe();
        if (mc < PAGE_MIN_MOVIES || sc < PAGE_MIN_SERIES) {
          logger.warn(
            `[Catalog] Catálogo inicial: ${mc} filmes / ${sc} séries com TMDB. Ampliando janela de anos…`
          );
          const wider = await getCatalogWithFilters(
            { minYear: Math.min(minYearResolved, 2010) },
            undefined,
            { fetchAll: true },
            signal
          );
          if (signal.aborted) return;
          fullMovies = mergeUniqueById(fullMovies, wider.movies || []);
          fullSeries = mergeUniqueById(fullSeries, wider.series || []);
          ({ mc, sc } = countProbe());
        }
        const kidsItems = [...fullMovies, ...fullSeries].filter(
          (m) =>
            (m as { kids?: boolean }).kids === true ||
            m.genre?.some((g) => {
              const low = String(g).toLowerCase();
              return (
                low.includes('anim') ||
                low.includes('infant') ||
                low.includes('kids') ||
                low.includes('family') ||
                low.includes('famíl') ||
                low.includes('adventure') ||
                low.includes('aventur')
              );
            })
        );
        const kc = kidsItems.length;

        if (mc < PAGE_MIN_MOVIES || sc < PAGE_MIN_SERIES || kc < PAGE_MIN_KIDS) {
          const widest = await getCatalogWithFilters(
            { minYear: 1990 },
            undefined,
            { fetchAll: true },
            signal
          );
          if (signal.aborted) return;
          fullMovies = mergeUniqueById(fullMovies, widest.movies || []);
          fullSeries = mergeUniqueById(fullSeries, widest.series || []);
        }

        const full = applyAdminFilters(fullMovies, fullSeries, catalogSettings);
        safeApply(full.movies, full.series);
        setUsingCachedCatalog(false);
        setCatalogErrorMessage(
          full.movies.length === 0 && full.series.length === 0
            ? 'O Supabase respondeu sem filmes ou séries reproduzíveis.'
            : null
        );

        void enrichProgressively(full.movies, full.series);

        enrichPlatformFromTmdbBackground(full.movies, full.series, (result) => {
          if (result.updated > 0) {
            try {
              localStorage.removeItem(CACHE_KEY);
            } catch {
              // ignore
            }
          }
        });

        if (full.movies.length > 0 || full.series.length > 0) {
          try {
            localStorage.setItem(
              CACHE_KEY,
              JSON.stringify({
                movies: full.movies.slice(0, 2500),
                series: full.series.slice(0, 2500),
                timestamp: Date.now(),
              })
            );
          } catch (storageErr) {
            // ERR-05: localStorage full — try clearing old cache entries and retry
            logger.warn('[Catalog] localStorage write failed, attempting cleanup:', storageErr);
            try {
              // Remove old cache entries to free space
              const keysToRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (
                  key &&
                  (key.startsWith('redx-catalog-cache-v') ||
                    key.startsWith('redx-channels-cache-v')) &&
                  key !== CACHE_KEY
                ) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach((key) => localStorage.removeItem(key));
              // Retry with smaller dataset
              localStorage.setItem(
                CACHE_KEY,
                JSON.stringify({
                  movies: full.movies.slice(0, 1000),
                  series: full.series.slice(0, 1000),
                  timestamp: Date.now(),
                })
              );
            } catch {
              logger.warn(
                '[Catalog] localStorage cleanup and retry also failed — cache will not persist'
              );
            }
          }
        }

        logger.log(`Catalogo final: ${full.movies.length} filmes, ${full.series.length} series`);
        logger.timeEnd(timerId);
      } catch (err) {
        logger.error('Erro ao carregar catalogo:', err);
        if (!signal.aborted) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : 'Falha ao carregar catálogo do Supabase.';
          setCatalogErrorMessage(
            usedCachedCatalog
              ? `${message} Exibindo cache local enquanto o Supabase não responde.`
              : message
          );
          setUsingCachedCatalog(usedCachedCatalog);
          setSignal('homeReady', true);
        }
        try {
          logger.timeEnd(timerId);
        } catch {}
      } finally {
        clearTimeout(loadTimeout);
        safeSetLoading(false);
      }
    };

    void loadData();

    // BUG FIX: cleanup cancela todas as operações assíncronas ao desmontar ou
    // ao mudar deps, evitando setState em componente desmontado (memory leak / warning).
    return () => {
      clearTimeout(loadTimeout);
      controller.abort();
    };
  }, [userId, profileId, authLoading, isAuthenticated, disabled, currentPath, applyCatalog]);

  const trendingMovies = useMemo(() => {
    const fromDb = movies
      .filter((m) => hasValidVideoUrl(m))
      .sort(sortByRating)
      .slice(0, 20);
    return fromDb.length > 0 ? fromDb : [...movies].sort(sortByRating).slice(0, 20);
  }, [movies]);

  const trendingSeries = useMemo(() => {
    const fromDb = series
      .filter((s) => hasValidVideoUrl(s))
      .sort(sortByRating)
      .slice(0, 20);
    return fromDb.length > 0 ? fromDb : [...series].sort(sortByRating).slice(0, 20);
  }, [series]);

  const moviesByGenre = useMemo(() => buildHomeGenreMap(movies), [movies]);
  const seriesByGenre = useMemo(() => buildHomeGenreMap(series), [series]);

  return {
    movies,
    series,
    loading,
    enrichmentError,
    catalogErrorMessage,
    usingCachedCatalog,
    trendingMovies,
    trendingSeries,
    moviesByGenre,
    seriesByGenre,
  };
}
