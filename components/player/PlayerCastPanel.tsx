import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { G, VISION_FLOAT_STYLE, vGlass } from './playerTokens';
import { getImageUrl } from '../../services/tmdb';
import type { CastMember } from '../../types';

const CAST_GRID_COLS = 8;

interface PlayerCastPanelProps {
  visible: boolean;
  cast: CastMember[];
  focusArea: string;
  focusedCastIdx: number;
  onClose: () => void;
}

const PlayerCastPanel: React.FC<PlayerCastPanelProps> = ({
  visible,
  cast,
  focusArea,
  focusedCastIdx,
  onClose,
}) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        className="absolute left-6 right-6 z-[205] bottom-[min(46vh,320px)] max-xl:bottom-52"
        style={{ ...VISION_FLOAT_STYLE, padding: '22px 28px 26px', minHeight: 140 }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="player-cast-title"
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 22 }}>
          <h3
            id="player-cast-title"
            style={{ fontSize: 16, fontWeight: 900, color: G.textPrimary, letterSpacing: '0.06em' }}
          >
            ELENCO
          </h3>
          <button
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
              }
            }}
            tabIndex={0}
            aria-label="Fechar elenco"
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
              boxShadow:
                focusArea === 'cast' && focusedCastIdx === -1
                  ? '0 0 0 2px rgba(167,117,255,0.72), 0 0 18px rgba(124,58,237,0.35)'
                  : undefined,
            }}
          >
            <X size={15} /> Fechar
          </button>
        </div>
        <div
          className="cast-grid-scroll grid gap-x-6 gap-y-7 overflow-y-auto w-full"
          style={{
            gridTemplateColumns: `repeat(${CAST_GRID_COLS}, minmax(0, 1fr))`,
            gridAutoFlow: 'row',
            maxHeight: 'min(38vh, 340px)',
            paddingBottom: 4,
          }}
        >
          {cast.length > 0 ? (
            cast.map((actor, idx) => {
              const focused = focusArea === 'cast' && focusedCastIdx === idx;
              return (
                <div
                  key={actor.id}
                  id={`cast-actor-${idx}`}
                  className="flex flex-col items-center text-center min-w-0"
                  role="listitem"
                  aria-label={`${actor.name}${actor.character ? ` como ${actor.character}` : ''}`}
                  style={{
                    transform: focused ? 'scale(1.06)' : 'scale(1)',
                    opacity: focusArea === 'cast' ? (focused ? 1 : 0.55) : 0.55,
                    transition: 'all 220ms',
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: focused
                        ? '2px solid rgba(167,117,255,0.85)'
                        : `1px solid ${G.border}`,
                      boxShadow: focused ? '0 0 16px rgba(124,58,237,0.45)' : undefined,
                    }}
                  >
                    <img
                      src={actor.profile_path ? getImageUrl(actor.profile_path, 'w200') : '/x.png'}
                      alt={actor.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  </div>
                  <div className="w-full min-w-0 mt-2.5 px-0.5">
                    <p
                      style={{
                        fontSize: 8,
                        fontWeight: 900,
                        color: G.textPrimary,
                        textTransform: 'uppercase',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.25,
                      }}
                    >
                      {actor.name}
                    </p>
                    <p
                      style={{
                        fontSize: 7,
                        fontWeight: 600,
                        color: G.textSec,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 3,
                        lineHeight: 1.2,
                      }}
                    >
                      {actor.character}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div
              className="col-span-full"
              role="status"
              aria-live="polite"
              style={{
                padding: 32,
                opacity: 0.25,
                fontWeight: 900,
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                textAlign: 'center',
                width: '100%',
              }}
            >
              Buscando elenco...
            </div>
          )}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default PlayerCastPanel;
