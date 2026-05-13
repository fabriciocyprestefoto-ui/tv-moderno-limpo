import React, { useState, useRef, useEffect, useCallback } from 'react';
import { setSignal } from '../utils/appSignals';
import { motion } from 'framer-motion';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

import { Page, UserProfile } from '../types';
import { Search } from 'lucide-react';
import { playSelectSound, playNavigateSound } from '../utils/soundEffects';
import type { User } from '@supabase/supabase-js';

interface ProfileMenuItem {
  id: string;
  label: string;
  tab?: string;
  subView?: string;
}

const PROFILE_MENU_ITEMS: ProfileMenuItem[] = [
  { id: 'switch-profile', label: 'Trocar Perfil', tab: 'switch-profile' },
  { id: 'overview', label: 'Visão geral', tab: 'overview' },
  { id: 'subscription', label: 'Assinatura', tab: 'subscription' },
  { id: 'security', label: 'Segurança', tab: 'security' },
  { id: 'devices', label: 'Aparelhos', tab: 'devices' },
  { id: 'profiles', label: 'Perfis', tab: 'profiles' },
  { id: 'change-password', label: 'Alterar Senha', tab: 'security', subView: 'change-password' },
  { id: 'passkeys', label: 'Gerenciar Chaves de Acesso', tab: 'security', subView: 'passkeys' },
  {
    id: 'sign-out-all',
    label: 'Encerrar sessão em todos os aparelhos',
    tab: 'security',
    subView: 'sign-out-all',
  },
];

interface NavigationProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  profile: UserProfile | null;
  user?: User | null;
  onProfileClick: () => void;
  onProfileMenuSelect?: (tab: string, subView?: string) => void;
}

/** Avatar: perfil (Supabase user_profiles) → auth (Google/OAuth) → fallback */
function getAvatarUrl(profile: UserProfile | null, user: User | null | undefined): string {
  if (profile?.avatar) return profile.avatar;
  const meta = user?.user_metadata as Record<string, string> | undefined;
  if (meta?.avatar_url) return meta.avatar_url;
  if (meta?.picture) return meta.picture;
  return '/logored.png';
}

