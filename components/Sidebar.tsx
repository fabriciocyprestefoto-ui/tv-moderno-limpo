import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Home,
  Film,
  Tv,
  Star,
  Radio,
  Trophy,
  List,
  Search,
  Settings,
  LayoutGrid,
  Lock,
} from 'lucide-react';
import { Page, UserProfile } from '../types';
import { playSelectSound, playNavigateSound } from '../utils/soundEffects';
import type { User } from '@supabase/supabase-js';
import { useLocation } from 'react-router-dom';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';
import { runtimeFlags } from '../config/runtimeFlags';

const PAGE_TO_PATH: Record<string, string> = {
  HOME: '/',
  GENRES: '/generos',
  MOVIES: '/filmes',
  SERIES: '/series',
  KIDS: '/kids',
  LIVE: '/canais',
  FUTEBOL: '/futebol',
  MY_LIST: '/lista',
  SEARCH: '/busca',
  SETTINGS: '/settings',
  ADULTO: '/adulto',
};

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  activeProfile: UserProfile | null;
  user?: User | null;
  onProfileClick?: () => void;
  onProfileMenuSelect?: (tab: string, subView?: string) => void;
}

const NAV_ITEMS = [
  { icon: Home, page: Page.HOME, label: 'Início' },
  { icon: LayoutGrid, page: Page.GENRES, label: 'Gêneros' },
  { icon: Tv, page: Page.SERIES, label: 'Séries' },
  { icon: Film, page: Page.MOVIES, label: 'Filmes' },
  { icon: Star, page: Page.KIDS, label: 'Kids' },
  { icon: Radio, page: Page.LIVE, label: 'Canais' },
  { icon: Trophy, page: Page.FUTEBOL, label: 'Futebol' },
  { icon: List, page: Page.MY_LIST, label: 'Minha lista' },
  { icon: Search, page: Page.SEARCH, label: 'Pesquisar' },
];

