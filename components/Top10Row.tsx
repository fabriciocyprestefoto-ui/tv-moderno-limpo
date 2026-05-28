import React, { useMemo, useRef, useCallback, useState } from 'react';
import { Media } from '../types';
import { getMediaPoster } from '../utils/mediaUtils';
import LazyImage, { ERROR_SVG } from '../components/LazyImage';
import { playSelectSound } from '../utils/soundEffects';

interface Top10RowProps {
  title?: string;
  items: Media[];
  onSelect: (media: Media) => void;
  rowIndex?: number;
}

const CARD_WIDTH = 140;
const CARD_HEIGHT = 210;

/**
 * Top10Row — Netflix-style Top 10 trending row with large numbered overlays.
 * Uses the same navigation pattern as MovieRow but with custom card rendering.
 */
const Top10Row: React.FC<Top10RowProps> = React.memo(
  ({ title = 'Top 10 Hoje', items, onSelect, rowIndex = 0 }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const [focusedIndex, setFocusedIndex] = useState(-1);

    const top10Items = useMemo(() => items.slice(0, 10), [items]);

    const handleCardClick = useCallback(
      (media: Media) => {
        playSelectSound();
        onSelect(media);
      },
      [onSelect]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent, media: Media) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCardClick(media);
        }
      },
      [handleCardClick]
    );

    if (top10Items.length < 3) return null;

    return (
      <section data-nav-row={rowIndex} className="px-[72px] relative mt-8 overflow-visible">
        <h2 className="text-[1.875rem] leading-9 font-bold mb-6 flex items-center gap-4 text-[#f0f0f0]">
          <span className="text-red-500 font-black">TOP 10</span>
          {title}
          <div className="h-[1px] flex-1 bg-gradient-to-r from-white/20 to-transparent" />
        </h2>

        <div
          ref={rowRef}
          data-nav-scroll
          className="flex gap-6 overflow-x-auto overflow-y-visible pb-4 no-scrollbar scroll-smooth"
          style={{ scrollPadding: '48px' }}
        >
          {top10Items.map((media, idx) => {
            const poster = getMediaPoster(media);
            const isFocused = focusedIndex === idx;

            return (
              <button
                key={media.id || idx}
                type="button"
                data-nav-item
                data-nav-col={idx}
                className="relative flex-shrink-0 outline-none group"
                style={{
                  width: `${CARD_WIDTH + 60}px`,
                  height: `${CARD_HEIGHT}px`,
                }}
                onClick={() => handleCardClick(media)}
                onKeyDown={(e) => handleKeyDown(e, media)}
                onFocus={() => setFocusedIndex(idx)}
                onBlur={() => setFocusedIndex(-1)}
              >
                {/* Large number overlay */}
                <div
                  className="absolute left-0 bottom-0 z-10 pointer-events-none select-none"
                  style={{
                    fontSize: `${CARD_HEIGHT * 0.85}px`,
                    lineHeight: '0.8',
                    fontWeight: 900,
                    fontStyle: 'italic',
                    color: 'transparent',
                    WebkitTextStroke: '3px rgba(255,255,255,0.7)',
                    textShadow: '0 4px 20px rgba(0,0,0,0.8)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >
                  {idx + 1}
                </div>

                {/* Poster card */}
                <div
                  className={`absolute right-0 top-0 rounded-xl overflow-hidden border transition-all duration-200
                  ${
                    isFocused
                      ? 'border-white scale-105 shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                      : 'border-white/10 group-hover:scale-103'
                  }`}
                  style={{
                    width: `${CARD_WIDTH}px`,
                    height: `${CARD_HEIGHT}px`,
                  }}
                >
                  {poster ? (
                    <LazyImage
                      src={poster}
                      alt={media.title}
                      className="absolute inset-0 w-full h-full"
                      fallbackSrc={ERROR_SVG}
                      showSkeleton={true}
                      objectFit="cover"
                      eager={idx < 2}
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
                    <p className="text-[9px] font-bold text-white/90 line-clamp-2 leading-tight drop-shadow-lg">
                      {media.title}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }
);

Top10Row.displayName = 'Top10Row';
export default Top10Row;
