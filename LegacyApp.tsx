import React, { useState, useEffect, useCallback } from 'react';
import { setSignal } from './utils/appSignals';
import { AnimatePresence, motion } from 'framer-motion';
import { Page, UserProfile, Media } from './types';
import { normalizeRemoteKey } from './hooks/useRemoteControl';
import Sidebar from './components/Sidebar';
import MobileLayout from './components/mobile/MobileLayout';
import { useMobileDetect } from './hooks/useMobileDetect';
import { ErrorBoundary } from './components/ErrorBoundary';
// Lazy — primeira tela (Login) carrega sob demanda
const Login = React.lazy(() => import('./pages/Login'));
const Profiles = React.lazy(() => import('./pages/Profiles'));
import { useAuth } from './contexts/AuthContext';
import { logger } from './utils/logger';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { SpatialNavProvider, useSpatialNav } from './hooks/useSpatialNavigation';
import { playBackSound, playSelectSound, playNavigateSound, initAudio } from './utils/soundEffects';
import { useToast } from '@/contexts/ToastContext';
import { useCatalogLoader } from './hooks/useCatalogLoader';
import { useNextEpisode } from './hooks/useNextEpisode';
import { useExitConfirm } from './hooks/useExitConfirm';
import { getStreamUrl, getEpisodeStreamUrl } from './services/streamService';
import { getProfiles } from './services/profileService';
import { App as CapApp } from '@capacitor/app';
import { isPlaybackUrlKnownBroken } from './utils/playbackHealth';
import {
  isPlaceholderOrFakeStreamUrl,
  pickFirstRealStreamUrlFromRow,
} from './utils/streamUrlGuards';
import { invalidateContinueWatchingCache } from './hooks/useContinueWatching';
import type { HomeGenreLabel } from './config/homeCatalog';
import {
  PATH_TO_PAGE,
  PAGE_TO_PATH,
  pathToLegacyPage,
  buildWatchPathForMedia,
} from './config/legacyRoutes';
import { useLegacyUrlSync } from './hooks/useLegacyUrlSync';
import { useWatchDeepLink } from './hooks/useWatchDeepLink';

