import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Media } from '../types';
import {
  deduplicateMedia,
  getMediaBackdrop,
  getMediaLogo,
  getMediaPoster,
  hasValidVideoUrl,
} from '../utils/mediaUtils';
import { playNavigateSound, playSelectSound } from '../utils/soundEffects';
import { getMediaDetailsByID, getLogo } from '../services/tmdb';
import LazyImage, { ERROR_SVG } from '../components/LazyImage';
import { isTVBox } from '../utils/tvBoxDetector';

// CSS-module convertido para CSS global: no build TV (plugin-legacy renderModernChunks:false)
// o CSS-module era descartado do bundle e os cards colapsavam (altura ~0) — aparecia so o logo.
// Este mapa preserva todas as referencias `styles.X` do JSX apontando para classes globais.
const styles = {
  rowSection: 'mvrow-rowSection',
  rowTitle: 'mvrow-rowTitle',
  rowTitleLine: 'mvrow-rowTitleLine',
  rowShell: 'mvrow-rowShell',
  rowShellExpanded: 'mvrow-rowShellExpanded',
  highlightSlot: 'mvrow-highlightSlot',
  highlightSlotOpen: 'mvrow-highlightSlotOpen',
  verticalFeaturedCard: 'mvrow-verticalFeaturedCard',
  horizontalCard: 'mvrow-horizontalCard',
  verticalFeaturedImage: 'mvrow-verticalFeaturedImage',
  horizontalImage: 'mvrow-horizontalImage',
  horizontalOverlay: 'mvrow-horizontalOverlay',
  horizontalLogo: 'mvrow-horizontalLogo',
  trackWrapper: 'mvrow-trackWrapper',
  navButton: 'mvrow-navButton',
  navButtonLeft: 'mvrow-navButtonLeft',
  navButtonRight: 'mvrow-navButtonRight',
  rowTrack: 'mvrow-rowTrack',
  cardWrap: 'mvrow-cardWrap',
  card: 'mvrow-card',
  cardImage: 'mvrow-cardImage',
  cardGradient: 'mvrow-cardGradient',
  cardLogo: 'mvrow-cardLogo',
  progress: 'mvrow-progress',
  progressFill: 'mvrow-progressFill',
  placeholder: 'mvrow-placeholder',
  sentinel: 'mvrow-sentinel',
} as const;

const LOGO_CACHE_MAX = 200;
const _logoCache = new Map<string, string | null>();

function logoCacheSet(key: string, value: string | null): void {
  if (_logoCache.size >= LOGO_CACHE_MAX) {
    // Ejetar entrada mais antiga (Map preserva ordem de inserção)
    const firstKey = _logoCache.keys().next().value;
    if (firstKey !== undefined) _logoCache.delete(firstKey);
  }
  _logoCache.set(key, value);
}

/** Auditoria TV: menos cards no DOM em TV Box (fileiras horizontais). */
const DEFAULT_MAX_ITEMS = isTVBox() ? 36 : 100;

interface MovieRowProps {
  title: string;
  items: Media[];
  onSelect: (media: Media) => void;
  onPlay?: (media: Media) => void;
  showProgress?: boolean;
  rowIndex?: number;
  maxItems?: number;
  headerActionLabel?: string;
  onHeaderActionClick?: () => void;
  loading?: boolean;
}

const CARD_HEIGHT = 250;
const CARD_WIDTH = 167;
/** Alinha com gap 1rem do .rowTrack — tamanho por célula no virtualizer horizontal. */
const CARD_GAP_PX = 16;
const VIRTUAL_CARD_STRIDE = CARD_WIDTH + CARD_GAP_PX;
const SLOT_EXPANDED_HEIGHT = CARD_HEIGHT;
const SLOT_EXPANDED_WIDTH = Math.round((SLOT_EXPANDED_HEIGHT * 16) / 9);
const SLOT_COLLAPSED_WIDTH = CARD_WIDTH;
const IS_CAPACITOR = typeof window !== 'undefined' && !!window.Capacitor;
const VISIBLE_ROW_EAGER_COUNT = IS_CAPACITOR ? 2 : 6;
const ROW_OVERSCAN = IS_CAPACITOR ? 3 : 6;

