import React, { memo, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  expanded?: boolean;
  focused?: boolean;
  onClick?: () => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = memo(
  ({ icon, label, active, expanded, focused, onClick, buttonRef }) => {
    const internalRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
      if (focused) internalRef.current?.focus();
    }, [focused]);

    return (
      <button
        ref={(el) => {
          internalRef.current = el;
          buttonRef?.(el);
        }}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onClick?.();
          }
        }}
        tabIndex={0}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl mx-1.5 transition-all duration-200 group relative outline-none border
      ${
        active
          ? 'text-white border-[#a78bfa]/70 bg-[linear-gradient(90deg,rgba(139,92,246,0.3)_0%,rgba(139,92,246,0.1)_100%)] shadow-[inset_0_0_12px_rgba(139,92,246,0.24),0_0_0_1px_rgba(167,139,250,0.38)]'
          : focused
            ? 'text-white/90 border-white/20 bg-white/[0.08] ring-1 ring-white/15'
            : 'text-white/75 border-transparent hover:text-white hover:bg-white/8 hover:border-white/20'
      }`}
      >
        <div
          className={`shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${active ? 'text-white' : 'text-white/75'}`}
        >
          {icon}
        </div>
        <span
          className={`text-[10px] font-black uppercase tracking-[0.14em] transition-all duration-300 whitespace-nowrap
      ${expanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}
        >
          {label}
        </span>
      </button>
    );
  }
);

interface SidebarProps {
  activeCategories: Array<{ id: string; name: string; icon: React.ReactNode }>;
  activeCategoryId: string;
  isSidebarExpanded: boolean;
  focusArea: 'sidebar' | 'channels' | 'header' | 'epg';
  focusedCategoryIndex: number; // -1 = Voltar, 0..N = categorias
  setIsSidebarExpanded: (v: boolean) => void;
  onSearch?: () => void;
  onSelectCategory: (id: string, idx: number) => void;
  onBack: () => void;
  sidebarRefs: React.MutableRefObject<HTMLButtonElement[]>;
  backButtonRef: React.RefObject<HTMLButtonElement>;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeCategories,
  activeCategoryId,
  isSidebarExpanded,
  focusArea,
  focusedCategoryIndex,
  setIsSidebarExpanded,
  onSearch: _onSearch,
  onSelectCategory,
  onBack,
  sidebarRefs,
  backButtonRef,
}) => {
  const isBackFocused = focusArea === 'sidebar' && focusedCategoryIndex === -1;
  useEffect(() => {
    if (isBackFocused) backButtonRef.current?.focus();
  }, [isBackFocused, backButtonRef]);

  return (
    <aside
      className={`h-[calc(100%-24px)] mt-3 mb-3 ml-3 mr-2 rounded-4xl border border-white/20 flex flex-col py-5 transition-all duration-300 ease-out shadow-[0_4px_30px_rgba(0,0,0,0.22)]
      ${isSidebarExpanded ? 'w-62' : 'w-19.5'}`}
      style={{
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
      onMouseEnter={() => setIsSidebarExpanded(true)}
      onMouseLeave={() => {
        if (focusArea !== 'sidebar') setIsSidebarExpanded(false);
      }}
    >
      <div
        className={`flex items-center px-4 mb-4 gap-2 ${!isSidebarExpanded && 'justify-center'}`}
      >
        <button
          ref={backButtonRef}
          onClick={onBack}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onBack();
            }
          }}
          tabIndex={0}
          className={`p-2 rounded-xl transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/60 ${
            isBackFocused
              ? 'bg-[linear-gradient(90deg,rgba(139,92,246,0.3)_0%,rgba(139,92,246,0.1)_100%)] border-[#a78bfa]'
              : 'bg-white/10 border-white/15 hover:bg-white/20'
          }`}
          title="Voltar"
        >
          <ChevronRight size={16} className="text-white rotate-180" />
        </button>
        {isSidebarExpanded && (
          <img
            src="/logored.png"
            alt="Redflix"
            className="h-6 w-auto object-contain drop-shadow-md"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-1 px-1">
        {activeCategories.map((cat, idx) => (
          <SidebarItem
            key={cat.id}
            icon={cat.icon}
            label={cat.name}
            active={activeCategoryId === cat.id}
            focused={focusArea === 'sidebar' && focusedCategoryIndex === idx}
            expanded={isSidebarExpanded}
            onClick={() => onSelectCategory(cat.id, idx)}
            buttonRef={(el) => {
              sidebarRefs.current[idx] = el as HTMLButtonElement;
            }}
          />
        ))}
      </div>
    </aside>
  );
};

export default memo(Sidebar);
