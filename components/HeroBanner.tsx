import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Media } from '../types';
import { playSelectSound } from '../utils/soundEffects';
import { logger } from '../utils/logger';
import { getMediaDetailsByID, getLogo, getOfficialHeroBannerAsset } from '../services/tmdb';
import { getResponsiveImageSrcSet, toWebP } from '../utils/imageProxy';
import { getMediaLogo, hasValidVideoUrl } from '../utils/mediaUtils';
import { getLocalizedLogoSync, rememberLocalizedLogo } from '../services/logoService';
import { Play, Info, RefreshCw } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { isTVBox } from '../utils/tvBoxDetector';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface HeroBannerProps {
  mediaType?: 'movie' | 'tv' | 'all' | 'kids';
  onPlayMedia?: (media: Media) => void;
  onSelectMedia?: (media: Media) => void;
  dbMedia?: Media[];
  onBackdropChange?: (url: string) => void;
  variant?: 'default' | 'glass';
  hideCard?: boolean;
  priorityTitles?: string[];
  /** Se true, o título deve conter todas as strings de priorityTitles (AND). Default: OR. */
  priorityMatchAll?: boolean;
  /** Se true, só entram itens que casaram com priorityTitles — não completa com o resto do catálogo. */
  exclusivePriority?: boolean;
  /** Máximo de slides no carrossel do hero (default 5). */
  maxBannerSlides?: number;
  /** Prioriza estes IDs TMDB (ordem preservada). Toma precedência sobre `priorityTitles` quando definido. */
  priorityTmdbIds?: number[];
  /** Tipo TMDB para IDs em `priorityTmdbIds` que não existem no catálogo (default `series`). */
  priorityTmdbMediaType?: 'movie' | 'series';
}

const LOGO_CACHE_KEY = 'redx-logo-cache-v5';

const isTmdbImageUrl = (url?: string | null): boolean => {
  const value = String(url || '').trim();
  return value.startsWith('https://image.tmdb.org/');
};

const isUsableImageUrl = (url?: string | null): boolean => {
  const value = String(url || '').trim();
  return Boolean(value) && !value.includes('undefined') && !value.includes('null');
};

const getTmdbBackdropFromMedia = (media?: Media | null): string => {
  if (!media) return '';
  const bannerUrl = String(media.banner_url || '').trim();
  if (isUsableImageUrl(bannerUrl)) {
    return isTmdbImageUrl(bannerUrl) ? toWebP(bannerUrl, 'backdrop') : bannerUrl;
  }
  // Banners: TMDB + wsrv (toWebP). Não priorizar Supabase `posters/webp/{id}.webp` aqui — se o
  // objeto não existir no bucket, o <img> recebia 404 e sumia (onError só tratava wsrv).
  // getBannerWebPUrl fica disponível para fluxos que confirmem o ficheiro (ex.: ingestão).
  // REGRA TMDB: banners/backgrounds usam APENAS backdrop_path (16:9), NUNCA poster_path (2:3)
  // Usar proxy (toWebP) para evitar bloqueio de hotlinking do CDN TMDB
  const backdropPath = media.backdrop_path;
  if (typeof backdropPath === 'string' && backdropPath.startsWith('/')) {
    const raw = `https://image.tmdb.org/t/p/w1280${backdropPath}`;
    return toWebP(raw, 'backdrop');
  }
  if (media.backdrop && media.backdrop.startsWith('/bannert/')) return media.backdrop;
  // Aceitar URLs wsrv.nl (proxy já aplicado no banco) e URLs diretas TMDB
  if (
    media.backdrop &&
    (media.backdrop.includes('wsrv.nl') ||
      media.backdrop.includes('images.weserv.nl') ||
      media.backdrop.includes('/img-proxy/'))
  )
    return media.backdrop;
  if (isTmdbImageUrl(media.backdrop)) return toWebP(String(media.backdrop), 'backdrop');
  if (isUsableImageUrl(media.backdrop)) return String(media.backdrop).trim();
  return '';
};