const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  activeProfile: _activeProfile,
  user: _user,
  onProfileClick: _onProfileClick,
  onProfileMenuSelect: _onProfileMenuSelect,
}) => {
  // O sidebar expande inteiro quando qualquer item recebe foco
  const [expanded, setExpanded] = useState(false);
  // Item destacado ao navegar com setas — segue o foco sem navegar (igual ao menu de canais)
  const [focusedPage, setFocusedPage] = useState<Page | null>(null);
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp do momento em que o sidebar recebeu foco — evita fechar com ArrowLeft
  // quando a tecla está em repeat (o mesmo ArrowLeft que abriu o menu ainda está sendo lido)
  const focusEnteredAtRef = useRef<number>(0);
  // Guard: sidebar só expande após primeira interação real do usuário (keydown ou click)
  // Evita que auto-focus do browser/focusToFirstRow no mount expanda o sidebar
  const hasUserInteractedRef = useRef(false);
  useEffect(() => {
    const mark = () => { hasUserInteractedRef.current = true; };
    window.addEventListener('keydown', mark, { once: true });
    window.addEventListener('pointerdown', mark, { once: true });
    return () => {
      window.removeEventListener('keydown', mark);
      window.removeEventListener('pointerdown', mark);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('redx-sidebar-expanded', { detail: { expanded } }));
  }, [expanded]);

  const handleFocus = () => {
    if (!hasUserInteractedRef.current) return;
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    focusEnteredAtRef.current = Date.now();
    window.__sidebarFocused = true;
    setExpanded(true);
    // Inicializa o highlight na página atual ao abrir o sidebar
    setFocusedPage(currentPage);
  };

  const handleBlur = (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;

    // Se o próximo elemento focado ainda está dentro do sidebar, não colapsa
    if (sidebarRef.current?.contains(relatedTarget)) return;

    // Se o foco foi perdido para o nada (ex: clique fora ou transição de página interna)
    // e o sidebar era o que tinha o foco, mantemos ele aberto por um tempo maior
    // para evitar o efeito "abre e fecha" durante o carregamento de novas telas.
    const isLosingFocusToContent = !!relatedTarget && document.body.contains(relatedTarget);

    window.__sidebarFocused = false;
    setFocusedPage(null); // limpa o highlight ao perder o foco

    if (collapseTimer.current) clearTimeout(collapseTimer.current);

    collapseTimer.current = setTimeout(
      () => {
        // Dupla checagem: se o foco voltou para dentro ou se não há foco em lugar nenhum focado (TV Box switching)
        if (sidebarRef.current?.contains(document.activeElement)) return;

        // Se o foco está no conteúdo principal, agora sim podemos fechar com segurança
        setExpanded(false);
      },
      isLosingFocusToContent ? 300 : 600
    );
  };

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
      // Garantir que o flag seja limpo ao desmontar — evita travar navegação
      // caso o componente desmonte enquanto o sidebar ainda está focado
      window.__sidebarFocused = false;
    };
  }, []);

  // Resolve a Page associada a um botão do sidebar
  const resolvePageFromBtn = useCallback((btn: HTMLElement): Page | null => {
    const label = btn.getAttribute('aria-label') || '';
    const match = NAV_ITEMS.find((n) => n.label === label);
    if (match) return match.page;
    if (label === 'Configurações') return Page.SETTINGS;
    if (label === 'Adulto') return Page.ADULTO;
    return null;
  }, []);

  // Navega entre itens do sidebar com ↑/↓; ArrowRight sai do menu para o conteúdo
  const handleNavKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const key = normalizeRemoteKey(e);

      if (key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        playNavigateSound();
        // Foca o primeiro item de conteúdo fora do sidebar
        const firstContent = document.querySelector<HTMLElement>(
          '[data-nav-item]:not([data-nav-sidebar] [data-nav-item])'
        );
        firstContent?.focus({ preventScroll: true });
        return;
      }

      if (key === 'ArrowLeft') {
        // Ignora se o sidebar acabou de receber foco (< 300ms):
        // evita que o repeat do mesmo ArrowLeft que abriu o menu feche imediatamente
        if (Date.now() - focusEnteredAtRef.current < 300) return;
        e.preventDefault();
        e.stopPropagation();
        // ← fecha o sidebar e devolve foco ao conteúdo (como Netflix)
        setExpanded(false);
        setFocusedPage(null);
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      playNavigateSound();
      const sidebar = sidebarRef.current;
      if (!sidebar) return;
      const items = Array.from(sidebar.querySelectorAll<HTMLElement>('[data-nav-item]'));
      const current = document.activeElement as HTMLElement;
      const idx = items.indexOf(current);

      let targetBtn: HTMLElement;
      if (idx === -1) {
        targetBtn = items[0];
      } else if (key === 'ArrowDown') {
        targetBtn = items[idx + 1] ?? items[0]; // wrap para o início
      } else {
        targetBtn = items[idx - 1] ?? items[items.length - 1]; // wrap para o fim
      }

      if (targetBtn) {
        targetBtn.focus({ preventScroll: true });
        // Atualiza o highlight imediatamente — background segue a seta
        const page = resolvePageFromBtn(targetBtn);
        if (page !== null) setFocusedPage(page);
      }
    },
    [resolvePageFromBtn]
  );

  return (
    <aside
      ref={sidebarRef}
      className={`sidebar-rail${expanded ? ' sidebar-expanded' : ''}`}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleNavKeyDown}
      data-nav-sidebar
      aria-label="Menu de navegação"
    >
      {/* Logo */}
      <div className="sidebar-logo-area">
        <img src="/x.png" alt="REDX" className="sidebar-logo-x" />
        <img src="/logored.webp" alt="REDX" className="sidebar-logo-full" />
      </div>

      {/* Nav items */}
      <nav className="sidebar-nav-list">
        {NAV_ITEMS.map((item) => {
          const itemPath = PAGE_TO_PATH[item.page];
          const isActive = itemPath ? location.pathname === itemPath : currentPage === item.page;
          // Highlight segue a seta quando o sidebar está expandido/focado
          const isFocusHighlighted = expanded && focusedPage === item.page;
          const showGradient = isFocusHighlighted || (!focusedPage && isActive);

          return (
            <button
              key={item.label}
              className={`sidebar-nav-btn${showGradient ? ' active' : ''}`}
              onClick={() => {
                playSelectSound();
                setExpanded(false);
                setFocusedPage(null);
                (document.activeElement as HTMLElement)?.blur();
                onNavigate(item.page);
              }}
              onFocus={() => {
                // Atualiza highlight ao focar via mouse/tab também
                setFocusedPage(item.page);
              }}
              tabIndex={0}
              data-nav-item
              data-cy={item.page === Page.LIVE ? 'nav-live' : undefined}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {showGradient && <span className="sidebar-active-bar" />}
              <span className="sidebar-icon-cell">
                <item.icon size={17} />
              </span>
              <span className="sidebar-label-text">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {/* Adulto — removido de builds store-safe */}
        {runtimeFlags.adultContentEnabled && (
          <button
            className={`sidebar-nav-btn${
              (expanded && focusedPage === Page.ADULTO) ||
              (!focusedPage && (location.pathname === '/adulto' || currentPage === Page.ADULTO))
                ? ' active'
                : ''
            }`}
            onClick={() => {
              playSelectSound();
              setExpanded(false);
              setFocusedPage(null);
              (document.activeElement as HTMLElement)?.blur();
              onNavigate(Page.ADULTO);
            }}
            onFocus={() => setFocusedPage(Page.ADULTO)}
            tabIndex={0}
            data-nav-item
            aria-label="Adulto"
          >
            {((expanded && focusedPage === Page.ADULTO) ||
              (!focusedPage && (location.pathname === '/adulto' || currentPage === Page.ADULTO))) && (
              <span className="sidebar-active-bar" />
            )}
            <span className="sidebar-icon-cell">
              <Lock size={17} />
            </span>
            <span className="sidebar-label-text">Adulto</span>
          </button>
        )}

        {/* Settings */}
        <button
          className={`sidebar-nav-btn${
            (expanded && focusedPage === Page.SETTINGS) ||
            (!focusedPage &&
              (location.pathname === '/settings' ||
                location.pathname === '/configuracoes' ||
                currentPage === Page.SETTINGS))
              ? ' active'
              : ''
          }`}
          onClick={() => {
            playSelectSound();
            setExpanded(false);
            setFocusedPage(null);
            (document.activeElement as HTMLElement)?.blur();
            onNavigate(Page.SETTINGS);
          }}
          onFocus={() => setFocusedPage(Page.SETTINGS)}
          tabIndex={0}
          data-nav-item
          aria-label="Configurações"
        >
          {((expanded && focusedPage === Page.SETTINGS) ||
            (!focusedPage &&
              (location.pathname === '/settings' ||
                location.pathname === '/configuracoes' ||
                currentPage === Page.SETTINGS))) && <span className="sidebar-active-bar" />}
          <span className="sidebar-icon-cell">
            <Settings size={17} />
          </span>
          <span className="sidebar-label-text">Configurações</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
