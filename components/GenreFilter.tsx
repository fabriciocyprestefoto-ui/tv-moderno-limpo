import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { playSelectSound } from '../utils/soundEffects';
import { useSpatialNav } from '../hooks/useSpatialNavigation';

interface GenreFilterProps {
  genres: string[];
  selectedGenre: string | null;
  onSelectGenre: (genre: string | null) => void;
  label?: string;
  onOpenChange?: (open: boolean) => void;
}

const GenreFilter: React.FC<GenreFilterProps> = ({
  genres,
  selectedGenre,
  onSelectGenre,
  label = 'Gêneros',
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { setEnabled } = useSpatialNav();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleOpen = useCallback(
    (next: boolean) => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      setIsOpen(next);
      onOpenChange?.(next);
      // Disable global spatial nav while dropdown is open so arrow keys navigate within the list
      setEnabled(!next);
      // Block GlobalRemoteHandler (capture phase) while dropdown is open
      window.__modalTrapDepth = next
        ? (window.__modalTrapDepth || 0) + 1
        : Math.max(0, (window.__modalTrapDepth || 1) - 1);
      if (next) {
        // Auto-focus first item after render
        focusTimerRef.current = setTimeout(() => {
          const firstItem = containerRef.current?.querySelector<HTMLElement>('[data-genre-item]');
          firstItem?.focus();
        }, 50);
      } else {
        // Return focus to trigger
        focusTimerRef.current = setTimeout(() => triggerRef.current?.focus(), 10);
      }
    },
    [onOpenChange, setEnabled]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        toggleOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [toggleOpen]);

  // Clean up: re-enable spatial nav, release key trap, cancel pending focus on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      setEnabled(true);
      window.__modalTrapDepth = Math.max(0, (window.__modalTrapDepth || 1) - 1);
    };
  }, [setEnabled]);

  const handleSelect = useCallback(
    (genre: string | null) => {
      playSelectSound();
      onSelectGenre(genre);
      toggleOpen(false);
    },
    [onSelectGenre, toggleOpen]
  );

  // Arrow key navigation within dropdown (spatial nav is disabled while open)
  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const key = e.key;
      if (key === 'Escape' || key === 'Backspace' || key === 'Back') {
        e.preventDefault();
        e.stopPropagation();
        toggleOpen(false);
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;
      e.preventDefault();
      e.stopPropagation();

      const COLS = 3; // grid-cols-3
      const items = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>('[data-genre-item]') || []
      );
      if (items.length === 0) return;
      const currentIdx = items.indexOf(document.activeElement as HTMLElement);
      let nextIdx = currentIdx;
      if (key === 'ArrowRight') {
        nextIdx = (currentIdx + 1) % items.length;
      } else if (key === 'ArrowLeft') {
        nextIdx = (currentIdx - 1 + items.length) % items.length;
      } else if (key === 'ArrowDown') {
        nextIdx = currentIdx + COLS < items.length ? currentIdx + COLS : currentIdx;
      } else if (key === 'ArrowUp') {
        nextIdx = currentIdx - COLS >= 0 ? currentIdx - COLS : currentIdx;
      }
      items[nextIdx]?.focus();
    },
    [toggleOpen]
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-nav-item
        data-nav-col={0}
        tabIndex={0}
        onClick={() => {
          playSelectSound();
          toggleOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            playSelectSound();
            toggleOpen(!isOpen);
          }
        }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-[rgba(168,85,247,0.35)] text-white font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#a855f7]/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
      >
        <span>{label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-2 min-w-[320px] max-w-[420px] rounded-xl backdrop-blur-2xl bg-black/30 border border-[rgba(168,85,247,0.4)] shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(168,85,247,0.2),0_0_40px_rgba(168,85,247,0.1)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          onKeyDown={handleDropdownKeyDown}
        >
          <div className="p-4 max-h-[320px] overflow-y-auto">
            <div className="grid grid-cols-3 gap-x-6 gap-y-2">
              <button
                type="button"
                data-genre-item
                tabIndex={0}
                onClick={() => handleSelect(null)}
                data-nav-item
                data-nav-row={0}
                data-nav-col={0}
                className={`text-left py-2 px-2 text-sm font-medium transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 ${
                  !selectedGenre
                    ? 'text-[#c084fc] bg-[rgba(168,85,247,0.2)] border border-[rgba(168,85,247,0.4)]'
                    : 'text-white hover:text-[#d8b4fe] hover:bg-white/5'
                }`}
              >
                Todos
              </button>
              {genres.map((g, idx) => (
                <button
                  key={g}
                  type="button"
                  data-genre-item
                  tabIndex={0}
                  onClick={() => handleSelect(g)}
                  data-nav-item
                  data-nav-row={0}
                  data-nav-col={idx + 1}
                  className={`text-left py-2 px-2 text-sm font-medium transition-colors rounded-lg truncate focus:outline-none focus:ring-2 focus:ring-white/50 ${
                    selectedGenre === g
                      ? 'text-[#c084fc] bg-[rgba(168,85,247,0.2)] border border-[rgba(168,85,247,0.4)]'
                      : 'text-white hover:text-[#d8b4fe] hover:bg-white/5'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(GenreFilter);
