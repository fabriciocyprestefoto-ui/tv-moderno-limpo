import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setSignal } from '../utils/appSignals';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Check,
  Clock3,
  Film,
  Globe,
  Play,
  Plus,
  Clock,
  Star,
  Users,
} from 'lucide-react';
import { Media, SeriesDetail } from '../types';
import {
  fetchMovieDetail,
  getHorizontalCardLogo,
  getImageUrl,
  pickLogoEnPtOrNull,
} from '../services/tmdb';
import { getMovieByTmdbId } from '../services/supabaseService';
import { logger } from '../utils/logger';
import {
  getMediaBackdrop,
  getMediaPoster,
  getMediaLogo,
  hasRequiredTmdbImages,
  isRecentMedia,
} from '../utils/mediaUtils';
import { playBackSound, playSelectSound } from '../utils/soundEffects';
import { userService } from '../services/userService';
import { useSpatialNav } from '../hooks/useSpatialNavigation';

interface MovieDetailsProps {
  media: Media;
  onPlay: (media?: Media) => void;
  onBack: () => void;
  onSelectMedia?: (media: Media) => void;
}

const getYear = (value?: string | number): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim().length >= 4) return value.trim().slice(0, 4);
  return null;
};

const formatRuntime = (minutes?: number): string | null => {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins} min`;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
};

const normalizeVote = (value?: number | string): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(1);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed.toFixed(1);
  }
  return null;
};

const extractPlayableUrl = (item?: Record<string, unknown> | null): string => {
  if (!item) return '';
  const candidates = [
    item.stream_url,
    item.video_url,
    item.videoUrl,
    item.source_url,
    item.url,
    item.link,
  ];
  for (const v of candidates) {
    if (typeof v !== 'string') continue;
    const c = v.trim();
    if (c.length <= 5 || c.includes('undefined') || c.includes('null')) continue;
    return c;
  }
  return '';
};

const resolveCatalogLogo = (
  context: Partial<Media> | null | undefined,
  ...candidates: Array<string | null | undefined>
): string => {
  for (const candidate of candidates) {
    const logo = getMediaLogo({ ...(context || {}), logo_url: candidate });
    if (logo) return logo;
  }
  return '';
};

const RecommendationLogo: React.FC<{
  tmdbId: number;
  mediaType: 'movie' | 'series';
  fallbackTitle: string;
}> = ({ tmdbId, mediaType, fallbackTitle }) => {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      setLogo(null);
      return;
    }

    let cancelled = false;
    getHorizontalCardLogo(tmdbId, mediaType)
      .then((value: string | undefined) => {
        if (cancelled) return;
        setLogo(value || null);
      })
      .catch(() => {
        if (!cancelled) setLogo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [tmdbId, mediaType]);

  if (logo) {
    return (
      <img
        src={logo}
        alt={fallbackTitle}
        className="h-10 max-w-[80%] object-contain object-left drop-shadow-[0_8px_18px_rgba(0,0,0,0.8)]"
        loading="lazy"
      />
    );
  }

  return <h3 className="text-sm font-bold text-white line-clamp-2">{fallbackTitle}</h3>;
};
const MovieDetails: React.FC<MovieDetailsProps> = ({ media, onPlay, onBack, onSelectMedia }) => {
  const { focusedRow, popFocusTrap, pushFocusTrap, setCircularH, setCircularV, setPosition } =
    useSpatialNav();

  const onBackRef = useRef(onBack);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const backDebounceRef = useRef(0);
  const hasAutoBackRef = useRef(false);

  onBackRef.current = onBack;

  const tmdbId = media.tmdb_id ? Number(media.tmdb_id) : 0;

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(getMediaLogo(media) || null);
  const [logoError, setLogoError] = useState(false);
  const [dbItem, setDbItem] = useState<Media | null>(null);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inWatchLater, setInWatchLater] = useState(false);
  const [isTogglingList, setIsTogglingList] = useState(false);
  const [isTogglingLater, setIsTogglingLater] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [media.tmdb_id, media.id]);

  const handleBack = useCallback(() => {
    const now = Date.now();
    if (now - backDebounceRef.current < 180) return;
    backDebounceRef.current = now;
    setSignal('canExitApp', false);
    playBackSound();
    if (typeof onBackRef.current === 'function') onBackRef.current();
  }, []);

  useEffect(() => {
    setCircularH(true);
    setCircularV(true);
    pushFocusTrap('movie-details-focus-trap');
    setSignal('detailsActive', true);
    return () => {
      setSignal('detailsActive', false);
      popFocusTrap();
      setCircularH(false);
      setCircularV(false);
    };
  }, [popFocusTrap, pushFocusTrap, setCircularH, setCircularV]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Back') {
        event.preventDefault();
        event.stopPropagation();
        handleBack();
        return;
      }
      // ArrowLeft não aciona back — apenas teclas dedicadas (Escape/Backspace/Back)
      // Netflix: ArrowLeft sempre navega; Back físico é o único trigger de voltar
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [focusedRow, handleBack]);

  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setInvalidReason(null);
      setDetail(null);

      try {
        const [tmdbDetail, dbRow] = await Promise.all([
          fetchMovieDetail(tmdbId),
          getMovieByTmdbId(tmdbId),
        ]);

        if (cancelled) return;

        setDetail(tmdbDetail);
        setLogoUrl(
          resolveCatalogLogo(
            { ...(media as any), ...((dbRow as any) || {}) },
            (dbRow as any)?.logo_url,
            media.logo_url
          ) || null
        );

        if (dbRow) {
          setDbItem({ ...(dbRow as any), type: 'movie' } as Media);
        }

        const base = { ...((dbRow as any) || {}), type: 'movie' } as Media;
        const hasImg = getMediaPoster(base) || getMediaPoster(media) || tmdbDetail?.poster_path;
        if (!hasImg) setInvalidReason('missing_catalog_images');
      } catch (error) {
        logger.error('[MovieDetails] Falha ao carregar detalhes:', error);
        if (!cancelled) setInvalidReason('load_error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [media.logo_url, tmdbId]);

  const primaryMedia = dbItem || media;

  const mediaWithTmdbImages = useMemo(() => {
    const base = { ...primaryMedia };
    if (detail?.poster_path) base.poster_path = detail.poster_path;
    if (detail?.backdrop_path) base.backdrop_path = detail.backdrop_path;
    return base;
  }, [primaryMedia, detail?.poster_path, detail?.backdrop_path]);

  const backdropUrl = useMemo(() => {
    const fromTmdb = getMediaBackdrop(mediaWithTmdbImages);
    if (fromTmdb) return fromTmdb;
    return getMediaBackdrop(media) || getMediaBackdrop(primaryMedia) || '';
  }, [mediaWithTmdbImages, media, primaryMedia]);

  const posterUrl = useMemo(() => getMediaPoster(mediaWithTmdbImages), [mediaWithTmdbImages]);

  const logoDisplayUrl = useMemo(() => {
    if (detail?.images?.logos?.length) {
      const picked = pickLogoEnPtOrNull(detail.images.logos);
      if (picked?.file_path) {
        const url = getImageUrl(picked.file_path, 'original', 'logo') || '';
        if (url.length > 5) return url;
      }
    }
    const resolved = resolveCatalogLogo(
      {
        ...(media as any),
        ...((dbItem as any) || {}),
        logo_url: logoUrl || (dbItem as any)?.logo_url || media.logo_url,
      },
      logoUrl,
      (dbItem as any)?.logo_url,
      media.logo_url
    );
    return resolved.length > 5 ? resolved : null;
  }, [detail?.images?.logos, logoUrl, dbItem, media]);

  useEffect(() => {
    if (logoDisplayUrl || !tmdbId) return;
    let cancelled = false;
    getHorizontalCardLogo(tmdbId, 'movie')
      .then((logo: string | undefined) => {
        if (!cancelled && logo) {
          setLogoUrl(logo);
          setLogoError(false);
        }
      })
      .catch((err) => logger.warn('[MovieDetails] Logo fetch failed:', err));
    return () => {
      cancelled = true;
    };
  }, [logoDisplayUrl, tmdbId]);

  useEffect(() => {
    if (!logoError || !tmdbId) return;
    let cancelled = false;
    getHorizontalCardLogo(tmdbId, 'movie')
      .then((logo: string | undefined) => {
        if (!cancelled && logo) {
          setLogoUrl(logo);
          setLogoError(false);
        }
      })
      .catch((err) => logger.warn('[MovieDetails] Logo fallback fetch failed:', err));
    return () => {
      cancelled = true;
    };
  }, [logoError, tmdbId]);

  const vote = useMemo(
    () => normalizeVote(detail?.vote_average ?? media.rating),
    [detail?.vote_average, media.rating]
  );
  const releaseDate = detail?.release_date || media.release_date;
  const year = media.year ? String(media.year) : getYear(releaseDate);
  const runtime = formatRuntime(detail?.runtime);
  const genres = detail?.genres?.map((g) => g.name).filter(Boolean) || media.genre || [];
  const overview = (detail?.overview || media.description || '').trim();

  const rootPlayableUrl = useMemo(
    () => extractPlayableUrl(primaryMedia as unknown as Record<string, unknown>),
    [primaryMedia]
  );

  // Filmes recomendados (incluídos no fetchMovieDetail via append_to_response)
  const recommendations = useMemo(() => {
    const results = (detail as any)?.recommendations?.results as any[] | undefined;
    if (!results || results.length === 0) return [];
    return results.filter((r: any) => r.backdrop_path).slice(0, 12);
  }, [detail]);

  // Diretor do filme
  const director = useMemo(() => {
    return detail?.credits?.crew?.find((c) => c.job === 'Director')?.name || null;
  }, [detail?.credits?.crew]);

  const hasRequiredAssets =
    hasRequiredTmdbImages(mediaWithTmdbImages) && Boolean(posterUrl && backdropUrl);
  const meetsYearFilter = isRecentMedia(primaryMedia, 2022);

  const isBlocked = Boolean(invalidReason || !tmdbId || !hasRequiredAssets || !meetsYearFilter);

  useEffect(() => {
    if (loading || !isBlocked || hasAutoBackRef.current) return;
    hasAutoBackRef.current = true;
    let mounted = true;
    const timer = window.setTimeout(() => {
      if (mounted) handleBack();
    }, 160);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [handleBack, isBlocked, loading]);

  useEffect(() => {
    if (loading || isBlocked) return;
    let mounted = true;
    const focusCol = rootPlayableUrl ? 1 : 0;
    const timer = window.setTimeout(() => {
      if (mounted) {
        setPosition(1, focusCol);
        if (rootPlayableUrl && focusCol === 1)
          playButtonRef.current?.focus({ preventScroll: true });
      }
    }, 120);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [rootPlayableUrl, isBlocked, loading, setPosition]);

  useEffect(() => {
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return;
    userService
      .checkStatus(id)
      .then((s) => {
        setInWatchlist(s.inWatchlist);
        setInWatchLater(s.inWatchLater);
      })
      .catch(() => {});
  }, [media.tmdb_id]);

  const handleToggleWatchlist = useCallback(async () => {
    if (isTogglingList) return;
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return;
    setIsTogglingList(true);
    setInWatchlist((prev) => !prev);
    playSelectSound();
    try {
      await userService.toggleLibraryItem(
        id,
        media.type === 'series' ? 'tv' : 'movie',
        'watchlist'
      );
    } catch {
      setInWatchlist((prev) => !prev);
    } finally {
      setIsTogglingList(false);
    }
  }, [media.tmdb_id, media.type, isTogglingList]);

  const handleToggleWatchLater = useCallback(async () => {
    if (isTogglingLater) return;
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return;
    setIsTogglingLater(true);
    setInWatchLater((prev) => !prev);
    playSelectSound();
    try {
      await userService.toggleLibraryItem(
        id,
        media.type === 'series' ? 'tv' : 'movie',
        'watch_later'
      );
    } catch {
      setInWatchLater((prev) => !prev);
    } finally {
      setIsTogglingLater(false);
    }
  }, [media.tmdb_id, media.type, isTogglingLater]);

  const handlePlayPrimary = useCallback(() => {
    if (!rootPlayableUrl || isPlaying) return;
    setIsPlaying(true);
    playSelectSound();
    try {
      onPlay({ ...primaryMedia, stream_url: rootPlayableUrl });
    } finally {
      setIsPlaying(false);
    }
  }, [onPlay, primaryMedia, rootPlayableUrl, isPlaying]);

  const handleSelectRecommendation = useCallback(
    (item: any) => {
      playSelectSound();
      if (onSelectMedia) {
        const m: Media = {
          id: String(item.id),
          tmdb_id: item.id,
          title: item.title || item.name || '',
          type: 'movie',
          poster: item.poster_path ? getImageUrl(item.poster_path, 'w500') || '' : '',
          backdrop: item.backdrop_path ? getImageUrl(item.backdrop_path, 'w1280') || '' : '',
          poster_path: item.poster_path || null,
          backdrop_path: item.backdrop_path || null,
          year: item.release_date ? Number(item.release_date.slice(0, 4)) : undefined,
          rating: item.vote_average,
          description: item.overview || '',
        };
        onSelectMedia(m);
      }
    },
    [onSelectMedia]
  );

  if (loading) {
    const loadingBg =
      getMediaBackdrop(media) ||
      (typeof media.backdrop === 'string' && media.backdrop.trim() ? media.backdrop : '') ||
      getMediaPoster(media) ||
      (typeof media.poster === 'string' && media.poster.trim() ? media.poster : '');
    return (
      <div
        id="movie-details-focus-trap"
        className="fixed inset-0 z-50 overflow-hidden bg-[#0a0418] text-white"
        data-nav-row={0}
      >
        {loadingBg ? (
          <img
            src={loadingBg}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35 blur-sm scale-105"
            loading="eager"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="absolute inset-0 bg-black/60" aria-hidden />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="h-11 w-11 rounded-full border-2 border-white/15 border-t-violet-500 animate-spin"
            role="status"
            aria-label="Carregando"
          />
        </div>
        <button
          type="button"
          className="absolute top-6 left-6 z-[100] flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/60"
          onClick={handleBack}
          data-nav-item
          data-nav-col={0}
          data-nav-back
        >
          <ArrowLeft size={22} />
        </button>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div
        id="movie-details-focus-trap"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white"
        data-nav-row={0}
      >
        <button
          type="button"
          className="absolute top-6 left-6 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/60"
          onClick={handleBack}
          data-nav-item
          data-nav-col={0}
          data-nav-back
        >
          <ArrowLeft size={22} />
        </button>
        <p className="text-sm text-white/70 uppercase tracking-[0.2em]">Conteúdo indisponível</p>
      </div>
    );
  }

  return (
    <div
      id="movie-details-focus-trap"
      className="fixed inset-0 z-50 overflow-hidden text-white"
      style={{
        background:
          'linear-gradient(120deg, #2A0A45 0%, #32115a 25%, #571C87 55%, #8a2be2 80%, #C11EFC 100%)',
      }}
    >
      {/* BACKDROP */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {backdropUrl && (
          <div
            className="absolute top-0 left-0 w-full h-full bg-cover"
            style={{
              backgroundImage: `url(${backdropUrl})`,
              backgroundPosition: 'center calc(50% + 0.5cm)',
            }}
          />
        )}
        <div className="absolute inset-0 dt-hero-overlay" />
      </div>

      {/* MAIN CONTENT */}
      <div className="relative z-10 h-full overflow-y-auto px-8 md:px-16 lg:px-24 pb-24 max-w-[1920px] mx-auto">
        {/* BACK BUTTON */}
        <div className="pt-6" data-nav-row={0} data-nav-wrap="true">
          <button
            type="button"
            onClick={handleBack}
            className="dt-botao-glass flex h-12 w-12 items-center justify-center rounded-full"
            data-nav-item
            data-nav-col={0}
            data-nav-back
            aria-label="Voltar"
          >
            <ArrowLeft size={22} />
          </button>
        </div>

        {/* ═══ 1. HERO — poster lateral + info ═══ */}
        <div
          className="flex flex-col md:flex-row gap-8 items-end mb-16 pt-[22vh]"
          data-nav-row={1}
          data-nav-wrap-h="true"
        >
          {/* Poster lateral */}
          {posterUrl && (
            <div className="flex-shrink-0 hidden md:block">
              <div className="w-48 lg:w-60 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
                <img
                  src={posterUrl}
                  alt={media.title}
                  className="w-full h-auto object-cover"
                  loading="eager"
                />
              </div>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 w-full md:max-w-[55%] dt-glass-card dt-hero-panel">
            <div className="min-h-[55px] mb-4">
              {logoDisplayUrl && !logoError ? (
                <img
                  src={logoDisplayUrl}
                  alt={media.title || 'Logo'}
                  className="w-44 md:w-64 drop-shadow-lg object-contain object-left"
                  loading="eager"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <h1 className="text-4xl md:text-5xl font-bold drop-shadow-lg tracking-tight">
                  {media.title || 'Sem título'}
                </h1>
              )}
            </div>

            {detail?.tagline && (
              <p className="text-base md:text-lg text-gray-300 italic mb-4 drop-shadow-md">
                {detail.tagline}
              </p>
            )}

            {/* Metadata badges */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs md:text-sm font-medium mb-5 text-gray-200 drop-shadow-md">
              {vote && (
                <span className="flex items-center gap-1 text-yellow-400 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                  <Star size={14} fill="currentColor" /> {vote}
                </span>
              )}
              {year && (
                <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                  <Calendar size={12} /> {year}
                </span>
              )}
              {runtime && (
                <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                  <Clock3 size={12} /> {runtime}
                </span>
              )}
              {director && (
                <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10">
                  <Film size={12} /> {director}
                </span>
              )}
              {genres.length > 0 && (
                <span className="bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10 text-xs">
                  {genres.slice(0, 4).join(' • ')}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-nowrap gap-2">
              {rootPlayableUrl && (
                <button
                  ref={playButtonRef}
                  type="button"
                  disabled={isPlaying}
                  onClick={handlePlayPrimary}
                  className={`dt-botao-play px-3 py-2 rounded-full font-bold text-sm flex items-center gap-1.5 shrink-0 ${isPlaying ? 'opacity-50 grayscale' : ''}`}
                  data-nav-item
                  data-nav-col={0}
                  aria-label="Assistir"
                >
                  {isPlaying ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Play size={14} fill="currentColor" />
                  )}
                  {isPlaying ? 'Carregando...' : 'Assistir'}
                </button>
              )}
              <button
                type="button"
                className={`dt-botao-glass px-3 py-2 rounded-full font-bold text-sm flex items-center gap-1.5 shrink-0 ${inWatchlist ? 'ring-1 ring-white/40' : ''}`}
                data-nav-item
                data-nav-col={rootPlayableUrl ? 1 : 0}
                tabIndex={0}
                onClick={handleToggleWatchlist}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleToggleWatchlist();
                  }
                }}
                aria-pressed={inWatchlist}
              >
                {inWatchlist ? <Check size={14} /> : <Plus size={14} />}
                {inWatchlist ? 'Na Lista' : 'Adicionar'}
              </button>
              <button
                type="button"
                className={`dt-botao-glass px-3 py-2 rounded-full font-bold text-sm flex items-center gap-1.5 shrink-0 ${inWatchLater ? 'ring-1 ring-white/40' : ''}`}
                data-nav-item
                data-nav-col={(rootPlayableUrl ? 1 : 0) + 1}
                tabIndex={0}
                onClick={handleToggleWatchLater}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleToggleWatchLater();
                  }
                }}
                aria-pressed={inWatchLater}
              >
                {inWatchLater ? <Check size={14} /> : <Clock size={14} />}
                {inWatchLater ? 'Salvo' : 'Ver Depois'}
              </button>
            </div>
          </div>
        </div>

        {/* ═══ 2. SINOPSE + INFO ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16" id="details-info-section">
          <div className="lg:col-span-2 flex flex-col gap-8">
            <div className="dt-glass-card p-8" tabIndex={0} data-nav-item>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Film size={22} /> Sinopse
              </h2>
              <p className="text-lg leading-relaxed text-gray-200">
                {overview || 'Sinopse não disponível.'}
              </p>
            </div>
          </div>

          {/* Info panel */}
          <div className="dt-glass-card p-8" tabIndex={0} data-nav-item>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Film size={22} /> Informações
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {year && (
                <div>
                  <span className="text-gray-400 block">Ano</span>
                  <span className="font-semibold text-lg">{year}</span>
                </div>
              )}
              {runtime && (
                <div>
                  <span className="text-gray-400 block">Duração</span>
                  <span className="font-semibold text-lg">{runtime}</span>
                </div>
              )}
              {detail?.status && (
                <div>
                  <span className="text-gray-400 block">Status</span>
                  <span className="font-semibold text-lg">{detail.status}</span>
                </div>
              )}
              {detail?.original_language && (
                <div>
                  <span className="text-gray-400 block">Idioma</span>
                  <span className="font-semibold text-lg uppercase">
                    {detail.original_language}
                  </span>
                </div>
              )}
              {director && (
                <div className="col-span-2">
                  <span className="text-gray-400 block">Diretor</span>
                  <span className="font-semibold text-lg">{director}</span>
                </div>
              )}
              {detail?.production_companies && detail.production_companies.length > 0 && (
                <div className="col-span-2">
                  <span className="text-gray-400 block">Produtoras</span>
                  <span className="font-semibold text-lg">
                    {detail.production_companies.map((c: { name: string }) => c.name).join(', ')}
                  </span>
                </div>
              )}
              {genres.length > 0 && (
                <div className="col-span-2">
                  <span className="text-gray-400 block">Gêneros</span>
                  <span className="font-semibold text-lg">{genres.join(', ')}</span>
                </div>
              )}
              {detail?.homepage && (
                <div className="col-span-2 mt-2">
                  <a
                    href={detail.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1"
                    tabIndex={0}
                    data-nav-item
                  >
                    <Globe size={16} /> Site Oficial
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ 3. ELENCO ═══ */}
        {detail?.credits?.cast && detail.credits.cast.length > 0 && (
          <div className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
              <Users size={28} /> Elenco Principal
            </h2>
            <div className="dt-scroll-horizontal">
              {detail.credits.cast.slice(0, 15).map((actor) => (
                <div
                  key={actor.id}
                  className="dt-scroll-item w-32 dt-card rounded-2xl flex flex-col items-center text-center focus:outline-none focus:ring-2 focus:ring-white/50"
                  tabIndex={0}
                  data-nav-item
                >
                  <div className="aspect-square bg-gray-800 rounded-full overflow-hidden mb-3">
                    {actor.profile_path ? (
                      <img
                        src={getImageUrl(actor.profile_path, 'w200') || ''}
                        alt={actor.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        <Users size={40} />
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-sm truncate">{actor.name}</h3>
                  <p className="text-xs text-gray-400 truncate">{actor.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ 4. EQUIPE TÉCNICA ═══ */}
        {detail?.credits?.crew &&
          detail.credits.crew.length > 0 &&
          (() => {
            const filteredCrew = detail.credits.crew
              .filter((c) =>
                ['Director', 'Executive Producer', 'Writer', 'Screenplay'].includes(c.job)
              )
              .slice(0, 12);
            if (filteredCrew.length === 0) return null;
            return (
              <div className="mb-16">
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
                  <Briefcase size={28} /> Equipe Técnica
                </h2>
                <div className="dt-scroll-horizontal">
                  {filteredCrew.map((person, idx) => (
                    <div
                      key={`${person.id}-${idx}`}
                      className="dt-scroll-item w-32 dt-card rounded-2xl flex flex-col items-center text-center focus:outline-none focus:ring-2 focus:ring-white/50"
                      tabIndex={0}
                      data-nav-item
                    >
                      <div className="aspect-square bg-gray-800 rounded-full overflow-hidden mb-3">
                        {person.profile_path ? (
                          <img
                            src={getImageUrl(person.profile_path, 'w200') || ''}
                            alt={person.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <Users size={40} />
                          </div>
                        )}
                      </div>
                      <h3 className="font-bold text-sm truncate">{person.name}</h3>
                      <p className="text-xs text-gray-400 truncate">{person.job}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        {/* ═══ 5. RECOMENDADOS (HORIZONTAL BACKDROP TMDB) ═══ */}
        {recommendations.length > 0 && (
          <div className="mb-16">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-2">
              <Star size={28} /> Você também pode gostar
            </h2>
            <div className="dt-scroll-horizontal">
              {recommendations.map((rec: any) => (
                <button
                  key={rec.id}
                  type="button"
                  className="dt-scroll-item w-[320px] md:w-[360px] dt-card cursor-pointer text-left rounded-2xl overflow-hidden border border-white/10 bg-black/30"
                  tabIndex={0}
                  onClick={() => handleSelectRecommendation(rec)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectRecommendation(rec)}
                >
                  <div className="relative aspect-video">
                    <img
                      src={getImageUrl(rec.backdrop_path, 'w1280') || ''}
                      alt={rec.title || rec.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                    <div className="absolute left-4 right-4 bottom-4 space-y-2">
                      <RecommendationLogo
                        tmdbId={Number(rec.id)}
                        mediaType="movie"
                        fallbackTitle={rec.title || rec.name || 'Sem título'}
                      />
                      {rec.vote_average > 0 && (
                        <p className="text-xs text-yellow-300 flex items-center gap-1">
                          <Star size={10} fill="currentColor" />{' '}
                          {Number(rec.vote_average).toFixed(1)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(MovieDetails);
