import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Media } from '../types';
import MovieRow from '../components/MovieRow';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import GenreFilter from '../components/GenreFilter';
import MediaCard from '../components/MediaCard';
import HeroBanner from '../components/HeroBanner';
import StreamingPlatforms, { platforms } from '../components/StreamingPlatforms';
import PlatformFilterBanner from '../components/PlatformFilterBanner';
import NewEpisodeToast from '../components/NewEpisodeToast';
import { useContinueWatching } from '../hooks/useContinueWatching';
import { playSelectSound } from '../utils/soundEffects';
import {
  filterMediaWithRequiredTmdbPoster,
  filterMediaMapWithRequiredTmdbPoster,
  hasPosterAndVideo,
} from '../utils/mediaUtils';
import {
  buildExclusiveHomeGenreMap,
  HomeGenreLabel,
  HOME_GENRE_DISPLAY_ORDER,
  mediaKey,
} from '../config/homeCatalog';
import { removeDuplicates, sortByRating } from '../utils/catalogUtils';
import { matchesPlatform } from '../config/platformConfig';
import {
  getProviderTmdbIds,
  fetchMoviesByTrending,
  fetchSeriesByTrending,
  fetchTop100PopularIds,
  fetchTop100TopRatedIds,
} from '../services/tmdb';
import { isKidsContent } from '../utils/genreUtils';
import { useNavigate } from 'react-router-dom';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { isTVBox } from '../utils/tvBoxDetector';

/**
 * LazyRow — monta o conteúdo apenas quando a linha está próxima do viewport.
 * Reduz o número de MediaCard nodes no DOM em ~70% na TV Box.
 * TV Box usa margem maior (1200px) para pré-renderizar antes do D-pad chegar.
 */
const LAZY_ROW_MARGIN = isTVBox() ? '1200px 0px' : '600px 0px';

