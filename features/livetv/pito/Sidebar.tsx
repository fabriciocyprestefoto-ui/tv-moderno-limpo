import React from 'react';
import { motion } from 'framer-motion';
import { Tv, Film, Sparkles, Radio, Gamepad2, Baby, ArrowLeft, Circle } from 'lucide-react';
import { PitoCategory } from './types';

interface SidebarProps {
  categories: PitoCategory[];
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  focusedIndex?: number;
  isFocused?: boolean;
}

export const PitoSidebar: React.FC<SidebarProps> = ({
  categories,
  activeCategory,
  onSelectCategory,
  isExpanded,
  onToggleExpand,
  focusedIndex,
  isFocused,
}) => {
  void onToggleExpand;
  const focusedItemRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (isFocused && focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused, focusedIndex]);

  return (
    <motion.div
      animate={{ width: isExpanded ? 230 : 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      className="self-stretch livetv-sidebar-purple flex flex-col py-[clamp(8px,2vh,20px)] px-3 overflow-hidden relative z-30"
    >
      <nav className="flex h-full min-h-0 flex-col gap-[clamp(3px,0.7vh,8px)] overflow-hidden">
        {/* Botão Voltar */}
        <button
          type="button"
          tabIndex={0}
          data-nav-item
          aria-label="Voltar para o início"
          ref={focusedIndex === -1 ? focusedItemRef : null}
          onClick={() => (window.location.href = '/')}
          className={`livetv-sidebar-row flex flex-1 min-h-0 items-center gap-2 px-3 py-2 text-left w-full ${
            focusedIndex === -1 && isFocused
              ? 'livetv-sidebar-row--active livetv-sidebar-row--focus'
              : ''
          }`}
        >
          <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center bg-white/10">
            <ArrowLeft
              className={`w-4 h-4 ${focusedIndex === -1 && isFocused ? 'text-white' : 'text-purple-200/70'}`}
            />
          </div>
          <span
            className={`text-[11px] font-bold uppercase tracking-[0.06em] truncate ${focusedIndex === -1 && isFocused ? 'text-white' : 'text-purple-100/80'}`}
          >
            VOLTAR
          </span>
        </button>

        {/* Categorias */}
        {categories.map((cat, idx) => {
          const IconComponent =
            (cat.icon &&
              {
                Tv,
                Film,
                Sparkles,
                Radio,
                Gamepad2,
                Baby,
                Circle,
              }[cat.icon]) ||
            Circle;
          const isActive = activeCategory === cat.id;
          const isItemFocused = isFocused && focusedIndex === idx;

          return (
            <button
              key={cat.id}
              type="button"
              tabIndex={0}
              data-nav-item
              aria-label={cat.name}
              aria-current={isActive ? 'true' : undefined}
              ref={isItemFocused ? focusedItemRef : null}
              onClick={() => onSelectCategory(cat.id)}
              className={`livetv-sidebar-row flex flex-1 min-h-0 items-center gap-2 px-3 py-2 text-left ${
                isActive ? 'livetv-sidebar-row--active' : ''
              } ${isItemFocused ? 'livetv-sidebar-row--focus' : ''}`}
            >
              <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center bg-white/10">
                <IconComponent
                  className={`w-4 h-4 ${isActive ? 'text-white' : 'text-purple-200/60'}`}
                />
              </div>
              <span
                className={`text-[11px] font-bold uppercase tracking-[0.05em] truncate flex-1 min-w-0 ${isActive ? 'text-white' : 'text-purple-100/85'}`}
              >
                {cat.name}
              </span>
              <span
                className={`text-[10px] font-semibold flex-shrink-0 tabular-nums ${isActive ? 'text-white/80' : 'text-purple-300/50'}`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </nav>
    </motion.div>
  );
};