// Lazy page components — mesmas funções de import() para prefetch durante catálogo/sessão
const importHomePage = () => import('./pages/Home');
const importKidsPage = () => import('./pages/Kids');
const Home = React.lazy(importHomePage);
const Genres = React.lazy(() => import('./pages/Genres'));
const Movies = React.lazy(() => import('./pages/Movies'));
const Series = React.lazy(() => import('./pages/Series'));
const Kids = React.lazy(importKidsPage);
const MyList = React.lazy(() => import('./pages/MyList'));
const LiveTV = React.lazy(() => import('./pages/LiveTV'));
const Details = React.lazy(() => import('./pages/Details'));
const Player = React.lazy(() => import('./pages/Player'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Search = React.lazy(() => import('./pages/Search'));
const AdminDashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const DebugPage = React.lazy(() => import('./pages/DebugPage'));
const AdultoPage = React.lazy(() => import('./pages/AdultoPage'));

import { GlobalLoader } from './components/GlobalLoader';
import TitleTransitionOverlay from './components/TitleTransitionOverlay';
import VinhetaGate from './components/VinhetaGate';
import { LazyFallback } from './components/LazyFallback';
import HomeSkeleton from './components/HomeSkeleton';
import { LoadingScreen } from './components/LoadingScreen';
import { PlaybackRecoveryFallback } from './components/PlaybackRecoveryFallback';
import { runtimeFlags } from './config/runtimeFlags';

const ACTIVE_PROFILE_KEY = 'redx-active-profile';

// Quando VITE_FAKE_LOGIN=true, injeta um perfil fake no localStorage para
// que a tela de seleção de perfil seja ignorada automaticamente.
// import.meta.env.DEV garante tree-shaking completo em builds de produção.
if (import.meta.env.DEV && runtimeFlags.fakeLoginEnabled) {
  const fakeUserId = 'fake-user-testsprite';
  const profileKey = `redx-profile-selected:${fakeUserId}`;
  try {
    if (!localStorage.getItem(profileKey)) {
      localStorage.setItem(profileKey, '1');
    }
    if (!localStorage.getItem(ACTIVE_PROFILE_KEY)) {
      localStorage.setItem(
        ACTIVE_PROFILE_KEY,
        JSON.stringify({
          id: 'fake-profile-testsprite',
          name: 'TestSprite',
          avatar: null,
          isKids: false,
        })
      );
    }
  } catch {
    /* noop */
  }

  // Injeta catálogo fake no cache para que /filmes, /series e /busca tenham
  // conteúdo mesmo sem acesso ao Supabase (ambiente TestSprite cloud).
  // Atualizado a cada run para garantir dados frescos (timestamp = agora).
  try {
    const _FAKE_VIDEO =
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    const _fakeCatalog = {
      movies: [
        {
          id: 'fk-m1',
          title: 'Aventura no Espaço',
          type: 'movie',
          year: 2023,
          genre: ['Ficção Científica', 'Ação'],
          platform: 'Netflix',
          poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '8.6',
          description: 'Uma aventura épica pelo cosmos.',
        },
        {
          id: 'fk-m2',
          title: 'O Herói das Sombras',
          type: 'movie',
          year: 2023,
          genre: ['Ação', 'Super-heróis'],
          platform: 'Netflix',
          poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '9.0',
          description: 'Um herói luta contra o mal nas sombras.',
        },
        {
          id: 'fk-m3',
          title: 'Risos em Família',
          type: 'movie',
          year: 2022,
          genre: ['Comédia'],
          platform: 'Prime Video',
          poster: 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/2Uh0gzOh9rce4sRZCJDsQx2Qkqk.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '7.1',
          description: 'Uma família aprende a rir das adversidades.',
        },
        {
          id: 'fk-m4',
          title: 'Amor em Paris',
          type: 'movie',
          year: 2023,
          genre: ['Romance', 'Drama'],
          platform: 'Disney+',
          poster: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/lOSdUkGQmbAl5JQ3QoHqBZUbZhC.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '7.5',
          description: 'Uma história de amor nas ruas de Paris.',
        },
        {
          id: 'fk-m5',
          title: 'Casa dos Medos',
          type: 'movie',
          year: 2022,
          genre: ['Terror', 'Suspense'],
          platform: 'Max',
          poster: 'https://image.tmdb.org/t/p/w500/y5Z0WesTjvn59jP6yo459eUsbli.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/yDar8ByVBVTvijYMmrphEqnBNz0.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '6.8',
          description: 'Uma casa guarda segredos terríveis.',
        },
        {
          id: 'fk-m6',
          title: 'Detetive Noir',
          type: 'movie',
          year: 2023,
          genre: ['Policial', 'Suspense'],
          platform: 'Globoplay',
          poster: 'https://image.tmdb.org/t/p/w500/km4Fk8rBMUK3NQ4hTH0NNwYnkfN.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/kGzFbGhp99zva6oZODW5atUtnqi.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '7.9',
          description: 'Um detetive noir resolve crimes impossíveis.',
        },
        {
          id: 'fk-m7',
          title: 'Mundo Animado',
          type: 'movie',
          year: 2022,
          genre: ['Animação'],
          platform: 'Netflix',
          poster: 'https://image.tmdb.org/t/p/w500/pTEFqAjLkBGQFhTBLGbO3mxNxLN.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/mDfJG3LC3Dqb67AZ52x3Z0jU0uB.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '8.2',
          description: 'Um mundo mágico de personagens animados.',
        },
        {
          id: 'fk-m8',
          title: 'Drama Intenso',
          type: 'movie',
          year: 2023,
          genre: ['Drama'],
          platform: 'Netflix',
          poster: 'https://image.tmdb.org/t/p/w500/ulzhLuWrPK07P1YkdWQLZnQh1JL.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/fbeQSEQMSiKbJOCLFnLgQJKWmSa.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '8.8',
          description: 'Uma história dramática de superação.',
        },
      ],
      series: [
        {
          id: 'fk-s1',
          title: 'Wandinha',
          type: 'series',
          year: 2022,
          genre: ['Terror', 'Comédia'],
          platform: 'Netflix',
          poster: 'https://image.tmdb.org/t/p/w500/jeGtaMwGxPmQN5xM4ClnwPQcNQz.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '8.1',
          description: 'Wandinha Addams vai para um novo colégio.',
          seasons: 1,
          episodes: [
            {
              id: 'fk-s1-e1',
              episode_number: 1,
              season_number: 1,
              name: 'A Chegada',
              stream_url: _FAKE_VIDEO,
              overview: 'Wandinha chega ao Colégio Nunca Mais.',
              still_path: null,
            },
            {
              id: 'fk-s1-e2',
              episode_number: 2,
              season_number: 1,
              name: 'O Segredo',
              stream_url: _FAKE_VIDEO,
              overview: 'Um mistério assola o colégio.',
              still_path: null,
            },
            {
              id: 'fk-s1-e3',
              episode_number: 3,
              season_number: 1,
              name: 'O Monstro',
              stream_url: _FAKE_VIDEO,
              overview: 'O monstro é revelado.',
              still_path: null,
            },
          ],
        },
        {
          id: 'fk-s2',
          title: 'Ação Total',
          type: 'series',
          year: 2023,
          genre: ['Ação', 'Drama'],
          platform: 'Prime Video',
          poster: 'https://image.tmdb.org/t/p/w500/qjiskwlV1qQzRCjpV0cL9pEMF9a.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/8mkdxaZTMkAJBK5nqRY4AkfP0uY.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '8.5',
          description: 'Uma série cheia de adrenalina.',
          seasons: 1,
          episodes: [
            {
              id: 'fk-s2-e1',
              episode_number: 1,
              season_number: 1,
              name: 'Missão Impossível',
              stream_url: _FAKE_VIDEO,
              overview: 'A equipe recebe sua primeira missão.',
              still_path: null,
            },
            {
              id: 'fk-s2-e2',
              episode_number: 2,
              season_number: 1,
              name: 'Perseguição',
              stream_url: _FAKE_VIDEO,
              overview: 'Uma perseguição intensa pelas ruas da cidade.',
              still_path: null,
            },
          ],
        },
        {
          id: 'fk-s3',
          title: 'Policial de Elite',
          type: 'series',
          year: 2022,
          genre: ['Policial', 'Suspense'],
          platform: 'Globoplay',
          poster: 'https://image.tmdb.org/t/p/w500/w0KQQPxVJFyDQMSpMhqMpzP9qzA.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/3NTAbAiao4JLzFsBIOWZGFMJFmL.jpg',
          stream_url: _FAKE_VIDEO,
          tmdb_id: 0,
          rating: '8.3',
          description: 'Policiais de elite combatem o crime organizado.',
          seasons: 2,
          episodes: [
            {
              id: 'fk-s3-s1e1',
              episode_number: 1,
              season_number: 1,
              name: 'O Recrutamento',
              stream_url: _FAKE_VIDEO,
              overview: 'Novos recrutas chegam ao esquadrão.',
              still_path: null,
            },
            {
              id: 'fk-s3-s1e2',
              episode_number: 2,
              season_number: 1,
              name: 'A Operação',
              stream_url: _FAKE_VIDEO,
              overview: 'A primeira operação começa.',
              still_path: null,
            },
            {
              id: 'fk-s3-s2e1',
              episode_number: 1,
              season_number: 2,
              name: 'Nova Ameaça',
              stream_url: _FAKE_VIDEO,
              overview: 'Uma nova ameaça surge na cidade.',
              still_path: null,
            },
            {
              id: 'fk-s3-s2e2',
              episode_number: 2,
              season_number: 2,
              name: 'O Confronto',
              stream_url: _FAKE_VIDEO,
              overview: 'O confronto final se aproxima.',
              still_path: null,
            },
          ],
        },
      ],
      timestamp: Date.now(),
    };
    localStorage.setItem('redx-catalog-cache-v8', JSON.stringify(_fakeCatalog));
    // Injeta progresso fake para que a linha "Continuar Assistindo" apareça na Home.
    // tmdb_id usa o id do item fake (fk-m2) para que useContinueWatching faça o match.
    try {
      const _fakeProgress = [
        {
          tmdb_id: 'fk-m2',
          media_type: 'movie',
          progress_seconds: 300,
          total_duration: 596,
          season_number: null,
          episode_number: null,
          updated_at: new Date().toISOString(),
        },
      ];
      localStorage.setItem('redx-local-progress', JSON.stringify(_fakeProgress));
    } catch {
      /* noop */
    }
  } catch {
    /* noop */
  }
}

// Quando VITE_FAKE_LOGIN=true (ambiente TestSprite), não monta TitleTransitionOverlay
// (ex.: abertura do player com transitionMedia), para testes não esperarem o vídeo.
const FAKE_LOGIN_ENABLED = runtimeFlags.fakeLoginEnabled;

function readPersistedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch (e) {
    logger.warn('[LegacyApp] readPersistedProfile falhou:', e);
    return null;
  }
}

function persistProfile(profile: UserProfile | null): void {
  try {
    if (profile) localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(ACTIVE_PROFILE_KEY);
  } catch (e) {
    logger.warn('[LegacyApp] persistProfile falhou:', e);
  }
}

const PAGES_WITH_ROWS = [
  Page.LOGIN,
  Page.PLANS,
  Page.PROFILES,
  Page.HOME,
  Page.GENRES,
  Page.MOVIES,
  Page.SERIES,
  Page.KIDS,
  Page.MY_LIST,
  Page.LIVE,
  Page.ADULTO,
  Page.SEARCH,
  Page.DETAILS,
];

/** Baixa os chunks Home/Kids em paralelo ao catálogo — evita Suspense/LazyFallback após “Carregando início…”. */
function preloadHomeKidsChunks(): void {
  void importHomePage();
  void importKidsPage();
}

const LegacyAppInner: React.FC = () => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollPositions = React.useRef<Map<Page, number>>(new Map());
  const navStack = React.useRef<Page[]>([]);
  const watchConsumedRef = React.useRef<string | null>(null);
  /** Caminho e página antes de abrir o player (para Back / histórico). */
  const prePlayerPathRef = React.useRef<string>('/');
  const prePlayerPageRef = React.useRef<Page>(Page.HOME);
  const SKIP_AUTH = runtimeFlags.skipAuthEnabled;
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    if (SKIP_AUTH) {
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      const fromWatch = pathToLegacyPage(path);
      if (fromWatch === Page.PLAYER) return Page.PLAYER;
      return PATH_TO_PAGE[path] ?? Page.HOME;
    }
    const p = readPersistedProfile();
    if (!p) return Page.LOGIN;
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const fromWatch = pathToLegacyPage(path);
    if (fromWatch === Page.PLAYER) return Page.PLAYER;
    return PATH_TO_PAGE[path] ?? (p.isKids ? Page.KIDS : Page.HOME);
  });
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(() =>
    readPersistedProfile()
  );
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [_previousPage, setPreviousPage] = useState<Page>(Page.HOME);
  const [settingsTarget, setSettingsTarget] = useState<{ tab?: string; subView?: string } | null>(
    null
  );
  const [profileView, setProfileView] = useState<'select' | 'manage' | 'add'>('select');
  const { savePosition, restorePosition, focusToFirstRow, setPosition } = useSpatialNav();
  const { showToast } = useToast();
  const [isNavigating, setIsNavigating] = useState(false);
  const [transitionMedia, setTransitionMedia] = useState<Media | null>(null);
  const [pendingSectionPage, setPendingSectionPage] = useState<Page | null>(null);
  /** Se onComplete do overlay falhar, liberta loader/transição (evita bloqueio infinito). */
  const detailsTransitionSafetyRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    user,
    loading: authLoading,
    isProfileSelected,
    markProfileSelected,
    resetProfileSelection,
  } = useAuth();

  const routeNavigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlPlatform = searchParams.get('platform');

  useLegacyUrlSync(
    location.pathname,
    authLoading,
    Boolean(user && activeProfile && isProfileSelected),
    setCurrentPage
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (currentPage === Page.PLAYER || currentPage === Page.LIVE || currentPage === Page.ADULTO)
      return;

    // Garante que o shell volte ao gradiente padrao ao sair de player/canais.
    document.documentElement.removeAttribute('data-page');
  }, [currentPage]);

  // NAV-07: data-nav-page para memória de coluna por página (evita vazamento entre Home/Series/etc)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const pageId = String(currentPage).toLowerCase();
    document.documentElement.setAttribute('data-nav-page', pageId);
    return () => document.documentElement.removeAttribute('data-nav-page');
  }, [currentPage]);

  useEffect(() => {
    if (!user?.id || !activeProfile?.id || !isProfileSelected) return;
    let cancelled = false;
    getProfiles(user.id)
      .then((profiles) => {
        if (cancelled) return;
        const updated = profiles.find((p) => p.id === activeProfile.id);
        if (
          updated &&
          (updated.avatar !== activeProfile.avatar || updated.name !== activeProfile.name)
        ) {
          setActiveProfile(updated);
          persistProfile(updated);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeProfile?.id, activeProfile?.avatar, activeProfile?.name, isProfileSelected]);

  const isAuthenticated = !!user;

  // ── Catalog ──────────────────────────────────────────────────────────────────
  // Desabilitar catálogo na página LIVE (Canais) - não precisa de filmes/séries
  const catalogDisabled = currentPage === Page.LIVE || currentPage === Page.ADULTO;

  const {
    movies,
    series,
    loading,
    enrichmentError,
    catalogErrorMessage,
    usingCachedCatalog,
    trendingMovies,
    trendingSeries,
    moviesByGenre,
    seriesByGenre,
  } = useCatalogLoader({
    userId: user?.id,
    profileId: activeProfile?.id,
    authLoading,
    isAuthenticated,
    disabled: catalogDisabled,
    currentPath: location.pathname,
  });

  // Sinalizar para o boot screen que a Home está pronta
  useEffect(() => {
    // Basta não estar carregando (loading === false) para sinalizar pronto
    if (!loading) {
      if (typeof window.__MARK_HOME_READY === 'function') {
        window.__MARK_HOME_READY();
      }
    }
  }, [loading]);

  // Prefetch dos chunks Home/Kids em paralelo ao catálogo (evita atraso extra após o loading de início)
  useEffect(() => {
    if (authLoading) return;
    if (!user && !SKIP_AUTH) return;
    preloadHomeKidsChunks();
  }, [authLoading, user?.id, SKIP_AUTH]);

  // ── enrichmentError: avisar usuário quando imagens TMDB falharem ──
  useEffect(() => {
    if (enrichmentError) {
      showToast('Algumas imagens podem estar incompletas.', 'info');
    }
  }, [enrichmentError, showToast]);

  // ── Next episode ─────────────────────────────────────────────────────────────
  const { nextEpisodeData, setNextEpisodeData } = useNextEpisode({
    currentPage,
    selectedMedia,
    userId: user?.id,
  });

  const noopBack = useCallback(() => {}, []);
  const { showExitConfirm, setShowExitConfirm, requestExit } = useExitConfirm({
    currentPage,
    onBack: noopBack,
  });

  // NAV: enquanto o modal de saída estiver aberto, bloquear handlers globais
  // para o D-pad não "vazar" para o menu lateral.
  useEffect(() => {
    if (!showExitConfirm) return;
    setSignal('modalKeyTrap', true);
    return () => {
      setSignal('modalKeyTrap', false);
    };
  }, [showExitConfirm]);

  // ── Auth effect: IDÊNTICO ao projeto de referência (src/LegacyApp.tsx) ──
  // Ref que espelha currentPage — permite leitura sem adicionar currentPage
  // como dependência reativa (evita re-execução do effect a cada navegação).
  const _authCurrentPageRef = React.useRef(currentPage);
  _authCurrentPageRef.current = currentPage;

  useEffect(() => {
    if (authLoading) return;
    const page = _authCurrentPageRef.current;

    if (SKIP_AUTH) return;

    // Sem user → forçar LOGIN
    if (!user) {
      persistProfile(null);
      if (activeProfile) setActiveProfile(null);
      if (isProfileSelected) resetProfileSelection();
      if (page !== Page.LOGIN) setCurrentPage(Page.LOGIN);
      return;
    }

    // Auto-seleção de perfil — sem tela "Quem está assistindo?"
    // Cria um perfil padrão silencioso e vai direto para Home
    if (!isProfileSelected || !activeProfile) {
      const autoProfile: UserProfile = {
        id: `auto-${user.id}`,
        name: 'Usuário',
        avatar: '',
        isKids: false,
        parentalRating: '18',
      } as unknown as UserProfile;
      persistProfile(autoProfile);
      setActiveProfile(autoProfile);
      markProfileSelected();
      if ([Page.LOGIN, Page.PROFILES, Page.PLANS].includes(page)) {
        setCurrentPage(Page.HOME);
      }
      return;
    }

    // Com perfil já selecionado, redirecionar de telas de auth
    if ([Page.LOGIN, Page.PROFILES, Page.PLANS].includes(page)) {
      setCurrentPage(Page.HOME);
    }
  }, [
    authLoading,
    user,
    activeProfile,
    isProfileSelected,
    profileView,
    resetProfileSelection,
    SKIP_AUTH,
  ]);
  // ↑ currentPage intencionalmente omitido: _authCurrentPageRef.current fornece o valor
  //   sem tornar o effect reativo a cada mudança de página.

  const prevPageRef = React.useRef<Page>(currentPage);
  useEffect(() => {
    if (prevPageRef.current !== Page.PROFILES && currentPage === Page.PROFILES) {
      setProfileView('select');
    }
    prevPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (!PAGES_WITH_ROWS.includes(currentPage)) return;
    if (currentPage === Page.DETAILS) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;
    const retryInterval = 100;
    let retryId: ReturnType<typeof setTimeout> | null = null;

    const tryFocus = () => {
      if (cancelled) return;
      attempts++;
      const hasRows = document.querySelector('[data-nav-row]');
      if (hasRows || attempts >= maxAttempts) {
        // focusToFirstRow detecta o menor data-nav-row no DOM dinamicamente.
        // setPosition(0, 0) falha quando data-nav-row="0" não existe (ex: Home com
        // HeroBanner variant="glass" que começa em row=1).
        focusToFirstRow();
      } else {
        retryId = setTimeout(tryFocus, retryInterval);
      }
    };

    const rafId = requestAnimationFrame(() => tryFocus());
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (retryId !== null) clearTimeout(retryId);
    };
  }, [currentPage, focusToFirstRow, setPosition]);

  // FIX BUG 8: useCallback evita nova referência a cada render (re-renders desnecessários nos filhos)
  const navigate = useCallback(
    (page: Page, media: Media | null = null) => {
      if (page === Page.HOME && activeProfile && !isProfileSelected) {
        markProfileSelected();
      }
      if (page === Page.FUTEBOL) {
        setIsNavigating(false);
        setTransitionMedia(null);
        routeNavigate('/futebol');
        return;
      }
      if (page === Page.LIVE) {
        setIsNavigating(false);
        setTransitionMedia(null);
        routeNavigate('/canais');
        return;
      }
      // ADULTO é tratado como LIVE/FUTEBOL: navega direto via rota sem passar pelo
      // switch interno (case Page.ADULTO). Evita double-mount do VinhetaGate causado
      // por setCurrentPage(Page.ADULTO) + v7_startTransition.
      if (page === Page.ADULTO) {
        setIsNavigating(false);
        setTransitionMedia(null);
        routeNavigate('/adulto');
        return;
      }
      if (page === Page.MOVIES || page === Page.SERIES) {
        setIsNavigating(false);
        setTransitionMedia(null);
        setPendingSectionPage(page);
        return;
      }

      const executeNavigation = () => {
        const path = PAGE_TO_PATH[page];
        if (path) {
          routeNavigate(path);
        }
        if (media) setSelectedMedia(media);
        // Salvar scroll position da página atual
        scrollPositions.current.set(currentPage, window.scrollY);
        // Push na stack de navegação
        navStack.current.push(currentPage);
        if (navStack.current.length > 10) navStack.current.shift();
        setPreviousPage(currentPage);
        setCurrentPage(page);

        // Pequeno delay para esconder o loader após a troca de estado
        setTimeout(() => {
          setIsNavigating(false);
          setTransitionMedia(null);
        }, 200);
      };

      if (page === Page.DETAILS) {
        if (detailsTransitionSafetyRef.current) {
          clearTimeout(detailsTransitionSafetyRef.current);
          detailsTransitionSafetyRef.current = null;
        }
        if (media) setSelectedMedia(media);
        scrollPositions.current.set(currentPage, window.scrollY);
        navStack.current.push(currentPage);
        if (navStack.current.length > 10) navStack.current.shift();
        setPreviousPage(currentPage);
        setCurrentPage(page);
      } else if (page === Page.PLAYER) {
        // data-page e playerActive são gerenciados pelo Player.tsx via useLayoutEffect
        if (media) setTransitionMedia(media);
        setIsNavigating(true);
        setTimeout(() => {
          executeNavigation();
        }, 300);
      } else {
        executeNavigation();
      }
    },
    [routeNavigate, currentPage, activeProfile, isProfileSelected, markProfileSelected]
  );

  const completeSectionVinheta = useCallback(() => {
    if (!pendingSectionPage) return;
    const targetPage = pendingSectionPage;
    setPendingSectionPage(null);

    const path = PAGE_TO_PATH[targetPage];
    if (path) routeNavigate(path);
    scrollPositions.current.set(currentPage, window.scrollY);
    navStack.current.push(currentPage);
    if (navStack.current.length > 10) navStack.current.shift();
    setPreviousPage(currentPage);
    setCurrentPage(targetPage);
  }, [pendingSectionPage, routeNavigate, currentPage]);

  useEffect(() => {
    const pagesWithBanner = [
      Page.HOME,
      Page.GENRES,
      Page.MOVIES,
      Page.SERIES,
      Page.KIDS,
      Page.MY_LIST,
      Page.SEARCH,
    ];
    if (pagesWithBanner.includes(currentPage)) {
      // Filmes/Séries/Kids: sempre abrir no topo (mostrando o HeroBanner),
      // nunca restaurar posição salva — evita abrir na seção de posters.
      // HOME/MY_LIST/SEARCH: restaurar posição salva ao voltar.
      const pagesAlwaysTop = [Page.MOVIES, Page.SERIES, Page.KIDS, Page.GENRES];
      const savedScroll = pagesAlwaysTop.includes(currentPage)
        ? 0
        : scrollPositions.current.get(currentPage) || 0;
      const doScroll = () => {
        scrollContainerRef.current?.scrollTo({ top: savedScroll, behavior: 'auto' });
        window.scrollTo({ top: savedScroll, behavior: 'auto' });
      };
      const id = requestAnimationFrame(() => requestAnimationFrame(doScroll));
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [currentPage]);

  const handlePlayMedia = useCallback(
    async (media: Media) => {
      logger.log(
        '[handlePlayMedia] "' +
          media.title +
          '" | stream_url: ' +
          (media.stream_url ? 'SIM' : 'NAO') +
          ' | tmdb_id: ' +
          media.tmdb_id
      );

      const openPlayer = (playbackMedia: Media, url: string) => {
        const streamUrl = String(url || '').trim();
        if (!streamUrl) {
          showToast('"' + playbackMedia.title + '" nao possui URL de stream configurada.', 'error');
          setIsNavigating(false);
          return;
        }
        const pathNow = location.pathname.replace(/\/$/, '') || '/';
        if (!/^\/watch\/[^/]+$/.test(pathNow)) {
          prePlayerPathRef.current = pathNow;
          prePlayerPageRef.current = currentPage;
        }
        const watchPath = buildWatchPathForMedia(playbackMedia);
        const currentFull = `${pathNow}${location.search || ''}`;
        watchConsumedRef.current = watchPath;
        if (currentFull !== watchPath) routeNavigate(watchPath, { replace: false });
        savePosition('player-return');
        setPreviousPage(currentPage);
        // data-page='player' e playerActive são definidos pelo próprio Player.tsx
        // via useLayoutEffect (antes do paint) — igual ao padrão do projeto de referência.
        // Setar aqui era prematuro e causava flash de tela preta antes do Player montar.
        setSelectedMedia({ ...playbackMedia, stream_url: streamUrl });
        setCurrentPage(Page.PLAYER);
        setIsNavigating(false);
      };

      const brokenCandidateUrls: string[] = [];

      const pushCandidateUrl = (
        candidateUrls: string[],
        url: string | null | undefined,
        source: string
      ) => {
        const candidate = String(url || '').trim();
        if (!candidate) return;
        if (isPlaceholderOrFakeStreamUrl(candidate)) {
          logger.warn(
            `[handlePlayMedia] Ignorando URL placeholder (${source}): ${candidate.substring(0, 80)}...`
          );
          return;
        }
        if (isPlaybackUrlKnownBroken(candidate)) {
          logger.warn(
            `[handlePlayMedia] Ignorando URL marcada como quebrada (${source}): ${candidate.substring(0, 80)}...`
          );
          if (!brokenCandidateUrls.includes(candidate)) brokenCandidateUrls.push(candidate);
          return;
        }
        if (!candidateUrls.includes(candidate)) candidateUrls.push(candidate);
      };

      const directUrl = pickFirstRealStreamUrlFromRow(media as unknown as Record<string, unknown>);
      const candidateUrls: string[] = [];

      // Timeout helper: cancela query Supabase lenta após 5 s
      const withDbTimeout = <T,>(promise: Promise<T>): Promise<T | null> =>
        Promise.race([
          promise,
          new Promise<null>((r) => setTimeout(() => r(null), 5000)),
        ]) as Promise<T | null>;

      if (media.type === 'series') {
        const season = Number(media.season_number || 0);
        const episode = Number(media.episode_number || 0);

        // 1ª opção: URL já presente no objeto (instantânea)
        pushCandidateUrl(candidateUrls, directUrl, 'direct');

        // 2ª opção: URL do episódio no DB (com timeout de 5 s)
        if (candidateUrls.length === 0 && season > 0 && episode > 0) {
          const episodeUrl = await withDbTimeout(
            getEpisodeStreamUrl(media.title, season, episode, media.tmdb_id)
          );
          if (episodeUrl) {
            logger.log(
              '[handlePlayMedia] URL do episodio encontrada: ' + episodeUrl.substring(0, 80) + '...'
            );
          }
          pushCandidateUrl(candidateUrls, episodeUrl, 'episode-db');
        }

        // 3ª opção: fallback genérico da série no DB (com timeout de 5 s)
        if (candidateUrls.length === 0) {
          logger.log(
            '[handlePlayMedia] Buscando fallback de série no Supabase para: "' + media.title + '"'
          );
          const genericSeriesUrl = await withDbTimeout(
            getStreamUrl(media.title, media.type, media.tmdb_id)
          );
          if (genericSeriesUrl) {
            logger.log(
              '[handlePlayMedia] Fallback de série encontrado: ' +
                genericSeriesUrl.substring(0, 80) +
                '...'
            );
          }
          pushCandidateUrl(candidateUrls, genericSeriesUrl, 'series-fallback');
        }
      } else {
        // 1ª opção: URL já presente no objeto (instantânea)
        pushCandidateUrl(candidateUrls, directUrl, 'direct');

        // 2ª opção: URL fresca do DB (com timeout de 5 s) — só busca se directUrl estiver ausente
        if (candidateUrls.length === 0) {
          logger.log(
            '[handlePlayMedia] directUrl ausente — buscando no Supabase para: "' + media.title + '"'
          );
          const dbMovieUrl = await withDbTimeout(
            getStreamUrl(media.title, media.type, media.tmdb_id)
          );
          if (dbMovieUrl) {
            logger.log(
              '[handlePlayMedia] URL de filme encontrada no DB: ' +
                dbMovieUrl.substring(0, 80) +
                '...'
            );
          }
          pushCandidateUrl(candidateUrls, dbMovieUrl, 'movie-db');
        }
      }

      if (candidateUrls.length > 0) {
        const chosenUrl = candidateUrls[0];
        logger.log(
          '[handlePlayMedia] Abrindo stream validada: ' + chosenUrl.substring(0, 80) + '...'
        );
        openPlayer(media, chosenUrl);
        return;
      }

      // Último recurso 1: se só sobraram URLs marcadas como quebradas no cache local,
      // tente novamente assim mesmo. Isso evita falsos negativos quando a falha foi
      // transitória e a mesma URL continua sendo a única disponível no banco.
      if (brokenCandidateUrls.length > 0) {
        const retryUrl = brokenCandidateUrls[0];
        logger.warn(
          '[handlePlayMedia] Reabrindo URL previamente marcada como quebrada: ' +
            retryUrl.substring(0, 80) +
            '...'
        );
        openPlayer(media, retryUrl);
        return;
      }

      // Último recurso: se todas as URLs foram filtradas por "known broken" mas existe
      // directUrl válida sintaticamente, tentar assim mesmo — erro transiente pode ter passado.
      if (
        directUrl &&
        directUrl.startsWith('http') &&
        directUrl.length > 10 &&
        !isPlaceholderOrFakeStreamUrl(directUrl)
      ) {
        logger.warn(
          '[handlePlayMedia] Tentando directUrl mesmo marcada como quebrada: ' +
            directUrl.substring(0, 80) +
            '...'
        );
        openPlayer(media, directUrl);
        return;
      }

      logger.warn(
        '[handlePlayMedia] Nenhuma stream_url utilizável encontrada para "' +
          media.title +
          '". Playback cancelado.'
      );
      playBackSound();
      showToast('"' + media.title + '" nao possui uma URL de stream valida no momento.', 'error');
      setIsNavigating(false);
    },
    [currentPage, showToast, savePosition, location.pathname, location.search, routeNavigate, setIsNavigating]
  );

  useWatchDeepLink({
    pathname: location.pathname,
    searchParams,
    authLoading,
    user,
    activeProfile,
    isProfileSelected,
    loading,
    movies,
    series,
    handlePlayMedia,
    routeNavigate,
    showToast,
    watchConsumedRef,
  });

  const handleStreamFailed = useCallback(
    async (failedUrl: string) => {
      if (!selectedMedia) return;
      logger.warn('[handleStreamFailed] URL falhou: ' + failedUrl.substring(0, 80) + '...');
      // failedUrl já foi marcada como broken em Player.tsx via markPlaybackUrlsFailed.
      // Tentamos buscar uma URL alternativa no banco (a quebrada será ignorada automaticamente).
      // Timeout de 4s — sem isso, um Supabase lento mantém a callback pendente indefinidamente.
      const altUrl = await Promise.race([
        getStreamUrl(selectedMedia.title, selectedMedia.type, selectedMedia.tmdb_id),
        new Promise<null>((r) => setTimeout(() => r(null), 4000)),
      ]);
      if (altUrl && altUrl !== failedUrl) {
        logger.log(
          '[handleStreamFailed] URL alternativa encontrada: ' + altUrl.substring(0, 80) + '...'
        );
        setSelectedMedia((prev) => (prev ? { ...prev, stream_url: altUrl } : prev));
      } else {
        logger.warn(
          '[handleStreamFailed] Nenhuma URL alternativa disponivel para "' +
            selectedMedia.title +
            '"'
        );
      }
    },
    [selectedMedia]
  );

  const handlePlayNext = () => {
    if (!nextEpisodeData || !selectedMedia) return;
    const nextMedia: Media = {
      ...selectedMedia,
      title: nextEpisodeData.title,
      stream_url: nextEpisodeData.stream_url || '',
      season_number: nextEpisodeData.season,
      episode_number: nextEpisodeData.episode,
    } as Media;
    setNextEpisodeData(null);
    setSelectedMedia(nextMedia);
    const watchPath = buildWatchPathForMedia(nextMedia);
    watchConsumedRef.current = watchPath;
    routeNavigate(watchPath, { replace: true });
  };

  const handleSelectEpisode = useCallback(async (season: number, episode: number) => {
    if (!selectedMedia) return;
    logger.log(
      `[handleSelectEpisode] Selecionando S${season}E${episode} para "${selectedMedia.title}"`
    );

    setIsNavigating(true);

    // Timeout de 5 s — mesma política do handlePlayMedia
    const streamUrl = await Promise.race([
      getEpisodeStreamUrl(selectedMedia.title, season, episode, selectedMedia.tmdb_id),
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]);

    if (streamUrl) {
      const updated = {
        ...selectedMedia,
        stream_url: streamUrl,
        season_number: season,
        episode_number: episode,
      } as Media;
      setSelectedMedia(updated);
      const watchPath = buildWatchPathForMedia(updated);
      watchConsumedRef.current = watchPath;
      routeNavigate(watchPath, { replace: true });
      setIsNavigating(false);
    } else {
      showToast(`URL para S${season}E${episode} nao encontrada.`, 'error');
      setIsNavigating(false);
    }
  }, [selectedMedia, routeNavigate, showToast]);

  const handleLogin = () => {
    preloadHomeKidsChunks();
    // Vai direto para Home — sem tela de seleção de perfil
    setCurrentPage(Page.HOME);
  };

  const handleProfileSelect = (profile: UserProfile) => {
    persistProfile(profile);
    setActiveProfile(profile);
    markProfileSelected();
    preloadHomeKidsChunks();
    setCurrentPage(profile.isKids ? Page.KIDS : Page.HOME);
  };

  const handleBackToPrevious = useCallback(() => {
    if (detailsTransitionSafetyRef.current) {
      clearTimeout(detailsTransitionSafetyRef.current);
      detailsTransitionSafetyRef.current = null;
    }
    setIsNavigating(false);
    setTransitionMedia(null);
    setSignal('canExitApp', false);
    playBackSound();

    setSignal('playerActive', false);
    setSignal('livetvActive', false);
    document.documentElement.removeAttribute('data-page');

    if (currentPage === Page.PLAYER) {
      invalidateContinueWatchingCache();
      setNextEpisodeData(null);
      restorePosition('player-return');
      navStack.current = [];
      let pathToGo = (prePlayerPathRef.current || '/').replace(/\/$/, '') || '/';
      if (/^\/watch\/[^/]+$/.test(pathToGo)) pathToGo = '/';
      routeNavigate(pathToGo);
      const mapped = pathToLegacyPage(pathToGo);
      const nextPage = mapped ?? prePlayerPageRef.current;
      setCurrentPage(nextPage);
      setPreviousPage(nextPage);
      watchConsumedRef.current = null;
      return;
    }

    navStack.current = [];
    routeNavigate('/');
    setCurrentPage(Page.HOME);
    setPreviousPage(Page.HOME);
  }, [currentPage, restorePosition, routeNavigate, setNextEpisodeData]);

  useEffect(() => {
    if (currentPage === Page.DETAILS) {
      window.__redxBackFromDetails = handleBackToPrevious;
      return () => {
        window.__redxBackFromDetails = null;
      };
    }
    return undefined;
  }, [currentPage, handleBackToPrevious]);

  const handleTVBack = useCallback(() => {
    playBackSound();
    // Login: voltar não pode ir para Home (que mostra catálogo / SKIP_AUTH); deve sair como na Home.
    if (currentPage === Page.LOGIN) {
      requestExit();
      return;
    }
    if (currentPage === Page.HOME) {
      requestExit();
      return;
    }
    handleBackToPrevious();
    setShowExitConfirm(false);
  }, [currentPage, handleBackToPrevious, requestExit]);

  useEffect(() => {
    const initOnce = () => {
      initAudio();
    };
    window.addEventListener('keydown', initOnce, { once: true });
    window.addEventListener('click', initOnce, { once: true });
    setSignal('canExitApp', false);
    return () => {
      window.removeEventListener('keydown', initOnce);
      window.removeEventListener('click', initOnce);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Back') {
        if (e.defaultPrevented) return;
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (currentPage === Page.LIVE || currentPage === Page.PLAYER) return;
        e.preventDefault();
        handleTVBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, handleTVBack]);

  useEffect(() => {
    const handler = () => {
      if (currentPage === Page.DETAILS) handleBackToPrevious();
    };
    window.addEventListener('redx-details-back', handler);
    return () => window.removeEventListener('redx-details-back', handler);
  }, [currentPage, handleBackToPrevious]);

  // ═══ NATIVE BACK (Capacitor / Android TV remote) ═══
  // Intercepta o evento customizado despachado pelo App.tsx antes de minimizar
  useEffect(() => {
    const handler = (e: Event) => {
      // Sempre tratar back internamente — impede o app de minimizar/sair
      e.preventDefault();
      handleTVBack();
    };
    window.addEventListener('redx-native-back', handler);
    return () => window.removeEventListener('redx-native-back', handler);
  }, [handleTVBack]);

  // Evita setState dentro do render quando faltam dados obrigatórios de navegação.
  useEffect(() => {
    const requiresMedia = currentPage === Page.DETAILS || currentPage === Page.PLAYER;
    if (!requiresMedia || selectedMedia) return;
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (/^\/watch\/[^/]+$/.test(path)) return;
    setCurrentPage(activeProfile?.isKids ? Page.KIDS : Page.HOME);
  }, [currentPage, selectedMedia, activeProfile?.isKids, location.pathname]);

  // Safety timeout: reduzido para 8s em dispositivos lentos (TV Box)
  // FIX: nunca exibe tela em branco/roxa — HomeSkeleton é o fallback garantido.
  // DEVE ficar ANTES de qualquer return condicional (Regras dos Hooks)
  const [catalogTimeout, setCatalogTimeout] = React.useState(false);
  React.useEffect(() => {
    if (!loading) {
      setCatalogTimeout(false);
      return;
    }
    const t = setTimeout(() => setCatalogTimeout(true), 3000); // 3s para TV Box lenta
    return () => clearTimeout(t);
  }, [loading]);

  // Safety timeout para auth — evita tela roxa infinita se auth travar
  const [authTimedOut, setAuthTimedOut] = React.useState(false);
  React.useEffect(() => {
    if (!authLoading) {
      setAuthTimedOut(false);
      return;
    }
    const t = setTimeout(() => setAuthTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [authLoading]);

  /* ── Detecção de mobile: touch + < 768px + NOT TV Box ── */
  const isMobile = useMobileDetect();

  // Durante auth: mesmo fundo roxo dos outros carregamentos (LoadingScreen)
  if (authLoading && !authTimedOut) {
    return <LoadingScreen text="Carregando sessão…" />;
  }

  const renderPage = () => {
    const needsCatalog = ![Page.LOGIN, Page.PROFILES, Page.PLANS, Page.LIVE, Page.ADULTO].includes(
      currentPage
    );
    const hasCatalogData = (movies?.length ?? 0) > 0 || (series?.length ?? 0) > 0;

    // Home / Kids após login: aguardar fim do catálogo (não confiar só em hasCatalogData — cache antigo/trial podia mostrar feed antes do fetch do utilizador)
    // pendingSectionPage !== null = vinheta ativa; não exibir LoadingScreen por baixo (VinhetaGate já cobre tudo em z=30000)
    const homeOrKidsAwaitingCatalog =
      !catalogTimeout &&
      loading &&
      needsCatalog &&
      pendingSectionPage === null &&
      (currentPage === Page.HOME || currentPage === Page.KIDS);
    if (homeOrKidsAwaitingCatalog) {
      return <LoadingScreen text="Carregando início…" />;
    }

    // Outras páginas com catálogo: skeleton até haver dados (ou timeout)
    // Também suprimido enquanto vinheta de seção está ativa
    if (loading && needsCatalog && !hasCatalogData && !catalogTimeout && pendingSectionPage === null) {
      return <HomeSkeleton />;
    }

    switch (currentPage) {
      case Page.LOGIN:
        return (
          <React.Suspense fallback={<LazyFallback />}>
            <Login
              onLogin={handleLogin}
              onAdminAccess={() => {
                try {
                  localStorage.setItem('redx_post_login_redirect', '/admin');
                } catch {
                  // noop
                }
              }}
            />
          </React.Suspense>
        );
      case Page.PROFILES:
        return (
          <React.Suspense fallback={<LazyFallback />}>
            <Profiles
              onSelect={handleProfileSelect}
              onBackToSelect={() => setProfileView('select')}
              initialEditMode={profileView === 'manage'}
              initialShowAddModal={profileView === 'add'}
            />
          </React.Suspense>
        );
      case Page.HOME:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado na Home.', err?.message);
            }}
          >
            <Home
              movies={movies ?? []}
              series={series ?? []}
              trendingMovies={trendingMovies ?? []}
              trendingSeries={trendingSeries ?? []}
              seriesByGenre={(seriesByGenre ?? new Map()) as Map<HomeGenreLabel, Media[]>}
              catalogErrorMessage={catalogErrorMessage}
              usingCachedCatalog={usingCachedCatalog}
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
              onPlayMedia={handlePlayMedia}
              initialPlatform={urlPlatform}
            />
          </ErrorBoundary>
        );
      case Page.GENRES:
        return (
          <React.Suspense fallback={<LazyFallback />}>
            <Genres
              movies={movies ?? []}
              series={series ?? []}
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
              onPlayMedia={handlePlayMedia}
            />
          </React.Suspense>
        );
      case Page.MOVIES:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado em Filmes.', err?.message);
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
          >
            <Movies
              movies={movies ?? []}
              moviesByGenre={(moviesByGenre ?? new Map()) as Map<HomeGenreLabel, Media[]>}
              trendingMovies={trendingMovies ?? []}
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
              onPlayMedia={handlePlayMedia}
            />
          </ErrorBoundary>
        );
      case Page.SERIES:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado em Séries.', err?.message);
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
          >
            <Series
              series={series ?? []}
              seriesByGenre={(seriesByGenre ?? new Map()) as Map<HomeGenreLabel, Media[]>}
              trendingSeries={trendingSeries ?? []}
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
              onPlayMedia={handlePlayMedia}
            />
          </ErrorBoundary>
        );
      case Page.KIDS:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado em Kids.', err?.message);
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
          >
            <Kids
              movies={movies ?? []}
              series={series ?? []}
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
              onPlayMedia={handlePlayMedia}
            />
          </ErrorBoundary>
        );
      case Page.MY_LIST:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado em Minha Lista.', err?.message);
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
          >
            <MyList
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
              onPlayMedia={handlePlayMedia}
              allMedia={[...(movies ?? []), ...(series ?? [])]}
            />
          </ErrorBoundary>
        );
      case Page.LIVE:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn(
                '[LegacyApp] Crash mitigado na LiveTV. Retornando em segurança.',
                err?.message
              );
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
            fallback={() => (
              <PlaybackRecoveryFallback
                contextName="Live TV"
                onGoSafe={() => setCurrentPage(Page.HOME)}
              />
            )}
          >
            <LiveTV onBack={handleTVBack} />
          </ErrorBoundary>
        );

      case Page.ADULTO:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn(
                '[LegacyApp] Crash mitigado na tela Adulto. Retornando em segurança.',
                err?.message
              );
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
            fallback={() => (
              <PlaybackRecoveryFallback
                contextName="Adulto"
                onGoSafe={() => setCurrentPage(Page.HOME)}
              />
            )}
          >
            <React.Suspense fallback={<LazyFallback />}>
              <AdultoPage />
            </React.Suspense>
          </ErrorBoundary>
        );

      case Page.DETAILS:
        if (!selectedMedia) {
          return <LoadingScreen text="Carregando detalhes..." />;
        }
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn(
                '[LegacyApp] Crash mitigado em Details. Retornando em segurança.',
                err?.message
              );
              setTimeout(() => handleBackToPrevious(), 500);
            }}
            fallback={(error: Error) => (
              <PlaybackRecoveryFallback
                contextName="Detalhes"
                error={error}
                onGoSafe={handleBackToPrevious}
              />
            )}
          >
            <Details
              key={`details-${selectedMedia.id}-${selectedMedia.tmdb_id ?? 'x'}-${selectedMedia.type}`}
              media={selectedMedia}
              onPlay={(mediaToPlay) => handlePlayMedia(mediaToPlay || selectedMedia)}
              onBack={handleBackToPrevious}
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
            />
          </ErrorBoundary>
        );
      case Page.PLAYER:
        if (!selectedMedia) {
          return <LoadingScreen text="Carregando player..." className="z-[20] pointer-events-none" />;
        }
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn(
                '[LegacyApp] Crash mitigado no Player.tsx. Retornando em segurança.',
                err?.message
              );
              setTimeout(() => handleBackToPrevious(), 500);
            }}
            fallback={(error: Error) => (
              <PlaybackRecoveryFallback
                contextName="Player"
                error={error}
                onGoSafe={handleBackToPrevious}
              />
            )}
          >
            <Player
              media={selectedMedia}
              onClose={handleBackToPrevious}
              nextEpisode={nextEpisodeData}
              onPlayNext={handlePlayNext}
              onSelectEpisode={handleSelectEpisode}
              onStreamFailed={handleStreamFailed}
            />
          </ErrorBoundary>
        );
      case Page.ADMIN:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado no Admin.', err?.message);
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
          >
            <AdminDashboard />
          </ErrorBoundary>
        );
      case Page.SETTINGS:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado em Settings.', err?.message);
              setTimeout(() => {
                setCurrentPage(Page.HOME);
                setSettingsTarget(null);
              }, 500);
            }}
          >
            <Settings
              onBack={() => {
                setCurrentPage(Page.HOME);
                setSettingsTarget(null);
              }}
              initialTab={settingsTarget?.tab}
              initialSubView={settingsTarget?.subView}
            />
          </ErrorBoundary>
        );
      case Page.SEARCH:
        return (
          <ErrorBoundary
            onError={(err) => {
              logger.warn('[LegacyApp] Crash mitigado em Search.', err?.message);
              setTimeout(() => {
                setCurrentPage(Page.HOME);
              }, 500);
            }}
          >
            <Search
              onSelectMedia={(m) => navigate(Page.DETAILS, m)}
              onPlayMedia={handlePlayMedia}
            />
          </ErrorBoundary>
        );
      case Page.DEBUG:
        return (
          <React.Suspense fallback={<LazyFallback />}>
            <DebugPage />
          </React.Suspense>
        );
      default:
        return (
          <Home
            movies={movies ?? []}
            series={series ?? []}
            trendingMovies={trendingMovies ?? []}
            trendingSeries={trendingSeries ?? []}
            seriesByGenre={(seriesByGenre ?? new Map()) as Map<HomeGenreLabel, Media[]>}
            catalogErrorMessage={catalogErrorMessage}
            usingCachedCatalog={usingCachedCatalog}
            onSelectMedia={(m) => navigate(Page.DETAILS, m)}
            onPlayMedia={handlePlayMedia}
            initialPlatform={urlPlatform}
          />
        );
    }
  };

  const pageContent = renderPage();
  // U2: Page transition — framer-motion fade entre trocas de página (sem flash branco)
  const wrappedPage = (
    <motion.div
      key={currentPage}
      className="w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeInOut' }}
    >
      <ErrorBoundary
        key={currentPage}
        onError={(error, errorInfo) => {
          logger.error(
            '[LegacyApp] Erro capturado:',
            error?.message,
            error?.stack,
            errorInfo?.componentStack
          );
          if (typeof window !== 'undefined') {
            window.__lastError = {
              error: String(error?.message),
              stack: error?.stack,
              componentStack: errorInfo?.componentStack,
            };
          }
        }}
        fallback={(_error: Error) => (
          <div className="redx-app-surface fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-white">
            <h2 className="text-xl font-bold mb-2">Erro na página</h2>
            <p className="text-white/60 text-sm text-center max-w-md mb-4">
              Ocorreu um erro ao carregar esta seção. Tente voltar ao início.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setCurrentPage(activeProfile?.isKids ? Page.KIDS : Page.HOME);
                }}
                className="px-6 py-3 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 transition-colors"
              >
                Voltar ao Início
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 transition-colors"
              >
                Recarregar
              </button>
            </div>
          </div>
        )}
      >
        {pageContent}
      </ErrorBoundary>
    </motion.div>
  );

  const backgroundClass = 'redx-background';
  const showNav = ![
    Page.LOGIN,
    Page.PLANS,
    Page.PROFILES,
    Page.PLAYER,
    Page.DETAILS,
    Page.ADMIN,
    Page.SETTINGS,
    Page.LIVE,
    Page.ADULTO,
  ].includes(currentPage);
  // TV Box fix: overflow no container raiz causa bug de compositor layer em Android WebView antigo,
  // fazendo o background aparecer sobre o card de login. Remover overflow em páginas fullscreen de auth.
  const isAuthFullscreen = [Page.LOGIN, Page.PROFILES, Page.PLANS].includes(currentPage);
  // normalizeRemoteKey importado de hooks/useRemoteControl — centralizado para todo o app

  const handleProfileClick = () => {
    persistProfile(null);
    setActiveProfile(null);
    resetProfileSelection();
    setProfileView('select');
    setCurrentPage(Page.PROFILES);
  };

  /* ══ RENDER MOBILE ════════════════════════════════════════════════════ */
  if (isMobile) {
    return (
      <MobileLayout
        currentPage={currentPage}
        onNavigate={navigate}
        activeProfile={activeProfile}
        showNav={showNav}
        onProfileClick={handleProfileClick}
      >
        {/* Loader e overlay de transição (reutilizados) */}
        <GlobalLoader
          isVisible={isNavigating && transitionMedia === null}
          message="Preparando conteúdo..."
        />
        {!FAKE_LOGIN_ENABLED && (
          <TitleTransitionOverlay
            title={transitionMedia?.title || null}
            media={transitionMedia}
            visible={transitionMedia !== null}
            onComplete={() => {
              if (detailsTransitionSafetyRef.current) {
                clearTimeout(detailsTransitionSafetyRef.current);
                detailsTransitionSafetyRef.current = null;
              }
              setIsNavigating(false);
              setTransitionMedia(null);
            }}
          />
        )}

        <div className={`${backgroundClass} w-full min-h-full text-white`}>
          <React.Suspense fallback={<LazyFallback />}>
            <AnimatePresence mode="wait" initial={false}>
              {wrappedPage}
            </AnimatePresence>
          </React.Suspense>
        </div>

        {/* Modal de saída (reutilizado) */}
        {showExitConfirm && (
          <div
            id="exit-confirm-modal"
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: 'rgba(10, 4, 26, 0.75)', backdropFilter: 'blur(12px)' }}
          >
            <div
              style={{
                background: 'linear-gradient(145deg, rgba(88,28,135,0.55), rgba(30,10,60,0.75))',
                backdropFilter: 'blur(48px)',
                border: '1px solid rgba(168,85,247,0.35)',
                borderRadius: '28px',
                padding: '32px 24px 24px',
                width: 'calc(100vw - 48px)',
                maxWidth: '320px',
              }}
            >
              <p className="text-xl font-black text-white mb-4 text-center">Sair do app?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '14px',
                    fontWeight: 700,
                    color: 'white',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  Não
                </button>
                <button
                  onClick={() => {
                    setShowExitConfirm(false);
                    setSignal('canExitApp', true);
                    CapApp.exitApp().catch(() => {});
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '14px',
                    fontWeight: 700,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                    border: '1px solid rgba(168,85,247,0.5)',
                  }}
                >
                  Sair
                </button>
              </div>
            </div>
          </div>
        )}
      </MobileLayout>
    );
  }

  /* ══ RENDER DESKTOP / TV (original — sem nenhuma mudança) ═════════════ */
  return (
    <div
      ref={scrollContainerRef}
      className={`${backgroundClass} relative min-h-screen w-full ${isAuthFullscreen ? '' : 'overflow-x-hidden overflow-y-auto'} flex flex-col items-center text-white`}
    >
      {/* Acessibilidade: skip link para teclado/leitores de tela */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[99999] focus:bg-purple-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:outline-none"
      >
        Pular para o conteúdo
      </a>
      {showNav && (
        <Sidebar
          currentPage={currentPage}
          onNavigate={navigate}
          activeProfile={activeProfile}
          user={user}
          onProfileClick={handleProfileClick}
          onProfileMenuSelect={(tab, subView) => {
            if (tab === 'switch-profile') {
              persistProfile(null);
              setActiveProfile(null);
              resetProfileSelection();
              setProfileView('select');
              setCurrentPage(Page.PROFILES);
              return;
            }
            setSettingsTarget({ tab, subView });
            setCurrentPage(Page.SETTINGS);
          }}
        />
      )}

      {/* Loader Global para transições suaves */}
      <GlobalLoader
        isVisible={isNavigating && transitionMedia === null}
        message="Preparando conteúdo..."
      />

      {/* Transição ao abrir detalhes: overlay chama onComplete quando a sequência termina (não usar timer fixo desalinhado). */}
      {!FAKE_LOGIN_ENABLED && (
        <TitleTransitionOverlay
          title={transitionMedia?.title || null}
          media={transitionMedia}
          visible={transitionMedia !== null}
          onComplete={() => {
            if (detailsTransitionSafetyRef.current) {
              clearTimeout(detailsTransitionSafetyRef.current);
              detailsTransitionSafetyRef.current = null;
            }
            setIsNavigating(false);
            setTransitionMedia(null);
          }}
        />
      )}

      <VinhetaGate
        active={pendingSectionPage === Page.MOVIES || pendingSectionPage === Page.SERIES}
        onComplete={completeSectionVinheta}
        onCancel={() => setPendingSectionPage(null)}
      />

      <main
        id="main-content"
        className={`w-full flex-1 flex flex-col items-center sidebar-content-offset ${[Page.LIVE, Page.DETAILS, Page.SETTINGS].includes(currentPage) ? 'p-0 pt-0' : 'p-0'}`}
      >
        <React.Suspense fallback={<LazyFallback />}>
          <AnimatePresence mode="wait" initial={false}>
            {wrappedPage}
          </AnimatePresence>
        </React.Suspense>
      </main>

      {showExitConfirm && (
        <div
          id="exit-confirm-modal"
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(10, 4, 26, 0.75)', backdropFilter: 'blur(12px)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-confirm-title"
        >
          <div
            data-nav-row={0}
            style={{
              background:
                'linear-gradient(145deg, rgba(88, 28, 135, 0.55) 0%, rgba(30, 10, 60, 0.75) 100%)',
              backdropFilter: 'blur(48px) saturate(180%)',
              WebkitBackdropFilter: 'blur(48px) saturate(180%)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.06) inset, 0 32px 80px rgba(0,0,0,0.55), 0 0 60px rgba(109,40,217,0.18)',
              borderRadius: '28px',
              padding: '36px 32px 28px',
              maxWidth: '360px',
              width: '90vw',
            }}
          >
            {/* Ícone */}
            <div className="flex justify-center mb-4">
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(168,85,247,0.18)',
                  border: '1px solid rgba(168,85,247,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(196,164,255,0.9)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </div>
            </div>

            <p
              id="exit-confirm-title"
              className="text-xl font-black text-white mb-2 text-center tracking-tight"
            >
              Sair do aplicativo?
            </p>

            <div className="flex gap-3">
              <button
                id="exit-btn-no"
                data-nav-item
                data-nav-col={0}
                onClick={() => {
                  playSelectSound();
                  setShowExitConfirm(false);
                }}
                onKeyDown={(e) => {
                  const key = normalizeRemoteKey(e);
                  if (key === 'Enter' || key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    playSelectSound();
                    setShowExitConfirm(false);
                  }
                  if (key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    playNavigateSound();
                    document.getElementById('exit-btn-yes')?.focus();
                  }
                  if (key === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                tabIndex={0}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '14px',
                  fontWeight: 700,
                  fontSize: '15px',
                  color: 'rgba(255,255,255,0.9)',
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.35)';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.6)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                }}
              >
                Não
              </button>
              <button
                id="exit-btn-yes"
                data-nav-item
                data-nav-col={1}
                onClick={() => {
                  playSelectSound();
                  setShowExitConfirm(false);
                  setSignal('canExitApp', true);
                  CapApp.exitApp().catch(() => {});
                }}
                onKeyDown={(e) => {
                  const key = normalizeRemoteKey(e);
                  if (key === 'Enter' || key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    playSelectSound();
                    setShowExitConfirm(false);
                    setSignal('canExitApp', true);
                    CapApp.exitApp().catch(() => {});
                  }
                  if (key === 'ArrowLeft') {
                    e.preventDefault();
                    e.stopPropagation();
                    playNavigateSound();
                    document.getElementById('exit-btn-no')?.focus();
                  }
                }}
                tabIndex={0}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '14px',
                  fontWeight: 700,
                  fontSize: '15px',
                  color: '#fff',
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                  border: '1px solid rgba(168,85,247,0.5)',
                  boxShadow: '0 4px 20px rgba(109,40,217,0.4)',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 28px rgba(109,40,217,0.65)';
                  e.currentTarget.style.filter = 'brightness(1.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(109,40,217,0.4)';
                  e.currentTarget.style.filter = '';
                }}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LegacyApp: React.FC = () => (
  <SpatialNavProvider>
    <LegacyAppInner />
  </SpatialNavProvider>
);

export default LegacyApp;
