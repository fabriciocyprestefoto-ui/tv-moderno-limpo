import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Media } from '../types';
import MediaCard from './MediaCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { deduplicateMedia, getMediaPoster } from '@/utils/mediaUtils';

interface MediaRowProps {
  title: string;
  items: Media[];
  onSelect: (media: Media) => void;
  onPlay?: (media: Media) => void;
  showProgress?: boolean;
  rowIndex?: number;
}

/** Largura do poster + gap-5 (~20px) — alinhado ao virtualizer horizontal. */
const CARD_WIDTH_PX = 167;
const GAP_PX = 20;
const SLOT_PX = CARD_WIDTH_PX + GAP_PX;
/** Acima disso, lista horizontal usa @tanstack/react-virtual (menos nós no DOM). */
const VIRTUAL_THRESHOLD = 24;

const MediaRow: React.FC<MediaRowProps> = React.memo(
  ({ title, items, onSelect, onPlay, showProgress, rowIndex = 0 }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const sectionRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      if (!sectionRef.current) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: '600px' }
      );
      observer.observe(sectionRef.current);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (isVisible || !sectionRef.current) return;
      const el = sectionRef.current;
      const handleFocusIn = () => {
        setIsVisible(true);
      };
      const fallbackTimer = window.setTimeout(() => setIsVisible(true), 2500);
      el.addEventListener('focusin', handleFocusIn);
      return () => {
        window.clearTimeout(fallbackTimer);
        el.removeEventListener('focusin', handleFocusIn);
      };
    }, [isVisible]);

    const validItems = useMemo(() => {
      const deduped = deduplicateMedia(items);
      return deduped.filter((m) => {
        const poster = getMediaPoster(m);
        return poster.length > 0 || !!m.backdrop;
      });
    }, [items]);

    const useVirtual = validItems.length > VIRTUAL_THRESHOLD;

    const virtualizer = useVirtualizer({
      horizontal: true,
      count: isVisible && useVirtual ? validItems.length : 0,
      getScrollElement: () => rowRef.current,
      estimateSize: () => SLOT_PX,
      overscan: 8,
    });

    const scroll = useMemo(
      () => (direction: 'left' | 'right') => {
        if (rowRef.current) {
          const { scrollLeft, clientWidth } = rowRef.current;
          const scrollTo =
            direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;
          rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
      },
      []
    );

    useEffect(() => {
      const row = rowRef.current;
      if (!row) return;
      const handleFocusIn = (e: FocusEvent) => {
        const card = (e.target as HTMLElement)?.closest(
          '[data-nav-item],[data-nav-media-card],[data-nav-poster-card]'
        );
        if (!card || !row.contains(card)) return;
        const rowRect = row.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const cardLeft = cardRect.left - rowRect.left + row.scrollLeft;
        const targetScroll = cardLeft - rowRect.width / 2 + cardRect.width / 2;
        row.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
      };
      row.addEventListener('focusin', handleFocusIn);
      return () => row.removeEventListener('focusin', handleFocusIn);
    }, []);

    const renderCard = (m: Media, idx: number) => (
      <div
        key={`${m.type}-${m.tmdb_id || m.id}`}
        className="relative flex-shrink-0"
        style={{ width: CARD_WIDTH_PX }}
      >
        <MediaCard
          media={m}
          onClick={() => onSelect(m)}
          onPlay={onPlay ? () => onPlay(m) : undefined}
          colIndex={idx}
        />
        {showProgress && (
          <div className="absolute bottom-4 left-4 right-4 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-[#A855F7] w-[60%]" />
          </div>
        )}
      </div>
    );

    if (validItems.length === 0) return null;

    return (
      <section ref={sectionRef} data-nav-row={rowIndex} className="px-12 relative group mt-8">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-4">
          {title}
          <div className="h-px flex-1 bg-linear-to-r from-white/20 to-transparent" />
        </h2>

        <div className="relative">
          <button
            onClick={() => scroll('left')}
            className="absolute left-[-40px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-black/60 active:scale-95"
            aria-label="Scroll Left"
            tabIndex={-1}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            onClick={() => scroll('right')}
            className="absolute right-[-40px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-black/60 active:scale-95"
            aria-label="Scroll Right"
            tabIndex={-1}
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div
            ref={rowRef}
            data-nav-scroll
            className="flex gap-5 overflow-x-auto pb-12 px-4 -mx-4 scrollbar-hide scroll-smooth min-h-[270px]"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {!isVisible ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 rounded-2xl overflow-hidden relative"
                  style={{
                    width: CARD_WIDTH_PX,
                    height: 250,
                    background: 'rgba(255,255,255,0.04)',
                    animationDelay: `${i * 120}ms`,
                  }}
                  aria-hidden="true"
                >
                  <div className="absolute inset-0 skeleton-shimmer-netflix" />
                  <div
                    className="w-full"
                    style={{
                      height: '75%',
                      background:
                        'linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                    }}
                  />
                  <div className="p-3 space-y-2">
                    <div
                      className="h-2.5 rounded-full relative overflow-hidden"
                      style={{ width: '70%', background: 'rgba(255,255,255,0.06)' }}
                    >
                      <div className="absolute inset-0 skeleton-shimmer-netflix" />
                    </div>
                    <div
                      className="h-2 rounded-full relative overflow-hidden"
                      style={{ width: '45%', background: 'rgba(255,255,255,0.04)' }}
                    >
                      <div className="absolute inset-0 skeleton-shimmer-netflix" />
                    </div>
                  </div>
                </div>
              ))
            ) : useVirtual ? (
              <div
                className="relative h-[250px]"
                style={{
                  width: virtualizer.getTotalSize(),
                  flexShrink: 0,
                }}
              >
                {virtualizer.getVirtualItems().map((vi) => {
                  const m = validItems[vi.index];
                  if (!m) return null;
                  return (
                    <div
                      key={vi.key}
                      data-index={vi.index}
                      className="absolute top-0 left-0 h-full flex items-start"
                      style={{
                        transform: `translateX(${vi.start}px)`,
                        width: SLOT_PX,
                      }}
                    >
                      {renderCard(m, vi.index)}
                    </div>
                  );
                })}
              </div>
            ) : (
              validItems.map((m, idx) => renderCard(m, idx))
            )}
          </div>
        </div>
      </section>
    );
  }
);

MediaRow.displayName = 'MediaRow';
export default MediaRow;