const MovieRow: React.FC<MovieRowProps> = React.memo(
  ({
    title,
    items,
    onSelect,
    onPlay: _onPlay,
    rowIndex = 0,
    maxItems = DEFAULT_MAX_ITEMS,
    headerActionLabel,
    onHeaderActionClick,
    loading = false,
  }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const sectionRef = useRef<HTMLElement>(null);
    const slotRef = useRef<HTMLButtonElement>(null);

    const validItems = useMemo(
      () =>
        deduplicateMedia(items)
          .filter((item) => Boolean(getMediaPoster(item)) && hasValidVideoUrl(item))
          .slice(0, maxItems),
      [items, maxItems]
    );
    const [hoveredMovie, setHoveredMovie] = useState<Media | null>(null);
    const [isVisible, setIsVisible] = useState(!IS_CAPACITOR);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isFocused, setIsFocused] = useState(false);
    const [logoMap, setLogoMap] = useState<Map<string, string | null>>(new Map());
    const [tmdbBackdrop, setTmdbBackdrop] = useState<string | null>(null);
    const [tmdbLogo, setTmdbLogo] = useState<string | null>(null);
    const detailsFetchRef = useRef<number>(0);

    const fetchLogoFor = useCallback((media: Media) => {
      if (!media?.tmdb_id) return;
      const key = `${media.tmdb_id}_${media.type}`;
      if (_logoCache.has(key)) {
        setLogoMap((prev) => (prev.has(key) ? prev : new Map(prev).set(key, _logoCache.get(key)!)));
        return;
      }
      // Sempre busca a logo localizada (pt→en→null→ja). Não semear com a
      // logo_url armazenada, que pode estar em idioma errado (flash ja).
      getLogo(media.tmdb_id, media.type as 'movie' | 'series')
        .then((logo) => {
          const normalizedLogo = logo ? getMediaLogo({ logo_url: logo }) : null;
          logoCacheSet(key, normalizedLogo);
          setLogoMap((prev) => new Map(prev).set(key, normalizedLogo));
        })
        .catch(() => {
          logoCacheSet(key, null);
        });
    }, []);

    const getLogoFor = useCallback(
      (media: Media): string | null => {
        // Sem tmdb_id: única fonte é a logo armazenada. Com tmdb_id: só a
        // localizada já buscada (null = skeleton, evita flash estrangeiro).
        if (!media?.tmdb_id) return getMediaLogo(media) || null;
        const key = `${media.tmdb_id}_${media.type}`;
        return logoMap.get(key) ?? null;
      },
      [logoMap]
    );

    const firstMovie = validItems.length > 0 ? validItems[0] : null;
    const isSlotExpanded = isFocused || hoveredMovie !== null;
    const currentSlotMovie =
      validItems.length > 0 ? (isSlotExpanded ? validItems[activeIndex] : firstMovie) : null;

    const rowMovies = useMemo(() => {
      if (validItems.length <= 1) return [];
      const result: Media[] = [];
      for (let i = 1; i < validItems.length; i++) {
        result.push(validItems[(activeIndex + i) % validItems.length]);
      }
      return result;
    }, [validItems, activeIndex]);
    const renderedItems = rowMovies;

    const rowVirtualizer = useVirtualizer({
      horizontal: true,
      count: isVisible ? renderedItems.length : 0,
      getScrollElement: () => rowRef.current,
      estimateSize: () => VIRTUAL_CARD_STRIDE,
      overscan: ROW_OVERSCAN,
    });

    const slotWidth = currentSlotMovie
      ? isSlotExpanded
        ? SLOT_EXPANDED_WIDTH
        : SLOT_COLLAPSED_WIDTH
      : 0;
    const slotHeight = isSlotExpanded ? SLOT_EXPANDED_HEIGHT : CARD_HEIGHT;

    useEffect(() => {
      const fetchId = ++detailsFetchRef.current;
      setTmdbBackdrop(null);
      setTmdbLogo(null);

      if (!isSlotExpanded || !currentSlotMovie) return;
      const tmdbId = currentSlotMovie.tmdb_id;
      if (!tmdbId) return;

      // Atraso de 280ms antes de buscar — evita rajada de chamadas ao navegar com D-pad
      const timer = setTimeout(() => {
        getMediaDetailsByID(tmdbId, currentSlotMovie.type)
          .then((details) => {
            if (fetchId !== detailsFetchRef.current) return;
            if (!details) return;
            if (details.backdrop) setTmdbBackdrop(details.backdrop);
            if (details.logo) setTmdbLogo(details.logo);
          })
          .catch(() => {});
      }, 280);

      return () => clearTimeout(timer);
    }, [isSlotExpanded, currentSlotMovie]);

    useEffect(() => {
      if (!isSlotExpanded) {
        setTmdbBackdrop(null);
        setTmdbLogo(null);
      }
    }, [isSlotExpanded]);

    useEffect(() => {
      if (!isVisible) return;
      if (validItems[0]) fetchLogoFor(validItems[0]);
    }, [isVisible, validItems, fetchLogoFor]);

    useEffect(() => {
      if (currentSlotMovie) fetchLogoFor(currentSlotMovie);
    }, [currentSlotMovie, fetchLogoFor]);

    // ── Prefetch on-focus (Fase 2): aquece o cache dos próximos posters ───────
    // O virtualizer só monta cards visíveis+overscan. Ao focar/navegar na row,
    // pré-carregamos em idle os N posters seguintes (mesma URL WebP do card) para
    // que o scroll horizontal seja instantâneo. Dedup via Set; cancelável.
    const prefetchedPostersRef = useRef<Set<string>>(new Set());
    useEffect(() => {
      if (!isVisible || validItems.length === 0) return;
      const PREFETCH_AHEAD = 6;
      const run = () => {
        for (let i = 1; i <= PREFETCH_AHEAD; i++) {
          const item = validItems[(activeIndex + i) % validItems.length];
          if (!item) continue;
          const url = getMediaPoster(item);
          if (!url || prefetchedPostersRef.current.has(url)) continue;
          prefetchedPostersRef.current.add(url);
          const img = new Image();
          img.decoding = 'async';
          img.src = url;
        }
      };
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      const handle = ric ? ric(run, { timeout: 1200 }) : (window.setTimeout(run, 200) as unknown as number);
      return () => {
        if (cic && ric) cic(handle);
        else window.clearTimeout(handle);
      };
    }, [isVisible, activeIndex, validItems]);

    const featuredBackdrop =
      tmdbBackdrop || (currentSlotMovie ? getMediaBackdrop(currentSlotMovie) : '');
    const featuredLogo = tmdbLogo || (currentSlotMovie ? getLogoFor(currentSlotMovie) : null);
    const currentSlotTitle = (currentSlotMovie?.title || 'Conteúdo').trim() || 'Conteúdo';

    useEffect(() => {
      if (!sectionRef.current) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: IS_CAPACITOR ? '600px' : '300px' }
      );
      observer.observe(sectionRef.current);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      rowVirtualizer.scrollToOffset(0);
      // Somente ao mudar o destaque da fila; rowVirtualizer não é estável entre renders.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: evitar loop ao resetar scroll
    }, [activeIndex]);

    const activateCard = useCallback(
      (indexInRow: number) => {
        const absoluteIndex = (activeIndex + 1 + indexInRow) % validItems.length;
        setActiveIndex(absoluteIndex);
        setHoveredMovie(validItems[absoluteIndex]);
        fetchLogoFor(validItems[absoluteIndex]);
        rowVirtualizer.scrollToIndex(indexInRow, { align: 'start' });
      },
      [activeIndex, validItems, fetchLogoFor, rowVirtualizer]
    );

    const handleCardClick = useCallback(
      (media: Media) => {
        playSelectSound();
        onSelect(media);
      },
      [onSelect]
    );

    const handleRowBlur = useCallback(() => {
      requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        if (sectionRef.current?.contains(activeElement)) return;
        setIsFocused(false);
        setHoveredMovie(null);
      });
    }, []);

    const handleSlotKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          const nextIdx = (activeIndex + 1) % validItems.length;
          setActiveIndex(nextIdx);
          setHoveredMovie(validItems[nextIdx]);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopPropagation();
          const sidebar = document.querySelector('[data-nav-sidebar]');
          const firstSidebarItem = sidebar?.querySelector('[data-nav-item]') as HTMLElement | null;
          if (firstSidebarItem) {
            playNavigateSound();
            firstSidebarItem.focus({ preventScroll: true });
          }
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (currentSlotMovie) handleCardClick(currentSlotMovie);
        }
      },
      [activeIndex, validItems, currentSlotMovie, handleCardClick]
    );

    if (loading && validItems.length === 0) {
      return (
        <section className={styles.rowSection} role="status" aria-busy="true" aria-label={`Carregando ${title}`}>
          <h2 className={styles.rowTitle}>
            {title}
            <div className={styles.rowTitleLine} />
          </h2>
          <div
            className={styles.rowShell}
            style={{ ['--movie-row-card-height' as string]: `${CARD_HEIGHT}px` }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={styles.placeholder}
                style={{ width: CARD_WIDTH, flexShrink: 0 }}
                aria-hidden="true"
              />
            ))}
          </div>
        </section>
      );
    }

    if (validItems.length === 0) return null;
    if (!currentSlotMovie) return null;

    return (
      <section
        ref={sectionRef}
        data-nav-row={rowIndex}
        className={styles.rowSection}
        onMouseLeave={() => {
          setHoveredMovie(null);
          if (!isFocused) setActiveIndex(0);
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className={styles.rowTitle}>
            {title}
            <div className={styles.rowTitleLine} />
          </h2>
          {headerActionLabel && onHeaderActionClick && (
            <button
              type="button"
              onClick={onHeaderActionClick}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white/70 border border-white/20 hover:text-white hover:bg-white/10 transition-colors"
              data-nav-item
              data-nav-col={1}
              tabIndex={0}
              aria-label={headerActionLabel}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const nextSection = document.querySelector(
                    `[data-nav-row="${rowIndex + 1}"]`
                  ) as HTMLElement | null;
                  const firstItem = nextSection?.querySelector(
                    '[data-nav-item]'
                  ) as HTMLElement | null;
                  if (firstItem) {
                    playNavigateSound();
                    firstItem.focus({ preventScroll: true });
                  }
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  slotRef.current?.focus({ preventScroll: true });
                }
              }}
            >
              {headerActionLabel}
            </button>
          )}
        </div>

        <div
          className={`${styles.rowShell} ${isSlotExpanded ? styles.rowShellExpanded : ''}`.trim()}
          style={{
            ['--movie-row-card-width' as string]: `${CARD_WIDTH}px`,
            ['--movie-row-card-height' as string]: `${CARD_HEIGHT}px`,
            ['--movie-row-slot-height' as string]: `${slotHeight}px`,
          }}
        >
          <button
            ref={slotRef}
            type="button"
            data-nav-item
            data-nav-poster-card
            data-nav-custom-focus
            data-nav-col={0}
            data-nav-internal="true"
            aria-label={`${currentSlotTitle}. Destaque da fileira ${title}. Pressione Enter para abrir.`}
            className={`${styles.highlightSlot} ${isSlotExpanded ? styles.highlightSlotOpen : ''}`}
            style={{
              width: `${slotWidth}px`,
              minWidth: `${slotWidth}px`,
              maxWidth: `${slotWidth}px`,
              flexShrink: 0,
              zIndex: 10,
            }}
            onClick={() => handleCardClick(currentSlotMovie)}
            onFocus={() => {
              setIsFocused(true);
              setHoveredMovie(validItems[activeIndex]);
            }}
            onBlur={handleRowBlur}
            onKeyDown={handleSlotKeyDown}
          >
            {isSlotExpanded ? (
              <article className={styles.horizontalCard}>
                {featuredBackdrop ? (
                  <LazyImage
                    src={featuredBackdrop}
                    alt={currentSlotMovie.title}
                    className="absolute inset-0 w-full h-full"
                    fallbackSrc={ERROR_SVG}
                    showSkeleton={true}
                    objectFit="cover"
                    eager={true}
                    imageType="backdrop"
                    width={SLOT_EXPANDED_WIDTH}
                    height={SLOT_EXPANDED_HEIGHT}
                    sizes={`${SLOT_EXPANDED_WIDTH}px`}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#16161e] flex items-center justify-center">
                    <div className="w-24 h-14 rounded bg-white/5 animate-pulse" />
                  </div>
                )}
                <div className={styles.horizontalOverlay} />
                {featuredLogo ? (
                  <img
                    src={featuredLogo}
                    alt={currentSlotMovie.title}
                    className={styles.horizontalLogo}
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute left-4 bottom-4 z-10">
                    <span className="text-xl font-bold text-white drop-shadow-lg">
                      {currentSlotMovie.title}
                    </span>
                  </div>
                )}
              </article>
            ) : firstMovie ? (
              <article className={styles.verticalFeaturedCard}>
                {getMediaPoster(firstMovie) ? (
                  <LazyImage
                    src={getMediaPoster(firstMovie)!}
                    alt={firstMovie.title}
                    className="absolute inset-0 w-full h-full"
                    fallbackSrc={ERROR_SVG}
                    showSkeleton={true}
                    objectFit="cover"
                    eager={true}
                    imageType="poster"
                    width={CARD_WIDTH}
                    height={CARD_HEIGHT}
                    sizes={`${CARD_WIDTH}px`}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#16161e] flex items-center justify-center">
                    <div className="w-16 h-20 rounded-lg bg-white/5 animate-pulse" />
                  </div>
                )}
              </article>
            ) : null}
          </button>

          <div className={styles.trackWrapper}>
            <div ref={rowRef} data-nav-scroll className={styles.rowTrack}>
              {isVisible ? (
                <div
                  className="relative h-full flex-shrink-0"
                  style={{
                    width: rowVirtualizer.getTotalSize(),
                    minWidth: rowVirtualizer.getTotalSize(),
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((vi) => {
                    const media = renderedItems[vi.index];
                    if (!media) return null;
                    const poster = getMediaPoster(media);
                    const navCol = vi.index + 2;
                    const mediaTitle = (media.title || 'Conteúdo').trim() || 'Conteúdo';
                    return (
                      <div
                        key={`${media.id}-${vi.index}`}
                        className={styles.cardWrap}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          height: '100%',
                          width: vi.size,
                          transform: `translateX(${vi.start}px)`,
                          boxSizing: 'border-box',
                          paddingRight: CARD_GAP_PX,
                        }}
                      >
                        <button
                          type="button"
                          className={`${styles.card} bg-transparent border-0 p-0 text-left`}
                          data-nav-item
                          data-nav-poster-card
                          data-nav-custom-focus
                          data-nav-col={navCol}
                          tabIndex={0}
                          aria-label={`${mediaTitle}. Pressione Enter para abrir.`}
                          onMouseEnter={() => activateCard(vi.index)}
                          onFocus={() => {
                            setIsFocused(true);
                            activateCard(vi.index);
                          }}
                          onBlur={handleRowBlur}
                          onClick={() => handleCardClick(media)}
                        >
                          {poster ? (
                            <LazyImage
                              src={poster}
                              alt={media.title}
                              className="absolute inset-0 w-full h-full"
                              fallbackSrc={ERROR_SVG}
                              showSkeleton={true}
                              objectFit="cover"
                              eager={isVisible && vi.index < VISIBLE_ROW_EAGER_COUNT}
                              imageType="poster"
                              width={CARD_WIDTH}
                              height={CARD_HEIGHT}
                              sizes={`${CARD_WIDTH}px`}
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[#16161e] flex items-center justify-center">
                              <div className="w-12 h-16 rounded bg-white/5 animate-pulse" />
                            </div>
                          )}
                          {/* Cards verticais sem overlay de logo/titulo */}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.placeholder} />
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }
);

MovieRow.displayName = 'MovieRow';
export default MovieRow;
