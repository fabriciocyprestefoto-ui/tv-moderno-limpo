import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Media } from '../types';
import MovieRow from '../components/MovieRow';
import MediaCard from '../components/MediaCard';
import HeroBanner from '../components/HeroBanner';
import StreamingPlatforms, { platforms } from '../components/StreamingPlatforms';
import PlatformFilterBanner from '../components/PlatformFilterBanner';
import { playSelectSound } from '../utils/soundEffects';
import { getProviderTmdbIds } from '../services/tmdb';
import { filterKidsContent } from '../utils/genreUtils';
import { hasPosterAndVideo, normalizeArtworkMedia, deduplicateMedia } from '../utils/mediaUtils';
import { getPlatformAliases } from '../config/platformConfig';
import { PLAYER_KIDS_MOVIE_INTRO_URL } from '../config/playerDefaults';
import { useSpatialNav } from '../hooks/useSpatialNavigation';

interface KidsProps {
  movies: Media[];
  series?: Media[];
  onSelectMedia: (media: Media) => void;
  onPlayMedia?: (media: Media) => void;
}

// ─── Floating decorative elements ────────────────────────────────
const FloatingElement: React.FC<{
  emoji: string;
  style: React.CSSProperties;
  delay: number;
  animated: boolean;
}> = ({ emoji, style, delay, animated }) => (
  <div
    className="absolute text-2xl md:text-3xl pointer-events-none select-none z-0"
    style={{
      ...style,
      animationName: animated ? 'kids-float' : undefined,
      animationDuration: animated ? `${6 + delay}s` : undefined,
      animationTimingFunction: animated ? 'ease-in-out' : undefined,
      animationIterationCount: animated ? 'infinite' : undefined,
      animationDelay: animated ? `${delay}s` : undefined,
      willChange: animated ? 'transform' : undefined,
    }}
  >
    {emoji}
  </div>
);

const floatingItems = [
  { emoji: '⭐', style: { top: '5%', left: '3%' }, delay: 0 },
  { emoji: '🫧', style: { top: '12%', right: '8%' }, delay: 1.5 },
  { emoji: '⭐', style: { top: '25%', right: '3%' }, delay: 0.8 },
  { emoji: '🫧', style: { top: '40%', left: '5%' }, delay: 2.2 },
  { emoji: '⭐', style: { top: '55%', right: '6%' }, delay: 1.2 },
  { emoji: '🫧', style: { top: '65%', left: '8%' }, delay: 3.0 },
  { emoji: '⭐', style: { top: '78%', right: '4%' }, delay: 0.5 },
  { emoji: '🫧', style: { top: '85%', left: '2%' }, delay: 2.0 },
  { emoji: '✨', style: { top: '15%', left: '45%' }, delay: 1.0 },
  { emoji: '✨', style: { top: '70%', right: '15%' }, delay: 2.5 },
];

// ─── Critérios de conteúdo kids via TMDB ──────────────────────────────
// A página Kids só aceita gêneros infantis oficiais do TMDB (Animation/Family/Kids).

// ─── Main Kids Page ──────────────────────────────────────────────
// platformAliases centralizado em config/platformConfig.ts

