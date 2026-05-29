import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Tv } from 'lucide-react';
import { G, VISION_FLOAT_STYLE, vGlass } from './playerTokens';
import { getImageUrl } from '../../services/tmdb';
import type { Season, Episode } from '../../types/player';
import type { Media } from '../../types';

interface PlayerEpisodesPanelProps {
  visible: boolean;
  seasons: Season[];
  episodes: Episode[];
  selectedSeasonNum: number;
  focusArea: string;
  focusedSeasonIdx: number;
  focusedEpisodeIdx: number;
  media: Media;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
  onSelectEpisode?: (season: number, episode: number) => void;
  onSeasonFocus: (idx: number, seasonNum: number) => void;
  onSeasonClick: (idx: number, seasonNum: number) => void;
}

const PlayerEpisodesPanel: React.FC<PlayerEpisodesPanelProps> = ({
  visible,
  seasons,
  episodes,
  selectedSeasonNum,
  focusArea,
  focusedSeasonIdx,
  focusedEpisodeIdx,
  media,
  videoRef,
  onClose,
  onSelectEpisode,
  onSeasonFocus,
  onSeasonClick,
}) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[20000] flex items-end justify-center px-4 pb-28 md:px-6 md:pb-32 pointer-events-auto"
        style={{ background: 'rgba(8,2,22,0.48)', backdropFilter: 'blur(14px)' }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-episodes-title"
      >
        <motion.div
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 32, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...VISION_FLOAT_STYLE,
            width: 'min(1120px, calc(100vw - 2rem))',
            maxHeight: 'min(72vh, 640px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '22px 28px 26px',
            marginBottom: 'min(10vh, 72px)',
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
            <h2
              id="player-episodes-title"
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: G.textPrimary,
                letterSpacing: '0.06em',
              }}
            >
              Temporadas e Episódios
            </h2>
            <button
              onClick={onClose}
              aria-label="Voltar aos controles do player"
              style={{
                ...vGlass({ borderRadius: '12px', padding: '6px 12px' }),
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: G.textPrimary,
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 150ms',
              }}
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          </div>

          <div className="flex gap-6 min-h-0 flex-1 overflow-hidden">
            {/* Seasons column */}
            <div
              className="cast-grid-scroll flex-shrink-0 flex flex-col gap-3 overflow-y-auto pr-1"
              style={{ width: 200 }}
              role="listbox"
              aria-label="Temporadas"
            >
              {seasons.map((s, idx) => {
                const seasonFocused = focusedSeasonIdx === idx && focusArea === 'episodes-seasons';
                return (
                  <button
                    key={s.id || idx}
                    onClick={() => onSeasonClick(idx, s.season_number)}
                    onFocus={() => onSeasonFocus(idx, s.season_number)}
                    role="option"
                    aria-selected={selectedSeasonNum === s.season_number}
                    aria-label={s.name || `Temporada ${s.season_number}`}
                    style={{
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderRadius: 16,
                      background: seasonFocused
                        ? G.btnFocus
                        : selectedSeasonNum === s.season_number
                          ? 'rgba(255,255,255,0.08)'
                          : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${seasonFocused ? 'rgba(167,117,255,0.45)' : 'transparent'}`,
                      color: selectedSeasonNum === s.season_number ? G.textPrimary : G.textSec,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 200ms',
                      outline: 'none',
                      boxShadow: seasonFocused
                        ? '0 0 0 2px rgba(167,117,255,0.55), 0 0 16px rgba(124,58,237,0.25)'
                        : undefined,
                    }}
                  >
                    {s.name || `Temporada ${s.season_number}`}
                  </button>
                );
              })}
            </div>

            {/* Episodes column */}
            <div className="cast-grid-scroll flex-1 overflow-y-auto flex flex-col gap-4 min-w-0">
              {episodes.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-full py-12"
                  style={{ opacity: 0.28 }}
                  role="status"
                  aria-live="polite"
                  aria-label="Carregando episódios"
                >
                  <div
                    className="w-8 h-8 rounded-full animate-spin mb-3"
                    style={{
                      border: '3px solid rgba(255,255,255,0.12)',
                      borderTopColor: 'rgba(167,117,255,0.85)',
                    }}
                  />
                  <p
                    style={{
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: '0.15em',
                      fontSize: 11,
                    }}
                  >
                    Carregando episódios...
                  </p>
                </div>
              ) : (
                episodes.map((ep, idx) => {
                  const isActive =
                    Number(media.episode_number) === ep.episode_number &&
                    selectedSeasonNum === Number(media.season_number);
                  const isFocused = focusedEpisodeIdx === idx && focusArea === 'episodes-list';
                  return (
                    <button
                      key={ep.id || idx}
                      id={`ep-${idx}`}
                      aria-label={`Episódio ${ep.episode_number}: ${ep.name}`}
                      aria-current={isActive ? 'true' : undefined}
                      onFocus={() => {}}
                      onClick={() => {
                        if (onSelectEpisode) {
                          onSelectEpisode(selectedSeasonNum, ep.episode_number);
                          onClose();
                          setTimeout(() => {
                            if (!document.fullscreenElement)
                              document.documentElement.requestFullscreen().catch(() => {});
                            videoRef.current?.play().catch(() => {});
                          }, 300);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 18,
                        padding: '14px 16px',
                        borderRadius: 18,
                        textAlign: 'left',
                        background: isFocused ? G.btnFocus : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isActive ? 'rgba(167,117,255,0.42)' : isFocused ? 'rgba(167,117,255,0.38)' : 'transparent'}`,
                        cursor: 'pointer',
                        transition: 'all 200ms',
                        outline: 'none',
                        opacity: isFocused ? 1 : 0.62,
                        boxShadow: isFocused
                          ? '0 0 0 2px rgba(167,117,255,0.55), 0 0 18px rgba(124,58,237,0.22)'
                          : undefined,
                        transform: isFocused ? 'scale(1.01)' : undefined,
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          width: 132,
                          height: 74,
                          borderRadius: 14,
                          overflow: 'hidden',
                          flexShrink: 0,
                          border: `1px solid ${isActive ? 'rgba(167,117,255,0.35)' : 'rgba(255,255,255,0.10)'}`,
                        }}
                      >
                        {ep.still_path ? (
                          <img
                            src={getImageUrl(ep.still_path, 'w300')}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              background: 'rgba(255,255,255,0.05)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0.35,
                            }}
                          >
                            <Tv size={22} />
                          </div>
                        )}
                        {isFocused && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.42)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: 'rgba(124,58,237,0.35)',
                                border: '1px solid rgba(167,117,255,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Play size={16} fill="white" style={{ marginLeft: 2 }} />
                            </div>
                          </div>
                        )}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 6,
                            left: 6,
                            padding: '3px 7px',
                            borderRadius: 8,
                            background: 'rgba(0,0,0,0.72)',
                            fontSize: 8,
                            fontWeight: 800,
                            color: 'rgba(255,255,255,0.88)',
                          }}
                        >
                          EP {ep.episode_number}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="flex items-center gap-2 flex-wrap"
                          style={{ marginBottom: 6 }}
                        >
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: isFocused ? G.textPrimary : 'rgba(255,255,255,0.82)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {ep.name}
                          </p>
                          {isActive && (
                            <span
                              style={{
                                flexShrink: 0,
                                padding: '3px 8px',
                                borderRadius: 8,
                                background: 'rgba(124,58,237,0.22)',
                                border: '1px solid rgba(167,117,255,0.4)',
                                fontSize: 8,
                                fontWeight: 900,
                                color: '#a78bfa',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                              }}
                            >
                              Assistindo
                            </span>
                          )}
                        </div>
                        <p
                          style={{
                            fontSize: 11,
                            color: 'rgba(255,255,255,0.40)',
                            fontWeight: 500,
                            lineHeight: 1.45,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {ep.overview || 'Prepare-se para mais emoção neste episódio.'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default PlayerEpisodesPanel;
