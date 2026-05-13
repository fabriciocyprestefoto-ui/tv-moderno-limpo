import React from 'react';
import { ContinueWatchingItem } from '../hooks/useContinueWatching';
import { getMediaPoster, getMediaBackdrop } from '../utils/mediaUtils';
import LazyImage, { ERROR_SVG } from '../components/LazyImage';
import { Play, Clock } from 'lucide-react';
import { playSelectSound } from '../utils/soundEffects';

interface ContinueWatchingRowProps {
  items: ContinueWatchingItem[];
  onPlay: (media: ContinueWatchingItem) => void;
  onSelect: (media: ContinueWatchingItem) => void;
  rowIndex?: number;
}

const CARD_W = 260;
const CARD_H = 146; // 16:9

const ContinueWatchingRow: React.FC<ContinueWatchingRowProps> = ({
  items,
  onPlay,
  onSelect: _onSelect,
  rowIndex = 0,
}) => {
  if (items.length === 0) return null;

  const formatProgress = (item: ContinueWatchingItem) => {
    if (item.seasonNumber && item.episodeNumber) {
      return `T${item.seasonNumber} E${item.episodeNumber}`;
    }
    if (item.totalDuration && item.progressSeconds) {
      const remaining = Math.max(0, item.totalDuration - item.progressSeconds);
      const min = Math.round(remaining / 60);
      return min > 0 ? `${min} min restantes` : null;
    }
    return null;
  };

  return (
    <section
      data-nav-row={rowIndex}
      style={{ paddingLeft: 72, paddingRight: 72, marginTop: '2rem', position: 'relative' }}
    >
      <h2
        style={{
          fontSize: '1.875rem',
          fontWeight: 700,
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          color: '#f0f0f0',
        }}
      >
        Continuar Assistindo
        <div
          style={{
            height: 1,
            flex: 1,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.2) 0%, transparent 100%)',
          }}
        />
      </h2>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          overflowX: 'auto',
          paddingBottom: 12,
          scrollbarWidth: 'none',
        }}
      >
        {items.map((item, idx) => {
          const backdrop = getMediaBackdrop(item) || getMediaPoster(item);
          const progress = formatProgress(item);

          return (
            <div
              key={`${item.id}-${item.seasonNumber ?? 0}-${item.episodeNumber ?? 0}`}
              data-nav-item
              data-nav-col={idx}
              tabIndex={0}
              onClick={() => {
                playSelectSound();
                onPlay(item);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  playSelectSound();
                  onPlay(item);
                }
              }}
              style={{
                position: 'relative',
                flexShrink: 0,
                width: CARD_W,
                height: CARD_H,
                borderRadius: '0.75rem',
                overflow: 'hidden',
                background: '#16161e',
                cursor: 'pointer',
                border: '0.8px solid rgba(255,255,255,0.15)',
                transition: 'transform 160ms ease, border-color 160ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.8)';
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)';
                (e.currentTarget as HTMLElement).style.boxShadow =
                  '0 0 0 2px rgba(168,85,247,0.4), 0 8px 24px rgba(0,0,0,0.5)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              {/* Backdrop image */}
              {backdrop ? (
                <LazyImage
                  src={backdrop}
                  alt={item.title}
                  className="absolute inset-0 w-full h-full"
                  fallbackSrc={ERROR_SVG}
                  showSkeleton={true}
                  objectFit="cover"
                  eager={idx < 4}
                />
              ) : (
                <div className="absolute inset-0 bg-[#16161e] flex items-center justify-center">
                  <div className="w-16 h-10 rounded bg-white/5 animate-pulse" />
                </div>
              )}

              {/* Gradient overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.85) 100%)',
                }}
              />

              {/* Play icon center */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 160ms ease',
                }}
                className="cw-play-overlay"
              >
                <div
                  style={{
                    background: 'rgba(168,85,247,0.85)',
                    borderRadius: '50%',
                    width: 40,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Play size={18} fill="white" color="white" />
                </div>
              </div>

              {/* Bottom info */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {/* Progress bar */}
                {item.progressPercent > 0 && (
                  <div
                    style={{
                      height: 3,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.2)',
                      overflow: 'hidden',
                      marginBottom: 2,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        borderRadius: 999,
                        width: `${item.progressPercent}%`,
                        background: 'linear-gradient(90deg, #a855f7, #7c3aed)',
                      }}
                    />
                  </div>
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#f0f0f0',
                    lineHeight: 1.2,
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  }}
                >
                  {item.title}
                </span>
                {progress && (
                  <span
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.6)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Clock size={9} /> {progress}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        [data-nav-item]:focus .cw-play-overlay,
        [data-nav-item]:hover .cw-play-overlay { opacity: 1 !important; }
      `}</style>
    </section>
  );
};

export default ContinueWatchingRow;
