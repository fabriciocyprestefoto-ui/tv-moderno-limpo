import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { logger } from '../utils/logger';
import { setSignal, getSignal } from '../utils/appSignals';
import { motion, AnimatePresence } from 'framer-motion';
import { Media, CastMember, CrewMember, Episode, Season, SeriesDetail } from '../types';
import {
  fetchSeriesDetail,
  fetchMovieDetail,
  fetchSeriesCredits,
  fetchSeasonEpisodes,
  getImageUrl,
  getLogo,
  getMediaDetailsByID,
} from '../services/tmdb';
import tmdbSync from '../services/tmdbSync';
import { getCachedDetails } from '../services/detailsPrefetchService';
import {
  getSeriesByTmdbId,
  getMovieByTmdbId,
  getSeasons as getDBSeasons,
  getEpisodes as getDBEpisodes,
  type SeasonDB,
} from '../services/supabaseService';
import { userService } from '../services/userService';
import { useToast } from '@/contexts/ToastContext';
import { playSelectSound, playBackSound } from '../utils/soundEffects';
import { getMediaBackdrop, getMediaLogo, hasValidVideoUrl } from '../utils/mediaUtils';
import { getLocalizedLogoSync, rememberLocalizedLogo } from '../services/logoService';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { pickFirstRealStreamUrlFromRow } from '../utils/streamUrlGuards';
import { getResponsiveImageSrcSet } from '../utils/imageProxy';
import {
  Play,
  ArrowLeft,
  Plus,
  Check,
  Clock,
  Star,
  Film,
  Tv,
  Users,
  ChevronDown,
  Globe,
  Building2,
  MapPin,
  Languages,
  DollarSign,
  ExternalLink,
  Image as ImageIcon,
  Briefcase,
} from 'lucide-react';

interface DetailsProps {
  media: Media;
  onPlay: (media?: Media) => void | Promise<void>;
  onBack: () => void;
  onSelectMedia?: (media: Media) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Race a promise against a timeout; resolves null on timeout */
function withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T | null> {
  return Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
}

const formatCurrency = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
};

/** Formata datas ISO vindas da TMDB evitando "Invalid Date" */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function mapDbSeasonToSeason(season: SeasonDB): Season {
  return {
    id: season.id,
    season_number: Number(season.season_number || 0),
    name: season.title || `Temporada ${season.season_number}`,
    poster_path: season.poster || null,
  };
}

/* ------------------------------------------------------------------ */
/*  Vision Pro / visionOS Glass — leve para TV Box (blur 12px)         */
/* ------------------------------------------------------------------ */
const visionGlass = (opacity = 0.05, blur?: number) => {
  const b = blur !== undefined ? blur : 12;
  return {
    background: `rgba(255,255,255,${opacity})`,
    backdropFilter: `blur(${b}px)`,
    WebkitBackdropFilter: `blur(${b}px)`,
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  };
};

/** Vision Pro: cards em cápsula — vidro transparente (frosted glass) */
const visionProCapsuleStyle = (): React.CSSProperties => {
  const b = 12;
  return {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: `blur(${b}px)`,
    WebkitBackdropFilter: `blur(${b}px)`,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  };
};

/* ------------------------------------------------------------------ */
/*  EpisodeCard — memoizado para evitar re-renders ao navegar foco     */
/* ------------------------------------------------------------------ */
interface EpisodeCardProps {
  ep: Episode;
  idx: number;
  selectedSeason: number;
  episodeGridStart: number;
  onPlay: (media?: Media) => void;
  buildEpisodePlaybackMedia: (ep: Episode) => Media;
  isWatched?: boolean;
  epProgressPercent?: number;
}

const EpisodeCard = React.memo(function EpisodeCard({
  ep,
  idx,
  selectedSeason,
  episodeGridStart,
  onPlay,
  buildEpisodePlaybackMedia,
  isWatched,
  epProgressPercent = 0,
}: EpisodeCardProps) {
  const playbackMedia = buildEpisodePlaybackMedia(ep);
  const playable = hasValidVideoUrl(playbackMedia as unknown as Record<string, unknown>);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.35 }}
      className="vision-episode-card group cursor-pointer flex flex-col"
      onClick={() => {
        if (!playable) return;
        playSelectSound();
        onPlay(playbackMedia);
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && playable) {
          e.preventDefault();
          playSelectSound();
          onPlay(playbackMedia);
        }
      }}
      tabIndex={0}
      data-episode-card
      data-nav-item
      data-nav-row={episodeGridStart + Math.floor(idx / 5)}
      data-nav-col={idx % 5}
      role="button"
      aria-label={`S${selectedSeason} E${ep.episode_number} - ${ep.name}`}
    >
      <div className="p-2 pb-0">
        <div className="relative w-full aspect-video overflow-hidden rounded-xl">
          {ep.still_path ? (
            <img
              src={getImageUrl(ep.still_path, 'w342')}
              srcSet={getResponsiveImageSrcSet(getImageUrl(ep.still_path, 'w342'), 'backdrop')}
              sizes="220px"
              alt={ep.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 group-focus-visible:scale-110"
              width={342}
              height={192}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/[0.03]">
              <Film size={22} className="text-white/10" />
            </div>
          )}
          {/* Checkmark de assistido */}
          {isWatched && (
            <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
              <Check size={11} className="text-white" strokeWidth={3} />
            </div>
          )}
          {/* Barra de progresso — verde completa se assistido, roxo parcial se em progresso */}
          {isWatched ? (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 rounded-b-xl" />
          ) : epProgressPercent > 0 ? (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-white/20">
              <div
                className="h-full rounded-b-xl"
                style={{
                  width: `${epProgressPercent}%`,
                  background: 'linear-gradient(90deg,#a855f7,#7c3aed)',
                }}
              />
            </div>
          ) : null}
          {playable && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-all duration-300">
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="relative w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.9), rgba(124,58,237,0.9))',
                  boxShadow: '0 4px 14px rgba(139,92,246,0.5)',
                }}
              >
                <Play size={13} fill="white" className="text-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="px-3 py-2.5 text-center">
        <p className="text-[11px] md:text-[12px] font-semibold text-white/70 group-hover:text-white transition-colors leading-snug line-clamp-1">
          S{selectedSeason} E{ep.episode_number} - {ep.name}
        </p>
      </div>
    </motion.div>
  );
});

