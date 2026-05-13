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
import styles from './MovieRow.module.css';
import { isTVBox } from '../utils/tvBoxDetector';

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
const VISIBLE_ROW_EAGER_COUNT = IS_CAPACITOR ? 4 : 6;

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
      const initial = getMediaLogo(media) || null;
      logoCacheSet(key, initial);
      if (initial) {
        setLogoMap((prev) => new Map(prev).set(key, initial));
        return;
      }
      getLogo(media.tmdb_id, media.type as 'movie' | 'series')
        .then((logo) => {
          const normalizedLogo = logo ? getMediaLogo({ logo_url: logo }) : null;
          logoCacheSet(key, normalizedLogo);
          if (normalizedLogo) setLogoMap((prev) => new Map(prev).set(key, normalizedLogo));
        })
        .catch(() => {
          logoCacheSet(key, null);
        });
    }, []);

    const getLogoFor = useCallback(
      (media: Media): string | null => {
        const fallbackLogo = getMediaLogo(media) || null;
        if (!media?.tmdb_id) return fallbackLogo;
        const key = `${media.tmdb_id}_${media.type}`;
        return logoMap.get(key) ?? fallbackLogo;
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
      overscan: 6,
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

    const featuredBackdrop =
      tmdbBackdrop || (currentSlotMovie ? getMediaBackdrop(currentSlotMovie) : '');
    const featuredLogo = tmdbLogo || (currentSlotMovie ? getLogoFor(currentSlotMovie) : null);

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
        <section className={styles.rowSection}>
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
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#16161e] flex items-center justify-center">
                    <div className="w-16 h-20 rounded-lg bg-white/5 animate-pulse" />
                  </div>
                )}
                <div className={styles.cardGradient} />
                {featuredLogo && <img src={featuredLogo} alt="" className={styles.cardLogo} />}
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
                          aria-label={media.title}
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
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[#16161e] flex items-center justify-center">
                              <div className="w-12 h-16 rounded bg-white/5 animate-pulse" />
                            </div>
                          )}
                          <div className={styles.cardGradient} />
                          {(() => {
                            const logo = getLogoFor(media);
                            return logo ? (
                              <img src={logo} alt="" className={styles.cardLogo} />
                            ) : null;
                          })()}
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