const Kids: React.FC<KidsProps> = ({ movies, series = [], onSelectMedia, onPlayMedia }) => {
  const KIDS_ALL_BASE_ROW = 20;
  const KIDS_ALL_MIN_CARD_PX = 165;
  const KIDS_ALL_GAP_PX = 32;
  const KIDS_ALL_BATCH = 48;
  const [filter, setFilter] = useState<string | null>(null);
  const [providerIds, setProviderIds] = useState<Set<number> | null>(null);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [showAllKids, setShowAllKids] = useState(false);
  const [visibleAllKidsCount, setVisibleAllKidsCount] = useState(KIDS_ALL_BATCH);
  const [showAllKidsCols, setShowAllKidsCols] = useState(3);
  const showAllKidsGridRef = useRef<HTMLDivElement | null>(null);
  const showAllKidsSentinelRef = useRef<HTMLDivElement | null>(null);
  const { setPosition, setEnabled } = useSpatialNav();

  useEffect(() => {
    setShowAllKids(false);
  }, []);

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

  /** Filmes iniciados na página Kids usam vinheta dedicada; séries mantêm a vinheta padrão do Player. */
  const handlePlayKids = useCallback(
    (m: Media) => {
      if (!onPlayMedia) return;
      if (m.type === 'movie') {
        onPlayMedia({ ...m, introVideoUrl: PLAYER_KIDS_MOVIE_INTRO_URL });
      } else {
        onPlayMedia(m);
      }
    },
    [onPlayMedia]
  );

  const enableFloatingMotion = false; // Desativado: background estático para compatibilidade com controle/TV Box

  const allContent = useMemo(
    () => [...movies, ...series].filter((m) => m.type === 'movie' || m.type === 'series'),
    [movies, series]
  );

  /** Supabase (streams) + regras kids + poster + vídeo/episódios válidos.
   *  Usa hasPosterAndVideo em vez de filterMediaWithRequiredTmdbPoster para aceitar
   *  séries kids com seasons > 0 mesmo sem stream_url direta. */
  const kidsContent = useMemo(() => {
    const safe = filterKidsContent(allContent);
    return deduplicateMedia(safe.map(normalizeArtworkMedia).filter(hasPosterAndVideo));
  }, [allContent]);

  const kidsMovies = useMemo(() => kidsContent.filter((m) => m.type === 'movie'), [kidsContent]);
  const kidsSeries = useMemo(() => kidsContent.filter((m) => m.type === 'series'), [kidsContent]);

  const hasGenre = (m: Media, term: string) => {
    const search = term.toLowerCase();
    if (Array.isArray(m.genre))
      return m.genre.some((g) => String(g).toLowerCase().includes(search));
    if (typeof m.genre === 'string') return (m.genre as string).toLowerCase().includes(search);
    return false;
  };

  const animations = useMemo(() => kidsContent.filter((m) => hasGenre(m, 'anim')), [kidsContent]);
  const adventure = useMemo(
    () => kidsContent.filter((m) => hasGenre(m, 'avent') || hasGenre(m, 'adventure')),
    [kidsContent]
  );
  const family = useMemo(
    () => kidsContent.filter((m) => hasGenre(m, 'famíl') || hasGenre(m, 'family')),
    [kidsContent]
  );

  const filteredKidsContent = useMemo(() => {
    if (!filter) return null;
    // Prioridade 1: match por TMDB Discover (conteúdo disponível na plataforma no BR)
    if (providerIds !== null) {
      const byTmdb = kidsContent.filter((m) => m.tmdb_id && providerIds.has(Number(m.tmdb_id)));
      if (byTmdb.length > 0) return byTmdb;
    }
    // Prioridade 2: campo 'platform' no banco de dados
    const aliases = getPlatformAliases(filter);
    return kidsContent.filter((m) => {
      if (!m.platform) return false;
      const p = m.platform.toLowerCase();
      return aliases.some((alias) => p.includes(alias));
    });
  }, [kidsContent, filter, providerIds]);

  const handleSelect = useCallback((m: Media) => onSelectMedia(m), [onSelectMedia]);
  const visibleAllKids = useMemo(
    () => kidsContent.slice(0, visibleAllKidsCount),
    [kidsContent, visibleAllKidsCount]
  );

  useEffect(() => {
    if (!showAllKids) return;
    setVisibleAllKidsCount(KIDS_ALL_BATCH);
  }, [showAllKids, filter]);

  useEffect(() => {
    if (!showAllKids) return;
    setEnabled(true);
  }, [showAllKids, setEnabled]);

  useEffect(() => {
    if (!showAllKids) return;
    const el = showAllKidsGridRef.current;
    if (!el) return;

    const computeCols = () => {
      const w = el.getBoundingClientRect().width;
      const cols = Math.max(
        1,
        Math.floor((w + KIDS_ALL_GAP_PX) / (KIDS_ALL_MIN_CARD_PX + KIDS_ALL_GAP_PX))
      );
      setShowAllKidsCols(cols);
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
  }, [showAllKids]);

  useEffect(() => {
    if (!showAllKids) return;
    requestAnimationFrame(() => setPosition(KIDS_ALL_BASE_ROW, 0));
  }, [showAllKids, showAllKidsCols, visibleAllKids.length, setPosition]);

  useEffect(() => {
    if (showAllKids) return;
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
  }, [showAllKids, setPosition]);

  useEffect(() => {
    if (!showAllKids) return;
    let attempts = 0;
    const maxAttempts = 12;
    const timer = window.setInterval(() => {
      const first = document.querySelector(
        `[data-nav-row="${KIDS_ALL_BASE_ROW}"] [data-nav-item]`
      ) as HTMLElement | null;
      if (first) {
        setPosition(KIDS_ALL_BASE_ROW, 0);
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
  }, [showAllKids, visibleAllKids.length, showAllKidsCols, setPosition]);

  useEffect(() => {
    if (!showAllKids) return;
    const ensureFocusOnGrid = () => {
      const active = document.activeElement as HTMLElement | null;
      // Leave focus alone if it is on any navigable element (grid item OR sidebar item)
      if (active?.hasAttribute('data-nav-item')) return;
      const first = document.querySelector(
        `[data-nav-row="${KIDS_ALL_BASE_ROW}"] [data-nav-item]`
      ) as HTMLElement | null;
      if (!first) return;
      setPosition(KIDS_ALL_BASE_ROW, 0);
      first.focus({ preventScroll: true });
    };
    const normalizeKey = (event: KeyboardEvent) => {
      const code = event.keyCode || (event as KeyboardEvent & { which?: number }).which || 0;
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
        setShowAllKids(false);
        event.preventDefault();
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;
      ensureFocusOnGrid();
    };
    window.addEventListener('keydown', onKeyDownCapture, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDownCapture, { capture: true });
  }, [showAllKids, setPosition, setShowAllKids]);

  useEffect(() => {
    if (!showAllKids) return;
    const sentinel = showAllKidsSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleAllKidsCount((prev) => Math.min(prev + KIDS_ALL_BATCH, kidsContent.length));
      },
      { root: null, rootMargin: '300px 0px', threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [showAllKids, kidsContent.length]);

  useEffect(() => {
    if (showAllKids) return;
    const timer = window.setTimeout(() => {
      const banner = document.querySelector('[data-nav-row="1"] [data-nav-item]');
      const primaryButton = document.querySelector('[data-nav-row="3"] [data-nav-item]');
      const firstCard = document.querySelector('[data-nav-row="4"] [data-nav-item]');
      const fallback = document.querySelector('[data-nav-item]');
      ((banner || primaryButton || firstCard || fallback) as HTMLElement | null)?.focus?.({
        preventScroll: true,
      });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [filter, showAllKids, kidsContent.length]);

  return (
    <>
      <div className="relative w-full min-h-screen overflow-hidden">
        {floatingItems.map((item, i) => (
          <FloatingElement key={i} {...item} animated={enableFloatingMotion} />
        ))}

        <div className="relative z-10 w-full space-y-4 pb-20 animate-fade-in">
          {/* Banner no topo — filtro por plataforma OU Hero padrão */}
          {filter ? (
            <PlatformFilterBanner
              platformName={filter}
              onClearFilter={() => {
                playSelectSound();
                setFilter(null);
              }}
              onSelectPlatform={(name) => {
                playSelectSound();
                setFilter(name);
              }}
            />
          ) : kidsContent.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center">
              <p className="text-xl font-bold text-white/80 mb-2">
                Nenhum conteúdo infantil no catálogo
              </p>
              <p className="text-sm text-white/50 max-w-md">
                A página Kids agora mostra apenas títulos classificados pelo TMDB como conteúdo
                infantil.
              </p>
            </div>
          ) : (
            <>
              <div
                className="flex flex-col w-full relative min-h-screen"
                style={{
                  marginLeft: 'calc(-1 * var(--sidebar-w))',
                  width: 'calc(100% + var(--sidebar-w))',
                }}
              >
                <div className="flex-1 min-h-0 overflow-hidden relative" data-nav-row={1}>
                  <HeroBanner
                    variant="glass"
                    mediaType="kids"
                    onPlayMedia={handlePlayKids}
                    onSelectMedia={onSelectMedia}
                    dbMedia={kidsContent}
                    onBackdropChange={() => {}}
                    priorityTmdbIds={[172385]}
                    priorityTitles={['Rio 2']}
                    priorityTmdbMediaType="movie"
                    exclusivePriority
                    maxBannerSlides={1}
                  />
                </div>
              </div>
              <div
                className="relative z-30 w-full flex items-center justify-center pointer-events-none"
                style={{ marginTop: '-94px' }}
                data-nav-row="2"
              >
                <StreamingPlatforms
                  onSelectPlatform={(name) => {
                    playSelectSound();
                    setFilter(name);
                  }}
                />
              </div>
              {!showAllKids && (
                <div className="px-6 md:px-12 pt-4 flex justify-center" data-nav-row="3">
                  <button
                    type="button"
                    onClick={() => setShowAllKids(true)}
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

          {/* Conteúdo com filtro */}
          {filter && (
            <section className="space-y-8 pb-20" style={{ marginTop: 'calc(76px - 3cm)' }}>
              <div className="px-6 md:px-12">
                {loadingProvider ? (
                  <div className="flex justify-center py-40">
                    <div className="w-12 h-12 border-4 border-[#a855f7] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredKidsContent && filteredKidsContent.length > 0 ? (
                  <MovieRow
                    title={`Conteúdo ${filter} no Kids`}
                    items={filteredKidsContent}
                    onSelect={handleSelect}
                    onPlay={handlePlayKids}
                    rowIndex={3}
                  />
                ) : (
                  <div className="text-center py-20 text-white/50">
                    <p className="text-xl font-bold">Nenhum conteúdo encontrado para {filter}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {!filter && kidsContent.length > 0 && (
            <div
              className="modern-home-content relative z-20 space-y-4"
              style={{ marginTop: '76px' }}
            >
              {showAllKids ? (
                <div className="px-6 md:px-12 pt-6 pb-20">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black uppercase tracking-[0.2em] text-white/85">
                      Todo conteúdo Kids
                    </h3>
                    <button
                      onClick={() => setShowAllKids(false)}
                      className="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-[0.15em] text-white/80 border border-white/20 hover:bg-white/10 transition-colors"
                      data-nav-item
                      data-nav-row={19}
                      data-nav-col={0}
                      tabIndex={0}
                    >
                      Voltar
                    </button>
                  </div>
                  <div
                    ref={showAllKidsGridRef}
                    className="grid gap-8 items-start"
                    style={{
                      gridTemplateColumns: `repeat(${showAllKidsCols}, minmax(${KIDS_ALL_MIN_CARD_PX}px, 1fr))`,
                    }}
                  >
                    {visibleAllKids.map((item, idx) => {
                      const rowIndex = Math.floor(idx / showAllKidsCols);
                      const colIndex = idx % showAllKidsCols;
                      return (
                        <div
                          key={`${item.type}-${item.tmdb_id || item.id}`}
                          data-nav-row={KIDS_ALL_BASE_ROW + rowIndex}
                          className="rounded-xl outline-none"
                          data-nav-media-card
                        >
                          <MediaCard
                            media={item}
                            onClick={() => {
                              playSelectSound();
                              handleSelect(item);
                            }}
                            onPlay={onPlayMedia ? () => handlePlayKids(item) : undefined}
                            colIndex={colIndex}
                            disableHover
                          />
                        </div>
                      );
                    })}

                    {visibleAllKids.length < kidsContent.length && (
                      <div
                        ref={showAllKidsSentinelRef}
                        className="col-span-full w-full py-10 text-center"
                      >
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                          Carregando próximo lote...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <MovieRow
                  title="🌟 Populares no Kids"
                  items={kidsContent}
                  onSelect={handleSelect}
                  onPlay={handlePlayKids}
                  rowIndex={3}
                  maxItems={100}
                />
              )}

              {animations.length > 0 && (
                <MovieRow
                  title="🎨 Animações Incríveis"
                  items={animations}
                  onSelect={handleSelect}
                  onPlay={handlePlayKids}
                  rowIndex={4}
                  maxItems={100}
                />
              )}

              {adventure.length > 0 && (
                <MovieRow
                  title="🗺️ Aventuras Mágicas"
                  items={adventure}
                  onSelect={handleSelect}
                  onPlay={handlePlayKids}
                  rowIndex={5}
                  maxItems={100}
                />
              )}

              {family.length > 0 && (
                <MovieRow
                  title="👨‍👩‍👧‍👦 Para Toda Família"
                  items={family}
                  onSelect={handleSelect}
                  onPlay={handlePlayKids}
                  rowIndex={6}
                  maxItems={100}
                />
              )}

              {kidsSeries.length > 0 && (
                <MovieRow
                  title="📺 Séries para Crianças"
                  items={kidsSeries}
                  onSelect={handleSelect}
                  onPlay={handlePlayKids}
                  rowIndex={7}
                  maxItems={100}
                />
              )}

              {kidsMovies.length > 0 && (
                <MovieRow
                  title="🎬 Filmes Infantis"
                  items={kidsMovies}
                  onSelect={handleSelect}
                  onPlay={handlePlayKids}
                  rowIndex={8}
                  maxItems={100}
                />
              )}

              {kidsContent.length > 40 && (
                <MovieRow
                  title="🌈 Mais para Explorar"
                  items={kidsContent.slice(40)}
                  onSelect={handleSelect}
                  onPlay={handlePlayKids}
                  rowIndex={9}
                  maxItems={100}
                />
              )}
            </div>
          )}
        </div>
        <style>{`
        @keyframes kids-float {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          25% { transform: translate3d(0, -12px, 0) rotate(6deg) scale(1.06); }
          50% { transform: translate3d(0, 2px, 0) rotate(-4deg) scale(0.98); }
          75% { transform: translate3d(0, 10px, 0) rotate(3deg) scale(1.03); }
          100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
        }
      `}</style>
      </div>
    </>
  );
};

export default React.memo(Kids);
