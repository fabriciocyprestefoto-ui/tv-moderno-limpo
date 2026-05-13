import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Baby,
  BookOpen,
  Circle,
  Clapperboard,
  Film,
  Flame,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  MapPin,
  Music,
  Newspaper,
  Radio,
  ShoppingCart,
  Sparkles,
  Star,
  Trophy,
  Tv,
} from 'lucide-react';
import type { PitoCategory } from './types';

const ICONS: Record<string, React.FC<{ className?: string }>> = {
  Tv,
  Film,
  Sparkles,
  Radio,
  Gamepad2,
  Baby,
  Circle,
  Globe,
  Newspaper,
  Trophy,
  Clapperboard,
  BookOpen,
  Heart,
  Music,
  Flame,
  GraduationCap,
  ShoppingCart,
  MapPin,
  Star,
};

interface LiveTvSidebarProps {
  categories: PitoCategory[];
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  focusedIndex: number;
  isFocused: boolean;
}

export function LiveTvSidebar({
  categories,
  activeCategory,
  onSelectCategory,
  focusedIndex,
  isFocused,
}: LiveTvSidebarProps) {
  const navigate = useNavigate();
  const focusedItemRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (isFocused && focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused, focusedIndex]);

  return (
    <div className="relative z-30 flex w-[230px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-stream-sidebar via-stream-surface/98 to-black/90 px-3 py-[clamp(8px,2vh,20px)]">
      <nav className="flex min-h-0 flex-1 flex-col gap-[clamp(3px,0.7vh,8px)] overflow-y-auto pito-no-scrollbar">
        <button
          type="button"
          tabIndex={0}
          aria-label="Voltar para o início"
          ref={focusedIndex === -1 ? focusedItemRef : null}
          onClick={() => navigate('/')}
          className={`flex w-full min-h-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
            focusedIndex === -1 && isFocused
              ? 'bg-white/15 ring-2 ring-white/40'
              : 'hover:bg-white/10'
          }`}
        >
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-white/10">
            <ArrowLeft
              className={`h-4 w-4 ${focusedIndex === -1 && isFocused ? 'text-white' : 'text-stream-muted/70'}`}
            />
          </div>
          <span
            className={`truncate text-[11px] font-bold uppercase tracking-[0.06em] ${
              focusedIndex === -1 && isFocused ? 'text-white' : 'text-stream-muted/85'
            }`}
          >
            VOLTAR
          </span>
        </button>

        {categories.map((cat, idx) => {
          const IconComponent = ICONS[cat.icon] ?? Circle;
          const isActive = activeCategory === cat.id;
          const isItemFocused = isFocused && focusedIndex === idx;

          return (
            <button
              key={cat.id}
              type="button"
              tabIndex={0}
              aria-label={cat.name}
              aria-current={isActive ? 'true' : undefined}
              ref={isItemFocused ? focusedItemRef : null}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex min-h-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                isActive ? 'bg-white/12' : 'hover:bg-white/10'
              } ${isItemFocused ? 'ring-2 ring-white/40' : ''}`}
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-white/10">
                <IconComponent className={`h-4 w-4 ${isActive ? 'text-white' : 'text-stream-muted/65'}`} />
              </div>
              <span
                className={`min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.05em] ${
                  isActive ? 'text-white' : 'text-stream-muted/88'
                }`}
              >
                {cat.name}
              </span>
              <span
                className={`flex-shrink-0 tabular-nums text-[10px] font-semibold ${
                  isActive ? 'text-white/80' : 'text-stream-muted/50'
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