const Navigation: React.FC<NavigationProps> = React.memo(
  ({ currentPage, onNavigate, profile, user, onProfileClick, onProfileMenuSelect }) => {
    const [showSubmenu, setShowSubmenu] = useState(false);
    const [focusedSubmenuIdx, setFocusedSubmenuIdx] = useState(0);
    const [focusedNavCol, setFocusedNavCol] = useState<number | null>(null);
    const submenuRef = useRef<HTMLDivElement>(null);
    const profileBtnRef = useRef<HTMLButtonElement>(null);

    // MEM-03: stable ref pattern — avoid re-adding listeners on every focusedSubmenuIdx change
    const focusedSubmenuIdxRef = useRef(focusedSubmenuIdx);
    useEffect(() => {
      focusedSubmenuIdxRef.current = focusedSubmenuIdx;
    }, [focusedSubmenuIdx]);
    const onProfileMenuSelectRef = useRef(onProfileMenuSelect);
    useEffect(() => {
      onProfileMenuSelectRef.current = onProfileMenuSelect;
    }, [onProfileMenuSelect]);

    // Fechar submenu ao clicar fora ou pressionar Escape
    useEffect(() => {
      if (!showSubmenu) return;
      setSignal('modalKeyTrap', true);
      window.__profileMenuOpen = true;
      const handleClick = (e: MouseEvent) => {
        const el = e.target as Node;
        if (submenuRef.current?.contains(el) || profileBtnRef.current?.contains(el)) return;
        setShowSubmenu(false);
      };
      const handleKey = (e: KeyboardEvent) => {
        const key = normalizeRemoteKey(e);
        if (key === 'Escape' || key === 'Backspace') {
          e.preventDefault();
          setShowSubmenu(false);
        }
        // D-pad navigation no submenu
        if (key === 'ArrowDown') {
          e.preventDefault();
          playNavigateSound();
          setFocusedSubmenuIdx((prev) => Math.min(PROFILE_MENU_ITEMS.length - 1, prev + 1));
        }
        if (key === 'ArrowUp') {
          e.preventDefault();
          playNavigateSound();
          setFocusedSubmenuIdx((prev) => Math.max(0, prev - 1));
        }
        if (key === 'Enter' || key === ' ') {
          e.preventDefault();
          playSelectSound();
          const item = PROFILE_MENU_ITEMS[focusedSubmenuIdxRef.current];
          if (item && onProfileMenuSelectRef.current) {
            setShowSubmenu(false);
            onProfileMenuSelectRef.current(item.tab || 'overview', item.subView);
          }
        }
      };
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey, { capture: true });
      return () => {
        window.__profileMenuOpen = false;
        setSignal('modalKeyTrap', false);
        document.removeEventListener('mousedown', handleClick);
        document.removeEventListener('keydown', handleKey, { capture: true });
      };
    }, [showSubmenu]);

    // Focus submenu item when focusedSubmenuIdx changes
    useEffect(() => {
      if (!showSubmenu) return;
      const items = submenuRef.current?.querySelectorAll('[data-submenu-item]');
      if (items && items[focusedSubmenuIdx]) {
        (items[focusedSubmenuIdx] as HTMLElement).focus();
      }
    }, [showSubmenu, focusedSubmenuIdx]);
    const navItems = [
      { id: Page.HOME, label: 'Início' },
      { id: Page.GENRES, label: 'Gêneros' },
      { id: Page.MOVIES, label: 'Filmes' },
      { id: Page.SERIES, label: 'Séries' },
      { id: Page.KIDS, label: 'Kids' },
      { id: Page.LIVE, label: 'Canais' },

      { id: Page.FUTEBOL, label: 'Futebol' },
      { id: Page.MY_LIST, label: 'Lista' },
    ];

    const maxNavCol = navItems.length + 1; // Search + Profile
    const focusNavCol = useCallback(
      (col: number) => {
        const clamped = Math.max(0, Math.min(col, maxNavCol));
        const el = document.querySelector(`[data-nav-row="0"] [data-nav-col="${clamped}"]`);
        if (el instanceof HTMLElement) {
          el.focus();
          setFocusedNavCol(clamped);
        }
      },
      [maxNavCol]
    );

    return (
      <nav
        className="flex items-center justify-between w-full"
        data-nav-row={0}
        aria-label="Navegação principal"
      >
        {/* Esquerda: Logo + Links */}
        <div className="flex items-center gap-4">
          {/* Logo REDX */}
          <img
            src="/logored.png"
            alt="Redflix — Ir para o início"
            role="button"
            tabIndex={0}
            className="h-6 w-auto object-contain drop-shadow-md cursor-pointer hover:scale-105 transition-transform"
            onClick={() => onNavigate(Page.HOME)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate(Page.HOME);
              }
            }}
          />

          {/* Menu Links */}
          <div className="flex items-center gap-6">
            {navItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => {
                  playSelectSound();
                  onNavigate(item.id);
                }}
                aria-label={item.label}
                aria-current={currentPage === item.id ? 'page' : undefined}
                className={`nav-menu-item relative text-[15px] font-medium transition-colors duration-200 outline-none px-4 py-2 rounded-2xl
                ${
                  currentPage === item.id
                    ? 'text-white font-bold'
                    : focusedNavCol === idx
                      ? 'text-white font-semibold'
                      : 'text-gray-300 hover:text-white focus:text-white'
                }`}
                tabIndex={0}
                data-nav-item
                data-nav-col={idx}
                onFocus={() => setFocusedNavCol(idx)}
                onMouseEnter={() => setFocusedNavCol(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    playSelectSound();
                    onNavigate(item.id);
                    return;
                  }
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = idx + 1;
                    playNavigateSound();
                    focusNavCol(next > maxNavCol ? 0 : next);
                  }
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prev = idx - 1;
                    if (prev >= 0) {
                      playNavigateSound();
                      focusNavCol(prev);
                    }
                  }
                }}
              >
                {/* Pill animado para item ativo */}
                {currentPage === item.id && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: 'rgba(109,40,217,0.42)',
                      border: '1px solid rgba(196,164,255,0.6)',
                      boxShadow:
                        '0 0 0 1px rgba(196,164,255,0.32), 0 10px 24px rgba(76,29,149,0.45)',
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                {/* Pill de hover/foco */}
                {currentPage !== item.id && focusedNavCol === idx && (
                  <span
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: 'rgba(109,40,217,0.22)',
                      border: '1px solid rgba(196,164,255,0.35)',
                    }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Direita: Busca + Perfil */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => {
              playSelectSound();
              onNavigate(Page.SEARCH);
            }}
            className={`transition-all outline-none rounded-xl p-1.5 border
            ${
              focusedNavCol === navItems.length
                ? 'text-white bg-[rgba(109,40,217,0.3)] border-[rgba(196,164,255,0.55)] shadow-[0_0_0_1px_rgba(196,164,255,0.24),0_8px_20px_rgba(76,29,149,0.35)]'
                : 'text-gray-300 hover:text-white border-transparent'
            }`}
            aria-label="Buscar"
            tabIndex={0}
            data-nav-item
            data-nav-col={navItems.length}
            onFocus={() => setFocusedNavCol(navItems.length)}
            onMouseEnter={() => setFocusedNavCol(navItems.length)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                playSelectSound();
                onNavigate(Page.SEARCH);
                return;
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                playNavigateSound();
                focusNavCol(navItems.length - 1);
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                playNavigateSound();
                focusNavCol(navItems.length + 1);
              }
            }}
          >
            <Search size={20} />
          </button>

          <div className="relative">
            <button
              ref={profileBtnRef}
              onClick={() => {
                playSelectSound();
                if (onProfileMenuSelect) {
                  setShowSubmenu((prev) => !prev);
                  setFocusedSubmenuIdx(0);
                } else {
                  onProfileClick();
                }
              }}
              aria-label={`Perfil de ${profile?.name || user?.user_metadata?.name || 'usuário'}`}
              aria-haspopup={onProfileMenuSelect ? 'menu' : undefined}
              aria-expanded={onProfileMenuSelect ? showSubmenu : undefined}
              className={`w-8 h-8 rounded-full overflow-hidden border transition-all focus:outline-none
              ${
                focusedNavCol === navItems.length + 1
                  ? 'border-[rgba(196,164,255,0.65)] shadow-[0_0_0_1px_rgba(196,164,255,0.25),0_8px_18px_rgba(76,29,149,0.45)]'
                  : 'border-transparent hover:border-white'
              }`}
              tabIndex={0}
              data-nav-item
              data-nav-col={navItems.length + 1}
              onFocus={() => setFocusedNavCol(navItems.length + 1)}
              onMouseEnter={() => setFocusedNavCol(navItems.length + 1)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.currentTarget as HTMLButtonElement).click();
                  return;
                }
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  playNavigateSound();
                  focusNavCol(navItems.length);
                }
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  playNavigateSound();
                  focusNavCol(0);
                }
              }}
            >
              <img
                src={getAvatarUrl(profile, user)}
                alt={profile?.name || user?.user_metadata?.name || 'Perfil'}
                className="w-full h-full object-cover object-[center_15%]"
              />
            </button>

            {/* Submenu glass — estilo referência (dropdown Prime) */}
            {showSubmenu && onProfileMenuSelect && (
              <div
                ref={submenuRef}
                role="menu"
                aria-label="Menu de perfil"
                className="absolute right-0 top-full mt-2 sm:mt-3 w-70 sm:w-[320px] lg:w-90 max-w-[88vw] rounded-2xl sm:rounded-3xl border border-[rgba(196,164,255,0.28)] bg-[linear-gradient(145deg,rgba(18,16,36,0.9),rgba(12,10,24,0.86))] shadow-[0_18px_44px_rgba(8,4,18,0.62)] backdrop-blur-xl z-100 overflow-hidden"
              >
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/10">
                  <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.26em] text-white/40">
                    Conta
                  </p>
                  <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-white truncate">
                    {profile?.name || 'Perfil'}
                  </p>
                </div>

                <div
                  className="max-h-[60vh] overflow-y-auto px-1 sm:px-1.5 py-1 sm:py-1.5"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {PROFILE_MENU_ITEMS.map((item, idx) => (
                    <React.Fragment key={item.id}>
                      {idx === 1 && <div className="my-1 sm:my-1.5 border-t border-white/10" />}
                      <button
                        data-submenu-item
                        role="menuitem"
                        tabIndex={0}
                        onClick={() => {
                          playSelectSound();
                          setShowSubmenu(false);
                          onProfileMenuSelect(item.tab || 'overview', item.subView);
                        }}
                        onFocus={() => setFocusedSubmenuIdx(idx)}
                        onMouseEnter={() => setFocusedSubmenuIdx(idx)}
                        className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[12px] sm:text-[13px] font-semibold rounded-lg sm:rounded-xl transition-colors outline-none border border-transparent
                        ${
                          item.id === 'switch-profile'
                            ? focusedSubmenuIdx === idx
                              ? 'text-[#c084fc] bg-[rgba(109,40,217,0.42)] border-[rgba(196,164,255,0.6)] shadow-[0_0_0_1px_rgba(196,164,255,0.32)]'
                              : 'text-[#c084fc] hover:bg-[rgba(109,40,217,0.2)] hover:text-[#d8b4fe]'
                            : focusedSubmenuIdx === idx
                              ? 'text-white bg-[rgba(109,40,217,0.42)] border-[rgba(196,164,255,0.6)] shadow-[0_0_0_1px_rgba(196,164,255,0.32),0_10px_24px_rgba(76,29,149,0.35)]'
                              : 'text-white/90 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    );
  }
);

Navigation.displayName = 'Navigation';
export default Navigation;
