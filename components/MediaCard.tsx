import React, { useState, useRef, useCallback, useEffect } from 'react';
import { setSignal } from '@/utils/appSignals';
import { Media } from '../types';
import { getMediaDetailsByID } from '@/services/tmdb';
import { getFetchOptions } from '@/services/tmdbKeys';
import { fetchWithTimeout, fetchDedup } from '@/utils/fetchUtils';
import tmdbSync from '@/services/tmdbSync';
import { userService } from '@/services/userService';
import { motion } from 'framer-motion';
import { Play, Plus, Check, Clock, Info } from 'lucide-react';
import { getMediaPoster, getMediaBackdrop, getMediaLogo } from '@/utils/mediaUtils';
import { getWatchProgress } from '@/utils/continueWatchingProgress';
import {
  cacheStatusGet,
  cacheStatusSet,
  cacheStatusUpdate,
  hasPrefetchedDetails,
  setPrefetchedDetails,
} from '@/utils/mediaCardCaches';
import LazyImage, { ERROR_SVG } from '@/components/LazyImage';
import { playNavigateSound, playSelectSound } from '@/utils/soundEffects';
import { useToast } from '@/contexts/ToastContext';

/** Limita prefetches concorrentes para não sobrecarregar TV Box fraco */
let _activePrefetches = 0;
const MAX_CONCURRENT_PREFETCHES = 3;

/** Verifica se o conteúdo foi adicionado nos últimos N dias */
function isRecentContent(media: Media, days = 14): boolean {
  const dateStr = media.created_at || media.release_date || media.first_air_date;
  if (!dateStr) return false;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= days;
  } catch {
    return false;
  }
}

/** Retorna badge de qualidade — campo declarado tem prioridade sobre heurística de URL */
function getQualityBadge(media: Media): 'HD' | '4K' | null {
  if (media.quality === '4K') return '4K';
  if (media.quality === 'FHD' || media.quality === 'HD') return 'HD';
  // Fallback heurístico para registros sem campo quality preenchido
  const url = String(media.stream_url || media.video_url || media.source_url || '').toLowerCase();
  if (url.includes('4k') || url.includes('2160')) return '4K';
  if (media.stream_url || media.video_url || media.source_url) return 'HD';
  return null;
}

/** Calcula porcentagem de match baseado no vote_average do TMDB.
 *  Só exibe para títulos realmente bons (≥7.5), evitando banalizar o badge. */
function getMatchPercentage(media: Media): { percent: number; color: string } | null {
  const rating = media.rating;
  if (typeof rating !== 'number' || isNaN(rating) || rating < 7.5) return null;
  const percent = Math.min(99, Math.round(rating * 10));
  const color = percent >= 85 ? 'text-green-400' : 'text-yellow-400';
  return { percent, color };
}

interface MediaCardProps {
  media: Media;
  onClick: () => void;
  onPlay?: () => void;
  size?: 'sm' | 'md' | 'lg';
  colIndex?: number;
  /** Desativa expansão no hover (ex: página Lista) */
  disableHover?: boolean;
  /** Permite promover só os primeiros cards realmente prioritários */
  eagerPoster?: boolean;
}

/**
 * Cache de módulo para checkStatus — evita 200+ queries Supabase no boot.
 * Chave: tmdb_id (number ou string). A entrada é invalidada quando o usuário
 * altera a lista (watchlist/watchLater) — toggleStatusCache() abaixo.
 */
/**
 * MediaCard — Netflix/Apple TV Style (TV Box Remote)
 * ════════════════════════════════════════════════════
 * Retraído: Poster vertical
 * Expandido (focus D-Pad ou hover): Backdrop + Logo + 4 botões glass
 * TV Box: Enter entra no modo botões, ← → navega, Enter executa, Back sai
 */