const LazyRow: React.FC<{ children: React.ReactNode; estimatedHeight?: number }> = ({
  children,
  estimatedHeight = 220,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: LAZY_ROW_MARGIN, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  return (
    <div ref={ref} style={{ minHeight: mounted ? undefined : `${estimatedHeight}px` }}>
      {mounted ? children : null}
    </div>
  );
};

const COLS_PER_ROW = 6;
const ALL_CONTENT_BATCH_SIZE = isTVBox() ? 36 : 60;
const ALL_CONTENT_BASE_ROW = 10;
const ALL_CONTENT_MIN_CARD_PX = 165;
const ALL_CONTENT_GAP_PX = 32; // gap-8 ~= 32px

interface HomeProps {
  movies: Media[];
  series: Media[];
  trendingMovies: Media[];
  trendingSeries: Media[];
  seriesByGenre: Map<HomeGenreLabel, Media[]>;
  onSelectMedia: (media: Media) => void;
  onPlayMedia?: (media: Media) => void;
  initialPlatform?: string | null;
  catalogErrorMessage?: string | null;
  usingCachedCatalog?: boolean;
}

const Home: React.FC<HomeProps> = ({
  movies,
  series,
  trendingMovies,
  trendingSeries,
  seriesByGenre,
  onSelectMedia,
  onPlayMedia,
  catalogErrorMessage,
  usingCachedCatalog = false,
}) => {
  const navigateNative = useNavigate();
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [providerIds, setProviderIds] = useState<Set<number> | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showAllContent, setShowAllContent] = useState(false);
  const [visibleAllCount, setVisibleAllCount] = useState(ALL_CONTENT_BATCH_SIZE);
  const allContentSentinelRef = useRef<HTMLDivElement | null>(null);
  const { setPosition, setEnabled } = useSpatialNav();
  const showAllGridRef = useRef<HTMLDivElement | null>(null);
  const [showAllCols, setShowAllCols] = useState(3);

  // ── Conteúdo em Alta via TMDB ──────────────────────────────────
  const [tmdbPopularMovies, setTmdbPopularMovies] = useState<Media[]>([]);
  const [tmdbPopularSeries, setTmdbPopularSeries] = useState<Media[]>([]);
  // IDs TMDB para "Aclamados": populares (trending/week) + bem avaliados (top_rated).
  // Aclamados = itens do catálogo Supabase que o TMDB considera populares E/OU bem avaliados.
  const [tmdbPopularIds, setTmdbPopularIds] = useState<Set<number>>(new Set());
  const [tmdbTopRatedIds, setTmdbTopRatedIds] = useState<Set<number>>(new Set());
  const [newEpToast, setNewEpToast] = useState<{
    seriesName: string;
    seasonEpisode: string;
  } | null>(null);

  useEffect(() => {
    // Home sempre inicia no feed normal; "Ver todo conteúdo" só abre via botão/filtro.
    setShowAllContent(false);
  }, []);

  useEffect(() => {
    const handler = (e: any) => setIsSidebarOpen(!!e.detail?.expanded);
    window.addEventListener('redx-sidebar-expanded', handler);
    return () => window.removeEventListener('redx-sidebar-expanded', handler);
  }, []);

  useEffect(() => {
    if (!selectedPlatform) {
      setProviderIds(null);
      return;
    }
    const platform = platforms.find((p) => p.name === selectedPlatform);
    if (!platform?.id) {
      setProviderIds(null);
      return;
    }
    let cancelled = false;
    setProviderLoading(true);
    getProviderTmdbIds(platform.id)
      .then((ids) => {
        if (!cancelled) {
          setProviderIds(ids);
          setProviderLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderIds(new Set());
          setProviderLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlatform]);

  /** Filtra um array de mídia pelos IDs do provider TMDB */
  const filterByPlatform = useCallback(
    (items: Media[]): Media[] => {
      if (!selectedPlatform) return items;
      // Prioridade 1: Match por IDs do TMDB
      if (providerIds && providerIds.size > 0) {
        const byIds = items.filter((m) => m.tmdb_id && providerIds.has(Number(m.tmdb_id)));
        if (byIds.length > 0) return byIds;
      }
      // Prioridade 2: Match por nome da plataforma (campo 'platform' no banco)
      return items.filter((m) => m.platform && matchesPlatform(m.platform, selectedPlatform));
    },
    [providerIds, selectedPlatform]
  );

  // ─── Content preparation ──────────────────────────────────────────────
  const allMedia = useMemo(() => [...(movies || []), ...(series || [])], [movies, series]);
  const homeMovies = useMemo(() => (movies || []).filter((item) => !isKidsContent(item)), [movies]);
  const homeSeries = useMemo(() => (series || []).filter((item) => !isKidsContent(item)), [series]);
  const homeTrendingMovies = useMemo(
    () => (trendingMovies || []).filter((item) => !isKidsContent(item)),
    [trendingMovies]
  );
  const homeTrendingSeries = useMemo(
    () => (trendingSeries || []).filter((item) => !isKidsContent(item)),
    [trendingSeries]
  );
  const homeAllMedia = useMemo(
    () => removeDuplicates([...homeMovies, ...homeSeries]),
    [homeMovies, homeSeries]
  );
  const { items: continueWatchingItems } = useContinueWatching(allMedia);

  /**
   * relatedRows — usa movies/series ORIGINAL (props) para não depender de
   * providerIds. Assim a recomputação de relatedRows não é disparada quando
   * o utilizador filtra por plataforma.
   */
  const relatedRowsSource = useMemo(() => [...(movies || []), ...(series || [])], [movies, series]);

  const tmdbSeries = useMemo(
    () => filterMediaWithRequiredTmdbPoster(homeSeries.filter((s) => s.type === 'series')),
    [homeSeries]
  );
  const tmdbSeriesByGenre = useMemo(
    () =>
      filterMediaMapWithRequiredTmdbPoster(
        new Map(
          Array.from(seriesByGenre.entries()).map(([g, items]) => [
            g,
            items.filter((s) => s.type === 'series' && !isKidsContent(s)),
          ])
        )
      ),
    [seriesByGenre]
  );
  const tmdbTrendingSeries = useMemo(
    () => filterMediaWithRequiredTmdbPoster(homeTrendingSeries.filter((s) => s.type === 'series')),
    [homeTrendingSeries]
  );

  const allContent = useMemo(
    () =>
      [...homeTrendingMovies, ...homeTrendingSeries, ...homeMovies, ...homeSeries].filter((m) =>
        hasPosterAndVideo(m)
      ),
    [homeMovies, homeSeries, homeTrendingMovies, homeTrendingSeries]
  );

  const genres = useMemo(() => Array.from(tmdbSeriesByGenre.keys()).sort(), [tmdbSeriesByGenre]);

  // ─── Apply platform + genre filters ───────────────────────────────────
  const isPlatformActive = !!selectedPlatform && providerIds !== null && providerIds.size > 0;
  const fullCatalogContent = useMemo(() => {
    const merged = removeDuplicates([...homeMovies, ...homeSeries]);
    const withVideo = merged.filter((m) => hasPosterAndVideo(m));
    return isPlatformActive ? filterByPlatform(withVideo) : withVideo;
  }, [homeMovies, homeSeries, isPlatformActive, filterByPlatform]);

  const effectiveSeries = useMemo(() => {
    let base = tmdbSeries;
    if (genreFilter) {
      base =
        tmdbSeriesByGenre.get(genreFilter) ??
        tmdbSeries.filter(
          (s) => Array.isArray(s.genre) && s.genre.some((g) => g.trim() === genreFilter)
        );
    }
    return isPlatformActive ? filterByPlatform(base) : base;
  }, [tmdbSeries, tmdbSeriesByGenre, genreFilter, isPlatformActive, filterByPlatform]);

  const effectiveTrendingSeries = useMemo(() => {
    if (genreFilter) {
      return [...effectiveSeries]
        .sort((a, b) => parseFloat(String(b.rating || '0')) - parseFloat(String(a.rating || '0')))
        .slice(0, 20);
    }
    const base = tmdbTrendingSeries;
    return isPlatformActive ? filterByPlatform(base) : base;
  }, [tmdbTrendingSeries, genreFilter, effectiveSeries, isPlatformActive, filterByPlatform]);

  const effectiveMovies = useMemo(() => {
    const base = filterMediaWithRequiredTmdbPoster(homeMovies);
    return isPlatformActive ? filterByPlatform(base) : base;
  }, [homeMovies, isPlatformActive, filterByPlatform]);

  const effectiveTrendingMovies = useMemo(() => {
    const base = filterMediaWithRequiredTmdbPoster(homeTrendingMovies);
    return isPlatformActive ? filterByPlatform(base) : base;
  }, [homeTrendingMovies, isPlatformActive, filterByPlatform]);

  const platformLabel = selectedPlatform || '';

  // ─── Top Rated content (Filmes Aclamados e Séries Imperdíveis) ──────────
  // "Aclamados" = itens do catálogo Supabase que o TMDB classifica como bem avaliados
  // (top_rated) e/ou populares (trending). Score: top_rated=2, popular=1 (ambos=3).
  // Ordena por score desc, desempate por rating (vote_average). Se os ranks TMDB ainda
  // não carregaram ou o catálogo não casa por tmdb_id, cai para ordenação por rating.
  const acclaimedScore = useCallback(
    (m: Media): number => {
      const id = Number((m as { tmdb_id?: number | string }).tmdb_id);
      if (!Number.isFinite(id) || id <= 0) return 0;
      return (tmdbTopRatedIds.has(id) ? 2 : 0) + (tmdbPopularIds.has(id) ? 1 : 0);
    },
    [tmdbPopularIds, tmdbTopRatedIds]
  );

  const rankAcclaimed = useCallback(
    (pool: Media[]): Media[] => {
      const hasTmdbRanks = tmdbPopularIds.size > 0 || tmdbTopRatedIds.size > 0;
      if (!hasTmdbRanks) return [...pool].sort(sortByRating).slice(0, 100);
      const ranked = pool.filter((m) => acclaimedScore(m) > 0);
      ranked.sort((a, b) => {
        const d = acclaimedScore(b) - acclaimedScore(a);
        return d !== 0 ? d : sortByRating(a, b);
      });
      // Catálogo pode não casar por tmdb_id — fallback p/ não esvaziar a linha.
      return (ranked.length >= 5 ? ranked : [...pool].sort(sortByRating)).slice(0, 100);
    },
    [acclaimedScore, tmdbPopularIds, tmdbTopRatedIds]
  );

  const topRatedMovies = useMemo(() => {
    const trendingKeys = new Set(effectiveTrendingMovies.map((m) => mediaKey(m)));
    return rankAcclaimed(effectiveMovies.filter((m) => !trendingKeys.has(mediaKey(m))));
  }, [effectiveMovies, effectiveTrendingMovies, rankAcclaimed]);

  const topRatedSeries = useMemo(() => {
    const trendingKeys = new Set(effectiveTrendingSeries.map((s) => mediaKey(s)));
    return rankAcclaimed(effectiveSeries.filter((s) => !trendingKeys.has(mediaKey(s))));
  }, [effectiveSeries, effectiveTrendingSeries, rankAcclaimed]);

  // ─── Novidades: mais recentes por ano (décrescente) ───────────────────────
  const newestMovies = useMemo(() => {
    return [...effectiveMovies]
      .filter((m) => m.year && m.year <= new Date().getFullYear() + 1)
      .sort((a, b) => (b.year || 0) - (a.year || 0))
      .slice(0, 100);
  }, [effectiveMovies]);

  const newestSeries = useMemo(() => {
    return [...effectiveSeries]
      .filter((s) => s.year && s.year <= new Date().getFullYear() + 1)
      .sort((a, b) => (b.year || 0) - (a.year || 0))
      .slice(0, 100);
  }, [effectiveSeries]);

  // ─── Linhas personalizadas: "Porque você assistiu X" ────────────────────
  const personalizedRows = useMemo(() => {
    if (continueWatchingItems.length === 0) return [];
    const rows: { title: string; items: Media[] }[] = [];
    const usedKeys = new Set<string>();
    const seedItems = continueWatchingItems.filter((item) => !isKidsContent(item)).slice(0, 3);
    for (const watched of seedItems) {
      const watchedGenres: string[] = Array.isArray(watched.genre)
        ? (watched.genre as string[])
        : typeof watched.genre === 'string'
          ? [watched.genre as string]
          : [];
      if (watchedGenres.length === 0) continue;
      const related = relatedRowsSource
        .filter((m) => {
          const k = mediaKey(m);
          if (usedKeys.has(k) || mediaKey(watched) === k) return false;
          const mGenres: string[] = Array.isArray(m.genre)
            ? (m.genre as string[])
            : typeof m.genre === 'string'
              ? [m.genre as string]
              : [];
          return hasPosterAndVideo(m) && mGenres.some((g) => watchedGenres.includes(g));
        })
        .sort(sortByRating)
        .slice(0, 24);
      if (related.length < 5) continue;
      related.forEach((m) => usedKeys.add(mediaKey(m)));
      rows.push({ title: `Porque você assistiu ${watched.title}`, items: related });
      if (rows.length >= 2) break;
    }
    return rows;
  }, [continueWatchingItems, relatedRowsSource]);

  // ─── Carregamento de "Em Alta" via TMDB (top 10 populares) ─────────────────
  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: number | null = null;
    let idleHandle: number | null = null;

    const loadTrendingRows = () => {
      Promise.all([fetchMoviesByTrending(), fetchSeriesByTrending()])
        .then(([movies, series]) => {
          if (!cancelled) {
            setTmdbPopularMovies(movies.slice(0, 10));
            setTmdbPopularSeries(series.slice(0, 10));
          }
        })
        .catch(() => {});
      // IDs TMDB para ranquear "Aclamados" (populares + bem avaliados). Cache 12h em localStorage.
      Promise.all([fetchTop100PopularIds(), fetchTop100TopRatedIds()])
        .then(([popular, topRated]) => {
          if (cancelled) return;
          if (popular?.length) setTmdbPopularIds(new Set(popular.map(Number)));
          if (topRated?.length) setTmdbTopRatedIds(new Set(topRated.map(Number)));
        })
        .catch(() => {});
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(loadTrendingRows, {
        timeout: isTVBox() ? 1800 : 1200,
      }) as unknown as number;
    } else if (typeof window !== 'undefined') {
      fallbackTimer = window.setTimeout(loadTrendingRows, 350);
    } else {
      loadTrendingRows();
    }

    return () => {
      cancelled = true;
      if (
        idleHandle !== null &&
        typeof window !== 'undefined' &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(idleHandle as unknown as number);
      }
      if (fallbackTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, []);

  // ─── Notificação de novo episódio (1× por sessão) ─────────────────────────
  useEffect(() => {
    if (continueWatchingItems.length === 0 || !series || series.length === 0) return;
    const SESSION_KEY = 'redx_new_ep_notified';
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const seriesMap = new Map<string, Media>();
    for (const s of series) {
      if (s.tmdb_id) seriesMap.set(String(s.tmdb_id), s);
    }
    for (const item of continueWatchingItems) {
      if (item.type !== 'series') continue;
      const catalogSeries = seriesMap.get(String(item.tmdb_id));
      if (!catalogSeries) continue;
      const progressEp = item.episodeNumber || 0;
      const totalEps =
        (catalogSeries as any).episode_count ||
        (catalogSeries as any).total_episodes ||
        (catalogSeries as any).seasons ||
        0;
      if (totalEps > 0 && progressEp > 0 && progressEp < totalEps) {
        setNewEpToast({
          seriesName: item.title,
          seasonEpisode: `${totalEps - progressEp} ep. disponível`,
        });
        sessionStorage.setItem(SESSION_KEY, '1');
        break;
      }
    }
  }, [continueWatchingItems, series]);

  // ─── Chaves dos itens já exibidos nas linhas superiores ──────────────────
  // Passadas para buildExclusiveHomeGenreMap para que as linhas de gênero
  // só mostrem conteúdo DIFERENTE do que já aparece acima.
  const excludedKeys = useMemo(() => {
    const keys = new Set<string>();
    const topRows = [
      ...effectiveTrendingMovies,
      ...topRatedMovies,
      ...effectiveTrendingSeries,
      ...topRatedSeries,
      ...newestMovies,
      ...newestSeries,
    ];
    for (const item of topRows) keys.add(mediaKey(item));
    return keys;
  }, [
    effectiveTrendingMovies,
    topRatedMovies,
    effectiveTrendingSeries,
    topRatedSeries,
    newestMovies,
    newestSeries,
  ]);

  // ─── Mapa exclusivo por gênero: cada item aparece em no máximo 1 linha ────
  const exclusiveGenreMap = useMemo(() => {
    const allFilteredItems = filterMediaWithRequiredTmdbPoster(
      removeDuplicates([...homeMovies, ...homeSeries])
    ).filter((m) => hasPosterAndVideo(m));
    const filtered = isPlatformActive ? filterByPlatform(allFilteredItems) : allFilteredItems;
    return buildExclusiveHomeGenreMap(filtered, excludedKeys);
  }, [homeMovies, homeSeries, isPlatformActive, filterByPlatform, excludedKeys]);

  const visibleFullCatalogContent = useMemo(
    () => fullCatalogContent.slice(0, visibleAllCount),
    [fullCatalogContent, visibleAllCount]
  );
  const showCatalogFailureState = useMemo(
    () =>
      !showAllContent &&
      !selectedPlatform &&
      !genreFilter &&
      allContent.length === 0 &&
      fullCatalogContent.length === 0 &&
      tmdbPopularMovies.length === 0 &&
      tmdbPopularSeries.length === 0,
    [
      allContent.length,
      fullCatalogContent.length,
      genreFilter,
      selectedPlatform,
      showAllContent,
      tmdbPopularMovies.length,
      tmdbPopularSeries.length,
    ]
  );

  useEffect(() => {
    if (!showAllContent) return;
    setVisibleAllCount(ALL_CONTENT_BATCH_SIZE);
  }, [showAllContent, selectedPlatform, genreFilter]);

  useEffect(() => {
    if (!showAllContent) return;
    // Recovery: garante nav espacial ativa ao entrar no modo "Ver todo conteúdo".
    setEnabled(true);
  }, [showAllContent, setEnabled]);

  useEffect(() => {
    if (!showAllContent) return;
    requestAnimationFrame(() => setPosition(ALL_CONTENT_BASE_ROW, 0));
  }, [showAllContent, setPosition, visibleFullCatalogContent.length]);

  useEffect(() => {
    if (!showAllContent) return;
    const el = showAllGridRef.current;
    if (!el) return;

    const computeCols = () => {
      const w = el.getBoundingClientRect().width;
      const cols = Math.max(
        1,
        Math.floor((w + ALL_CONTENT_GAP_PX) / (ALL_CONTENT_MIN_CARD_PX + ALL_CONTENT_GAP_PX))
      );
      setShowAllCols(cols);
    };

    computeCols();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => computeCols());
      ro.observe(el);
    } else {
      window.addEventListener('resize', computeCols);
    }

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', computeCols);
    };
  }, [showAllContent]);

  useEffect(() => {
    if (!showAllContent) return;
    // Quando a grade muda (TV Box 3 col / monitor 5 col / wide 6 col),
    // precisamos reposicionar o foco no primeiro item.
    requestAnimationFrame(() => setPosition(ALL_CONTENT_BASE_ROW, 0));
  }, [showAllContent, showAllCols, setPosition]);

  useEffect(() => {
    if (!showAllContent) return;
    let attempts = 0;
    const maxAttempts = 12;
    const timer = window.setInterval(() => {
      const first = document.querySelector(
        `[data-nav-row="${ALL_CONTENT_BASE_ROW}"] [data-nav-item]`
      ) as HTMLElement | null;
      if (first) {
        setPosition(ALL_CONTENT_BASE_ROW, 0);
        first.focus({ preventScroll: true });
        window.clearInterval(timer);
        return;
      }
      attempts++;
      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [showAllContent, visibleFullCatalogContent.length, showAllCols, setPosition]);

  useEffect(() => {
    if (!showAllContent) return;
    const ensureFocusOnGrid = () => {
      const active = document.activeElement as HTMLElement | null;
      // Leave focus alone if it is on any navigable element (grid item OR sidebar item)
      if (active?.hasAttribute('data-nav-item')) return;
      const first = document.querySelector(
        `[data-nav-row="${ALL_CONTENT_BASE_ROW}"] [data-nav-item]`
      ) as HTMLElement | null;
      if (!first) return;
      setPosition(ALL_CONTENT_BASE_ROW, 0);
      first.focus({ preventScroll: true });
    };
    const normalizeKey = (event: KeyboardEvent) => {
      const code = event.keyCode || (event as any).which || 0;
      if (event.key === 'OK' || event.key === 'Select' || code === 23 || code === 66)
        return 'Enter';
      if (event.key === 'Left' || code === 21) return 'ArrowLeft';
      if (event.key === 'Right' || code === 22) return 'ArrowRight';
      if (event.key === 'Up' || code === 19) return 'ArrowUp';
      if (event.key === 'Down' || code === 20) return 'ArrowDown';
      if (event.key === 'Escape' || event.key === 'GoBack' || code === 27 || code === 4)
        return 'Back';
      return event.key;
    };
    const onKeyDownCapture = (event: KeyboardEvent) => {
      const key = normalizeKey(event);
      if (key === 'Back') {
        setShowAllContent(false);
        event.preventDefault();
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;
      ensureFocusOnGrid();
    };
    window.addEventListener('keydown', onKeyDownCapture, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDownCapture, { capture: true });
  }, [showAllContent, setPosition, setShowAllContent]);

  useEffect(() => {
    if (!showAllContent) return;
    const sentinel = allContentSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleAllCount((prev) => {
          if (prev >= fullCatalogContent.length) return prev;
          return Math.min(prev + ALL_CONTENT_BATCH_SIZE, fullCatalogContent.length);
        });
      },
      { root: null, rootMargin: '300px 0px', threshold: 0.01 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [showAllContent, fullCatalogContent.length]);

  useEffect(() => {
    if (!showAllContent) return;

    const onConfirmFocusedPoster = (event: KeyboardEvent) => {
      const code = event.keyCode || (event as any).which || 0;
      const isConfirm =
        event.key === 'Enter' ||
        event.key === 'OK' ||
        event.key === 'Select' ||
        code === 23 ||
        code === 66;
      if (!isConfirm) return;

      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const cardHost = active.closest('[data-media-index]') as HTMLElement | null;
      if (!cardHost) return;

      const rawIndex = cardHost.getAttribute('data-media-index');
      const idx = rawIndex ? Number(rawIndex) : NaN;
      if (!Number.isFinite(idx)) return;

      const media = visibleFullCatalogContent[idx];
      if (!media) return;

      event.preventDefault();
      event.stopPropagation();
      playSelectSound();
      onSelectMedia(media);
    };

    window.addEventListener('keydown', onConfirmFocusedPoster, { capture: true });
    return () => window.removeEventListener('keydown', onConfirmFocusedPoster, { capture: true });
  }, [showAllContent, visibleFullCatalogContent, onSelectMedia]);

  useEffect(() => {
    if (showAllContent) return;

    const focusVerTodoFromPlatforms = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown') return;
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const inPlatformsRow = !!active.closest('[data-nav-row="2"]');
      if (!inPlatformsRow) return;

      const verTodoButton = document.querySelector(
        '[data-nav-button="ver-todo"]'
      ) as HTMLElement | null;

      if (!verTodoButton) return;

      event.preventDefault();
      event.stopPropagation();
      setPosition(3, 0);
      verTodoButton.focus({ preventScroll: true });
    };

    window.addEventListener('keydown', focusVerTodoFromPlatforms, { capture: true });
    return () =>
      window.removeEventListener('keydown', focusVerTodoFromPlatforms, { capture: true });
  }, [showAllContent, setPosition]);

  // ─── Keyboard Shortcut '1' for Channels ───────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shortcut '1' to go to Channels
      if (e.key === '1') {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        if (isInput) return;

        e.preventDefault();
        navigateNative('/canais');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateNative]);

  // FIX: MutationObserver aguarda o DOM ter um nav-item antes de focar
  // Evita polling com setTimeout fixo que falha se a renderização for mais lenta
  useEffect(() => {
    const findAndFocus = () => {
      const first = document.querySelector(
        '[data-nav-row="0"] [data-nav-item]:not([data-nav-sidebar] [data-nav-item])'
      ) as HTMLElement | null;
      const fallback = document.querySelector(
        '[data-nav-row="1"] [data-nav-item]:not([data-nav-sidebar] [data-nav-item])'
      ) as HTMLElement | null;
      const target = first || fallback;
      if (target) {
        target.focus({ preventScroll: true });
        return true;
      }
      return false;
    };

    // Tenta imediatamente (já pode estar pronto)
    if (findAndFocus()) return;

    // Observa mutações no DOM e foca assim que o primeiro item aparecer
    const observer = new MutationObserver(() => {
      if (findAndFocus()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Segurança: desconecta após 3s para não vazar em caso de erro de renderização
    const safetyTimer = window.setTimeout(() => observer.disconnect(), 3000);

    return () => {
      observer.disconnect();
      clearTimeout(safetyTimer);
    };
  }, []);

  return (
    <>
      <div className="relative z-10 w-full space-y-4 pb-20 animate-fade-in">
        <SectionErrorBoundary section="hero">
          <div
            className="mt-0 relative z-0 w-full overflow-hidden"
            style={{
              marginLeft: 'calc(-1 * var(--sidebar-w))',
              width: 'calc(100% + var(--sidebar-w))',
              height: '100dvh',
              minHeight: '100vh',
            }}
          >
            {selectedPlatform ? (
              <PlatformFilterBanner
                platformName={selectedPlatform}
                onClearFilter={() => setSelectedPlatform(null)}
                onSelectPlatform={setSelectedPlatform}
                allMedia={homeAllMedia}
                embedded
              />
            ) : allContent.length === 0 ? (
              <div className="relative w-full h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.22),_transparent_45%),linear-gradient(135deg,_#12071f_0%,_#090912_45%,_#04040a_100%)]">
                <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-transparent" />
                <div className="relative z-10 flex h-full w-full items-end px-8 pb-20 md:px-16">
                  <div className="max-w-3xl rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white/45">
                      Catálogo indisponível
                    </p>
                    <h2 className="mt-4 text-3xl font-black text-white md:text-5xl">
                      O conteúdo do Supabase não chegou nesta carga.
                    </h2>
                    <p className="mt-4 max-w-2xl text-sm text-white/65 md:text-base">
                      {catalogErrorMessage ||
                        'A Home precisa de filmes e séries com poster e URL real de reprodução. Enquanto o Supabase não responder, os destaques ficam vazios.'}
                    </p>
                    {usingCachedCatalog && (
                      <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300/80">
                        Tentando manter o cache local ativo
                      </p>
                    )}
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="rounded-2xl bg-violet-600 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-violet-500"
                      >
                        Tentar novamente
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateNative('/canais')}
                        className="rounded-2xl border border-white/20 bg-white/8 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white/85 transition-colors hover:bg-white/12"
                      >
                        Abrir canais
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full overflow-hidden">
                <HeroBanner
                  variant="glass"
                  onPlayMedia={onPlayMedia}
                  onSelectMedia={onSelectMedia}
                  dbMedia={allContent}
                  hideCard={filterOpen}
                  priorityTmdbIds={[541671]}
                  priorityTitles={['Bailarina']}
                  priorityTmdbMediaType="movie"
                  maxBannerSlides={10}
                />
                {!isSidebarOpen && (
                  <div
                    className="absolute top-0 z-20 flex items-center"
                    style={{
                      left: 'calc(var(--sidebar-w) + 0.5cm)',
                      paddingTop: 'calc(18px + 0.5cm + 0.7cm)',
                    }}
                  >
                    <GenreFilter
                      genres={genres}
                      selectedGenre={genreFilter}
                      onSelectGenre={setGenreFilter}
                      onOpenChange={setFilterOpen}
                      label="Filtrar Filmes e Séries"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionErrorBoundary>

        <div
          className="relative z-30 w-full flex items-center justify-center pointer-events-none"
          style={{ marginTop: '-94px' }}
          data-nav-row="2"
        >
          <StreamingPlatforms onSelectPlatform={setSelectedPlatform} />
        </div>

        {!showAllContent && (
          <div className="px-6 md:px-12 pt-4 flex justify-center" data-nav-row="3">
            <button
              type="button"
              onClick={() => setShowAllContent(true)}
              className="px-6 py-3 rounded-full text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 border border-white/20 hover:bg-white/10 transition-colors"
              data-nav-item
              data-nav-col={0}
              data-nav-button="ver-todo"
              tabIndex={0}
              aria-label="Ver todo conteúdo"
            >
              Ver todo conteúdo
            </button>
          </div>
        )}

        <div className="modern-home-content relative z-20" style={{ marginTop: '-1cm' }}>
          {/* Platform filter indicator + clear button */}
          {isPlatformActive && (
            <div
              className="px-6 md:px-12 flex items-center gap-4 pb-3"
              style={{ marginTop: '1cm' }}
            >
              <div className="flex items-center gap-3 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] backdrop-blur-sm">
                <span className="text-[13px] font-bold uppercase tracking-[0.2em] text-white/40">
                  Filtrando por
                </span>
                <span className="text-lg font-bold text-white">{platformLabel}</span>
              </div>
              <button
                onClick={() => setSelectedPlatform(null)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-[0.15em] text-white/40 hover:text-white hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/[0.1]"
                data-nav-item
                tabIndex={0}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Limpar
              </button>
              {providerLoading && (
                <span className="text-[13px] text-white/20 animate-pulse">
                  Carregando catálogo...
                </span>
              )}
            </div>
          )}

          {showAllContent ? (
            <div className="px-6 md:px-12 pt-6 pb-20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black uppercase tracking-[0.2em] text-white/85">
                  Todo conteúdo do app
                </h3>
                <button
                  onClick={() => setShowAllContent(false)}
                  className="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-[0.15em] text-white/80 border border-white/20 hover:bg-white/10 transition-colors"
                  data-nav-item
                  data-nav-row={9}
                  data-nav-col={0}
                  tabIndex={0}
                >
                  Voltar
                </button>
              </div>
              <div
                ref={showAllGridRef}
                className="grid gap-8 items-start"
                style={{
                  gridTemplateColumns: `repeat(${showAllCols}, minmax(${ALL_CONTENT_MIN_CARD_PX}px, 1fr))`,
                }}
              >
                {visibleFullCatalogContent.map((item, idx) => {
                  const rowIndex = Math.floor(idx / showAllCols);
                  const colIndex = idx % showAllCols;
                  const navRow = ALL_CONTENT_BASE_ROW + rowIndex;
                  return (
                    <div
                      key={`${item.type}-${item.tmdb_id || item.id}`}
                      data-nav-row={navRow}
                      data-media-index={idx}
                      className="outline-none"
                      tabIndex={-1}
                    >
                      <MediaCard
                        media={item}
                        onClick={() => {
                          playSelectSound();
                          onSelectMedia(item);
                        }}
                        onPlay={onPlayMedia ? () => onPlayMedia(item) : undefined}
                        disableHover
                        colIndex={colIndex}
                        eagerPoster={idx < showAllCols}
                      />
                    </div>
                  );
                })}

                {fullCatalogContent.length === 0 && (
                  <div className="col-span-full text-center py-24">
                    <p className="text-lg font-black uppercase tracking-[0.25em] text-white/35">
                      Nenhum conteúdo com URL real encontrado
                    </p>
                  </div>
                )}

                {visibleFullCatalogContent.length < fullCatalogContent.length && (
                  <div
                    ref={allContentSentinelRef}
                    className="col-span-full w-full py-10 text-center"
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                      Carregando próximo lote...
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : genreFilter ? (
            <div className="px-6 md:px-12 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8 pt-6 pb-20">
              {effectiveSeries.map((s, idx) => {
                const visualRow = Math.floor(idx / COLS_PER_ROW);
                const colInRow = idx % COLS_PER_ROW;
                return (
                  <div
                    key={`${s.type}-${s.tmdb_id || s.id}`}
                    data-nav-row={4 + visualRow}
                    className="rounded-xl outline-none"
                    data-nav-media-card
                  >
                    <MediaCard
                      media={s}
                      onClick={() => {
                        playSelectSound();
                        onSelectMedia(s);
                      }}
                      onPlay={onPlayMedia ? () => onPlayMedia(s) : undefined}
                      colIndex={colInRow}
                      eagerPoster={idx < COLS_PER_ROW}
                    />
                  </div>
                );
              })}
              {effectiveSeries.length === 0 && (
                <div className="col-span-full text-center py-32">
                  <p className="text-2xl font-black uppercase tracking-[0.5em] opacity-20">
                    Nenhuma série encontrada
                  </p>
                  <button
                    onClick={() => {
                      setGenreFilter(null);
                      setSelectedPlatform(null);
                    }}
                    className="mt-6 px-6 py-3 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                    data-nav-item
                    tabIndex={0}
                  >
                    Limpar Filtros
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {showCatalogFailureState && (
                <div className="px-6 md:px-12 pt-8">
                  <div className="rounded-[2rem] border border-amber-400/20 bg-amber-400/5 p-8 backdrop-blur-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-200/70">
                      Diagnóstico do catálogo
                    </p>
                    <h3 className="mt-3 text-2xl font-black text-white">
                      Nenhum item reproduzível foi retornado pelo Supabase.
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm text-white/70">
                      {catalogErrorMessage ||
                        'Verifique se as tabelas movies/series têm poster TMDB e URL real em stream_url, video_url, source_url, play_url ou url.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Continuar Assistindo — sempre visível, não filtrado por plataforma */}
              {continueWatchingItems.length > 0 && (
                <SectionErrorBoundary section="continuar-assistindo">
                  <MovieRow
                    title="Continuar assistindo"
                    items={continueWatchingItems}
                    onSelect={onSelectMedia}
                    onPlay={onPlayMedia}
                    showProgress
                    rowIndex={4}
                  />
                </SectionErrorBoundary>
              )}

              {/* Filmes em Alta (top 10 TMDB) */}
              {tmdbPopularMovies.length > 0 && (
                <SectionErrorBoundary section="filmes-em-alta">
                  <MovieRow
                    title="🔥 Filmes em Alta"
                    items={tmdbPopularMovies}
                    onSelect={onSelectMedia}
                    headerActionLabel="Ver Tudo ›"
                    onHeaderActionClick={() => navigateNative('/filmes')}
                    onPlay={onPlayMedia}
                    rowIndex={5}
                  />
                </SectionErrorBoundary>
              )}

              {/* Filmes Aclamados (Top Rated) */}
              {topRatedMovies.length > 0 && (
                <SectionErrorBoundary section="filmes-aclamados">
                  <MovieRow
                    title="🎬 Filmes Aclamados"
                    items={topRatedMovies}
                    onSelect={onSelectMedia}
                    headerActionLabel="Ver Tudo ›"
                    onHeaderActionClick={() => navigateNative('/filmes')}
                    onPlay={onPlayMedia}
                    rowIndex={6}
                  />
                </SectionErrorBoundary>
              )}

              {/* Séries em Alta (top 10 TMDB) */}
              {tmdbPopularSeries.length > 0 && (
                <SectionErrorBoundary section="series-em-alta">
                  <MovieRow
                    title="🔥 Séries em Alta"
                    items={tmdbPopularSeries}
                    onSelect={onSelectMedia}
                    headerActionLabel="Ver Tudo ›"
                    onHeaderActionClick={() => navigateNative('/series')}
                    onPlay={onPlayMedia}
                    rowIndex={7}
                  />
                </SectionErrorBoundary>
              )}

              {/* Novidades — Filmes mais recentes */}
              {newestMovies.length > 0 && (
                <SectionErrorBoundary section="filmes-novos">
                  <MovieRow
                    title="🆕 Filmes Novos"
                    items={newestMovies}
                    onSelect={onSelectMedia}
                    onPlay={onPlayMedia}
                    rowIndex={9}
                  />
                </SectionErrorBoundary>
              )}

              {/* Novidades — Séries mais recentes */}
              {newestSeries.length > 0 && (
                <SectionErrorBoundary section="series-novas">
                  <MovieRow
                    title="🆕 Séries Novas"
                    items={newestSeries}
                    onSelect={onSelectMedia}
                    onPlay={onPlayMedia}
                    rowIndex={10}
                  />
                </SectionErrorBoundary>
              )}

              {/* Todos os Filmes (quando plataforma ativa) */}
              {isPlatformActive && effectiveMovies.length > 0 && (
                <SectionErrorBoundary section="filmes-plataforma">
                  <MovieRow
                    title={`Filmes — ${platformLabel}`}
                    items={effectiveMovies}
                    onSelect={onSelectMedia}
                    onPlay={onPlayMedia}
                    rowIndex={11}
                  />
                </SectionErrorBoundary>
              )}

              {/* Todas as Séries */}
              {effectiveSeries.length > 0 && (
                <MovieRow
                  title={isPlatformActive ? `Séries — ${platformLabel}` : 'Todas as Séries'}
                  items={effectiveSeries}
                  onSelect={onSelectMedia}
                  onPlay={onPlayMedia}
                  rowIndex={12}
                />
              )}

              {/* Linhas personalizadas: "Porque você assistiu X" */}
              {personalizedRows.map((row, idx) => (
                <LazyRow key={`personal-${idx}`}>
                  <MovieRow
                    title={`✨ ${row.title}`}
                    items={row.items}
                    onSelect={onSelectMedia}
                    onPlay={onPlayMedia}
                    rowIndex={13 + HOME_GENRE_DISPLAY_ORDER.length + idx}
                    maxItems={24}
                  />
                </LazyRow>
              ))}

              {/* Gêneros Prioritários — cada item aparece em no máximo 1 linha */}
              {HOME_GENRE_DISPLAY_ORDER.map((genre, idx) => {
                const items = exclusiveGenreMap.get(genre as HomeGenreLabel) || [];
                if (items.length === 0) return null;
                return (
                  <LazyRow key={genre}>
                    <MovieRow
                      title={genre}
                      items={items}
                      onSelect={onSelectMedia}
                      onPlay={onPlayMedia}
                      rowIndex={13 + idx}
                      maxItems={100}
                    />
                  </LazyRow>
                );
              })}

              {/* Mensagem quando filtro não retorna resultados */}
              {isPlatformActive &&
                effectiveSeries.length === 0 &&
                effectiveMovies.length === 0 &&
                effectiveTrendingMovies.length === 0 &&
                !providerLoading && (
                  <div className="text-center py-32">
                    <p className="text-xl font-bold uppercase tracking-[0.4em] text-white/15">
                      Nenhum conteúdo encontrado para {platformLabel}
                    </p>
                    <button
                      onClick={() => setSelectedPlatform(null)}
                      className="mt-6 px-6 py-3 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                      data-nav-item
                      tabIndex={0}
                    >
                      Voltar ao catálogo completo
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* ── Toast de novo episódio ── */}
      {newEpToast && (
        <NewEpisodeToast
          seriesName={newEpToast.seriesName}
          seasonEpisode={newEpToast.seasonEpisode}
          onDismiss={() => setNewEpToast(null)}
        />
      )}
    </>
  );
};

export default React.memo(Home);
