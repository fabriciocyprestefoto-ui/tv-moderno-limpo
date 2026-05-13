import React, { useEffect, useRef, useState } from 'react';
import { Media } from '../types';
import { Play, Info, Plus, Check, X } from 'lucide-react';
import { getMediaPoster, getMediaDuration } from '@/utils/mediaUtils';
import { playNavigateSound, playSelectSound } from '@/utils/soundEffects';
import { userService } from '@/services/userService';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';

/* ============================================================
   ACTION MODAL – TV Card Action Overlay
   - Opens on Enter from a focused card
   - Horizontal D-Pad navigation between buttons
   - Captures key events while open (no leak to spatial nav)
   - Close on Back/Escape → restores focus to original card
   ============================================================ */

interface ActionModalProps {
  media: Media;
  isOpen: boolean;
  onClose: () => void;
  onSelect: () => void; // Navigate to details page
  onPlay?: () => void; // Navigate directly to player
  onToggleList?: () => void; // Toggle Minha Lista
}

const ActionModal: React.FC<ActionModalProps> = ({
  media,
  isOpen,
  onClose,
  onSelect,
  onPlay,
  onToggleList,
}) => {
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [isInList, setIsInList] = useState(false);
  const focusedIdxRef = useRef(0);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    focusedIdxRef.current = focusedIdx;
    if (isOpen && buttonsRef.current[focusedIdx]) {
      buttonsRef.current[focusedIdx]?.focus();
    }
  }, [focusedIdx, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    window.__modalTrapDepth = (window.__modalTrapDepth || 0) + 1;
    setFocusedIdx(0);

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const key = normalizeRemoteKey(e);

      switch (key) {
        case 'ArrowLeft':
          playNavigateSound();
          setFocusedIdx((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          playNavigateSound();
          setFocusedIdx((prev) => Math.min(2, prev + 1));
          break;
        case 'Enter': {
          playSelectSound();
          const idx = focusedIdxRef.current;
          if (idx === 0) {
            // Assistir - vai direto para Player se onPlay existir
            if (onPlay) onPlay();
            else onSelect();
          } else if (idx === 1) {
            // Detalhes
            onSelect();
          }
          if (idx === 2) {
            // Toggle Minha Lista
            setIsInList((prev) => !prev);
            try {
              const tmdbId = media.tmdb_id || Number(media.id);
              if (tmdbId) {
                userService.toggleLibraryItem(tmdbId, media.type, 'watchlist').catch(() => {});
              }
            } catch {}
            if (onToggleList) onToggleList();
          }
          break;
        }
        case 'Escape':
        case 'Backspace':
          onClose();
          break;
        // Block Up/Down so spatial nav doesn't move
        case 'ArrowUp':
        case 'ArrowDown':
          break;
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.__modalTrapDepth = Math.max(0, (window.__modalTrapDepth || 1) - 1);
      window.removeEventListener('keydown', handler, { capture: true });
    };
  }, [isOpen, onClose, onSelect, onPlay, onToggleList, media]);

  if (!isOpen) return null;

  const poster = getMediaPoster(media);
  const duration = getMediaDuration(media);

  const actions = [
    { label: 'Assistir', Icon: Play },
    { label: 'Detalhes', Icon: Info },
    { label: isInList ? 'Na Lista' : 'Minha Lista', Icon: isInList ? Check : Plus },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="relative glass p-8 rounded-[2rem] border border-white/20 w-full max-w-lg shadow-[0_0_80px_rgba(0,0,0,0.9)]">
        {/* Close button */}
        <button
          onClick={onClose}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onClose();
            }
          }}
          aria-label="Fechar"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Media info */}
        <div className="flex gap-4 mb-6">
          <img
            src={poster}
            alt={media.title}
            className="w-20 h-28 rounded-xl object-cover border border-white/10"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-black mb-1 truncate">{media.title}</h3>
            <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
              <span className="px-1.5 py-0.5 rounded border border-white/20 bg-black/40">
                {media.rating || 'N/A'}
              </span>
              <span>{media.year || ''}</span>
              <span>{duration}</span>
            </div>
            <p className="text-xs text-white/40 line-clamp-2">{media.description}</p>
          </div>
        </div>

        {/* Action buttons – D-Pad navigable */}
        <div className="flex gap-3">
          {actions.map((action, idx) => (
            <button
              key={action.label}
              ref={(el) => {
                buttonsRef.current[idx] = el;
              }}
              onClick={() => {
                if (idx === 0 && onPlay) onPlay();
                else if (idx === 0 || idx === 1) onSelect();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all duration-200 outline-none ${
                focusedIdx === idx
                  ? 'bg-[#A855F7] text-white scale-105 shadow-[0_0_20px_rgba(168,85,247,0.5)]'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
              tabIndex={isOpen ? 0 : -1}
            >
              <action.Icon className="w-4 h-4" />
              {action.label}
            </button>
          ))}
        </div>

        {/* Hint */}
        <p className="text-center text-[9px] text-white/20 mt-4 font-bold uppercase tracking-[0.3em]">
          ← → para navegar · ENTER para selecionar · VOLTAR para fechar
        </p>
      </div>
    </div>
  );
};

export default React.memo(ActionModal);