const MediaCard: React.FC<MediaCardProps> = React.memo(
  ({
    media,
    onClick,
    onPlay,
    size: _size = 'md',
    colIndex = 0,
    disableHover = false,
    eagerPoster,
  }) => {
    const { showToast } = useToast();
    const isInteractiveCard = !disableHover;
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [logoUrl, setLogoUrl] = useState<string | null>(getMediaLogo(media) || null);
    const [dynamicPosterUrl, setDynamicPosterUrl] = useState<string | null>(null);
    // isMuted/trailer states removidos — trailers desativados conforme PRD
    const [backdropLoaded, setBackdropLoaded] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    // Library states (Supabase)
    const [inWatchlist, setInWatchlist] = useState(false);
    const [inWatchLater, setInWatchLater] = useState(false);
    const [isTogglingList, setIsTogglingList] = useState(false);
    const [isTogglingLater, setIsTogglingLater] = useState(false);
    // TV Box: modo de navegação pelos botões internos
    const [buttonMode, setButtonMode] = useState(false);
    const [activeBtn, setActiveBtn] = useState(0);
    const hoverTimeoutRef = useRef<number | null>(null);
    const preloadTimeoutRef = useRef<number | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    const [expandsLeft, setExpandsLeft] = useState(false);

    // Total de botões: Assistir, Detalhes, Lista, Depois
    const TOTAL_BTNS = 4;

    // Check library status on mount — usa cache de módulo para evitar Supabase por card
    useEffect(() => {
      if (!isInteractiveCard) return;
      const tmdbId = media.tmdb_id || media.id;
      if (!tmdbId) return;
      const cached = cacheStatusGet(tmdbId);
      if (cached) {
        setInWatchlist(cached.inWatchlist);
        setInWatchLater(cached.inWatchLater);
        return;
      }
      userService
        .checkStatus(tmdbId)
        .then((status) => {
          cacheStatusSet(tmdbId, status);
          setInWatchlist(status.inWatchlist);
          setInWatchLater(status.inWatchLater);
        })
        .catch(() => {
          // checkStatus falhou (Supabase offline/lento) — assume não está na lista (estado neutro)
          // Não exibe toast para não spammar em falhas de rede temporárias
          cacheStatusSet(tmdbId, { inWatchlist: false, inWatchLater: false });
        });
    }, [isInteractiveCard, media.tmdb_id, media.id]);

    useEffect(() => {
      setLogoUrl(getMediaLogo(media) || null);
      setBackdropLoaded(false);
      setHasLoaded(false);
    }, [
      media.id,
      media.tmdb_id,
      media.logo_url,
      media.backdrop,
      media.poster,
      media.poster_path,
      media.backdrop_path,
    ]);

    // Toggle Watchlist
    const handleToggleWatchlist = useCallback(
      async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (isTogglingList) return;
        const tmdbId = media.tmdb_id || media.id;
        if (!tmdbId) return;
        setIsTogglingList(true);
        setInWatchlist((prev) => !prev); // optimistic
        try {
          const result = await userService.toggleLibraryItem(
            tmdbId,
            media.type === 'series' ? 'tv' : 'movie',
            'watchlist'
          );
          if (result === 'auth_required') {
            setInWatchlist((prev) => !prev);
          } else {
            const added = !inWatchlist;
            cacheStatusUpdate(tmdbId, 'inWatchlist', added);
            showToast(added ? 'Adicionado à Lista' : 'Removido da Lista', 'success', 2000);
          }
        } catch {
          setInWatchlist((prev) => !prev);
        } finally {
          setIsTogglingList(false);
        }
      },
      [media, isTogglingList, showToast]
    );

    // Toggle Watch Later
    const handleToggleWatchLater = useCallback(
      async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (isTogglingLater) return;
        const tmdbId = media.tmdb_id || media.id;
        if (!tmdbId) return;
        setIsTogglingLater(true);
        setInWatchLater((prev) => !prev); // optimistic
        try {
          const result = await userService.toggleLibraryItem(
            tmdbId,
            media.type === 'series' ? 'tv' : 'movie',
            'watch_later'
          );
          if (result === 'auth_required') {
            setInWatchLater((prev) => !prev);
          } else {
            const added = !inWatchLater;
            cacheStatusUpdate(tmdbId, 'inWatchLater', added);
            showToast(added ? 'Salvo para Depois' : 'Removido de Assistir Depois', 'success', 2000);
          }
        } catch {
          setInWatchLater((prev) => !prev);
        } finally {
          setIsTogglingLater(false);
        }
      },
      [media, isTogglingLater, showToast]
    );

    // Card ativo = hover (mouse) OU focus D-Pad — TV Box expande ao navegar com o controle
    const isActive = !disableHover && (isHovered || isFocused);
    const rawPoster = getMediaPoster(media);
    // Prioridade: poster dinâmico (TMDB) > poster do media > backdrop como último fallback
    const poster =
      dynamicPosterUrl ||
      rawPoster ||
      getMediaBackdrop(media) ||
      media.backdrop ||
      media.poster ||
      '';
    const shouldPosterLoadEagerly =
      eagerPoster ?? (isInteractiveCard && colIndex !== undefined && colIndex < 3);

    // Dimensões responsivas: escala baseada na resolução lógica da tela
    // 4K/Full HD ≥ 1920: 195px | 1280–1919: 180px | < 1280 (TV Box 720p): 167px
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const cardWidth = screenW >= 1920 ? 195 : screenW >= 1280 ? 180 : 167;
    const cardHeight = Math.round((cardWidth * 250) / 167); // mantém proporção original
    const expandedWidth = Math.round((cardHeight * 16) / 9);

    // ─── Preload: Logo + Backdrop ───────────────────────
    const preloadContent = useCallback(async () => {
      if (hasLoaded) return;
      try {
        let tmdbId = media.tmdb_id && media.tmdb_id > 0 ? media.tmdb_id : null;

        // Se não tem tmdb_id, buscar pelo título no TMDB (com deduplication)
        if (!tmdbId && media.title) {
          const searchType = media.type === 'series' ? 'tv' : 'movie';
          const dedupKey = `tmdb-search-${searchType}-${media.title}`;
          const searchRes = await fetchDedup(dedupKey, () =>
            fetchWithTimeout(
              `https://api.themoviedb.org/3/search/${searchType}?query=${encodeURIComponent(media.title)}&language=pt-BR`,
              getFetchOptions(),
              8_000
            )
          );
          const searchData = await (searchRes as Response).json();
          if (searchData.results && searchData.results.length > 0) {
            tmdbId = searchData.results[0].id;
          }
        }

        if (!tmdbId) {
          setHasLoaded(true);
          return;
        }

        // Auto-Cura: se o ID falhar, tmdbSync corrige no banco automaticamente
        const details =
          (await tmdbSync.getOrFixDetails(
            { ...media, tmdb_id: tmdbId },
            media.type === 'series' ? 'tv' : 'movie'
          )) || (await getMediaDetailsByID(tmdbId, media.type));
        setHasLoaded(true);
        if (!details) return;

        if (details.logo) setLogoUrl(getMediaLogo({ logo_url: details.logo }) || details.logo);
        // Poster oficial TMDB sempre tem prioridade sobre qualquer URL do banco
        if (details.poster) setDynamicPosterUrl(details.poster);
      } catch {
        setHasLoaded(true);
      }
    }, [media.tmdb_id, media.type, media.title, hasLoaded]);

    // Ref para garantir acesso à versão mais recente de preloadContent sem re-criar o observer
    const preloadRef = useRef(preloadContent);
    useEffect(() => {
      preloadRef.current = preloadContent;
    }, [preloadContent]);

    // Busca poster e logo via TMDB ao montar — logo precisa de fetch mesmo quando poster_path já existe
    useEffect(() => {
      if (!isInteractiveCard) return;
      if (!media.tmdb_id) return;
      const el = cardRef.current;
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            observer.disconnect();
            preloadRef.current();
          }
        },
        { rootMargin: '200px' }
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, [isInteractiveCard, media.id, media.tmdb_id]);

    const handleMouseEnter = useCallback(() => {
      if (disableHover) return;
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setExpandsLeft(rect.left + expandedWidth > window.innerWidth - 16);
      }
      if (preloadTimeoutRef.current) clearTimeout(preloadTimeoutRef.current);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      preloadTimeoutRef.current = window.setTimeout(() => {
        preloadTimeoutRef.current = null;
        preloadContent();
      }, 150);
      hoverTimeoutRef.current = window.setTimeout(() => {
        hoverTimeoutRef.current = null;
        setIsHovered(true);
        preloadContent();
      }, 200);
    }, [preloadContent, disableHover]);

    const handleMouseLeave = useCallback(() => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
        preloadTimeoutRef.current = null;
      }
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      setIsHovered(false);
      setButtonMode(false);
      setActiveBtn(0);
    }, []);

    // Prefetch on focus — debounced 500ms fetch para carregar detalhes antecipadamente
    const prefetchTimerRef = useRef<number | null>(null);

    const handleFocus = useCallback(() => {
      setIsFocused(true);
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setExpandsLeft(rect.left + expandedWidth > window.innerWidth - 16);
      }
      if (disableHover) return;
      preloadContent();

      // Prefetch detalhes via requestIdleCallback (não bloqueia input no D-pad)
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      const doPrefetch = () => {
        const tmdbId = media.tmdb_id || media.id;
        if (
          !tmdbId ||
          hasPrefetchedDetails(tmdbId) ||
          _activePrefetches >= MAX_CONCURRENT_PREFETCHES
        )
          return;
        _activePrefetches++;
        getMediaDetailsByID(Number(tmdbId), media.type)
          .then((details) => {
            if (details) setPrefetchedDetails(tmdbId, details);
          })
          .catch(() => {})
          .finally(() => {
            _activePrefetches--;
          });
      };
      if (typeof window.requestIdleCallback === 'function') {
        prefetchTimerRef.current = window.requestIdleCallback(doPrefetch, {
          timeout: 1000,
        }) as unknown as number;
      } else {
        prefetchTimerRef.current = window.setTimeout(doPrefetch, 500);
      }
    }, [preloadContent, disableHover, media.tmdb_id, media.id, media.type]);

    const handleBlur = useCallback(() => {
      setIsFocused(false);
      setButtonMode(false);
      setActiveBtn(0);
      setSignal('modalKeyTrap', false);
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
    }, []);

    // ─── Navegação ─────────────────────────────────────────────────
    const goToWatch = useCallback(
      (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (onPlay) {
          onPlay();
          return;
        }
        // Rota /watch não existe — fallback para Details (onClick)
        onClick();
      },
      [onClick, onPlay]
    );

    const goToDetails = useCallback(
      (e?: React.MouseEvent) => {
        e?.stopPropagation();
        onClick();
      },
      [onClick]
    );

    // Executar ação do botão ativo
    const executeButton = useCallback(
      (idx: number) => {
        playSelectSound();
        switch (idx) {
          case 0:
            goToWatch();
            break; // Assistir
          case 1:
            goToDetails();
            break; // Detalhes
          case 2:
            handleToggleWatchlist();
            break; // Lista
          case 3:
            handleToggleWatchLater();
            break; // Depois
        }
      },
      [goToWatch, goToDetails, handleToggleWatchlist, handleToggleWatchLater]
    );

    // ─── Controle Remoto D-Pad ─────────────────────────────────────
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (buttonMode) {
          // Modo botões: ← → navega entre botões, Enter executa, Back sai
          switch (e.key) {
            case 'ArrowLeft':
              e.preventDefault();
              e.stopPropagation();
              playNavigateSound();
              setActiveBtn((prev) => Math.max(0, prev - 1));
              break;
            case 'ArrowRight':
              e.preventDefault();
              e.stopPropagation();
              playNavigateSound();
              setActiveBtn((prev) => Math.min(TOTAL_BTNS - 1, prev + 1));
              break;
            case 'ArrowUp':
            case 'ArrowDown':
              // Sai do modo botões — previne default para evitar scroll do browser,
              // mas NÃO chama stopPropagation para que o spatial nav mova o foco
              e.preventDefault();
              setButtonMode(false);
              setActiveBtn(0);
              setSignal('modalKeyTrap', false);
              return;
            case 'Enter':
              e.preventDefault();
              e.stopPropagation();
              executeButton(activeBtn);
              break;
            case 'Escape':
            case 'Backspace':
              e.preventDefault();
              e.stopPropagation();
              setButtonMode(false);
              setActiveBtn(0);
              setSignal('modalKeyTrap', false);
              break;
          }
        } else {
          // Modo normal: Enter entra no modo botões (1º Enter = abre opções, 2º Enter = executa)
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            setButtonMode(true);
            setSignal('modalKeyTrap', true);
          }
        }
      },
      [buttonMode, activeBtn, executeButton]
    );

    // Cleanup
    useEffect(() => {
      return () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      };
    }, []);

    // Pre-compute NOVO badge, match percentage e quality badge
    const isNew = isRecentContent(media);
    const matchInfo = getMatchPercentage(media);
    const qualityBadge = getQualityBadge(media);
    const titleSafe = (media.title || 'Conteúdo').trim() || 'Conteúdo';
    const kindLabel =
      media.type === 'series' ? 'Série' : media.type === 'movie' ? 'Filme' : 'Título';

    return (
      <div
        ref={cardRef}
        className={`relative shrink-0 focus-visible:outline-none ${isActive ? 'z-50' : ''}`}
        style={{
          width: isActive ? `${expandedWidth}px` : `${cardWidth}px`,
          height: `${cardHeight}px`,
          /* transition:all anima TODAS as propriedades CSS — causa reflow+paint em
           * cada mudança de estado no TV Box. Usar só as propriedades necessárias. */
          transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          transformOrigin: 'top left',
        }}
        tabIndex={0}
        role="button"
        aria-label={`${kindLabel}: ${titleSafe}. Pressione Enter para abrir.`}
        data-testid="media-card"
        data-nav-item
        data-nav-media-card
        data-nav-custom-focus
        data-nav-col={colIndex}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {/* motion.div com layout prop media getBoundingClientRect() em TODOS os cards
         * a cada render — substituído por div com transition CSS puro que é O(1)  */}
        <div
          className={`absolute top-0 h-full bg-[#16161e] rounded-2xl overflow-hidden cursor-pointer
          ${isActive ? 'z-50' : ''}`}
          style={{
            width: isActive ? expandedWidth : cardWidth,
            height: cardHeight,
            transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            left: expandsLeft ? 'auto' : 0,
            right: expandsLeft ? 0 : 'auto',
          }}
          onClick={onClick}
        >
          {/* ═══ POSTER visionOS (Estado Retraído) ═══ */}
          <div
            className={`absolute inset-0 transition-opacity duration-500 ${isActive && backdropLoaded ? 'opacity-0' : 'opacity-100'}`}
          >
            {/* Glass frame container */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              {poster ? (
                <LazyImage
                  src={poster}
                  alt={media.title}
                  className="absolute inset-0 w-full h-full"
                  fallbackSrc={ERROR_SVG}
                  showSkeleton={true}
                  objectFit="cover"
                  eager={shouldPosterLoadEagerly}
                />
              ) : (
                <div className="absolute inset-0 skeleton-shimmer-netflix rounded-2xl" />
              )}
              {/* NOVO badge — conteúdo recente (últimos 14 dias) */}
              {isNew && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className="absolute top-2 left-2 z-20 px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-black uppercase tracking-wider novo-badge-glow"
                >
                  NOVO
                </motion.div>
              )}

              {/* Match percentage + quality badge — canto superior direito */}
              <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-0.5">
                {matchInfo && (
                  <span className={`text-[9px] font-black ${matchInfo.color}`}>
                    {matchInfo.percent}% Match
                  </span>
                )}
                {qualityBadge && (
                  <span className="px-1 py-0.5 rounded bg-black/70 border border-white/20 text-white text-[7px] font-bold uppercase tracking-wide">
                    {qualityBadge}
                  </span>
                )}
              </div>

              {/* Gradiente mínimo na base — poster totalmente visível */}
              <div className="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />

              <div
                className={`absolute inset-x-0 ${isFocused ? 'bottom-2.5 px-2.5' : 'bottom-3 px-4'} pointer-events-none z-10`}
              >
                {isFocused && (
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/55 to-transparent pointer-events-none -z-10" />
                )}
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className={`${isFocused ? 'max-h-8' : 'max-h-7'} w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]`}
                  />
                ) : (
                  <span
                    className={`block max-w-[92%] font-black uppercase leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] ${
                      isFocused ? 'text-[9px]' : 'text-[8px]'
                    }`}
                  >
                    {titleSafe}
                  </span>
                )}
              </div>
            </div>
            {/* F5: Progress bar — conteúdo parcialmente assistido */}
            {(() => {
              const wp = getWatchProgress(media.tmdb_id || media.id);
              return wp > 0 ? (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 z-20 rounded-b-2xl overflow-hidden pointer-events-none">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${wp}%`,
                      background: 'linear-gradient(90deg, #a855f7, #7c3aed)',
                    }}
                  />
                </div>
              ) : null;
            })()}
            {/* Borda sutil — sem sombra/glow */}
            <div className="absolute inset-0 rounded-2xl border border-white/6 pointer-events-none" />
          </div>

          {/* ═══ EXPANDIDO (Focus/Hover) — Estilo Cinematic ═══
           * AnimatePresence + motion.div removidos: Framer Motion rodava getBoundingClientRect
           * + JS animation loop em todos os cards focados. Substituído por CSS opacity
           * transition — executado pelo compositor do browser sem bloquear a thread JS. */}
          {isActive && (
            <div
              className="absolute inset-0 flex flex-col justify-end rounded-2xl"
              style={{ animation: 'fade-in 180ms ease forwards' }}
            >
              {/* ── FUNDO: backdrop/poster do título ── */}
              <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#0a0a0c]">
                {poster && (
                  <img
                    src={poster}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setBackdropLoaded(true)}
                    onError={() => setBackdropLoaded(true)}
                  />
                )}
                {/* Gradiente mínimo — legibilidade do texto sem cobrir a imagem */}
                <div className="absolute inset-0 bg-linear-to-t from-black/45 via-black/10 to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-0 bg-linear-to-r from-black/25 to-transparent z-10 pointer-events-none" />
              </div>

              <div className="relative z-30 p-3 pb-2.5 flex flex-col justify-end gap-2">
                {/* Logo do filme — cai para título quando a logo não vier do TMDB */}
                <div className="flex items-end mb-0.5 min-h-[32px]">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="max-h-8 max-w-[55%] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-[11px] font-black uppercase leading-tight text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] line-clamp-2">
                      {titleSafe}
                    </span>
                  )}
                </div>

                {/* Botões de ação — glass transparente com backdrop-blur */}
                <div className="flex items-center gap-1.5">
                  {/* ▶ ASSISTIR — glass com borda branca */}
                  <button
                    onClick={goToWatch}
                    tabIndex={-1}
                    className={`py-1.5 px-3 rounded-lg text-white font-bold uppercase tracking-wider text-[9px]
                      flex items-center gap-1.5
                      transition-[background-color,border-color,transform] duration-150 ease-out
                      ${
                        buttonMode && activeBtn === 0
                          ? 'border-2 border-white shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                          : 'border border-white/60'
                      }`}
                    style={{
                      backgroundColor:
                        buttonMode && activeBtn === 0
                          ? 'rgba(255,255,255,0.25)'
                          : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    <Play size={10} fill="currentColor" /> Assistir
                  </button>

                  {/* Detalhes — glass pill */}
                  <button
                    onClick={goToDetails}
                    tabIndex={-1}
                    className={`py-1.5 px-2.5 rounded-lg text-white font-bold uppercase tracking-wider text-[9px]
                      flex items-center gap-1
                      transition-[background-color,border-color,transform] duration-150 ease-out
                      ${
                        buttonMode && activeBtn === 1
                          ? 'border-2 border-white scale-105 shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                          : 'border border-transparent'
                      }`}
                    style={{
                      backgroundColor:
                        buttonMode && activeBtn === 1
                          ? 'rgba(255,255,255,0.25)'
                          : 'rgba(255,255,255,0.08)',
                    }}
                    title="Detalhes"
                  >
                    <Info size={10} strokeWidth={2.5} /> Detalhes
                  </button>

                  {/* Minha Lista — glass pill (toggle) */}
                  <button
                    onClick={handleToggleWatchlist}
                    tabIndex={-1}
                    className={`py-1.5 px-2.5 rounded-lg font-bold uppercase tracking-wider text-[9px]
                      flex items-center gap-1
                      transition-[background-color,border-color,transform] duration-150 ease-out
                      ${
                        buttonMode && activeBtn === 2
                          ? 'border-2 border-white scale-105 shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                          : 'border border-transparent'
                      }
                      ${inWatchlist ? 'text-green-400' : 'text-white'}`}
                    style={{
                      backgroundColor:
                        buttonMode && activeBtn === 2
                          ? 'rgba(255,255,255,0.25)'
                          : inWatchlist
                            ? 'rgba(34,197,94,0.15)'
                            : 'rgba(255,255,255,0.08)',
                    }}
                    title={inWatchlist ? 'Remover da Lista' : 'Minha Lista'}
                  >
                    {inWatchlist ? (
                      <Check size={10} strokeWidth={2.5} />
                    ) : (
                      <Plus size={10} strokeWidth={2.5} />
                    )}
                    {inWatchlist ? 'Na Lista' : 'Lista'}
                  </button>

                  {/* Assistir Depois — glass pill (toggle) */}
                  <button
                    onClick={handleToggleWatchLater}
                    tabIndex={-1}
                    className={`py-1.5 px-2.5 rounded-lg font-bold uppercase tracking-wider text-[9px]
                      flex items-center gap-1
                      transition-[background-color,border-color,transform] duration-150 ease-out
                      ${
                        buttonMode && activeBtn === 3
                          ? 'border-2 border-white scale-105 shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                          : 'border border-transparent'
                      }
                      ${inWatchLater ? 'text-blue-400' : 'text-white'}`}
                    style={{
                      backgroundColor:
                        buttonMode && activeBtn === 3
                          ? 'rgba(255,255,255,0.25)'
                          : inWatchLater
                            ? 'rgba(59,130,246,0.15)'
                            : 'rgba(255,255,255,0.08)',
                    }}
                    title={inWatchLater ? 'Remover' : 'Ver Depois'}
                  >
                    <Clock size={10} strokeWidth={2.5} />
                    {inWatchLater ? 'Salvo' : 'Depois'}
                  </button>
                </div>

                {/* Dica de navegação (TV Box) — aparece no modo botões */}
                {buttonMode && (
                  <div className="text-center mt-0.5">
                    <span className="text-[7px] text-white/30 font-bold uppercase tracking-[0.2em]">
                      ← → navegar · OK selecionar · VOLTAR sair
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Foco — linha branca fina e sólida, sem glow/sombra */}
        {isFocused && (
          <div
            className="absolute pointer-events-none z-50"
            style={{
              inset: '0px',
              borderRadius: '1rem',
              border: '3px solid rgba(168, 85, 247, 0.8)',
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
            }}
          />
        )}
      </div>
    );
  }
);

MediaCard.displayName = 'MediaCard';
export default MediaCard;
