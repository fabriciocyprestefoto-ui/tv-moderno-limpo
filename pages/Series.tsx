import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Media } from '../types';
import MediaCard from '../components/MediaCard';
import HeroBanner from '../components/HeroBanner';
import StreamingPlatforms, { platforms } from '../components/StreamingPlatforms';
import PlatformFilterBanner from '../components/PlatformFilterBanner';
import MovieRow from '../components/MovieRow';
import GenreFilter from '../components/GenreFilter';
import { playSelectSound } from '../utils/soundEffects';
import { getProviderTmdbIds } from '../services/tmdb';
import {
  PAGE_MIN_SERIES,
  HomeGenreLabel,
  HOME_GENRE_DISPLAY_ORDER,
  resolveGenreQueryParam,
} from '../config/homeCatalog';
import {
  filterMediaMapWithRequiredTmdbPoster,
  filterMediaWithRequiredTmdbPoster,
} from '../utils/mediaUtils';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { isTVBox } from '../utils/tvBoxDetector';

interface SeriesProps {
  series: Media[];
  seriesByGenre: Map<HomeGenreLabel, Media[]>;
  trendingSeries: Media[];
  onSelectMedia: (media: Media) => void;
  onPlayMedia?: (media: Media) => void;
}

const COLS_PER_ROW = 6;
const ITEMS_PER_PAGE = isTVBox() ? 36 : 48;
const ALL_CATALOG_BASE_ROW = 20;
const ALL_CATALOG_MIN_CARD_PX = 165;
const ALL_CATALOG_GAP_PX = 32; // gap-8 ~= 32px
const Series: React.FC<SeriesProps> = ({
  series,
  seriesByGenre,
  trendingSeries,
  onSelectMedia,
  onPlayMedia,
}) => {
  const [filter, setFilter] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [providerIds, setProviderIds] = useState<Set<number> | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { setPosition, setEnabled } = useSpatialNav();
  const showAllGridRef = useRef<HTMLDivElement | null>(null);
  const [showAllCols, setShowAllCols] = useState(3);
  const [searchParams] = useSearchParams();
  const routeNavigate = useNavigate();

  const clearGenreFilter = useCallback(() => {
    setGenreFilter(null);
    const next = new URLSearchParams(searchParams);
    next.delete('genre');
    const qs = next.toString();
    routeNavigate({ pathname: '/series', search: qs ? `?${qs}` : '' }, { replace: true });
  }, [searchParams, routeNavigate]);

  useEffect(() => {
    const g = searchParams.get('genre');
    if (!g) {
      setGenreFilter(null);
      return;
    }
    const resolved = resolveGenreQueryParam(g);
    setGenreFilter(resolved ?? g.trim());
  }, [searchParams]);

  useEffect(() => {
    setShowAllSeries(false);
  }, []);

  useEffect(() => {
    const handler = (e: any) => setIsSidebarOpen(!!e.detail?.expanded);
    window.addEventListener('redx-sidebar-expanded', handler);
    return () => window.removeEventListener('redx-sidebar-expanded', handler);
  }, []);

  const seriesOnly = useMemo(() => (series || []).filter((s) => s.type === 'series'), [series]);

  // Reset visible count when filter/genre changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [genreFilter, filter]);
  useEffect(() => {
    if (showAllSeries) setVisibleCount(ITEMS_PER_PAGE);
  }, [showAllSeries]);

  useEffect(() => {
    if (!showAllSeries) return;
    setEnabled(true);
  }, [showAllSeries, setEnabled]);

  // IntersectionObserver to load more items on scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [genreFilter, filter]);

  const tmdbSeries = useMemo(() => filterMediaWithRequiredTmdbPoster(seriesOnly), [seriesOnly]);
  const tmdbSeriesByGenre = useMemo(
    () =>
      filterMediaMapWithRequiredTmdbPoster(
        new Map(
          Array.from(seriesByGenre.entries()).map(([g, items]) => [
            g,
            (items || []).filter((x) => x.type === 'series'),
          ])
        )
      ),
    [seriesByGenre]
  );
  const tmdbTrendingSeries = useMemo(
    () =>
      filterMediaWithRequiredTmdbPoster((trendingSeries || []).filter((s) => s.type === 'series')),
    [trendingSeries]
  );

  const genres = useMemo(() => {
    const genreSet = new Set<string>();
    for (const s of tmdbSeries) {
      if (Array.isArray(s.genre)) {
        s.genre.forEach((g) => {
          const v = String(g).trim();
          if (v) genreSet.add(v);
        });
      }
    }
    return Array.from(genreSet).sort();
  }, [tmdbSeries]);

  useEffect(() => {
    if (showAllSeries) return;
    const t = setTimeout(() => {
      const banner = document.querySelector('[data-nav-row="1"] [data-nav-item]');
      const firstSeries = document.querySelector('[data-nav-row="4"] [data-nav-item]');
      const fallback = document.querySelector('[data-nav-item]');
      ((banner || firstSeries || fallback) as HTMLElement)?.focus?.({ preventScroll: true });
    }, 300);
    return () => clearTimeout(t);
  }, [filter, genreFilter, showAllSeries]);

  // Buscar IDs TMDB do provedor para filtrar conteúdo real da plataforma
  useEffect(() => {
    if (!filter) {
      setProviderIds(null);
      return;
    }
    const platform = platforms.find((p) => p.name === filter);
    if (!platform?.id) {
      setProviderIds(null);
      return;
    }
    let cancelled = false;
    setLoadingProvider(true);
    setProviderIds(null);
    getProviderTmdbIds(platform.id)
      .then((ids) => {
        if (!cancelled) {
          setProviderIds(ids);
          setLoadingProvider(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderIds(new Set());
          setLoadingProvider(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const effectiveSeries = useMemo(() => {
    if (!genreFilter) return tmdbSeries;
    return (
      tmdbSeriesByGenre.get(genreFilter as HomeGenreLabel) ??
      tmdbSeries.filter(
        (s) => Array.isArray(s.genre) && s.genre.some((g) => g.trim() === genreFilter)
      )
    );
  }, [tmdbSeries, tmdbSeriesByGenre, genreFilter]);

  const effectiveTrendingSeries = useMemo(() => {
    if (!genreFilter) return tmdbTrendingSeries;
    return [...effectiveSeries]
      .sort((a, b) => parseFloat(String(b.rating || '0')) - parseFloat(String(a.rating || '0')))
      .slice(0, 20);
  }, [tmdbTrendingSeries, genreFilter, effectiveSeries]);

  // Mapeamento de nomes do componente → nomes reais no DB
  const platformAliases: Record<string, string[]> = useMemo(
    () => ({
      Netflix: ['netflix'],
      'Prime Video': ['amazon prime video', 'prime video', 'amazon video'],
      'Disney+': ['disney plus', 'disney+'],
      Max: ['hbo max', 'max'],
      Globoplay: ['globoplay'],
      'Apple TV+': ['apple tv', 'apple tv+', 'apple tv store'],
      'Paramount+': ['paramount plus', 'paramount+'],
      'HBO Max': ['hbo max'],
      'Pluto TV': ['pluto tv'],
      Crunchyroll: ['crunchyroll'],
      'Claro Video': ['claro video', 'claro tv'],
      'Warner Bros': ['warner'],
    }),
    []
  );

  const filteredSeries = useMemo(() => {
    if (!filter) return null;
    // Prioridade 1: match por TMDB Discover (conteúdo disponível na plataforma no BR)
    if (providerIds !== null) {
      const byTmdb = effectiveSeries.filter((s) => s.tmdb_id && providerIds.has(Number(s.tmdb_id)));
      if (byTmdb.length > 0) return byTmdb;
    }
    // Prioridade 2: campo 'platform' no banco de dados
    const aliases = platformAliases[filter] || [filter.toLowerCase()];
    return effectiveSeries.filter((s) => {
      if (!s.platform) return false;
      const p = s.platform.toLowerCase();
      return aliases.some((alias) => p.includes(alias));
    });
  }, [effectiveSeries, filter, providerIds, platformAliases]);

  const allSeriesCatalog = useMemo(() => {
    if (filter && filteredSeries) return filteredSeries;
    return effectiveSeries;
  }, [filter, filteredSeries, effectiveSeries]);

  useEffect(() => {
    if (!showAllSeries) return;

    const el = showAllGridRef.current;
    if (!el) return;

    const computeCols = () => {
      const w = el.getBoundingClientRect().width;
      const cols = Math.max(
        1,
        Math.floor((w + ALL_CATALOG_GAP_PX) / (ALL_CATALOG_MIN_CARD_PX + ALL_CATALOG_GAP_PX))
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
  }, [showAllSeries]);

  useEffect(() => {
    if (!showAllSeries) return;
    requestAnimationFrame(() => setPosition(ALL_CATALOG_BASE_ROW, 0));
  }, [showAllSeries, showAllCols, visibleCount, setPosition]);

  useEffect(() => {
    if (showAllSeries) return;
    const focusVerTudoFromPlatforms = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown') return;
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      if (!active.closest('[data-nav-row="2"]')) return;
      const verTudoButton = document.querySelector(
        '[data-nav-button="ver-todo"]'
      ) as HTMLElement | null;
      if (!verTudoButton) return;
      event.preventDefault();
      event.stopPropagation();
      setPosition(3, 0);
      verTudoButton.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', focusVerTudoFromPlatforms, { capture: true });
    return () =>
      window.removeEventListener('keydown', focusVerTudoFromPlatforms, { capture: true });
  }, [showAllSeries, setPosition]);

  useEffect(() => {
    if (!showAllSeries) return;
    let attempts = 0;
    const maxAttempts = 12;
    const timer = window.setInterval(() => {
      const first = document.querySelector(
        `[data-nav-row="${ALL_CATALOG_BASE_ROW}"] [data-nav-item]`
      ) as HTMLElement | null;
      if (first) {
        setPosition(ALL_CATALOG_BASE_ROW, 0);
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
  }, [showAllSeries, visibleCount, showAllCols, setPosition]);

  useEffect(() => {
    if (!showAllSeries) return;

    const normalizeKey = (event: KeyboardEvent) => {
      const code = event.keyCode || (event as any).which || 0;
      if (event.key === 'OK' || event.key === 'Select' || code === 23 || code === 66)
        return 'Enter';
      if (event.key === 'Left' || code === 21) return 'ArrowLeft';
      if (event.key === 'Right' || code === 22) return 'ArrowRight';
      if (event.key === 'Up' || code === 19) return 'ArrowUp';
      if (event.key === 'Down' || code === 20) return 'ArrowDown';
      // Tecla Voltar Android (keyCode 4 no WebView → Escape no DOM) ou Escape
      if (event.key === 'Escape' || event.key === 'GoBack' || code === 27 || code === 4)
        return 'Back';
      return event.key;
    };

    const onKeyDownCapture = (event: KeyboardEvent) => {
      const key = normalizeKey(event);

      // Voltar / Escape → sai do modo "Ver tudo"
      if (key === 'Back') {
        event.preventDefault();
        event.stopPropagation();
        setShowAllSeries(false);
        return;
      }

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;

      const active = document.activeElement as HTMLElement | null;

      // Já está num nav-item FORA da sidebar → deixa o sistema de navegação trabalhar normalmente
      if (active?.hasAttribute('data-nav-item') && !active.closest('[data-nav-sidebar]')) return;

      // Está na sidebar → ao pressionar ArrowRight restaura foco na grade
      if (active?.closest('[data-nav-sidebar]') && key === 'ArrowRight') {
        const first = document.querySelector(
          `[data-nav-row="${ALL_CATALOG_BASE_ROW}"] [data-nav-item]`
        ) as HTMLElement | null;
        if (first) {
          event.preventDefault();
          event.stopPropagation();
          setPosition(ALL_CATALOG_BASE_ROW, 0);
          first.focus({ preventScroll: true });
        }
        return;
      }

      // Foco completamente fora do sistema de navegação → restaura na grade
      if (!active?.hasAttribute('data-nav-item')) {
        const first = document.querySelector(
          `[data-nav-row="${ALL_CATALOG_BASE_ROW}"] [data-nav-item]`
        ) as HTMLElement | null;
        if (first) {
          setPosition(ALL_CATALOG_BASE_ROW, 0);
          first.focus({ preventScroll: true });
        }
      }
    };

    window.addEventListener('keydown', onKeyDownCapture, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDownCapture, { capture: true });
  }, [showAllSeries, setPosition]);

  const handleSelect = useCallback((m: Media) => onSelectMedia(m), [onSelectMedia]);

  const belowMinCatalog = !filter && !genreFilter && tmdbSeries.length < PAGE_MIN_SERIES;

  return (
    <>
      <div className="relative z-10 w-full space-y-4 pb-20 animate-fade-in">
        {/* Banner no topo — filtro por plataforma OU Hero padrão */}
        {filter ? (
          <PlatformFilterBanner
            platformName={filter}
            allMedia={seriesOnly}
            onClearFilter={() => {
              playSelectSound();
              setFilter(null);
            }}
            onSelectPlatform={(name) => {
              playSelectSound();
              setFilter(name);
            }}
          />
        ) : (
          <>
            <div
              className="flex flex-col w-full relative min-h-screen"
              style={{
                marginLeft: 'calc(-1 * var(--sidebar-w))',
                width: 'calc(100% + var(--sidebar-w))',
                zIndex: 20,
              }}
            >
              <div className="flex-1 min-h-0 overflow-hidden relative" data-nav-row={1}>
                <HeroBanner
                  variant="glass"
                  mediaType="tv"
                  onPlayMedia={onPlayMedia}
                  onSelectMedia={onSelectMedia}
                  dbMedia={effectiveSeries}
                  onBackdropChange={() => {}}
                  hideCard={filterOpen}
                  priorityTmdbIds={[273160]}
                  priorityTitles={['The Beauty: Lindos de Morrer']}
                  priorityTmdbMediaType="series"
                  exclusivePriority
                  maxBannerSlides={1}
                />
              </div>
              {!isSidebarOpen && (
                <div
                  className="absolute top-0 z-30 flex items-center"
                  style={{
                    left: 'calc(var(--sidebar-w) + 0.5cm)',
                    paddingTop: 'calc(18px + 0.5cm + 0.7cm)',
                  }}
                  data-nav-row={0}
                >
                  <GenreFilter
                    genres={genres}
                    selectedGenre={genreFilter}
                    onSelectGenre={setGenreFilter}
                    onOpenChange={setFilterOpen}
                    label="Filtrar Séries"
                  />
                </div>
              )}
            </div>
            <div
              className="relative z-30 w-full flex items-center justify-center pointer-events-none"
              style={{ marginTop: '-94px' }}
              data-nav-row="2"
            >
              <StreamingPlatforms onSelectPlatform={(name) => setFilter(name)} />
            </div>
            {!showAllSeries && (
              <div className="px-6 md:px-12 pt-4 flex justify-center" data-nav-row="3">
                <button
                  type="button"
                  onClick={() => setShowAllSeries(true)}
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
          </>
        )}

        <div
          className="modern-home-content relative z-20"
          style={!filter ? { marginTop: '76px' } : { marginTop: 'calc(76px - 3cm)' }}
        >
          {showAllSeries ? (
            <div className="px-12 pt-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black uppercase tracking-[0.2em] text-white/85">
                  Todas as Séries
                </h3>
                <button
                  onClick={() => setShowAllSeries(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowAllSeries(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-[0.15em] text-white/80 border border-white/20 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40"
                  data-nav-item
                  data-nav-row={19}
                  data-nav-col={0}
                  tabIndex={0}
                  aria-label="Voltar para navegação"
                >
                  ← Voltar
                </button>
              </div>
              <div
                ref={showAllGridRef}
                className="grid gap-8 items-start"
                style={{
                  gridTemplateColumns: `repeat(${showAllCols}, minmax(${ALL_CATALOG_MIN_CARD_PX}px, 1fr))`,
                }}
              >
                {allSeriesCatalog.slice(0, visibleCount).map((s, idx) => {
                  const rowIndex = Math.floor(idx / showAllCols);
                  const colInRow = idx % showAllCols;
                  return (
                    <div
                      key={`${s.type}-${s.tmdb_id || s.id}`}
                      data-nav-row={ALL_CATALOG_BASE_ROW + rowIndex}
                      className="rounded-xl outline-none"
                      data-nav-media-card
                    >
                      <MediaCard
                        media={s}
                        onClick={() => {
                          playSelectSound();
                          handleSelect(s);
                        }}
                        onPlay={onPlayMedia ? () => onPlayMedia(s) : undefined}
                        colIndex={colInRow}
                        disableHover
                      />
                    </div>
                  );
                })}
              </div>
              {(allSeriesCatalog.length ?? 0) > visibleCount && (
                <div
                  ref={sentinelRef}
                  className="w-full py-8 text-center text-white/40 text-xs font-bold uppercase tracking-[0.2em]"
                >
                  Carregando próximo lote...
                </div>
              )}
            </div>
          ) : genreFilter ? (
            <div className="px-12 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8 pt-6">
              {effectiveSeries?.slice(0, visibleCount).map((s, idx) => {
                const visualRow = Math.floor(idx / COLS_PER_ROW);
                const colInRow = idx % COLS_PER_ROW;
                return (
                  <div
                    key={`${s.type}-${s.tmdb_id || s.id}`}
                    data-nav-row={3 + visualRow}
                    className="rounded-xl outline-none"
                    data-nav-media-card
                  >
                    <MediaCard
                      media={s}
                      onClick={() => {
                        playSelectSound();
                        handleSelect(s);
                      }}
                      onPlay={onPlayMedia ? () => onPlayMedia(s) : undefined}
                      colIndex={colInRow}
                    />
                  </div>
                );
              })}
              {(effectiveSeries?.length ?? 0) > visibleCount && (
                <div ref={sentinelRef} className="col-span-full h-4" />
              )}
              {effectiveSeries?.length === 0 && (
                <div className="col-span-full text-center py-32">
                  <p className="text-2xl font-black uppercase tracking-[0.5em] opacity-20">
                    Nenhuma série encontrada
                  </p>
                  {genreFilter && (
                    <button
                      type="button"
                      onClick={clearGenreFilter}
                      className="mt-6 px-6 py-3 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                      data-nav-item
                      tabIndex={0}
                    >
                      Limpar Filtro
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : filter && platforms.find((p) => p.name === filter) ? (
            <section className="space-y-8 animate-in fade-in duration-1000">
              <div className="px-12">
                {loadingProvider ? (
                  <div className="flex justify-center py-40">
                    <div className="w-12 h-12 border-4 border-[#a855f7] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredSeries && filteredSeries.length > 0 ? (
                  <MovieRow
                    title="Séries encontradas"
                    items={filteredSeries}
                    onSelect={handleSelect}
                    onPlay={onPlayMedia}
                    rowIndex={4}
                  />
                ) : (
                  <div className="text-center py-40 opacity-20">
                    <p className="text-2xl font-black uppercase tracking-[0.5em]">
                      Nenhuma série encontrada
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : filter ? (
            <div className="px-12 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
              {filteredSeries?.slice(0, visibleCount).map((s, idx) => {
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
                        handleSelect(s);
                      }}
                      onPlay={onPlayMedia ? () => onPlayMedia(s) : undefined}
                      colIndex={colInRow}
                    />
                  </div>
                );
              })}
              {(filteredSeries?.length ?? 0) > visibleCount && (
                <div ref={sentinelRef} className="col-span-full h-4" />
              )}
              {filteredSeries?.length === 0 && (
                <div className="col-span-full text-center py-32">
                  <p className="text-2xl font-black uppercase tracking-[0.5em] opacity-20">
                    Nenhuma série encontrada
                  </p>
                  {genreFilter && (
                    <button
                      type="button"
                      onClick={clearGenreFilter}
                      className="mt-6 px-6 py-3 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                      data-nav-item
                      tabIndex={0}
                    >
                      Limpar Filtro
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* belowMinCatalog: diagnóstico removido da UI — logar apenas no console */}
              {belowMinCatalog &&
                import.meta.env.DEV &&
                (() => {
                  console.warn(
                    `[Series] Apenas ${tmdbSeries.length} séries com poster TMDB (meta: ${PAGE_MIN_SERIES}+). Verifique o Supabase ou amplie o intervalo de anos.`
                  );
                  return null;
                })()}
              {effectiveTrendingSeries.length > 0 && (
                <MovieRow
                  title="🔥 Em Alta"
                  items={effectiveTrendingSeries}
                  onSelect={handleSelect}
                  onPlay={onPlayMedia}
                  rowIndex={4}
                  maxItems={100}
                />
              )}

              {effectiveSeries.length > 0 && (
                <MovieRow
                  title="Todas as Séries"
                  items={effectiveSeries}
                  onSelect={handleSelect}
                  onPlay={onPlayMedia}
                  rowIndex={5}
                  maxItems={100}
                />
              )}

              {/* Gêneros Prioritários */}
              {HOME_GENRE_DISPLAY_ORDER.map((genre, idx) => {
                const items = tmdbSeriesByGenre.get(genre as HomeGenreLabel) || [];
                if (items.length === 0) return null;
                return (
                  <MovieRow
                    key={genre}
                    title={`Séries de ${genre}`}
                    items={items}
                    onSelect={onSelectMedia}
                    onPlay={onPlayMedia}
                    rowIndex={6 + idx}
                    maxItems={100}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default React.memo(Series);