const getReleaseLabel = (media: Media): string | null => {
  if (typeof media.year === 'number' && Number.isFinite(media.year) && media.year > 1900) {
    return String(media.year);
  }
  const fromRelease = String(media.release_date || '').match(/\d{4}/)?.[0];
  if (fromRelease) return fromRelease;
  const fromFirstAir = String(media.first_air_date || '').match(/\d{4}/)?.[0];
  return fromFirstAir || null;
};

const useTmdbDetailsCache = () => {
  const cacheRef = React.useRef<Map<string, Promise<any>>>(new Map());
  return React.useCallback((tmdbId: number, type: 'movie' | 'series') => {
    const key = `${tmdbId}_${type}`;
    let promise = cacheRef.current.get(key);
    if (!promise) {
      promise = getMediaDetailsByID(tmdbId, type).catch(() => null);
      cacheRef.current.set(key, promise);
    }
    return promise;
  }, []);
};

const MAX_BANNER_RETRIES = 3;

const DEFAULT_MAX_SLIDES = 1;

const HeroBanner: React.FC<HeroBannerProps> = ({
  mediaType = 'all',
  onPlayMedia,
  onSelectMedia,
  dbMedia,
  onBackdropChange,
  variant = 'default',
  hideCard = false,
  priorityTitles,
  priorityMatchAll = false,
  exclusivePriority = false,
  maxBannerSlides = DEFAULT_MAX_SLIDES,
  priorityTmdbIds,
  priorityTmdbMediaType = 'series',
}) => {
  const reducedMotion = useReducedMotion();
  const slideCap = Math.max(1, Math.min(12, maxBannerSlides));
  const [bannerItems, setBannerItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { showToast } = useToast();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [backdropOverrides, setBackdropOverrides] = useState<Record<string, string>>({});
  const getCachedDetails = useTmdbDetailsCache();

  const logoCache = useRef<Map<string, string | null>>(new Map());
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const savedLogo = localStorage.getItem(LOGO_CACHE_KEY);
      const logoPairs = savedLogo ? (JSON.parse(savedLogo) as [string, string | null][]) : [];
      logoCache.current = Array.isArray(logoPairs) ? new Map(logoPairs) : new Map();
    } catch {
      logoCache.current = new Map();
    }
  }, []);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    setFetchError(false);
    setBackdropOverrides({});

    const sourceMedia = dbMedia && dbMedia.length > 0 ? dbMedia : [];
    const priorityIdList = priorityTmdbIds?.filter((id) => Number(id) > 0) ?? [];
    const priorityIdSet = new Set(priorityIdList);

    if (sourceMedia.length === 0 && priorityIdList.length === 0) {
      setBannerItems([]);
      setLoading(false);
      return;
    }

    // 1. Candidatos: vídeo válido OU ID fixo do hero (entra no banner mesmo fora do catálogo)
    let validCandidates: Media[] = sourceMedia.filter(
      (m: Media) =>
        m.tmdb_id &&
        Number(m.tmdb_id) > 0 &&
        (hasValidVideoUrl(m) || priorityIdSet.has(Number(m.tmdb_id)))
    );

    const seenTmdb = new Set(validCandidates.map((m) => Number(m.tmdb_id)));
    priorityIdList.forEach((id, index) => {
      if (!seenTmdb.has(id)) {
        seenTmdb.add(id);
        validCandidates.push({
          id: `__hero_priority_${id}`,
          tmdb_id: id,
          type: priorityTmdbMediaType,
          title: String(priorityTitles?.[index] || '').trim(),
          stream_url: 'https://example.com/',
        } as Media);
      }
    });

    // 2. Prioridade por ID TMDB ou por títulos
    let priorityItems: Media[] = [];
    if (priorityIdList.length > 0) {
      const byId = new Map(validCandidates.map((m) => [Number(m.tmdb_id), m]));
      priorityItems = priorityIdList.map((id) => byId.get(id)).filter((m): m is Media => !!m);
    } else if (priorityTitles && priorityTitles.length > 0) {
      priorityItems = validCandidates.filter((m) => {
        const title = String(m.title || '').toLowerCase();
        if (priorityMatchAll) {
          return priorityTitles.every((t) => title.includes(t.toLowerCase()));
        }
        return priorityTitles.some((t) => title.includes(t.toLowerCase()));
      });
    }

    // 3. Lista final: só prioridade ou prioridade + catálogo
    const candidates = exclusivePriority
      ? priorityItems.slice(0, slideCap)
      : [
          ...priorityItems,
          ...validCandidates.filter((m) => !priorityItems.find((p) => p.id === m.id)),
        ].slice(0, slideCap);

    // ── FAST PATH: mostrar imediatamente com dados do banco ──────────────────
    // Exibe os primeiros 5 candidatos sem esperar TMDB — banner aparece em < 100ms
    const quickItems = candidates
      .filter((m) => getTmdbBackdropFromMedia(m)) // só quem já tem backdrop
      .slice(0, slideCap);
    const fallbackQuickItems =
      exclusivePriority && priorityIdList.length > 0
        ? []
        : validCandidates.filter((m) => getTmdbBackdropFromMedia(m)).slice(0, slideCap);
    const initialQuickItems = quickItems.length > 0 ? quickItems : fallbackQuickItems;

    if (initialQuickItems.length > 0) {
      setBannerItems(initialQuickItems);
      setLoading(false);
    } else {
      // Sem backdrop local ainda — mostra loading enquanto TMDB carrega
      setLoading(true);
    }

    // ── BACKGROUND ENRICHMENT: enriquecer com TMDB silenciosamente ──────────
    // Apenas os primeiros 5 candidatos (era 12) — bem mais rápido
    let cancelled = false;
    const enrichBanners = async () => {
      try {
        const sliced = candidates.slice(0, slideCap);
        const enriched: Media[] = [];

        // Busca todos em paralelo (só 5 itens — seguro para TV Box)
        const results = await Promise.allSettled(
          sliced.map(async (candidate) => {
            const type = candidate.type === 'series' ? 'series' : 'movie';
            const asset = await getOfficialHeroBannerAsset(Number(candidate.tmdb_id), type);
            return { candidate, asset };
          })
        );

        if (cancelled) return;

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.asset?.backdrop) {
            const { candidate, asset } = result.value;
            enriched.push({
              ...candidate,
              backdrop: asset.backdrop,
              logo_url: asset.logo || candidate.logo_url || null,
              description: asset.description || candidate.description,
            } as unknown as Media);
          }
        }

        if (cancelled) return;

        if (enriched.length > 0) {
          setBannerItems(enriched);
          // Não reseta para 0: preserva a posição da auto-rotação se ainda válida
          // (resetar fazia o banner voltar ao 1º item quando o TMDB enriquecia).
          setCurrentIndex((i) => (i < enriched.length ? i : 0));
        } else if (initialQuickItems.length === 0) {
          // Nenhum backdrop disponível — usar candidatos sem imagem
          setBannerItems(candidates.slice(0, slideCap));
        }
      } catch (err) {
        logger.error('[HeroBanner] Erro ao enriquecer banners:', err);
        if (!cancelled && initialQuickItems.length === 0) {
          setFetchError(true);
          if (retryCount >= MAX_BANNER_RETRIES) {
            showToast(
              'Não foi possível carregar os destaques. Verifique sua conexão.',
              'error',
              5000
            );
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void enrichBanners();
    return () => {
      cancelled = true;
    };
  }, [
    dbMedia,
    mediaType,
    priorityTitles,
    priorityTmdbIds,
    priorityTmdbMediaType,
    priorityMatchAll,
    exclusivePriority,
    slideCap,
    retryCount,
  ]);

  // Auto-rotação do banner: troca o slide a cada 10s, ciclando todos os itens.
  // Count via ref + interval criado UMA vez (mount) — o enriquecimento TMDB atualiza
  // bannerItems sem reiniciar o timer, garantindo cadência fixa de 10s.
  const bannerCountRef = useRef(0);
  useEffect(() => {
    bannerCountRef.current = bannerItems.length;
  }, [bannerItems.length]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const n = bannerCountRef.current;
      if (n > 1) setCurrentIndex((i) => (i + 1) % n);
    }, 10000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const movie = bannerItems[currentIndex];
    if (!movie) {
      setLogoUrl(null);
      setLogoError(false);
      return;
    }

    const cacheKey = `${movie.tmdb_id || movie.id}_${movie.type}`;

    // Logo localizada já conhecida (pt→en→null→ja). NÃO semear com a logo_url
    // armazenada — pode estar em idioma errado e causaria o flash ja→en→pt.
    const localized = getLocalizedLogoSync(movie);

    setLogoError(false);
    setLogoUrl(localized || logoCache.current.get(cacheKey) || null);

    const tmdbId = Number(movie.tmdb_id);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      // Sem tmdb_id: única fonte é a logo armazenada.
      if (!localized) setLogoUrl(getMediaLogo(movie) || null);
      return;
    }

    const type = movie.type === 'series' ? 'series' : 'movie';
    const needsLogo = !localized && !logoCache.current.has(cacheKey);
    const needsBackdrop = !getTmdbBackdropFromMedia(movie);

    if (!needsLogo && !needsBackdrop) return;

    let cancelled = false;
    getCachedDetails(tmdbId, type)
      .then(async (details) => {
        if (cancelled || !details) return;

        if (details.backdrop) {
          setBackdropOverrides((prev) => ({ ...prev, [cacheKey]: details.backdrop }));
        }

        if (needsLogo) {
          let logo = details.logo || null;
          if (!logo) logo = (await getLogo(tmdbId, type)) || null;
          if (cancelled) return;
          logoCache.current.set(cacheKey, logo);
          try {
            localStorage.setItem(
              LOGO_CACHE_KEY,
              JSON.stringify(Array.from(logoCache.current.entries()))
            );
          } catch {
            /* ignore */
          }
          if (logo) {
            setLogoUrl((prev) => prev || logo);
            rememberLocalizedLogo(movie, logo);
          }
        }
      })
      .catch((err) => logger.warn('[HeroBanner] Falha ao enriquecer item:', err));
    return () => {
      cancelled = true;
    };
  }, [bannerItems, currentIndex, getCachedDetails]);

  useEffect(() => {
    const movie = bannerItems[currentIndex];
    const key = movie ? `${movie.tmdb_id || movie.id}_${movie.type}` : '';
    const url = getTmdbBackdropFromMedia(movie) || backdropOverrides[key] || '';
    if (url && onBackdropChange) onBackdropChange(url);
  }, [bannerItems, currentIndex, onBackdropChange, backdropOverrides]);

  if (loading) {
    return (
      <div
        className="h-full min-h-[100dvh] bg-[#080808] relative overflow-hidden"
        data-hero-banner
        data-testid="hero-banner"
        aria-busy="true"
        aria-label="Carregando destaques"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#111018] via-[#080808] to-[#180a24]" />
        {/* Gradiente inferior para blend com o conteúdo abaixo */}
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#080808] to-transparent pointer-events-none" />
      </div>
    );
  }

  if (fetchError && !bannerItems.length) {
    return (
      <div
        className="h-full min-h-[100dvh] bg-[#0a0a14] flex flex-col items-center justify-center gap-6"
        data-hero-banner
        data-testid="hero-banner"
        role="alert"
        aria-live="assertive"
      >
        <p className="text-white/50 text-sm uppercase tracking-widest font-bold">
          Não foi possível carregar os destaques
        </p>
        {retryCount < MAX_BANNER_RETRIES && (
          <button
            onClick={handleRetry}
            data-nav-item
            tabIndex={0}
            aria-label="Tentar carregar destaques novamente"
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-purple-700/60 hover:bg-purple-600/80 focus:ring-2 focus:ring-purple-400 outline-none text-white text-sm font-bold uppercase tracking-wider transition-all"
          >
            <RefreshCw size={16} aria-hidden />
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (!bannerItems.length) {
    // Sem itens e sem erro — pode ser que o catálogo ainda não chegou: mostrar shimmer
    return (
      <div
        className="h-full min-h-[100dvh] bg-[#080808] relative overflow-hidden"
        data-hero-banner
        data-testid="hero-banner"
        aria-busy="true"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#111018] via-[#080808] to-[#180a24]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#080808] to-transparent pointer-events-none" />
      </div>
    );
  }

  const movie = bannerItems[currentIndex];
  const cacheKey = movie ? `${movie.tmdb_id || movie.id}_${movie.type}` : '';
  const imageUrl = getTmdbBackdropFromMedia(movie) || backdropOverrides[cacheKey] || '';
  const imageSrcSet = getResponsiveImageSrcSet(imageUrl, 'backdrop');
  const releaseLabel = getReleaseLabel(movie);
  const bannerSynopsis =
    String(movie.description || (movie as { overview?: string }).overview || '').trim() ||
    'Sem sinopse disponível.';

  const handleClick = () => {
    playSelectSound();
    if (onSelectMedia) onSelectMedia(movie);
    else if (onPlayMedia) onPlayMedia(movie);
  };

  const transitionDuration = reducedMotion || isTVBox() ? 0 : variant === 'glass' ? 0.8 : 0.5;

  return (
    <div
      ref={bannerRef}
      className="absolute top-0 left-0 right-0 w-full h-full overflow-hidden z-0"
      data-hero-banner
      data-testid="hero-banner"
    >
      <div className="relative h-full w-full overflow-hidden group" style={{ minHeight: '100%' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`banner-${movie.id}-${currentIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: transitionDuration, ease: 'easeInOut' }}
            className={`absolute inset-0 ${variant === 'default' ? 'cursor-pointer' : ''}`}
            onClick={variant === 'default' ? handleClick : undefined}
            onKeyDown={
              variant === 'default'
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick();
                    }
                  }
                : undefined
            }
            role={variant === 'default' ? 'button' : undefined}
            tabIndex={variant === 'default' ? 0 : undefined}
            aria-label={variant === 'default' ? `Ver detalhes de ${movie.title}` : undefined}
            data-nav-item={variant === 'default' ? true : undefined}
            data-nav-col={variant === 'default' ? 0 : undefined}
          >
            <div className="absolute inset-0 w-full h-full overflow-hidden">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  srcSet={imageSrcSet}
                  sizes={imageSrcSet ? '100vw' : undefined}
                  alt={movie.title}
                  className="w-full h-full object-cover"
                  loading={currentIndex === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  {...({
                    fetchpriority: currentIndex === 0 ? 'high' : 'auto',
                  } as React.ImgHTMLAttributes<HTMLImageElement>)}
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    const currentSrc = img.src;
                    if (currentSrc.includes('wsrv.nl') || currentSrc.includes('/img-proxy/')) {
                      try {
                        const parsed = new URL(currentSrc, window.location.origin);
                        const original = parsed.searchParams.get('url');
                        if (original) {
                          img.src = decodeURIComponent(original);
                          return;
                        }
                      } catch {
                        /* ignore */
                      }
                    }
                    img.style.opacity = '0';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-[#090912]" />
              )}
            </div>

            {/* Gradiente lateral esquerdo (info area) */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent z-20 pointer-events-none" />
            {/* Gradiente inferior removido a pedido do usuário */}
            {/* Gradiente superior sutil — removido: ocultava o topo do vídeo */}
            {/* Vinheta lateral roxa sutil */}
            <div
              className="absolute inset-0 w-[55%] h-full z-20 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 140% 180% at 0% 85%, rgba(109,40,217,0.35) 0%, rgba(77,29,149,0.25) 20%, rgba(42,17,88,0.15) 40%, transparent 65%)',
              }}
            />

            {variant === 'glass' ? (
              <motion.div
                initial={reducedMotion ? false : { y: 40, opacity: 0 }}
                animate={{
                  y: 0,
                  opacity: hideCard ? 0 : 1,
                  pointerEvents: hideCard ? 'none' : 'auto',
                }}
                transition={{
                  duration: reducedMotion ? 0 : hideCard ? 0.18 : 0.9,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute inset-y-0 left-0 z-30 flex items-center pl-[calc(3rem+1cm)] pr-6"
                data-nav-row={1}
              >
                <div className="w-[243px] max-w-[55vw]">
                  <div
                    className="rounded-[1.6rem] p-4 flex flex-col gap-2 min-h-[141px]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.14)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2, duration: 0.7 }}
                      className="flex flex-col items-start w-full min-h-[36px]"
                    >
                      {/* Logo se disponível, senão texto do título */}
                      {logoUrl && !logoError ? (
                        <img
                          src={logoUrl}
                          alt={movie.title}
                          className="max-h-[36px] max-w-[166px] w-auto object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
                          loading="eager"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          {...({
                            fetchpriority: 'high',
                          } as React.ImgHTMLAttributes<HTMLImageElement>)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            setLogoError(true);
                          }}
                        />
                      ) : (
                        <span className="text-[11px] font-black text-white leading-tight line-clamp-2">
                          {movie.title}
                        </span>
                      )}
                    </motion.div>
                    <p className="text-[8px] text-white/80 leading-relaxed line-clamp-3 w-full">
                      {bannerSynopsis}
                    </p>
                    <motion.div
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3, duration: 0.6 }}
                      className="flex gap-3 w-full mt-1"
                    >
                      <button
                        tabIndex={0}
                        data-nav-item
                        data-nav-col={0}
                        className="flex items-center justify-center gap-1.5 h-8 px-4 rounded-full font-bold text-xs text-white hover:brightness-110 hover:scale-[1.03] active:scale-95 transition-all duration-200 outline-none focus:ring-2 focus:ring-purple-400/50 focus-visible:ring-2 focus-visible:ring-purple-400/50"
                        style={{
                          background:
                            'linear-gradient(135deg, #7C3AED 0%, #6D28D9 50%, #5B21B6 100%)',
                          boxShadow:
                            '0 4px 20px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}
                        onClick={() => {
                          playSelectSound();
                          if (onPlayMedia) onPlayMedia(movie);
                          else if (onSelectMedia) onSelectMedia(movie);
                        }}
                        aria-label={`Assistir ${movie.title}`}
                        data-testid="hero-banner-play"
                      >
                        <Play size={12} fill="currentColor" /> Assistir
                      </button>
                      <button
                        tabIndex={0}
                        data-nav-item
                        data-nav-col={1}
                        className="flex items-center justify-center gap-1.5 h-8 px-4 rounded-full font-bold text-xs text-white/90 border border-white/25 hover:bg-white/[0.12] hover:scale-[1.03] active:scale-95 transition-all duration-200 outline-none focus:ring-2 focus:ring-white/35 focus-visible:ring-2 focus-visible:ring-white/35"
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
                        }}
                        onClick={() => {
                          playSelectSound();
                          if (onSelectMedia) onSelectMedia(movie);
                        }}
                        aria-label={`Ver detalhes de ${movie.title}`}
                        data-testid="hero-banner-details"
                      >
                        <Info size={12} strokeWidth={2} /> Detalhes
                      </button>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={reducedMotion ? false : { y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-12 left-12 z-20 flex flex-col gap-2 max-w-[280px]"
              >
                {/* Logo se disponível, senão texto do título */}
                <div className="min-h-[48px] flex items-end">
                  {logoUrl && !logoError ? (
                    <img
                      src={logoUrl}
                      alt={movie.title}
                      className="max-h-[48px] max-w-[220px] w-auto object-contain drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        setLogoError(true);
                      }}
                    />
                  ) : (
                    <h2 className="text-2xl font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] leading-tight">
                      {movie.title}
                    </h2>
                  )}
                </div>
                {releaseLabel && (
                  <p className="text-[10px] font-black tracking-[0.18em] uppercase text-white/70">
                    {releaseLabel}
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default React.memo(HeroBanner);