const Details: React.FC<DetailsProps> = ({ media, onPlay, onBack, onSelectMedia }) => {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const backActionTsRef = useRef(0);
  const { setPosition, setCircularV, setCircularH, pushFocusTrap, popFocusTrap, setEnabled } =
    useSpatialNav();
  const { showToast } = useToast();
  const glassBlurTv = 12;

  // TV Box: wrap vertical e horizontal para setas funcionarem em todas as direções
  useEffect(() => {
    setCircularV(true);
    setCircularH(true);
    return () => {
      setCircularV(false);
      setCircularH(false);
    };
  }, [setCircularV, setCircularH]);

  // TV Box: sinalizar para __dispatchTVKey__ enviar Back e setas ao window (como LiveTV)
  useEffect(() => {
    setSignal('detailsActive', true);
    return () => {
      setSignal('detailsActive', false);
    };
  }, []);

  // Isola foco/teclas dentro da página de detalhes para não competir com rows de outras telas.
  useEffect(() => {
    pushFocusTrap('details-focus-trap');
    return () => popFocusTrap();
  }, [pushFocusTrap, popFocusTrap]);

  const handleBackClick = useCallback(() => {
    const now = Date.now();
    if (now - backActionTsRef.current < 180) return;
    backActionTsRef.current = now;

    // TV Box: garantir que o app NÃO feche ao voltar (MainActivity verifica __canExitApp após 200ms)
    setSignal('canExitApp', false);
    playBackSound();

    // Tenta callback primário.
    if (typeof onBackRef.current === 'function') onBackRef.current();

    // Fallback: se ainda estivermos em Details após o tick atual, força retorno.
    setTimeout(() => {
      if (!getSignal('detailsActive')) return;
      const goBack = window.__redxBackFromDetails;
      if (typeof goBack === 'function') {
        goBack();
        return;
      }
      window.dispatchEvent(new CustomEvent('redx-details-back'));
    }, 0);
  }, []);

  /* ───── state ───── */
  const [detail, setDetail] = useState<any>(() => {
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return null;
    return getCachedDetails(id, media.type === 'series' ? 'series' : 'movie')?.detail ?? null;
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    // Logo localizada conhecida (não a logo_url armazenada, que pode ser ja).
    const localized = getLocalizedLogoSync(media);
    if (localized) return localized;
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return null;
    return getCachedDetails(id, media.type === 'series' ? 'series' : 'movie')?.logo ?? null;
  });
  const [logoError, setLogoError] = useState(false);

  // Reset logoError quando media muda
  useEffect(() => {
    setLogoError(false);
  }, [media.id]);
  const [dbItem, setDbItem] = useState<Media | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);

  const [crew, setCrew] = useState<CrewMember[]>([]);

  // Series-specific
  const [seasons, setSeasons] = useState<Season[]>(() => {
    if (media.type !== 'series') return [];
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return [];
    const cached = getCachedDetails(id, 'series');
    const cachedSeasons = (cached?.detail as SeriesDetail | null)?.seasons;
    if (!cachedSeasons) return [];
    return cachedSeasons.filter((s) => s.season_number > 0);
  });
  const [selectedSeason, setSelectedSeason] = useState<number>(() => {
    if (media.type !== 'series') return 1;
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return 1;
    const cached = getCachedDetails(id, 'series');
    const cachedSeasons = (cached?.detail as SeriesDetail | null)?.seasons;
    if (!cachedSeasons) return 1;
    const real = cachedSeasons.filter((s) => s.season_number > 0);
    return real.length > 0 ? real[0].season_number : 1;
  });
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [watchedEpKeys, setWatchedEpKeys] = useState<Set<string>>(new Set());
  const [epProgressMap, setEpProgressMap] = useState<Map<string, number>>(new Map());
  const [seasonDropdown, setSeasonDropdown] = useState(false);
  const [dbSeasons, setDbSeasons] = useState<SeasonDB[]>([]);

  // Library
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inWatchLater, setInWatchLater] = useState(false);

  const [loading, setLoading] = useState<boolean>(() => {
    const id = media.tmdb_id ? Number(media.tmdb_id) : 0;
    if (!id) return true;
    return !getCachedDetails(id, media.type === 'series' ? 'series' : 'movie')?.detail;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSeries = media.type === 'series';
  const tmdbId = media.tmdb_id ? Number(media.tmdb_id) : 0;

  /* ───── initial data fetch ───── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!detail) setLoading(true);
      try {
        if (tmdbId) {
          // Cache hit: pré-fetched ao focar o card → carregamento instantâneo
          const cached = getCachedDetails(tmdbId, isSeries ? 'series' : 'movie');
          if (cached?.detail) {
            if (!cancelled) {
              setDetail(cached.detail);
              if (cached.logo) setLogoUrl(cached.logo);
              const det = cached.detail as SeriesDetail | null;
              if (isSeries && det?.seasons) {
                const realSeasons = det.seasons.filter((s) => s.season_number > 0);
                setSeasons(realSeasons);
                if (realSeasons.length > 0) setSelectedSeason(realSeasons[0].season_number);
              }
              setLoading(false);
            }
            // Continua buscando créditos em paralelo (não bloqueia o skeleton)
          }

          const [det, cred, logo, enriched] = await Promise.all([
            cached?.detail
              ? Promise.resolve(cached.detail)
              : withTimeout(isSeries ? fetchSeriesDetail(tmdbId) : fetchMovieDetail(tmdbId)),
            withTimeout(fetchSeriesCredits(tmdbId, isSeries ? 'series' : 'movie')),
            cached?.logo
              ? Promise.resolve(cached.logo)
              : withTimeout(getLogo(tmdbId, isSeries ? 'series' : 'movie')),
            withTimeout(getMediaDetailsByID(tmdbId, isSeries ? 'series' : 'movie')),
          ]);
          if (cancelled) return;
          setDetail(det);
          setCast(cred.cast?.slice(0, 12) || []);
          setCrew(
            cred.crew
              ?.filter((c: CrewMember) =>
                ['Executive Producer', 'Director', 'Writer', 'Creator', 'Producer'].includes(c.job)
              )
              .slice(0, 15) || []
          );
          {
            const finalLogo = getMediaLogo({
              ...media,
              logo_url: logo || enriched?.logo || media.logo_url || null,
              poster_path: det?.poster_path || (enriched as any)?.poster_path,
              backdrop_path: det?.backdrop_path || (enriched as any)?.backdrop_path,
            }) || null;
            setLogoUrl(finalLogo);
            if (logo) rememberLocalizedLogo(media, finalLogo);
          }
          if (isSeries && det?.seasons) {
            const realSeasons = det.seasons.filter((s: any) => s.season_number > 0);
            setSeasons(realSeasons);
            if (realSeasons.length > 0) setSelectedSeason(realSeasons[0].season_number);
          }

          if (isSeries) {
            const dbSeries = await getSeriesByTmdbId(tmdbId);
            if (cancelled) return;
            if (dbSeries) {
              setDbItem({ ...dbSeries, type: 'series' } as Media);
              const dbS = await getDBSeasons(dbSeries.id);
              if (cancelled) return;
              setDbSeasons(dbS);
              if (dbS.length > 0) {
                const normalizedDbSeasons = dbS
                  .map(mapDbSeasonToSeason)
                  .filter((s) => s.season_number > 0);
                setSeasons((current) => {
                  if (current.length > 0) return current;
                  return normalizedDbSeasons;
                });
                setSelectedSeason((current) => {
                  if (current > 0) return current;
                  return normalizedDbSeasons[0]?.season_number || 1;
                });
              }
            }
          } else {
            const dbMovie = await getMovieByTmdbId(tmdbId);
            if (cancelled) return;
            if (dbMovie) {
              setDbItem({ ...dbMovie, type: 'movie' } as Media);
            }
          }
        } else {
          // Quando não há tmdb_id válido (ex: dados fake/offline), usa as propriedades
          // locais do media diretamente — evita aguardar API TMDB inacessível.
          const hasLocalData = Boolean(media.title && (media.description || media.poster));
          if (hasLocalData) {
            setDetail({
              overview: media.description || '',
              vote_average: media.rating ? parseFloat(String(media.rating)) : undefined,
              backdrop_path: undefined,
            });
            setLogoUrl(getMediaLogo(media) || null);
            // Para séries sem tmdb_id: constrói array de temporadas a partir de media.seasons
            if (isSeries) {
              const seasonCount = typeof media.seasons === 'number' ? media.seasons : 1;
              const syntheticSeasons = Array.from({ length: seasonCount }, (_, i) => ({
                id: String(i + 1),
                season_number: i + 1,
                name: `Temporada ${i + 1}`,
                episode_count: 0,
                air_date: '',
                poster_path: null,
                overview: '',
              }));
              setSeasons(syntheticSeasons);
              setSelectedSeason(1);
            }
          } else {
            const type = isSeries ? 'tv' : 'movie';
            const fixed = await tmdbSync.getOrFixDetails(media, type);
            if (cancelled) return;
            if (fixed) {
              const path = fixed.backdrop?.includes('/original/')
                ? '/' + fixed.backdrop.split('/original/')[1]
                : undefined;
              setDetail({
                overview: fixed.description,
                vote_average: fixed.rating ? parseFloat(fixed.rating) : undefined,
                backdrop_path: path,
              });
              setLogoUrl(
                getMediaLogo({
                  ...media,
                  logo_url: fixed.logo || media.logo_url || null,
                }) || null
              );
            } else {
              setLogoUrl(getMediaLogo(media) || null);
            }
          }
        }

        if (cancelled) return;
        const id = media.tmdb_id || media.id;
        if (id) {
          userService
            .checkStatus(id)
            .then((s) => {
              if (cancelled) return;
              setInWatchlist(s.inWatchlist);
              setInWatchLater(s.inWatchLater);
            })
            .catch((err) => logger.warn('[Details] checkStatus falhou:', err));
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('Details load error:', err);
        setLogoUrl(getMediaLogo(media) || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    scrollRef.current?.scrollTo({ top: 0 });

    // Foco inicial nível Netflix: sempre no botão Play (Row 1, Col 0) quando o mount terminar
    // O motor espacial useSpatialNavigation cuida do 'pushFocusTrap', mas aqui forçamos a posição ideal.
    const t = setTimeout(() => {
      if (!cancelled) setPosition(1, 0);
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tmdbId, isSeries, setPosition, media.id]);

  useEffect(() => {
    if (!isSeries || selectedSeason < 1) return;
    // Fallback para séries sem tmdb_id: usa episodes embutidos no objeto media
    if (!tmdbId) {
      const mediaEpisodes = media.episodes;
      if (Array.isArray(mediaEpisodes)) {
        const filtered = mediaEpisodes.filter((ep) => ep.season_number === selectedSeason);
        setEpisodes(filtered.length > 0 ? filtered : mediaEpisodes);
      }
      setEpisodesLoading(false);
      return;
    }
    let cancelled = false;
    const fallbackSeriesUrl =
      pickFirstRealStreamUrlFromRow((dbItem || media) as unknown as Record<string, unknown>) ||
      pickFirstRealStreamUrlFromRow(media as unknown as Record<string, unknown>);
    setEpisodesLoading(true);
    setEpisodes([]);
    fetchSeasonEpisodes(tmdbId, selectedSeason)
      .then(async (eps) => {
        if (cancelled) return;
        const dbSeason = dbSeasons.find((s) => s.season_number === selectedSeason);
        if (dbSeason) {
          try {
            const dbEps = await getDBEpisodes(dbSeason.id);
            if (cancelled) return;
            eps = eps.map((ep) => {
              const match = dbEps.find((d) => d.episode_number === ep.episode_number);
              const resolvedStreamUrl =
                pickFirstRealStreamUrlFromRow(match as unknown as Record<string, unknown>) ||
                pickFirstRealStreamUrlFromRow(ep as unknown as Record<string, unknown>);
              return { ...ep, stream_url: resolvedStreamUrl || ep.stream_url || fallbackSeriesUrl || '' };
            });
          } catch {
            eps = eps.map((ep) => ({
              ...ep,
              stream_url:
                pickFirstRealStreamUrlFromRow(ep as unknown as Record<string, unknown>) ||
                ep.stream_url ||
                fallbackSeriesUrl ||
                '',
            }));
          }
        } else {
          eps = eps.map((ep) => ({
            ...ep,
            stream_url:
              pickFirstRealStreamUrlFromRow(ep as unknown as Record<string, unknown>) ||
              ep.stream_url ||
              fallbackSeriesUrl ||
              '',
          }));
        }
        if (!cancelled) {
          setEpisodes(eps);
          setEpisodesLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logger.warn('[Details] fetchSeasonEpisodes falhou:', err);
          setEpisodes([]);
          setEpisodesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSeason, tmdbId, isSeries, dbSeasons, dbItem, media]);

  useEffect(() => {
    if (!isSeries || !tmdbId) return;
    userService
      .getContinueWatching()
      .then((list) => {
        const keys = new Set<string>();
        const progress = new Map<string, number>();
        for (const item of list) {
          if (
            String(item.tmdb_id) === String(tmdbId) &&
            item.season_number &&
            item.episode_number
          ) {
            const pct =
              item.total_duration && item.total_duration > 0
                ? Math.min(100, Math.round((item.progress_seconds / item.total_duration) * 100))
                : 0;
            const epKey = `${item.season_number}-${item.episode_number}`;
            if (pct >= 85) keys.add(epKey);
            if (pct > 0) progress.set(epKey, pct);
          }
        }
        setWatchedEpKeys(keys);
        setEpProgressMap(progress);
      })
      .catch((err) => logger.warn('[Details] Progress load failed:', err));
  }, [isSeries, tmdbId]);

  /* ───── library toggles ───── */
  const toggleWatchlist = useCallback(async () => {
    const id = media.tmdb_id || media.id;
    logger.log('[Details] Toggle Watchlist:', id);
    if (!id) return;
    setInWatchlist((p) => !p);
    try {
      const r = await userService.toggleLibraryItem(id, isSeries ? 'tv' : 'movie', 'watchlist');
      logger.log('[Details] Watchlist result:', r);
      if (r === 'auth_required') {
        setInWatchlist((p) => !p);
        showToast('Faça login para adicionar à lista', 'error');
      } else if (r === 'unavailable') {
        setInWatchlist((p) => !p);
        showToast('Funcionalidade temporariamente indisponível', 'error');
      }
    } catch (e) {
      logger.error(e);
      setInWatchlist((p) => !p);
    }
  }, [media.tmdb_id, media.id, isSeries]);

  const toggleWatchLater = useCallback(async () => {
    const id = media.tmdb_id || media.id;
    logger.log('[Details] Toggle Watch Later:', id);
    if (!id) return;
    setInWatchLater((p) => !p);
    try {
      const r = await userService.toggleLibraryItem(id, isSeries ? 'tv' : 'movie', 'watch_later');
      logger.log('[Details] WatchLater result:', r);
      if (r === 'auth_required') {
        setInWatchLater((p) => !p);
        showToast('Faça login para assistir mais tarde', 'error');
      } else if (r === 'unavailable') {
        setInWatchLater((p) => !p);
        showToast('Funcionalidade temporariamente indisponível', 'error');
      }
    } catch (e) {
      logger.error(e);
      setInWatchLater((p) => !p);
    }
  }, [media.tmdb_id, media.id, isSeries]);

  /* ───── computed ───── */
  // Prioridade: TMDB (detail) para backdrop oficial > catálogo (media)
  const backdropUrl = useMemo(() => {
    if (detail?.backdrop_path) return getImageUrl(detail.backdrop_path, 'w1280');
    const fromMedia = getMediaBackdrop(media);
    if (fromMedia) return fromMedia;
    return media.backdrop || media.poster || '';
  }, [detail, media]);

  const title = media.title || detail?.name || detail?.title;
  const overview = String(detail?.overview || media.description || '').trim();
  const year =
    media.year || detail?.first_air_date?.slice(0, 4) || detail?.release_date?.slice(0, 4);
  const rating = media.rating
    ? String(media.rating)
    : detail?.vote_average
      ? Number(detail.vote_average).toFixed(1)
      : null;
  const runtime =
    media.duration ||
    (detail?.runtime ? `${Math.floor(detail.runtime / 60)}h ${detail.runtime % 60}m` : null);
  const tagline = detail?.tagline || '';
  const originalTitle = detail?.original_title || detail?.original_name || '';
  const status = detail?.status || '';
  const productionCompanies = detail?.production_companies || [];
  const productionCountries = detail?.production_countries || [];
  const spokenLanguages = detail?.spoken_languages || [];
  const budget = detail?.budget ? formatCurrency(detail.budget) : null;
  const revenue = detail?.revenue ? formatCurrency(detail.revenue) : null;
  const imdbId = detail?.imdb_id || '';
  const voteCount = detail?.vote_count ?? 0;
  const homepage = detail?.homepage || '';
  const popularity = detail?.popularity ? Math.round(detail.popularity) : null;
  const numberOfEpisodes = detail?.number_of_episodes || 0;
  const releaseDate = detail?.release_date || detail?.first_air_date || '';
  const lastAirDate = detail?.last_air_date || '';
  const directSeriesUrl = useMemo(
    () =>
      pickFirstRealStreamUrlFromRow((dbItem || media) as unknown as Record<string, unknown>) ||
      pickFirstRealStreamUrlFromRow(media as unknown as Record<string, unknown>),
    [dbItem, media]
  );
  const buildEpisodePlaybackMedia = useCallback(
    (ep: Episode): Media => {
      const baseMedia = dbItem || media;
      const resolvedEpisodeUrl = pickFirstRealStreamUrlFromRow(
        ep as unknown as Record<string, unknown>
      );
      return {
        ...baseMedia,
        stream_url: resolvedEpisodeUrl || ep.stream_url || directSeriesUrl || '',
        season_number: ep.season_number || selectedSeason,
        episode_number: ep.episode_number,
        episode_title: ep.name || ep.title,
      } as Media;
    },
    [dbItem, media, selectedSeason, directSeriesUrl]
  );

  // Para séries, só considerar "playável" se a URL do episódio for realmente válida
  // (http/https, não conter placeholders/indisponíveis, e não estar na lista de URLs conhecidas quebradas).
  const hasPlayableEpisode = useMemo(
    () => episodes.some((ep) => hasValidVideoUrl(ep as unknown as Record<string, unknown>)),
    [episodes]
  );
  const isDirectOnlySeriesPlayback =
    isSeries && Boolean(directSeriesUrl) && dbSeasons.length === 0 && seasons.length === 0;
  // Séries podem ter stream_url direto na tabela (sem episódios cadastrados) — usar como fallback
  // FIX: verifica media E dbItem separadamente — dbItem presente mas sem URL não bloqueia o botão

  const episodesSectionRef = useRef<HTMLElement>(null);
  const focusEpisodesSection = useCallback(
    (smoothScroll = true) => {
      if (!isSeries) return;
      const scrollBehavior: ScrollBehavior = smoothScroll ? 'smooth' : 'auto';
      const targetTop = Math.max(
        0,
        (episodesSectionRef.current?.offsetTop || window.innerHeight) - 96
      );
      scrollRef.current?.scrollTo({ top: targetTop, behavior: scrollBehavior });
      window.requestAnimationFrame(() => {
        setPosition(2, 0);
        const target =
          episodesSectionRef.current?.querySelector<HTMLElement>('[data-season-pill]') ||
          episodesSectionRef.current?.querySelector<HTMLElement>('[data-episode-card]');
        target?.focus({ preventScroll: true });
      });
    },
    [isSeries, setPosition]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const movieHasValidUrl = useMemo(
    () => hasValidVideoUrl((dbItem || media) as unknown as Record<string, unknown>),
    [dbItem, media]
  );
  const canPlayPrimary = isSeries
    ? Boolean(directSeriesUrl || hasPlayableEpisode)
    : movieHasValidUrl;

  const handlePlayPrimary = useCallback(() => {
    if (isPlaying) return;
    if (!canPlayPrimary) {
      playBackSound();
      showToast(
        isSeries
          ? 'Nenhum episódio com URL válida foi encontrado para esta série.'
          : 'Este filme ainda não possui URL de vídeo válida.',
        'error'
      );
      if (isSeries) focusEpisodesSection(true);
      return;
    }
    // FIX: preserva stream_url do catalog (media) se dbItem existir mas não tiver URL
    const baseMedia = dbItem || media;
    const playMedia = {
      ...baseMedia,
      stream_url:
        directSeriesUrl || baseMedia.stream_url || media.stream_url || '',
      season_number: isDirectOnlySeriesPlayback ? undefined : baseMedia.season_number,
      episode_number: isDirectOnlySeriesPlayback ? undefined : baseMedia.episode_number,
      episode_title: isDirectOnlySeriesPlayback ? undefined : baseMedia.episode_title,
    } as Media;
    setIsPlaying(true);
    playSelectSound();

    let playFn: () => Promise<void>;

    if (isDirectOnlySeriesPlayback) {
      playFn = () => onPlay(playMedia) as Promise<void>;
    } else if (isSeries && episodes.length > 0) {
      const firstPlayable = episodes.find((ep) => hasValidVideoUrl(ep as unknown as Record<string, unknown>));
      if (firstPlayable) {
        playFn = () => onPlay(buildEpisodePlaybackMedia(firstPlayable)) as Promise<void>;
      } else if (directSeriesUrl) {
        playFn = () => onPlay(playMedia) as Promise<void>;
      } else {
        setIsPlaying(false);
        return;
      }
    } else if (!isSeries) {
      playFn = () => onPlay(playMedia) as Promise<void>;
    } else {
      setIsPlaying(false);
      return;
    }

    playFn()
      .catch(() => {})
      .finally(() => setIsPlaying(false));
  }, [
    isSeries,
    episodes,
    onPlay,
    dbItem,
    media,
    buildEpisodePlaybackMedia,
    hasPlayableEpisode,
    isPlaying,
    directSeriesUrl,
    isDirectOnlySeriesPlayback,
    canPlayPrimary,
    focusEpisodesSection,
    showToast,
  ]);

  const handleSelectSimilar = useCallback(
    (rec: any) => {
      const type = rec.media_type === 'tv' ? 'series' : rec.first_air_date ? 'series' : 'movie';
      const mediaLike: Media = {
        id: String(rec.id),
        title: rec.title || rec.name || '',
        type,
        tmdb_id: rec.id,
        poster: rec.poster_path ? getImageUrl(rec.poster_path, 'w500') || '' : '',
        backdrop: rec.backdrop_path ? getImageUrl(rec.backdrop_path, 'w1280') || '' : '',
        description: rec.overview || '',
        year: (rec.release_date || rec.first_air_date || '').slice(0, 4)
          ? parseInt((rec.release_date || rec.first_air_date).slice(0, 4))
          : undefined,
        rating: rec.vote_average ? String(Number(rec.vote_average).toFixed(1)) : undefined,
        stream_url: '',
      } as Media;
      if (onSelectMedia) onSelectMedia(mediaLike);
      else onPlay(mediaLike);
    },
    [onSelectMedia, onPlay]
  );

  const hasInfoSection = Boolean(
    originalTitle ||
    status ||
    productionCompanies.length > 0 ||
    productionCountries.length > 0 ||
    spokenLanguages.length > 0 ||
    budget ||
    revenue ||
    imdbId ||
    homepage
  );

  const hasSeasonTabs = isSeries && seasons.length > 0;
  const episodeGridStart = hasSeasonTabs ? 3 : 2;
  const episodeNavRows = isSeries ? Math.ceil(episodes.length / 5) : 0;
  const overviewRow = episodeGridStart + episodeNavRows;
  const infoRow = overviewRow + 1;
  const castRow = hasInfoSection ? infoRow + 1 : overviewRow + 1;

  /* ───── keyboard ───── (Escape/Back e ArrowLeft no botão voltar) — capture para rodar antes do spatial nav */

  const focusHeroStart = useCallback(
    (smoothScroll = false) => {
      const scrollBehavior: ScrollBehavior = smoothScroll ? 'smooth' : 'auto';
      scrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior });
      setPosition(1, 0);
      window.requestAnimationFrame(() => {
        playButtonRef.current?.focus({ preventScroll: true });
      });
    },
    [setPosition]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Back/Escape — voltar (ou fechar dropdown) — inclui variantes Android TV
      if (
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        e.key === 'Back' ||
        e.key === 'GoBack' ||
        e.key === 'BrowserBack'
      ) {
        if (seasonDropdown) {
          setSeasonDropdown(false);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleBackClick();
        return;
      }
      if (e.key === 'ArrowUp' && !seasonDropdown) {
        const activeElement = document.activeElement as HTMLElement | null;
        const activeRowAttr = activeElement?.closest<HTMLElement>('[data-nav-row]')?.dataset.navRow;
        const activeRow = Number(activeRowAttr ?? -1);
        // Allow going back from any content row (2+) to the banner (row 1)
        if (Number.isFinite(activeRow) && activeRow >= 2) {
          e.preventDefault();
          e.stopPropagation();
          focusHeroStart(true);
        }
      }
      // ArrowLeft/ArrowDown/ArrowRight: deixar o Spatial Navigation gerenciar
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [focusHeroStart, handleBackClick, overviewRow, seasonDropdown]);

  /* ───── foco inicial: botão Assistir (row 1, col 0) ao abrir Details ───── */
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!seasonDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(e.target as Node)) {
        setSeasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [seasonDropdown]);

  // Desativa nav espacial quando dropdown de temporada está aberto e auto-foca primeiro item
  useEffect(() => {
    setEnabled(!seasonDropdown);
    if (seasonDropdown) {
      setTimeout(() => {
        const first = seasonDropdownRef.current?.querySelector<HTMLElement>('[data-season-item]');
        first?.focus();
      }, 50);
    }
    return () => {
      // Garante reativação da navegação ao sair de Details, mesmo que o dropdown
      // esteja aberto no momento do unmount.
      setEnabled(true);
    };
  }, [seasonDropdown, setEnabled]);

  useEffect(() => {
    if (loading) return;
    // Não roubar foco quando o dropdown de temporadas estiver aberto
    if (seasonDropdown) return;
    let mounted = true;
    let attempts = 0;
    const interval = setInterval(() => {
      if (!mounted || attempts >= 15) {
        clearInterval(interval);
        return;
      }
      if (playButtonRef.current) {
        focusHeroStart();
        clearInterval(interval);
      }
      attempts++;
    }, 200);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [focusHeroStart, loading, seasonDropdown]);

  /* ───── carregamento: spinner + backdrop ───── */
  if (loading) {
    const loadingBg =
      getMediaBackdrop(media) ||
      (typeof media.backdrop === 'string' && media.backdrop.trim()
        ? media.backdrop
        : '') ||
      (typeof media.poster === 'string' && media.poster.trim()
        ? media.poster
        : '');
    return createPortal(
      <div
        id="details-focus-trap"
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[60] overflow-hidden bg-[#0a0418] text-white"
      >
        {loadingBg ? (
          <img
            src={loadingBg}
            srcSet={getResponsiveImageSrcSet(loadingBg, 'backdrop')}
            sizes="100vw"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35 blur-sm scale-105"
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="absolute inset-0 bg-black/60" aria-hidden />

        {/* Skeleton de conteúdo — espelha layout real do hero (bottom-left) */}
        <div className="absolute bottom-32 left-10 z-10 flex flex-col gap-4 pointer-events-none" style={{ maxWidth: 420 }}>
          {/* Logo/título placeholder */}
          <div className="h-10 w-52 rounded-xl relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="absolute inset-0 skeleton-shimmer-netflix" />
          </div>
          {/* Descrição placeholder — 3 linhas */}
          <div className="flex flex-col gap-2">
            {[90, 80, 60].map((w) => (
              <div
                key={w}
                className="h-2.5 rounded-full relative overflow-hidden"
                style={{ width: `${w}%`, background: 'rgba(255,255,255,0.05)' }}
              >
                <div className="absolute inset-0 skeleton-shimmer-netflix" />
              </div>
            ))}
          </div>
          {/* Botões placeholder */}
          <div className="flex gap-3 mt-1">
            <div className="h-10 w-28 rounded-full relative overflow-hidden" style={{ background: 'rgba(124,58,237,0.25)' }}>
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
            <div className="h-10 w-28 rounded-full relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
            <div className="h-10 w-10 rounded-full relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="absolute inset-0 skeleton-shimmer-netflix" />
            </div>
          </div>
          {/* Tags de gênero placeholder */}
          <div className="flex gap-2">
            {[60, 80, 50].map((w) => (
              <div
                key={w}
                className="h-5 rounded-full relative overflow-hidden"
                style={{ width: w, background: 'rgba(255,255,255,0.06)' }}
              >
                <div className="absolute inset-0 skeleton-shimmer-netflix" />
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="h-11 w-11 rounded-full border-2 border-white/15 border-t-violet-500 animate-spin"
            role="status"
            aria-label="Carregando"
          />
        </div>
        {/* Back button — always interactive */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleBackClick();
          }}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' ||
              e.key === ' ' ||
              e.key === 'Escape' ||
              e.key === 'Backspace' ||
              e.key === 'Back' ||
              e.key === 'GoBack' ||
              e.key === 'BrowserBack'
            ) {
              e.preventDefault();
              e.stopPropagation();
              handleBackClick();
            }
          }}
          className="absolute top-8 left-8 z-[99999] w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/50 border border-white/10 hover:bg-white/10 bg-black/40 backdrop-blur-xl"
          aria-label="Voltar"
          data-nav-back
          tabIndex={0}
        >
          <ArrowLeft size={24} />
        </button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      id="details-focus-trap"
      ref={scrollRef}
      role="dialog"
      aria-modal="true"
      data-testid="detail-overlay"
      className="redx-background fixed inset-0 z-[60] overflow-y-auto overflow-x-hidden text-white font-sans selection:bg-white/20 animate-fade-in vision-details-page"
    >
      {/* Background global herdado do CSS global */}

      {/* Row 0: botão Voltar — wrapper para spatial nav encontrar */}
      <div className="fixed top-0 left-0 z-[99999] isolate" data-nav-row="0" data-nav-wrap="true">
        <button
          ref={backButtonRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleBackClick();
          }}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' ||
              e.key === ' ' ||
              e.key === 'Escape' ||
              e.key === 'Backspace' ||
              e.key === 'Back' ||
              e.key === 'GoBack' ||
              e.key === 'BrowserBack'
            ) {
              e.preventDefault();
              e.stopPropagation();
              handleBackClick();
            }
          }}
          className="mt-8 ml-8 w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/50 border border-white/10 hover:bg-white/10 bg-black/40 backdrop-blur-xl"
          style={{ pointerEvents: 'auto' }}
          aria-label="Voltar"
          data-nav-back
          data-nav-item
          data-nav-col="0"
          tabIndex={0}
        >
          <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
        </button>
      </div>

      {/* ══════ HERO BACKDROP ══════ */}
      <div className="relative w-screen h-screen overflow-visible">
        {/* Background image */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={backdropUrl || ''}
            srcSet={getResponsiveImageSrcSet(backdropUrl, 'backdrop')}
            sizes="100vw"
            alt={title}
            className="w-full h-full object-cover"
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0';
            }}
          />
        </div>
        {/* Gradiente lateral esquerdo (info area) */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 25%, transparent 55%)',
          }}
        />
        {/* Gradiente inferior — seamless fade into page background visionOS */}
        <div
          className="absolute bottom-0 left-0 right-0 z-[1] pointer-events-none"
          style={{
            height: '80vh',
            background:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 20%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.7) 65%, #000 100%)',
          }}
        />
        {/* Gradiente superior sutil */}
        <div
          className="absolute top-0 left-0 right-0 h-[30%] z-[1] pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)',
          }}
        />
        {/* Vinheta lateral roxa sutil */}
        <div
          className="absolute inset-0 w-[55%] h-full z-[1] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 140% 180% at 0% 85%, rgba(109,40,217,0.35) 0%, rgba(77,29,149,0.25) 20%, rgba(42,17,88,0.15) 40%, transparent 65%)',
          }}
        />
        {/* ══════ HERO CONTENT ══════ */}
        <div className="absolute bottom-[1cm] left-0 right-0 z-[12] overflow-visible px-8 md:px-16 pb-16">
          <motion.div
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="max-w-[72rem]"
          >
            {/* Logo — se disponível; senão exibe texto do título */}
            {logoUrl && !logoError ? (
              <img
                src={logoUrl}
                alt={title}
                className="max-h-[84px] max-w-[350px] w-auto object-contain drop-shadow-2xl mb-8 origin-left"
                decoding="async"
                onError={() => setLogoError(true)}
              />
            ) : (
              title && (
                <h1 className="text-3xl md:text-5xl font-black text-white drop-shadow-2xl mb-8 leading-tight tracking-tight">
                  {title}
                </h1>
              )
            )}

            {/* Tagline */}
            {tagline && (
              <p className="text-lg text-white/60 italic mb-6 font-medium tracking-wide border-l-2 border-[#A855F7] pl-4">
                {tagline}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 mb-8 flex-wrap">
              {rating && (
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10"
                  style={visionGlass(0.1)}
                >
                  <Star size={16} className="text-yellow-500" fill="currentColor" />
                  <span className="text-base font-bold text-white">{rating}</span>
                  {voteCount > 0 && (
                    <span className="text-[10px] text-white/40 font-medium">
                      ({voteCount.toLocaleString('pt-BR')})
                    </span>
                  )}
                </div>
              )}
              {year && (
                <div
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm font-medium text-white/90"
                  style={visionGlass(0.05)}
                >
                  {year}
                </div>
              )}
              {runtime && !isSeries && (
                <div
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm font-medium text-white/90"
                  style={visionGlass(0.05)}
                >
                  {runtime}
                </div>
              )}
              {isSeries && (
                <div ref={seasonDropdownRef} className="relative z-[20]">
                  <button
                    type="button"
                    onClick={() => {
                      focusEpisodesSection(true);
                      playSelectSound();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        focusEpisodesSection(true);
                        playSelectSound();
                      } else if (e.key === 'ArrowDown' && !seasonDropdown) {
                        e.preventDefault();
                        focusEpisodesSection(true);
                        playSelectSound();
                      }
                    }}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg border border-white/10 text-sm font-medium text-white/90 cursor-pointer hover:bg-white/10 transition-all outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/50 focus:bg-white/10 focus:scale-105 focus-visible:border-[#a78bfa] focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50 focus-visible:bg-white/10 focus-visible:scale-105"
                    style={visionGlass(0.05)}
                    tabIndex={0}
                    data-nav-item
                    data-nav-row="1"
                    data-nav-col="4"
                    data-testid="details-season-btn"
                  >
                    <span>{detail?.number_of_seasons || media.seasons || 1} Temporadas</span>
                    <ChevronDown
                      size={14}
                      className="shrink-0 transition-transform duration-300 -rotate-90"
                    />
                  </button>

                  <AnimatePresence>
                    {seasonDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        className="absolute left-0 top-full mt-2 rounded-2xl overflow-hidden min-w-[240px] border border-white/20 shadow-2xl z-[80] pointer-events-auto"
                        style={{
                          background: 'rgba(255,255,255,0.12)',
                          backdropFilter: `blur(${glassBlurTv}px)`,
                          WebkitBackdropFilter: `blur(${glassBlurTv}px)`,
                        }}
                      >
                        {seasons.map((s) => (
                          <button
                            key={s.season_number}
                            tabIndex={0}
                            data-season-item
                            onClick={() => {
                              setSelectedSeason(s.season_number);
                              setSeasonDropdown(false);
                              playSelectSound();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedSeason(s.season_number);
                                setSeasonDropdown(false);
                                playSelectSound();
                              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                e.preventDefault();
                                e.stopPropagation();
                                const items = Array.from(
                                  seasonDropdownRef.current?.querySelectorAll<HTMLElement>(
                                    '[data-season-item]'
                                  ) || []
                                );
                                const idx = items.indexOf(document.activeElement as HTMLElement);
                                const next =
                                  e.key === 'ArrowDown'
                                    ? Math.min(idx + 1, items.length - 1)
                                    : Math.max(idx - 1, 0);
                                items[next]?.focus();
                              } else if (
                                e.key === 'Escape' ||
                                e.key === 'Back' ||
                                e.key === 'GoBack' ||
                                e.key === 'BrowserBack'
                              ) {
                                e.preventDefault();
                                setSeasonDropdown(false);
                              }
                            }}
                            className={`w-full px-5 py-4 text-left text-sm font-bold transition-all border-b border-white/5 last:border-0 flex items-center gap-2 outline-none focus:bg-white/10 focus:text-white
                            ${
                              s.season_number === selectedSeason
                                ? 'text-white bg-[linear-gradient(90deg,rgba(139,92,246,0.32)_0%,rgba(59,130,246,0.18)_100%)]'
                                : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span>Temporada {s.season_number}</span>
                            {s.episode_count ? (
                              <span className="text-[10px] ml-auto opacity-60 block uppercase tracking-wider">
                                {s.episode_count} eps
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {isSeries && numberOfEpisodes > 0 && (
                <div
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm font-medium text-white/90"
                  style={visionGlass(0.05)}
                >
                  {numberOfEpisodes} Episódios
                </div>
              )}
            </div>

            {/* Botões pequenos — glow roxo atrás */}
            <div className="flex items-center gap-2 flex-wrap relative" data-nav-row="1">
              {/* Assistir — botão play estilo detalhes-main */}
              <button
                ref={playButtonRef}
                disabled={isPlaying || !canPlayPrimary}
                onClick={() => {
                  if (isPlaying) return;
                  handlePlayPrimary();
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !isPlaying) {
                    e.preventDefault();
                    handlePlayPrimary();
                  }
                }}
                data-nav-item
                data-nav-col="0"
                data-testid="details-play-btn"
                className={`details-botao-play flex items-center justify-center gap-2 py-3 px-6 rounded-full font-bold text-base ${isPlaying || !canPlayPrimary ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={canPlayPrimary ? 'Assistir' : 'Sem URL de video valida'}
              >
                {isPlaying ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Play size={20} fill="currentColor" className="shrink-0" />
                )}
                <span>{isPlaying ? 'Carregando...' : canPlayPrimary ? 'Assistir' : 'Indisponível'}</span>
              </button>

              {/* Adicionar à lista */}
              <button
                onClick={() => {
                  playSelectSound();
                  toggleWatchlist();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    playSelectSound();
                    toggleWatchlist();
                  }
                }}
                className="details-botao-glass flex items-center justify-center gap-2 py-3 px-6 rounded-full font-bold text-base shrink-0"
                title={inWatchlist ? 'Remover da Lista' : 'Adicionar à lista'}
                data-nav-item
                data-nav-col="1"
              >
                {inWatchlist ? (
                  <Check size={20} strokeWidth={2.5} />
                ) : (
                  <Plus size={20} strokeWidth={2} />
                )}
                <span>{inWatchlist ? 'Na Lista' : 'Adicionar'}</span>
              </button>

              {/* Assistir mais tarde */}
              <button
                onClick={() => {
                  playSelectSound();
                  toggleWatchLater();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    playSelectSound();
                    toggleWatchLater();
                  }
                }}
                className="details-botao-glass flex items-center justify-center gap-2 py-3 px-6 rounded-full font-bold text-base shrink-0"
                title={inWatchLater ? 'Remover de Ver Depois' : 'Assistir mais tarde'}
                data-nav-item
                data-nav-col="2"
              >
                {inWatchLater ? (
                  <Check size={20} strokeWidth={2.5} />
                ) : (
                  <Clock size={20} strokeWidth={2} />
                )}
                <span>{inWatchLater ? 'Adicionado' : 'Ver Depois'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ══════ CONTENT AREA ══════ */}
      <div className="relative z-10 mt-8 pb-24 w-full max-w-[1840px] mx-auto px-6 md:px-12 xl:px-16">
        {/* ══════ SEASONS & EPISODES — visionOS 5-col grid ══════ */}
        {/* Loading placeholder para série com episódios ainda carregando */}
        {isSeries && !isDirectOnlySeriesPlayback && loading && seasons.length === 0 && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="w-full mb-8"
          >
            <h2 className="text-lg font-bold text-white/90 mb-5">Episódios</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="vision-glass-card-transparent aspect-video animate-pulse rounded-xl"
                />
              ))}
            </div>
          </motion.section>
        )}
        {isSeries && !isDirectOnlySeriesPlayback && seasons.length > 0 && (
          <motion.section
            ref={episodesSectionRef}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full relative"
          >
            <div className="flex items-center gap-4 mb-5 flex-wrap">
              <h2 className="text-lg font-bold text-white/90 shrink-0">
                Episódios
                <span className="text-white/40 font-medium ml-2 text-sm">
                  ({episodes.length} Eps)
                </span>
              </h2>

              <div
                className="flex gap-2 overflow-x-auto no-scrollbar"
                data-nav-row="2"
                data-nav-wrap="true"
              >
                {seasons.map((s, sIdx) => (
                  <button
                    key={s.season_number}
                    type="button"
                    onClick={() => {
                      setSelectedSeason(s.season_number);
                      setSeasonDropdown(false);
                      playSelectSound();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSeason(s.season_number);
                        playSelectSound();
                      }
                    }}
                    className={`vision-season-pill shrink-0 px-4 py-1.5 rounded-xl text-xs font-bold ${
                      s.season_number === selectedSeason
                        ? 'vision-season-pill--active text-white'
                        : 'text-white/50'
                    }`}
                    data-nav-item
                    data-season-pill
                    data-nav-col={sIdx}
                    tabIndex={0}
                  >
                    T{s.season_number}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedSeason}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4"
              >
                {/* Skeleton: enquanto carrega, mostrar N fantasmas baseado em episode_count */}
                {episodesLoading &&
                  episodes.length === 0 &&
                  (() => {
                    const activeSeason = seasons.find((s) => s.season_number === selectedSeason);
                    const count = activeSeason?.episode_count || 10;
                    return Array.from({ length: Math.min(count, 20) }).map((_, i) => (
                      <div
                        key={`skel-${i}`}
                        className="vision-episode-card flex flex-col animate-pulse"
                      >
                        <div className="p-2 pb-0">
                          <div className="w-full aspect-video rounded-xl bg-white/[0.06]" />
                        </div>
                        <div className="px-3 py-2.5 flex justify-center">
                          <div className="h-3 w-3/4 rounded bg-white/[0.06]" />
                        </div>
                      </div>
                    ));
                  })()}
                {episodes.map((ep, idx) => (
                  <EpisodeCard
                    key={ep.id || `${selectedSeason}-${idx}`}
                    ep={ep}
                    idx={idx}
                    selectedSeason={selectedSeason}
                    episodeGridStart={episodeGridStart}
                    onPlay={onPlay}
                    buildEpisodePlaybackMedia={buildEpisodePlaybackMedia}
                    isWatched={watchedEpKeys.has(`${selectedSeason}-${ep.episode_number}`)}
                    epProgressPercent={
                      epProgressMap.get(`${selectedSeason}-${ep.episode_number}`) ?? 0
                    }
                  />
                ))}

                {episodes.length === 0 && !loading && !episodesLoading && (
                  <div className="col-span-full py-12 text-center">
                    <Tv size={32} className="mx-auto mb-3 text-white/15" />
                    <p className="text-white/25 font-bold uppercase tracking-[0.2em] text-[10px]">
                      Nenhum episódio
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.section>
        )}
        {isDirectOnlySeriesPlayback && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full mb-8"
          >
            <div className="vision-glass-card-transparent rounded-2xl px-5 py-4 text-white/75">
              <p className="text-sm font-semibold text-white/90 mb-1">Reprodução direta</p>
              <p className="text-xs leading-6">
                Este título está configurado para abrir direto no player. Enquanto não houver
                temporadas e episódios cadastrados no banco, a navegação por episódios fica oculta
                para evitar erros de reprodução.
              </p>
            </div>
          </motion.section>
        )}

        {/* ══════ SINOPSE + INFO (layout 2/3 + 1/3 do detalhes-main) ══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8" id="details-info-section">
          {/* Coluna esquerda: sinopse */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Overview */}
            <motion.section
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="vision-glass-card-transparent p-8 relative overflow-hidden"
              data-nav-row={overviewRow}
              data-nav-item
              data-nav-col="0"
              tabIndex={0}
            >
              <div className="flex items-center gap-4 mb-6">
                <Film size={18} className="text-white/40" />
                <h3 className="text-xs uppercase font-black tracking-[0.4em] text-white/50">
                  Sinopse Completa
                </h3>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <p className="text-lg md:text-xl text-white/80 leading-relaxed font-light">
                {overview || 'Nenhuma descrição disponível.'}
              </p>
            </motion.section>
          </div>

          {/* Coluna direita: informações */}
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="vision-glass-card-transparent p-8 relative overflow-hidden self-start"
            data-nav-row={infoRow}
            data-nav-item
            data-nav-col="0"
            tabIndex={0}
          >
            <div className="flex items-center gap-3 mb-6">
              <Tv size={18} className="text-white/40" />
              <h3 className="text-xs uppercase font-black tracking-[0.4em] text-white/50">
                Informações
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-white/80">
              {originalTitle && originalTitle !== title && (
                <div className="flex items-start gap-3">
                  <Film size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Título original
                    </p>
                    <p className="text-sm font-medium">{originalTitle}</p>
                  </div>
                </div>
              )}
              {status && (
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Status
                    </p>
                    <p className="text-sm font-medium capitalize">{status.replace(/_/g, ' ')}</p>
                  </div>
                </div>
              )}
              {productionCompanies.length > 0 && (
                <div className="flex items-start gap-3 md:col-span-2">
                  <Building2 size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
                      Produção
                    </p>
                    <p className="text-sm font-medium">
                      {productionCompanies.map((c: any) => c.name).join(', ')}
                    </p>
                  </div>
                </div>
              )}
              {productionCountries.length > 0 && (
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Países
                    </p>
                    <p className="text-sm font-medium">
                      {productionCountries.map((c: any) => c.name).join(', ')}
                    </p>
                  </div>
                </div>
              )}
              {spokenLanguages.length > 0 && (
                <div className="flex items-start gap-3">
                  <Languages size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Idiomas
                    </p>
                    <p className="text-sm font-medium">
                      {spokenLanguages.map((l: any) => l.english_name || l.name).join(', ')}
                    </p>
                  </div>
                </div>
              )}
              {!isSeries && budget && (
                <div className="flex items-start gap-3">
                  <DollarSign size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Orçamento
                    </p>
                    <p className="text-sm font-medium">{budget}</p>
                  </div>
                </div>
              )}
              {!isSeries && revenue && (
                <div className="flex items-start gap-3">
                  <DollarSign size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Bilheteria
                    </p>
                    <p className="text-sm font-medium">{revenue}</p>
                  </div>
                </div>
              )}
              {imdbId && (
                <a
                  href={`https://www.imdb.com/title/${imdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                >
                  <ExternalLink size={16} />
                  <span className="text-sm font-medium">IMDb</span>
                </a>
              )}
              {homepage && (
                <a
                  href={homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                >
                  <Globe size={16} />
                  <span className="text-sm font-medium truncate max-w-[200px]">Site oficial</span>
                </a>
              )}
              {releaseDate && (
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      {isSeries ? 'Primeira exibição' : 'Lançamento'}
                    </p>
                    <p className="text-sm font-medium">{formatDate(releaseDate)}</p>
                  </div>
                </div>
              )}
              {isSeries && lastAirDate && (
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Última exibição
                    </p>
                    <p className="text-sm font-medium">{formatDate(lastAirDate)}</p>
                  </div>
                </div>
              )}
              {popularity && popularity > 0 && (
                <div className="flex items-start gap-3">
                  <Star size={18} className="text-white/40 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                      Popularidade TMDB
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-32 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#A855F7] to-[#6D28D9]"
                          style={{ width: `${Math.min(100, popularity / 10)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{popularity}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.section>
        </div>
        {/* end synopsis+info grid */}

        {cast.length > 0 && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="w-full mt-8 p-10 rounded-[1.35rem] overflow-hidden relative border border-white/[0.12]"
            style={visionProCapsuleStyle()}
          >
            {/* Brilhos premium consistentes */}
            <div className="pointer-events-none absolute -bottom-16 right-4 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.1)_0%,rgba(168,85,247,0)_72%)]" />

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <Users size={20} className="text-white/40" />
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white/90">
                  Elenco Principal
                </h2>
              </div>

              <div className="flex gap-8 overflow-x-auto pb-4 no-scrollbar" data-nav-scroll>
                {cast.map((actor, idx) => (
                  <div
                    key={actor.id}
                    className="flex-shrink-0 flex flex-col items-center gap-3 w-28 group focus:outline-none"
                    data-nav-item
                    data-nav-actor-card
                    data-nav-row={castRow}
                    data-nav-col={idx}
                    tabIndex={0}
                  >
                    <div className="w-24 h-24 rounded-full overflow-hidden transition-all duration-500 group-hover:scale-110 group-focus:scale-110 group-focus-visible:scale-110 shadow-lg border-2 border-transparent grayscale group-hover:grayscale-0 group-focus:grayscale-0 group-focus-visible:grayscale-0 group-focus:border-white/60 group-focus-visible:border-white/60 group-focus:ring-1 group-focus:ring-white/20 group-focus:[box-shadow:0_0_0_3px_rgba(255,255,255,0.15),0_0_16px_rgba(255,255,255,0.12)]">
                      {actor.profile_path ? (
                        <img
                          src={getImageUrl(actor.profile_path, 'w200')}
                          alt={actor.name}
                          className="w-full h-full object-cover"
                          width={96}
                          height={96}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/20 text-xl font-bold">
                          {actor.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="text-center w-full">
                      <p className="text-xs font-bold text-white/90 truncate mb-0.5">
                        {actor.name}
                      </p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest truncate">
                        {actor.character}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        )}

        {/* ══════ CREW ══════ */}
        {crew.length > 0 && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            className="w-full mt-8"
          >
            <div className="flex items-center gap-4 mb-6">
              <Briefcase size={20} className="text-white/40" />
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white/90">
                Equipe Técnica
              </h2>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="details-scroll-horizontal">
              {crew.map((person, idx) => (
                <div
                  key={`crew-${person.id}-${idx}`}
                  className="details-scroll-item w-36 details-card"
                  tabIndex={0}
                >
                  <div className="aspect-[2/3] bg-gray-800 rounded-xl overflow-hidden mb-3">
                    {person.profile_path ? (
                      <img
                        src={getImageUrl(person.profile_path, 'w200')}
                        alt={person.name}
                        className="w-full h-full object-cover"
                        width={144}
                        height={216}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 bg-white/5">
                        <Users size={32} />
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-sm truncate text-white/90 px-1">{person.name}</h3>
                  <p className="text-xs text-white/40 truncate px-1 mb-2">{person.job}</p>
                </div>
              ))}
            </div>
          </motion.section>
        )}
        {/* ══════ GALERIA ══════ */}
        {(detail?.images?.backdrops?.length > 0 || detail?.images?.posters?.length > 0) && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.65, duration: 0.6 }}
            className="w-full mt-8 mb-8"
          >
            <div className="flex items-center gap-4 mb-6">
              <ImageIcon size={20} className="text-white/40" />
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white/90">
                Galeria
              </h2>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="details-scroll-horizontal">
              {detail.images.backdrops?.slice(0, 10).map((img: any, idx: number) => (
                <div
                  key={`backdrop-${idx}`}
                  className="details-scroll-item w-72 details-card"
                  tabIndex={0}
                >
                  <div className="aspect-video bg-gray-800 rounded-xl overflow-hidden">
                    <img
                      src={getImageUrl(img.file_path, 'w780') || ''}
                      srcSet={getResponsiveImageSrcSet(getImageUrl(img.file_path, 'w780'), 'backdrop')}
                      sizes="288px"
                      alt="Galeria"
                      className="w-full h-full object-cover"
                      width={288}
                      height={162}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              ))}
              {detail.images.posters?.slice(0, 8).map((img: any, idx: number) => (
                <div
                  key={`poster-${idx}`}
                  className="details-scroll-item w-40 details-card"
                  tabIndex={0}
                >
                  <div className="aspect-[2/3] bg-gray-800 rounded-xl overflow-hidden">
                    <img
                      src={getImageUrl(img.file_path, 'w500') || ''}
                      srcSet={getResponsiveImageSrcSet(getImageUrl(img.file_path, 'w500'), 'poster')}
                      sizes="160px"
                      alt="Poster"
                      className="w-full h-full object-cover"
                      width={160}
                      height={240}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ══════ MAIS COMO ESTE ══════ */}
        {(detail?.recommendations?.results?.length > 0 || detail?.similar?.results?.length > 0) && (
          <motion.section
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="w-full mt-8 mb-8"
          >
            <div className="flex items-center gap-4 mb-6">
              <Star size={20} className="text-white/40" />
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white/90">
                Você também pode gostar
              </h2>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="details-scroll-horizontal">
              {(detail.recommendations?.results || detail.similar?.results || [])
                .filter((r: any) => r.backdrop_path)
                .slice(0, 16)
                .map((rec: any) => (
                  <button
                    key={rec.id}
                    type="button"
                    tabIndex={0}
                    className="details-scroll-item w-72 details-card group cursor-pointer text-left"
                    onClick={() => {
                      playSelectSound();
                      handleSelectSimilar(rec);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        playSelectSound();
                        handleSelectSimilar(rec);
                      }
                    }}
                  >
                    <div className="aspect-video bg-gray-800 rounded-xl overflow-hidden relative">
                      <img
                        src={getImageUrl(rec.backdrop_path, 'w780') || ''}
                        srcSet={getResponsiveImageSrcSet(
                          getImageUrl(rec.backdrop_path, 'w780'),
                          'backdrop'
                        )}
                        sizes="288px"
                        alt={rec.title || rec.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        width={288}
                        height={162}
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center">
                          <Play size={16} fill="white" className="text-white ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <h3 className="font-bold text-sm truncate text-white/90">
                        {rec.title || rec.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {rec.vote_average > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                            <Star size={9} fill="currentColor" />{' '}
                            {Number(rec.vote_average).toFixed(1)}
                          </span>
                        )}
                        {(rec.release_date || rec.first_air_date) && (
                          <span className="text-[10px] text-white/30">
                            {(rec.release_date || rec.first_air_date).slice(0, 4)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </motion.section>
        )}
      </div>
    </div>,
    document.body
  );
};

export default React.memo(Details);
