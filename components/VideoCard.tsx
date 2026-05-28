import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Media } from '../types';
import { Play, Info, Plus, Check, Star, Monitor } from 'lucide-react';
import { getMediaPoster, getMediaDuration } from '@/utils/mediaUtils';
import LazyImage, { ERROR_SVG } from '@/components/LazyImage';
import { userService } from '@/services/userService';
import ActionModal from './ActionModal';

/**
 * VideoCard — Card otimizado para TV (Tela Grande)
 * ══════════════════════════════════════════════════════════
 * Layout:
 *   - 16:9 (landscape 400x225) ou 2:3 (portrait 240x360)
 *   - Thumbnail com img único (sem overlay)
 *   - Hover: scale(1.05), elevation
 *   - Focus (D-pad): hairline branco 0.5px (global index.css)
 *   - Badge: qualidade (HD/4K/Dolby), duração, classificação
 *   - Progress bar se já assistido
 *   - Fade-in ao carregar
 *   - Skeleton enquanto carrega
 *
 * Estados: Default → Hover → Focus → Loading → Error
 * Otimizado para DOM leve (sem framer-motion)
 */

// ═══════════════════════════════════════════════════════
// CONSTANTES E HELPERS
// ═══════════════════════════════════════════════════════

const CARD_SIZES = {
  portrait: { width: 240, height: 360, aspect: '2/3' },
  landscape: { width: 640, height: 360, aspect: '16/9' },
} as const;

type CardLayout = 'portrait' | 'landscape';

/** Badge de qualidade baseado em metadados */
function getQualityBadge(media: Media): { label: string; color: string } | null {
  const streamUrl = media.stream_url || '';
  const title = (media.title || '').toLowerCase();

  if (
    streamUrl.includes('4k') ||
    streamUrl.includes('2160') ||
    title.includes('4k') ||
    title.includes('uhd')
  ) {
    return { label: '4K', color: '#a855f7' };
  }
  if (streamUrl.includes('1080') || streamUrl.includes('fhd')) {
    return { label: 'FHD', color: '#22c55e' };
  }
  if (streamUrl.includes('dolby') || title.includes('dolby')) {
    return { label: 'Dolby', color: '#3b82f6' };
  }
  // Se tem stream_url, presumir HD
  if (media.stream_url) {
    return { label: 'HD', color: '#eab308' };
  }
  return null;
}

/** Formata rating para exibição */
function formatRating(rating: number | string | undefined): string | null {
  if (!rating) return null;
  const num = typeof rating === 'string' ? parseFloat(rating) : rating;
  if (isNaN(num) || num <= 0) return null;
  return num.toFixed(1);
}

/** Cores por classificação etária */
function getRatingColor(rating: string | number | undefined): string {
  const r = String(rating || '').toUpperCase();
  if (r.includes('18') || r === 'R') return '#ef4444';
  if (r.includes('16')) return '#f97316';
  if (r.includes('14')) return '#eab308';
  if (r.includes('12') || r.includes('10')) return '#22c55e';
  if (r === 'L' || r === 'G' || r.includes('LIVRE')) return '#3b82f6';
  return '#6b7280';
}

// ═══════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════

interface VideoCardProps {
  media: Media;
  onClick: () => void;
  onPlay?: () => void;
  /** 'portrait' (2:3) ou 'landscape' (16:9) */
  layout?: CardLayout;
  /** Índice de coluna para navegação D-pad */
  colIndex?: number;
  /** Índice de linha para navegação D-pad */
  rowIndex?: number;
  /** Progresso assistido [0..1] */
  progress?: number;
  /** Largura customizada (px) */
  width?: number;
  /** Altura customizada (px) */
  height?: number;
  /** Índice no grid (para animação staggered) */
  index?: number;
  /** Estilo inline */
  style?: React.CSSProperties;
}

const VideoCard: React.FC<VideoCardProps> = React.memo(
  ({
    media,
    onClick,
    onPlay,
    layout = 'portrait',
    colIndex = 0,
    rowIndex,
    progress,
    width,
    height,
    index = 0,
    style,
  }) => {
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [inWatchlist, setInWatchlist] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const cardSize = CARD_SIZES[layout];
    const cardW = width || cardSize.width;
    const cardH = height || cardSize.height;

    const poster = useMemo(() => getMediaPoster(media), [media]);
    const qualityBadge = useMemo(() => getQualityBadge(media), [media]);
    const displayRating = useMemo(() => formatRating(media.rating), [media.rating]);
    const durationText = useMemo(() => getMediaDuration(media), [media]);
    const ratingColor = useMemo(() => getRatingColor(media.rating), [media.rating]);

    // ── Verificar watchlist no mount ──
    useEffect(() => {
      const tmdbId = media.tmdb_id || media.id;
      if (tmdbId) {
        userService
          .checkStatus(tmdbId)
          .then((status) => {
            setInWatchlist(status.inWatchlist);
          })
          .catch(() => {});
      }
    }, [media.tmdb_id, media.id]);

    // ── Handlers ──
    const handleFocus = useCallback(() => setIsFocused(true), []);
    const handleBlur = useCallback(() => setIsFocused(false), []);
    const handleMouseEnter = useCallback(() => setIsHovered(true), []);
    const handleMouseLeave = useCallback(() => setIsHovered(false), []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        setShowModal(true);
      }
    }, []);

    const handleModalClose = useCallback(() => {
      setShowModal(false);
      setTimeout(() => cardRef.current?.focus(), 50);
    }, []);

    const handlePlayClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onPlay) onPlay();
        else onClick();
      },
      [onPlay, onClick]
    );

    const isActive = isHovered; // Foco via controle remoto usa borda branca, não escala/glow

    // Animação staggered fade-in
    const enterDelay = Math.min(index * 40, 600);

    return (
      <>
        <div
          ref={cardRef}
          className="video-card relative flex-shrink-0 outline-none cursor-pointer group"
          style={{
            width: `${cardW}px`,
            height: `${cardH}px`,
            animationDelay: `${enterDelay}ms`,
            ...style,
          }}
          tabIndex={0}
          data-nav-item
          data-nav-col={colIndex}
          {...(rowIndex !== undefined ? { 'data-nav-row': rowIndex } : {})}
          onClick={(e) => {
            if ((e.nativeEvent as any).pointerType === '' && e.clientX === 0 && e.clientY === 0)
              return;
            onClick();
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onKeyDown={handleKeyDown}
          role="button"
          aria-label={`${media.title} — ${media.type === 'series' ? 'Série' : 'Filme'}`}
        >
          {/* ═══ CARD BODY ═══ */}
          <div
            className={`
            absolute inset-0 rounded-2xl overflow-hidden
            transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
            ${
              isActive
                ? 'scale-105 shadow-[0_16px_48px_rgba(0,0,0,0.8)] z-40'
                : 'scale-100 shadow-none z-10'
            }
          `}
          >
            {/* ── Thumbnail — LazyImage com placeholder e fallback proxy ── */}
            {(layout === 'landscape' ? media.backdrop || poster : poster) ? (
              <LazyImage
                src={layout === 'landscape' ? media.backdrop || poster || '' : poster}
                alt={media.title}
                className="absolute inset-0 w-full h-full"
                fallbackSrc={ERROR_SVG}
                showSkeleton={true}
                objectFit="cover"
                eager={colIndex !== undefined && colIndex < 2}
                imageType={layout === 'landscape' ? 'backdrop' : 'poster'}
                width={cardW}
                height={cardH}
                sizes={`${cardW}px`}
              />
            ) : (
              <div className="absolute inset-0 bg-[#16161e] flex items-center justify-center">
                <div className="w-16 h-20 rounded-lg bg-white/5 animate-pulse" />
              </div>
            )}

            {/* ── Gradiente mínimo na base — poster/backdrop totalmente visível ── */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />

            {/* ── Glass border premium ── */}
            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.08] pointer-events-none" />

            {/* ═══ TOP BADGES ═══ */}
            <div className="absolute top-0 inset-x-0 p-2.5 flex justify-between items-start pointer-events-none z-20">
              {/* Qualidade */}
              <div className="flex gap-1.5">
                {qualityBadge && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider backdrop-blur-md border"
                    style={{
                      backgroundColor: `${qualityBadge.color}20`,
                      borderColor: `${qualityBadge.color}40`,
                      color: qualityBadge.color,
                    }}
                  >
                    {qualityBadge.label}
                  </span>
                )}
                {media.stream_url && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider
                  bg-green-500/15 border border-green-500/30 text-green-400 backdrop-blur-md flex items-center gap-0.5"
                  >
                    <Monitor className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">Stream</span>
                  </span>
                )}
              </div>

              {/* Classificação etária */}
              {media.rating && String(media.rating).match(/^(L|10|12|14|16|18|R|G|PG)/i) && (
                <span
                  className="w-6 h-6 rounded-md text-[9px] font-black flex items-center justify-center backdrop-blur-md border"
                  style={{
                    backgroundColor: `${ratingColor}25`,
                    borderColor: `${ratingColor}50`,
                    color: ratingColor,
                  }}
                >
                  {String(media.rating).replace('+', '')}
                </span>
              )}
            </div>

            {/* ═══ BOTTOM INFO ═══ */}
            <div className="absolute bottom-0 inset-x-0 p-3 z-20">
              {/* Título */}
              <h3
                className={`font-bold text-white line-clamp-2 leading-tight drop-shadow-lg mb-1 transition-all duration-300 ${
                  layout === 'landscape' ? 'text-sm' : 'text-[13px]'
                }`}
              >
                {media.title}
              </h3>

              {/* Metadados */}
              <div className="flex items-center gap-2 text-[10px] text-white/50 font-medium">
                {media.year && <span>{media.year}</span>}
                {displayRating && (
                  <span className="flex items-center gap-0.5 text-yellow-400/80">
                    <Star className="w-2.5 h-2.5" fill="currentColor" />
                    {displayRating}
                  </span>
                )}
                <span className="text-white/30">{durationText}</span>
              </div>

              {/* ── Hover Overlay — ações rápidas ── */}
              <div
                className={`flex items-center gap-2 mt-2 transition-all duration-300 ${
                  isActive
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2 pointer-events-none'
                }`}
              >
                <button
                  onClick={handlePlayClick}
                  className="flex-1 py-1.5 px-3 rounded-xl bg-white/90 text-black text-[11px] font-bold
                  flex items-center justify-center gap-1.5
                  hover:bg-white active:scale-95 transition-all duration-200
                  focus:outline-none focus:ring-[0.5px] focus:ring-white focus:ring-offset-0
                  pointer-events-auto"
                  tabIndex={-1}
                >
                  <Play className="w-3.5 h-3.5" fill="black" />
                  Assistir
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                  className="w-8 h-8 rounded-full bg-white/10 border border-white/20
                  flex items-center justify-center
                  hover:bg-white/25 active:scale-90 transition-all duration-200
                  focus:outline-none focus:ring-[0.5px] focus:ring-white focus:ring-offset-0
                  pointer-events-auto"
                  tabIndex={-1}
                  title="Detalhes"
                >
                  <Info className="w-3.5 h-3.5 text-white/80" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className={`w-8 h-8 rounded-full border flex items-center justify-center
                  active:scale-90 transition-all duration-200
                  focus:outline-none focus:ring-[0.5px] focus:ring-white focus:ring-offset-0
                  pointer-events-auto ${
                    inWatchlist
                      ? 'bg-green-500/25 border-green-400/40 text-green-400'
                      : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/25'
                  }`}
                  tabIndex={-1}
                  title={inWatchlist ? 'Na Lista' : 'Minha Lista'}
                >
                  {inWatchlist ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* ═══ DURATION BADGE ═══ */}
            {durationText && !isActive && (
              <div className="absolute bottom-3 right-3 z-20 pointer-events-none">
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white/60 bg-black/50 backdrop-blur-sm">
                  {durationText}
                </span>
              </div>
            )}

            {/* ═══ PROGRESS BAR ═══ */}
            {progress !== undefined && progress > 0 && (
              <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-30">
                <div
                  className="h-full bg-[#A855F7] rounded-r-full transition-all duration-500"
                  style={{ width: `${Math.min(100, progress * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Focus Ring FORA do overflow-hidden — linha branca sólida, sem glow/sombra */}
          {isFocused && (
            <div
              className="absolute pointer-events-none z-50"
              style={{
                inset: '0px',
                borderRadius: '1rem',
                border: '2.5px solid #ffffff',
              }}
            />
          )}
        </div>

        {/* Modal de ações via Enter (TV Box) */}
        <ActionModal
          media={media}
          isOpen={showModal}
          onClose={handleModalClose}
          onSelect={onClick}
          onPlay={onPlay}
        />
      </>
    );
  }
);

VideoCard.displayName = 'VideoCard';
export default VideoCard;

// ═══════════════════════════════════════════════════════
// SKELETON — Para usar em loading states
// ═══════════════════════════════════════════════════════

interface VideoCardSkeletonProps {
  layout?: CardLayout;
  width?: number;
  height?: number;
}

export const VideoCardSkeleton: React.FC<VideoCardSkeletonProps> = React.memo(
  ({ layout = 'portrait', width, height }) => {
    const cardSize = CARD_SIZES[layout];
    const w = width || cardSize.width;
    const h = height || cardSize.height;

    return (
      <div
        className="flex-shrink-0 rounded-2xl overflow-hidden bg-white/[0.03] animate-pulse"
        style={{ width: `${w}px`, height: `${h}px` }}
      >
        {/* Thumbnail skeleton */}
        <div className="w-full h-3/4 bg-gradient-to-b from-white/[0.03] to-white/[0.06]" />
        {/* Text skeleton */}
        <div className="p-3 space-y-2">
          <div className="h-3 bg-white/[0.06] rounded-full w-3/4" />
          <div className="h-2 bg-white/[0.04] rounded-full w-1/2" />
        </div>
      </div>
    );
  }
);

VideoCardSkeleton.displayName = 'VideoCardSkeleton';
