import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, Rewind, FastForward, ArrowLeft,
  Users, Volume2, VolumeX, Volume1, Check, SkipForward, ChevronRight, List, Tv,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Media } from '../types';
import type { CastMember, Season, Episode, TmdbSeason } from '../types/player';
import { useSpatialNav } from '../hooks/useSpatialNavigation';
import { getLogo } from '../services/tmdb';
import { userService } from '../services/userService';
import { logger } from '../utils/logger';
import { setSignal } from '../utils/appSignals';
import { getMediaBackdrop, getMediaLogo, getMediaPoster } from '../utils/mediaUtils';
import { getLocalizedLogoSync, rememberLocalizedLogo } from '../services/logoService';
import { PLAYER_INTRO_TIMEOUT_MS } from '../config/playerDefaults';
import { useHlsEngine } from './player/useHlsEngine';
import { type ResumeAction } from '../utils/playerTvControls';
import { useProgressHeartbeat } from './player/useProgressHeartbeat';
import { usePlayerIntro } from './player/usePlayerIntro';
import { usePlayerKeyboard } from './player/usePlayerKeyboard';
import { isFireTV, isModernAndroidTVWebView, isTVBox } from '../utils/tvBoxDetector';
import { playWhenVideoReady } from '../utils/videoAutoplay';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';
import { hasNativePlayer } from '../utils/tvModernoBridge';
import { useNativePlayerGate } from '../hooks/useNativePlayerGate';
import { isNativePlatform } from '../services/nativePlayerService';
import { runtimeFlags } from '../config/runtimeFlags';
import { getMediaPoster as getMediaPosterUrl } from '../utils/mediaUtils';
import { userService as userSvcForNative } from '../services/userService';
import { publicAssetUrl } from '../utils/publicAssetUrl';
// ── Sub-componentes extraídos ────────────────────────────────────────────────
import PlayerErrorScreen from '../components/player/PlayerErrorScreen';
import PlayerResumeOverlay from '../components/player/PlayerResumeOverlay';
import PlayerSettingsModal from '../components/player/PlayerSettingsModal';
import PlayerCastPanel from '../components/player/PlayerCastPanel';
import PlayerEpisodesPanel from '../components/player/PlayerEpisodesPanel';
import { G, vGlass, VISION_HUD_STYLE, VISION_FLOAT_STYLE, PLAYER_CSS } from '../components/player/playerTokens';

interface PlayerProps {
  media: Media;
  onClose: () => void;
  nextEpisode?: { title: string; season: number; episode: number; stream_url?: string } | null;
  onPlayNext?: () => void;
  onSelectEpisode?: (season: number, episode: number) => void;
  onStreamFailed?: (failedUrl: string) => void | Promise<void>;
}

const AUTO_HIDE_MS = 5000;
const SEEK_STEP = 30;
/** Vinheta antes do stream: usa intro dedicada quando houver, senão a vinheta global. */
const INTRO_SAFETY_MS = PLAYER_INTRO_TIMEOUT_MS;
const NEXT_EPISODE_TRIGGER_SECS = 40;
const NEXT_EPISODE_AUTOPLAY_SECS = 10;
const RESUME_MIN_SECS = 30;
const SPEED_STORAGE_KEY = 'redx-player-speed';

const VOD_NATIVE_INTRO_URL = 'asset:///public/vinheta-tv.mp4';

const getVodSourceUrl = (media: Media): string | undefined =>
  media.stream_url || media.video_url || media.source_url || undefined;

const getVodPlayerType = (media: Media): 'movie' | 'series' =>
  media.type === 'series' || media.media_type === 'tv' || Boolean(media.episode_number)
    ? 'series'
    : 'movie';

const toNativeIntroUrl = (url: string | null | undefined): string | undefined => {
  const clean = String(url || '').trim();
  if (!clean) return VOD_NATIVE_INTRO_URL;
  if (/^(https?:|file:|asset:|content:)/i.test(clean)) return clean;
  if (clean.startsWith('/')) return `asset:///public${clean}`;
  return clean;
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// G, vGlass, VISION_*_STYLE e PLAYER_CSS agora vêm de playerTokens.ts

/**
 * NativeVodPlayer — pipeline oficial de VOD no app Android TV moderno.
 * Não monta <video>, não usa HLS.js e não chama window.Android.openPlayer.
 */
const NativeVodPlayer: React.FC<PlayerProps> = ({ media, onClose, onSelectEpisode }) => {
  const tmdbId =
    typeof (media as { tmdb_id?: number | string }).tmdb_id !== 'undefined'
      ? Number((media as { tmdb_id?: number | string }).tmdb_id)
      : undefined;
  const mediaTypeStr = getVodPlayerType(media) === 'series' ? 'tv' : 'movie';
  const seasonNum = (media as { season_number?: number }).season_number;
  const episodeNum = (media as { episode_number?: number }).episode_number;
  const sourceUrl = getVodSourceUrl(media);
  const playerType = getVodPlayerType(media);
  const introUrl = toNativeIntroUrl(media.introVideoUrl);
  const tmdbNumericId = Number(tmdbId || 0);
  const hasTmdbContext = Number.isFinite(tmdbNumericId) && tmdbNumericId > 0;
  const canBrowseEpisodes = playerType === 'series' && hasTmdbContext;

  const nativePanelVideoRef = useRef<HTMLVideoElement | null>(null);
  const [nativePanel, setNativePanel] = useState<'cast' | 'episodes' | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(
    Number(seasonNum || 1)
  );
  const [focusedSeasonIdx, setFocusedSeasonIdx] = useState(0);
  const [focusedEpisodeIdx, setFocusedEpisodeIdx] = useState(0);

  // Resume: carrega posição salva antes de lançar Activity.
  // null = ainda carregando (gate aguarda); number = pronto para lançar.
  const [startPosition, setStartPosition] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const validTmdb = Number.isFinite(tmdbId) && (tmdbId ?? 0) > 0;
    if (!validTmdb) { setStartPosition(0); return; }
    userSvcForNative.getProgress(tmdbId!, seasonNum, episodeNum)
      .then((secs: number) => {
        if (!cancelled) setStartPosition(secs > 30 ? secs : 0);
      })
      .catch(() => {
        if (!cancelled) setStartPosition(0);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, seasonNum, episodeNum]);

  useEffect(() => {
    if (nativePanel !== 'cast' || cast.length !== 0 || !hasTmdbContext) return undefined;
    let mounted = true;
    const type = playerType === 'series' ? 'series' : 'movie';
    import('../services/tmdb').then(({ fetchSeriesCredits }) => {
      fetchSeriesCredits(tmdbNumericId, type).then((data: { cast: CastMember[] }) => {
        if (mounted) setCast(data?.cast?.slice(0, 40) || []);
      }).catch((err) => logger.warn('[NativeVodPlayer] Cast fetch failed:', err));
    }).catch((err) => logger.warn('[NativeVodPlayer] tmdb import failed:', err));
    return () => { mounted = false; };
  }, [nativePanel, cast.length, hasTmdbContext, playerType, tmdbNumericId]);

  useEffect(() => {
    if (nativePanel !== 'episodes' || !canBrowseEpisodes) return undefined;
    let mounted = true;
    import('../services/tmdb').then(({ fetchSeriesDetail }) => {
      fetchSeriesDetail(tmdbNumericId).then(data => {
        if (!mounted) return;
        if (data?.seasons) {
          setSeasons(
            (data.seasons as unknown as TmdbSeason[])
              .filter((s) => s.season_number > 0)
              .map((s) => ({
                id: Number.isFinite(Number(s?.id)) ? Number(s.id) : s.season_number,
                season_number: Number(s.season_number || 0),
                name: s.name || `Temporada ${s.season_number}`,
                episode_count: Number(s.episode_count || 0),
                air_date: s.air_date || null,
                poster_path: s.poster_path || null,
              }))
          );
        }
      }).catch((err) => logger.warn('[NativeVodPlayer] Season fetch failed:', err));
    }).catch((err) => logger.warn('[NativeVodPlayer] tmdb import failed:', err));
    return () => { mounted = false; };
  }, [nativePanel, canBrowseEpisodes, tmdbNumericId]);

  useEffect(() => {
    if (!seasons.length) return;
    const hasSelectedSeason = seasons.some((season) => season.season_number === selectedSeasonNum);
    if (!hasSelectedSeason) {
      setSelectedSeasonNum(seasons[0].season_number);
      setFocusedSeasonIdx(0);
    }
  }, [seasons, selectedSeasonNum]);

  useEffect(() => {
    if (nativePanel !== 'episodes' || !canBrowseEpisodes) return undefined;
    let mounted = true;
    import('../services/tmdb').then(({ fetchSeasonEpisodes }) => {
      fetchSeasonEpisodes(tmdbNumericId, selectedSeasonNum).then(data => {
        if (!mounted) return;
        setEpisodes(data || []);
        setFocusedEpisodeIdx(0);
      }).catch((err) => logger.warn('[NativeVodPlayer] Episodes fetch failed:', err));
    }).catch((err) => logger.warn('[NativeVodPlayer] tmdb import failed:', err));
    return () => { mounted = false; };
  }, [nativePanel, canBrowseEpisodes, selectedSeasonNum, tmdbNumericId]);

  // REGRA DE HOOKS: useNativePlayerGate DEVE ser chamado antes de qualquer return condicional.
  // url=null enquanto startPosition não carregou — Activity não lança antes do resume.
  const { gateActive, closed } = useNativePlayerGate({
    url: startPosition !== null ? (sourceUrl || null) : null,
    title: media.title,
    year: media.year,
    logo: getMediaLogo(media) || undefined,
    type: playerType,
    poster: getMediaPosterUrl(media) || undefined,
    introUrl,
    startPosition: startPosition ?? 0,
    onClose: ({ position, action }) => {
      try {
        if (tmdbId && position > 0) {
          // Assinatura: tmdbId, type, seconds, totalDuration?, season?, episode?
          void userSvcForNative.saveProgress(
            tmdbId,
            mediaTypeStr,
            position,
            undefined,
            seasonNum,
            episodeNum
          );
        }
      } catch {
        /* noop */
      }
      if (action === 'openCast') {
        setNativePanel('cast');
        return;
      }
      if (action === 'openEpisodes') {
        setNativePanel('episodes');
        return;
      }
      onClose();
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      // DIAGNÓSTICO VISÍVEL: overlay fica até usuário pressionar VOLTAR (ou 30s).
      // onClose() só é chamado após dismiss — sem navegação prematura.
      try {
        const div = document.createElement('div');
        div.style.cssText =
          'position:fixed;inset:0;background:#0a0018;color:#fff;z-index:99999;' +
          'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'padding:32px;font-family:sans-serif;text-align:center;gap:16px;';
        div.innerHTML =
          '<p style="font-size:20px;font-weight:bold;color:#ff6b6b;margin:0">❌ Erro no Player</p>' +
          '<p style="font-size:13px;color:#ffcc00;word-break:break-all;max-width:600px;margin:0">' +
            (msg || 'Erro desconhecido') +
          '</p>' +
          '<p style="font-size:11px;opacity:0.5;margin:0">Pressione VOLTAR para fechar</p>';
        document.body.appendChild(div);
        const dismiss = () => {
          try { div.remove(); } catch { /* noop */ }
          window.removeEventListener('keydown', keyHandler);
          onClose();
        };
        // eslint-disable-next-line prefer-const
        let autoTimer = window.setTimeout(dismiss, 30000);
        const keyHandler = (e: KeyboardEvent) => {
          if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'Back') {
            window.clearTimeout(autoTimer);
            dismiss();
          }
        };
        window.addEventListener('keydown', keyHandler);
      } catch {
        onClose();
      }
    },
  });

  // Enquanto startPosition não carregou: mostrar loading overlay.
  // (DEVE vir APÓS todos os hooks para não violar Rules of Hooks)
  if (startPosition === null) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, background: '#000', color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'sans-serif', gap: 12, zIndex: 99999,
        }}
      >
        <div
          style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: '#a855f7',
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>Carregando…</p>
      </div>
    );
  }

  if (!sourceUrl) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, background: '#000', color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'sans-serif', gap: 16, zIndex: 99999,
          padding: 32, textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Stream indisponível</p>
        <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>
          Este VOD não tem URL reproduzível cadastrada.
        </p>
        <button
          type="button"
          onClick={() => onClose()}
          style={{
            padding: '12px 24px',
            background: '#A855F7',
            color: '#fff',
            border: 0,
            borderRadius: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Voltar
        </button>
      </div>
    );
  }

  // Activity nativa rodando — overlay simples (sumirá quando Activity sobrepuser).
  // Se ficar visível por mais de ~3s, é sinal de que Activity NÃO abriu (debug visual).
  if (gateActive) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          fontSize: 14,
          gap: 8,
          zIndex: 99999,
        }}
      >
        <p style={{ opacity: 0.7 }}>Carregando…</p>
      </div>
    );
  }

  if (nativePanel) {
    return (
      <div
        className="redx-player-viewport fixed inset-0 z-[10000] overflow-hidden bg-black text-white font-sans"
        style={{
          background:
            'radial-gradient(circle at 18% 16%, rgba(126,58,242,0.28), transparent 34%), rgba(0,0,0,0.86)',
        }}
      >
        <style>{PLAYER_CSS}</style>
        <PlayerCastPanel
          visible={nativePanel === 'cast'}
          cast={cast}
          focusArea={nativePanel === 'cast' ? 'cast' : 'controls'}
          focusedCastIdx={0}
          onClose={() => onClose()}
        />
        <PlayerEpisodesPanel
          visible={nativePanel === 'episodes'}
          seasons={seasons}
          episodes={episodes}
          selectedSeasonNum={selectedSeasonNum}
          focusArea={nativePanel === 'episodes' ? 'episodes-list' : 'controls'}
          focusedSeasonIdx={focusedSeasonIdx}
          focusedEpisodeIdx={focusedEpisodeIdx}
          media={media}
          videoRef={nativePanelVideoRef}
          onClose={() => onClose()}
          onSelectEpisode={onSelectEpisode}
          onSeasonFocus={(idx, seasonNumber) => {
            setFocusedSeasonIdx(idx);
            setSelectedSeasonNum(seasonNumber);
          }}
          onSeasonClick={(idx, seasonNumber) => {
            setFocusedSeasonIdx(idx);
            setSelectedSeasonNum(seasonNumber);
            setFocusedEpisodeIdx(0);
          }}
        />
      </div>
    );
  }

  // Player fechou — render fallback "Voltando" pra evitar tela preta caso o pai
  // demore a desmontar Player ou navegar fora da rota /watch/*.
  if (closed) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          gap: 16,
          zIndex: 9999,
        }}
        role="alert"
      >
        <p style={{ fontSize: 14, opacity: 0.7 }}>Voltando…</p>
        <button
          type="button"
          onClick={() => onClose()}
          style={{
            padding: '12px 24px',
            background: '#A855F7',
            color: '#fff',
            border: 0,
            borderRadius: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Voltar agora
        </button>
      </div>
    );
  }
  return null;
};

const PlayerImpl: React.FC<PlayerProps> = ({
  media,
  onClose,
  nextEpisode,
  onPlayNext,
  onSelectEpisode,
  onStreamFailed,
}) => {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const introTimeoutRef = useRef<number | null>(null);
  const introVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackSessionRef = useRef(0);
  const activePlaybackUrlRef = useRef<string | null>(null);
  /** Vinheta global (`vinheta.mp4`) só na 1.ª abertura do player; trocar episódio não repete. */
  const defaultIntroConsumedRef = useRef(false);
  const nextEpisodeBtnRef = useRef<HTMLButtonElement | null>(null);
  const autoplayFiredRef = useRef(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const resumeCountdownRef = useRef<number | null>(null);
  const cssInjectedRef = useRef(false);
  /** TV Box: seek após loadedmetadata (currentTime antes de metadata é ignorado) */
  const pendingSeekRef = useRef<number | null>(null);
  /** Ref estável para onClose — evita adicionar onClose aos deps do setupPlayer useCallback. */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // ── Core state ────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const introVideoSrc = React.useMemo(
    () => publicAssetUrl('vinheta-tv.mp4', import.meta.env.VITE_APP_VERSION ?? '1'),
    []
  );
  // Fallback interno: quando o Player HTML5 for aberto diretamente, ainda mostra a vinheta.
  // O fluxo normal do app usa VinhetaGate antes de montar /watch e chega aqui com skipIntro=true.
  const [showIntro, setShowIntro] = useState(() => {
    // TV Moderno: pula vinheta web — playback acontece em ExoPlayerActivity nativo.
    if (hasNativePlayer()) return false;
    if (media.skipIntro) return false;
    return Boolean(introVideoSrc);
  });
  const showIntroRef = useRef(showIntro);
  const [mainVideoReady, setMainVideoReady] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  const sourceUrl = getVodSourceUrl(media);
    useEffect(() => {
      playbackSessionRef.current += 1;
      activePlaybackUrlRef.current = sourceUrl || null;
    }, [sourceUrl, media.id, media.season_number, media.episode_number]);

  const nativeVodFallback = React.useMemo(
    () => ({
      enabled: true,
      title: media.title,
      isLive: false,
      onComplete: () => onCloseRef.current(),
    }),
    [media.title]
  );

  // ── Settings state ────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState<'none' | 'quality'>('none');
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showAutoplayMutedHint, setShowAutoplayMutedHint] = useState(false);
  const requiresMutedAutoplay = isModernAndroidTVWebView();

  // ── Speed ──────────────────────────────────────────────────────────────────
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    const saved = localStorage.getItem(SPEED_STORAGE_KEY);
    return saved ? parseFloat(saved) : 1;
  });
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);
  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // ── Resume overlay ────────────────────────────────────────────────────────
  const [savedProgress, setSavedProgress] = useState<number>(0);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState<number>(5);
  const [focusedResumeAction, setFocusedResumeAction] = useState<ResumeAction>('continue');

  // ── Progress bar tooltip ──────────────────────────────────────────────────
  const [progressTooltip, setProgressTooltip] = useState<{ x: number; time: number } | null>(null);

  // ── Focus management ──────────────────────────────────────────────────────
  const [focusArea, setFocusArea] = useState<'controls' | 'settings' | 'cast' | 'episodes-seasons' | 'episodes-list' | 'resume' | 'speed'>('controls');
  const [focusedControlIdx, setFocusedControlIdx] = useState(1);
  const [focusedSettingsIdx, setFocusedSettingsIdx] = useState(0);
  const [focusedCastIdx, setFocusedCastIdx] = useState(0);
  const [focusedSpeedIdx, setFocusedSpeedIdx] = useState(2); // default: 1× (index 2)
  const [showCast, setShowCast] = useState(false);
  const [cast, setCast] = useState<CastMember[]>([]);

  // ── Episodes ──────────────────────────────────────────────────────────────
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(Number(media.season_number || 1));
  const [focusedSeasonIdx, setFocusedSeasonIdx] = useState(0);
  const [focusedEpisodeIdx, setFocusedEpisodeIdx] = useState(0);

  // ── Misc ──────────────────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const { setEnabled } = useSpatialNav();
  const tmdbId = media.tmdb_id;
  const tmdbNumericId = Number(media.tmdb_id || 0);
  const isSeries = media.type === 'series';
  const hasTmdbContext = Number.isFinite(tmdbNumericId) && tmdbNumericId > 0;
  const hasEpisodeContext =
    isSeries &&
    Number(media.season_number || 0) > 0 &&
    Number(media.episode_number || 0) > 0;
  const canBrowseEpisodes = isSeries && hasTmdbContext;

  // controlIds must be computed before any useEffect that uses it
  const controlIds = React.useMemo(() => {
    const ids = ['back', 'play', 'rewind', 'forward'];
    if (canBrowseEpisodes) ids.push('episodes');
    ids.push('cast', 'speed', 'volume');
    if (nextEpisode && hasEpisodeContext) ids.push('next');
    return ids;
  }, [canBrowseEpisodes, hasEpisodeContext, nextEpisode]);
  const currentControl = controlIds[focusedControlIdx];
  useEffect(() => { showIntroRef.current = showIntro; }, [showIntro]);

  // Lite mode pode ativar DEPOIS do mount (probe async / degradação de rede).
  // Quando isso ocorrer, abortar vinheta imediatamente.
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<{ lite: boolean }>).detail.lite) setShowIntro(false);
    };
    window.addEventListener('redx-lite-mode-change', handler);
    return () => window.removeEventListener('redx-lite-mode-change', handler);
  }, []);

  const focusVolumeForMutedAutoplay = useCallback(() => {
    setShowAutoplayMutedHint(true);
    setIsMuted(true);
    setVolume(0);
    setShowControls(true);
    setFocusArea('controls');
    const volumeIdx = controlIds.indexOf('volume');
    if (volumeIdx >= 0) setFocusedControlIdx(volumeIdx);
  }, [controlIds]);

  // ── HLS engine (extraído de Player.tsx → useHlsEngine) ────────────────────
  const {
    hlsRef, hlsInitTimeoutRef, networkRetryTimerRef,
    isBuffering, streamError, streamRetrying, stallCount,
    setIsBuffering, setStreamError, setStreamRetrying, setStallCount,
    qualities,
    currentQuality, currentQualityLabel,
    setCurrentQuality, setCurrentQualityLabel,
    setupPlayer, retryStream, reportStreamFailure, reportStreamHealthy,
  } = useHlsEngine({
    videoRef, sourceUrl, showIntroRef, onStreamFailed,
    nativeFallback: nativeVodFallback,
    onMutedFallback: focusVolumeForMutedAutoplay,
  });

  // ── Inject CSS once ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cssInjectedRef.current) return;
    cssInjectedRef.current = true;
    const style = document.createElement('style');
    style.setAttribute('data-vision-player', '1');
    style.textContent = PLAYER_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); cssInjectedRef.current = false; };
  }, []);

  useEffect(() => {
    if (currentControl === 'next' && nextEpisodeBtnRef.current) {
      nextEpisodeBtnRef.current.focus({ preventScroll: true });
    }
  }, [currentControl]);

  // ── TMDB Logo (HUD): mesma escolha pt/en que getLogo; não usar poster como logo ──
  useEffect(() => {
    let cancelled = false;
    // Cache-first: exibe logo instantânea do cache (logo-cache) e refina via API depois.
    const cachedLogo = getLocalizedLogoSync(media);
    setLogoUrl(cachedLogo || null);
    const tmdbAssetFileId = (url: string): string | null => {
      if (!url || !url.includes('image.tmdb.org')) return null;
      const m = url.match(/\/t\/p\/[^/]+\/([^/?#]+)/i);
      return m ? m[1].trim().toLowerCase() : null;
    };
    (async () => {
      const id = Number(tmdbId);
      if (Number.isFinite(id) && id > 0) {
        try {
          const apiLogo = await getLogo(id, isSeries ? 'series' : 'movie');
          if (!cancelled && apiLogo) {
            setLogoUrl(apiLogo);
            rememberLocalizedLogo(media, apiLogo); // persiste p/ próxima abertura ser instantânea
            return;
          }
        } catch (err) {
          logger.warn('[Player] Logo fetch failed:', err);
        }
      }
      const fallback = getMediaLogo(media);
      const poster = getMediaPoster(media);
      const f = fallback?.trim().toLowerCase() || '';
      const p = poster?.trim().toLowerCase() || '';
      if (fallback && p && f === p) {
        return;
      }
      const idLogo = fallback ? tmdbAssetFileId(fallback) : null;
      const idPoster = poster ? tmdbAssetFileId(poster) : null;
      if (idLogo && idPoster && idLogo === idPoster) {
        return;
      }
      if (!cancelled && fallback) setLogoUrl(fallback);
    })();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, isSeries, media.id, media.logo_url, media.poster]);

  // ── Spatial nav & fullscreen ──────────────────────────────────────────────
  useEffect(() => {
    setEnabled(false);
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const app = document.getElementById('app');
    const previousDataPage = html.getAttribute('data-page');
    const previousStyles = {
      htmlBackground: html.style.background,
      htmlBackgroundColor: html.style.backgroundColor,
      htmlBackgroundImage: html.style.backgroundImage,
      bodyBackground: body.style.background,
      bodyBackgroundColor: body.style.backgroundColor,
      bodyBackgroundImage: body.style.backgroundImage,
      rootBackground: root?.style.background ?? '',
      rootBackgroundColor: root?.style.backgroundColor ?? '',
      rootBackgroundImage: root?.style.backgroundImage ?? '',
      appBackground: app?.style.background ?? '',
      appBackgroundColor: app?.style.backgroundColor ?? '',
      appBackgroundImage: app?.style.backgroundImage ?? '',
    };

    html.setAttribute('data-page', 'player');
    const surfaceBackground = 'transparent';
    html.style.background = surfaceBackground;
    html.style.backgroundColor = surfaceBackground;
    html.style.backgroundImage = 'none';
    body.style.background = surfaceBackground;
    body.style.backgroundColor = surfaceBackground;
    body.style.backgroundImage = 'none';
    if (root) {
      root.style.background = surfaceBackground;
      root.style.backgroundColor = surfaceBackground;
      root.style.backgroundImage = 'none';
    }
    if (app) {
      app.style.background = surfaceBackground;
      app.style.backgroundColor = surfaceBackground;
      app.style.backgroundImage = 'none';
    }
    setSignal('playerActive', true);
    return () => {
      setEnabled(true);
      if (previousDataPage && previousDataPage.trim() && previousDataPage !== 'player') {
        html.setAttribute('data-page', previousDataPage);
      } else {
        html.removeAttribute('data-page');
      }
      html.style.background = previousStyles.htmlBackground;
      html.style.backgroundColor = previousStyles.htmlBackgroundColor;
      html.style.backgroundImage = previousStyles.htmlBackgroundImage;
      body.style.background = previousStyles.bodyBackground;
      body.style.backgroundColor = previousStyles.bodyBackgroundColor;
      body.style.backgroundImage = previousStyles.bodyBackgroundImage;
      if (root) {
        root.style.background = previousStyles.rootBackground;
        root.style.backgroundColor = previousStyles.rootBackgroundColor;
        root.style.backgroundImage = previousStyles.rootBackgroundImage;
      }
      if (app) {
        app.style.background = previousStyles.appBackground;
        app.style.backgroundColor = previousStyles.appBackgroundColor;
        app.style.backgroundImage = previousStyles.appBackgroundImage;
      }
      setSignal('playerActive', false);
      if (networkRetryTimerRef.current) clearTimeout(networkRetryTimerRef.current);
      if (hlsInitTimeoutRef.current) clearTimeout(hlsInitTimeoutRef.current);
      if (hlsRef.current) hlsRef.current.destroy();
      activePlaybackUrlRef.current = null;
    };
  }, [setEnabled]);

  // BACK físico Android/TV: o handler global dispara `redx-native-back`.
  // No player, interceptamos para fechar via fluxo local (retorno à tela anterior),
  // evitando fallback direto para Home.
  useEffect(() => {
    const handleNativeBack = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      onClose();
    };
    window.addEventListener('redx-native-back', handleNativeBack);
    return () => window.removeEventListener('redx-native-back', handleNativeBack);
  }, [onClose]);

  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    // ScreenOrientation.lock é experimental, ausente na tipagem padrão.
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (orientation?.lock) {
      orientation.lock('landscape').catch(() => {});
    }
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  // ── Reset on new source ───────────────────────────────────────────────────
  useEffect(() => {
    setStreamError(false);
    setStreamRetrying(false);
    setIsBuffering(true);
    setMainVideoReady(false);
    setShowCast(false);
    setCast([]);
    setShowEpisodes(false);
    setSeasons([]);
    setEpisodes([]);
    setSelectedSeasonNum(Number(media.season_number || 1));
    setFocusedSeasonIdx(0);
    setFocusedEpisodeIdx(0);
    setFocusArea('controls');
  }, [media.episode_number, media.id, media.season_number, sourceUrl, tmdbId]);

  // ── Desmutar ao pressionar OK quando autoplay foi bloqueado ─────────────
  useEffect(() => {
    if (!showAutoplayMutedHint) return;
    const handleUnmute = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (key !== 'Enter' && key !== ' ' && key !== 'MediaPlayPause') return;
      const v = videoRef.current;
      if (!v) return;
      v.muted = false;
      v.volume = 1;
      void v.play();
      setIsMuted(false);
      setVolume(1);
      setShowAutoplayMutedHint(false);
    };
    window.addEventListener('keydown', handleUnmute, { capture: true });
    return () => window.removeEventListener('keydown', handleUnmute, { capture: true });
  }, [showAutoplayMutedHint]);

  // ── Playback rate sync ────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate]);

  // ── Controls visibility ───────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!isPlaying || showCast || showSettings !== 'none') return;
    hideTimerRef.current = window.setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
  }, [isPlaying, showCast, showSettings]);

  useEffect(() => {
    if (!showCast && showSettings === 'none' && isPlaying) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
    }
  }, [showCast, showSettings, isPlaying]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  // ── Toggle play ───────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    revealControls();
  }, [revealControls]);

  // ── Seek ──────────────────────────────────────────────────────────────────
  const seek = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + seconds));
    revealControls();
  }, [revealControls]);

  // ── Progress bar click / drag ─────────────────────────────────────────────
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const v = videoRef.current;
    if (!bar || !v || !v.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    revealControls();
  }, [revealControls]);

  const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setProgressTooltip({ x: e.clientX - rect.left, time: ratio * duration });
  }, [duration]);

  // ── Speed ─────────────────────────────────────────────────────────────────
  const applySpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    localStorage.setItem(SPEED_STORAGE_KEY, String(rate));
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setShowSpeedPanel(false);
  }, []);

  useEffect(() => {
    // Não carrega manifest/HLS enquanto vinheta está tocando — evita
    // contenção de banda no Firestick e impede o filme de "tocar junto"
    // com a vinheta via atributo autoplay.
    if (showIntro) return;
    void setupPlayer();
  }, [setupPlayer, showIntro]);
  useEffect(() => { autoplayFiredRef.current = false; }, [media.stream_url]);

  // ── Next episode countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!nextEpisode || !isPlaying || !duration) return;
    const remaining = duration - currentTime;
    if (remaining <= NEXT_EPISODE_TRIGGER_SECS && remaining > 0) {
      const countdown = Math.ceil(Math.min(remaining, NEXT_EPISODE_AUTOPLAY_SECS));
      setNextCountdown(countdown);
      if (remaining <= 1 && !autoplayFiredRef.current && onPlayNext) {
        autoplayFiredRef.current = true;
        onPlayNext();
      }
    } else {
      setNextCountdown(null);
    }
  }, [currentTime, duration, isPlaying, nextEpisode, onPlayNext]);

  // ── Resume overlay logic ──────────────────────────────────────────────────
  useEffect(() => {
    if (showIntro || !tmdbId) return;
    // Removido guard de video.src: HLS.js usa blob: URL e a src fica vazia durante
    // setupPlayer. O guard causava o resume nunca aparecer em streams HLS.
    let mounted = true;
    pendingSeekRef.current = null;
    userService.getProgress(tmdbId, media.season_number, media.episode_number)
      .then(seconds => {
        if (!mounted) return;
        // Em WebView de TV antiga, overlay full-screen com blur pode tapar o vídeo.
        // currentTime só funciona após loadedmetadata — usamos pendingSeekRef para
        // aplicar o seek quando o evento disparar (onLoadedMetadata no <video>).
        if (isTVBox()) {
          if (seconds > RESUME_MIN_SECS) {
            pendingSeekRef.current = seconds;
          }
          return;
        }
        if (seconds > RESUME_MIN_SECS) {
          setSavedProgress(seconds);
          setShowResumeOverlay(true);
          setResumeCountdown(5);
          setFocusedResumeAction('continue');
          videoRef.current?.pause();
          setFocusArea('resume');
        } else {
          videoRef.current?.play().catch(() => {});
        }
      });
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIntro, tmdbId]);

  const clearResumeCountdown = useCallback(() => {
    if (resumeCountdownRef.current) {
      clearTimeout(resumeCountdownRef.current);
      resumeCountdownRef.current = null;
    }
  }, []);

  const continueFromSavedProgress = useCallback(() => {
    clearResumeCountdown();
    if (videoRef.current) {
      videoRef.current.currentTime = savedProgress;
      videoRef.current.play().catch(() => {});
    }
    setShowResumeOverlay(false);
    setFocusArea('controls');
  }, [clearResumeCountdown, savedProgress]);

  const restartFromBeginning = useCallback(() => {
    clearResumeCountdown();
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    setShowResumeOverlay(false);
    setFocusArea('controls');
  }, [clearResumeCountdown]);

  // Resume countdown 5s → auto-continue
  useEffect(() => {
    if (!showResumeOverlay) return;
    if (resumeCountdown <= 0) {
      continueFromSavedProgress();
      return;
    }
    resumeCountdownRef.current = window.setTimeout(() => {
      setResumeCountdown(c => c - 1);
    }, 1000);
    return () => { if (resumeCountdownRef.current) clearTimeout(resumeCountdownRef.current); };
  }, [continueFromSavedProgress, showResumeOverlay, resumeCountdown]);

  useEffect(() => {
    if (!showResumeOverlay) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`resume-action-${focusedResumeAction}`)?.focus();
    });
  }, [focusedResumeAction, showResumeOverlay]);

  // ── MediaSession API (lockscreen / notification drawer no Android) ────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const artSrc = getMediaBackdrop(media) || getMediaPoster(media);
    const artwork = artSrc
      ? [{ src: artSrc, sizes: '512x512', type: 'image/jpeg' }]
      : [];
    const genreLabel = Array.isArray(media.genre) ? media.genre.join(', ') : '';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: media.title ?? 'RedFlix',
      artist: genreLabel,
      album: media.year != null ? String(media.year) : '',
      artwork,
    });
    navigator.mediaSession.setActionHandler('play', () => { videoRef.current?.play().catch(() => {}); });
    navigator.mediaSession.setActionHandler('pause', () => { videoRef.current?.pause(); });
    navigator.mediaSession.setActionHandler('seekbackward', () => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - SEEK_STEP); });
    navigator.mediaSession.setActionHandler('seekforward', () => { if (videoRef.current) videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + SEEK_STEP); });
    if (nextEpisode && onPlayNext) {
      navigator.mediaSession.setActionHandler('nexttrack', onPlayNext);
    }
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [media, nextEpisode, onPlayNext]);

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  useProgressHeartbeat({ videoRef, heartbeatRef, media, tmdbId, showIntro, streamError });

  // ── Intro: vinheta dedicada (Kids) ou `vinheta.mp4` por defeito ─────────────
  usePlayerIntro({
    showIntro,
    introVideoSrc,
    introVideoRef,
    introTimeoutRef,
    defaultIntroConsumedRef,
    streamUrl: media?.stream_url,
    introVideoUrl: media.introVideoUrl,
    skipIntro: Boolean(media.skipIntro),
    setShowIntro,
  });

  useEffect(() => {
    if (!canBrowseEpisodes) {
      setShowEpisodes(false);
      return;
    }
  }, [canBrowseEpisodes]);

  /** Após vinheta (ou sem bloqueio de intro), garantir play no vídeo principal — MANIFEST_PARSED não chama play() enquanto `showIntroRef` é true. */
  useEffect(() => {
    if (showIntro || streamError) return;
    const v = videoRef.current;
    if (!v || !sourceUrl) return;
    // Se vídeo já tem dados suficientes (pré-carregado durante intro), limpa overlay imediatamente
    // sem esperar o evento `playing` — evita flash de tela preta após vinheta.
    if (v.readyState >= 3) setMainVideoReady(true);
    return playWhenVideoReady(v, {
      mutedFirst: requiresMutedAutoplay,
      mutedFallback: requiresMutedAutoplay,
      onMutedFallback: focusVolumeForMutedAutoplay,
    });
  }, [focusVolumeForMutedAutoplay, requiresMutedAutoplay, showIntro, streamError, sourceUrl]);

  // ── Cast fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showCast || cast.length !== 0 || !hasTmdbContext) return undefined;
    let mounted = true;
    const type = media.type === 'series' ? 'series' : 'movie';
    import('../services/tmdb').then(({ fetchSeriesCredits }) => {
      fetchSeriesCredits(tmdbNumericId, type).then((data: { cast: CastMember[] }) => {
        if (mounted) setCast(data?.cast?.slice(0, 40) || []);
      }).catch((err) => logger.warn('[Player] Cast fetch failed:', err));
    }).catch((err) => logger.warn('[Player] tmdb import failed:', err));
    return () => { mounted = false; };
  }, [showCast, cast.length, hasTmdbContext, media, tmdbNumericId]);

  // ── Seasons fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canBrowseEpisodes) return undefined;
    let mounted = true;
    import('../services/tmdb').then(({ fetchSeriesDetail }) => {
      fetchSeriesDetail(tmdbNumericId).then(data => {
        if (!mounted) return;
        if (data?.seasons) {
          setSeasons(
            (data.seasons as unknown as TmdbSeason[])
              .filter((s) => s.season_number > 0)
              .map((s) => ({
                id: Number.isFinite(Number(s?.id)) ? Number(s.id) : s.season_number,
                season_number: Number(s.season_number || 0),
                name: s.name || `Temporada ${s.season_number}`,
                episode_count: Number(s.episode_count || 0),
                air_date: s.air_date || null,
                poster_path: s.poster_path || null,
              }))
          );
        }
      }).catch((err) => logger.warn('[Player] Season fetch failed:', err));
    });
    return () => { mounted = false; };
  }, [canBrowseEpisodes, tmdbNumericId]);

  useEffect(() => {
    if (!seasons.length) return;
    const hasSelectedSeason = seasons.some((season) => season.season_number === selectedSeasonNum);
    if (!hasSelectedSeason) {
      setSelectedSeasonNum(seasons[0].season_number);
      setFocusedSeasonIdx(0);
    }
  }, [seasons, selectedSeasonNum]);

  // ── Episodes fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canBrowseEpisodes || !showEpisodes) return undefined;
    let mounted = true;
    import('../services/tmdb').then(({ fetchSeasonEpisodes }) => {
      fetchSeasonEpisodes(tmdbNumericId, selectedSeasonNum).then(data => {
        if (!mounted) return;
        setEpisodes(data || []);
        setFocusedEpisodeIdx(0);
      }).catch((err) => logger.warn('[Player] Episodes fetch failed:', err));
    });
    return () => { mounted = false; };
  }, [canBrowseEpisodes, showEpisodes, selectedSeasonNum, tmdbNumericId]);

  useEffect(() => {
    if (focusArea === 'episodes-seasons' && seasons[focusedSeasonIdx]) {
      setSelectedSeasonNum(seasons[focusedSeasonIdx].season_number);
    }
  }, [focusedSeasonIdx, focusArea, seasons]);

  // ── Cast scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (focusArea === 'cast' && focusedCastIdx >= 0) {
      const el = document.getElementById(`cast-actor-${focusedCastIdx}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [focusedCastIdx, focusArea]);

  // ── Keyboard handler (extraído → usePlayerKeyboard) ──────────────────────
  usePlayerKeyboard({
    showControls, showSettings, showCast, showResumeOverlay, showIntro,
    showEpisodes, showSpeedPanel, streamError, focusArea, focusedResumeAction,
    focusedControlIdx, focusedCastIdx, focusedSpeedIdx, focusedSettingsIdx,
    volume, isMuted, cast, seasons, episodes, focusedSeasonIdx, focusedEpisodeIdx,
    selectedSeasonNum, playbackRate, hasEpisodeContext, canBrowseEpisodes,
    nextEpisode: nextEpisode ?? null, qualities,
    videoRef, resumeCountdownRef, hlsRef,
    setShowIntro, setShowResumeOverlay, setFocusArea, setFocusedResumeAction,
    setShowEpisodes, setFocusedSeasonIdx, setFocusedEpisodeIdx,
    setShowCast, setFocusedCastIdx, setFocusedControlIdx,
    setShowSettings, setFocusedSettingsIdx, setShowSpeedPanel, setFocusedSpeedIdx,
    setVolume, setIsMuted, setCurrentQuality, setCurrentQualityLabel,
    togglePlay, seek, revealControls, onClose, retryStream, applySpeed,
    continueFromSavedProgress, restartFromBeginning, onSelectEpisode, onPlayNext,
  });

  // ── Helpers for btn classes ───────────────────────────────────────────────
  const vBtn = (id: string) => `vision-btn${currentControl === id ? ' v-active' : ''}`;
  const playerControlAttrs = (id: string) => ({
    'data-player-control': id,
    'aria-current': currentControl === id ? true : undefined,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="redx-player-viewport fixed inset-0 z-[10000] flex flex-col overflow-hidden text-white font-sans"
      style={{ background: 'transparent' }}
      onMouseMove={revealControls}
      onClick={() => { if (!showControls) revealControls(); }}
    >
      {/* Carregamento do stream principal */}
      {!mainVideoReady && !showIntro && !streamError && (
        <div
          className="absolute inset-0 z-[200] flex flex-col items-center justify-center gap-4 pointer-events-none"
          style={{ backgroundColor: 'transparent' }}
          aria-busy
          aria-label="Carregando reprodução"
        >
          <div
            className="w-16 h-16 rounded-full animate-spin shrink-0"
            style={{ border: '3px solid rgba(255,255,255,0.16)', borderTopColor: '#67e8f9' }}
          />
          <span className="text-[11px] font-black tracking-[0.35em] uppercase text-white/45">
            Carregando…
          </span>
        </div>
      )}

      {/* Overlay muted — autoplay bloqueado pela TV nova (desaparece ao pressionar OK) */}
      {showAutoplayMutedHint && !showIntro && (
        <div
          className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-white pointer-events-none"
          style={{ background: 'rgba(124,58,237,0.82)', border: '1px solid rgba(167,139,250,0.5)', backdropFilter: 'blur(12px)' }}
        >
          <span>🔇</span>
          <span>Pressione OK para ativar o som</span>
        </div>
      )}

      {/* ── Main video — TV Moderno: NÃO renderiza quando bridge nativa ativa
            (ExoPlayerActivity sobrepõe WebView e cuida do playback). ── */}
      {hasNativePlayer() ? null : (
      <video
        ref={(el) => {
          (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
          if (el) {
            el.controls = false;
            el.autoplay = false;
            el.setAttribute('playsinline', 'true');
            el.setAttribute('webkit-playsinline', 'true');
            el.setAttribute('disableremoteplayback', 'true');
            el.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback noplaybackrate');
          }
        }}
        className="redflix-main-video redx-player-video max-h-full w-full flex-1 object-contain"
        // display:none enquanto vinheta toca → Chromium ≥100 (Android 9+/10+) não renderiza
        // o botão nativo grande de play no elemento <video> vazio (sem src ainda).
        style={{ backgroundColor: 'transparent', display: showIntro ? 'none' : undefined }}
        muted={isMuted}
        playsInline
        preload={showIntro ? 'none' : 'auto'}
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          setMainVideoReady(true);
          setIsBuffering(false);
          // TV Box resume: aplicar seek aqui, após metadata estar disponível
          if (pendingSeekRef.current !== null && videoRef.current) {
            videoRef.current.currentTime = pendingSeekRef.current;
            pendingSeekRef.current = null;
          }
        }}
        onLoadedData={() => {
          setMainVideoReady(true);
          setIsBuffering(false);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          setMainVideoReady(true);
          setIsBuffering(false);
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setStallCount(0);
          reportStreamHealthy(sourceUrl || '');
          if (videoRef.current) setMainVideoReady(true);
        }}
        onCanPlay={() => {
          if (videoRef.current) setMainVideoReady(true);
        }}
        onEnded={() => {
          void userService.saveProgress(tmdbId || '', media.type, 0, videoRef.current?.duration || 0, media.season_number, media.episode_number);
          if (nextEpisode && onPlayNext && !autoplayFiredRef.current) {
            autoplayFiredRef.current = true;
            onPlayNext();
          }
        }}
        onError={() => {
          const sessionAtHandlerStart = playbackSessionRef.current;
          const activePlaybackUrl = activePlaybackUrlRef.current || '';
          const currentSrc = videoRef.current?.currentSrc || '';
          // HLS.js usa blob: como src (MediaSource API) — nunca inclui a URL m3u8.
          // Não filtrar erros de blob: ou a camada de erro do MediaSource seria ignorada.
          const isHlsBlob = currentSrc.startsWith('blob:');
          if (
            sessionAtHandlerStart !== playbackSessionRef.current ||
            (!isHlsBlob && activePlaybackUrl && currentSrc && !currentSrc.includes(activePlaybackUrl))
          ) {
            return;
          }

          const ve = videoRef.current?.error;
          const details = {
            reason: 'video_element_error',
            details: { code: ve?.code, message: ve?.message },
          };
          reportStreamFailure(sourceUrl || '', details);
          setStreamError(true);
        }}
      />
      )}

      {/* ── Quality badge ── */}
      {!showIntro && (
        <div className="absolute top-4 right-4 z-[200] flex items-center gap-2 pointer-events-none">
          <div
            className="px-3 py-1 rounded-md text-[11px] font-black tracking-widest uppercase border"
            style={{
              background: currentQualityLabel === 'AUTO' ? 'rgba(0,0,0,0.62)' : 'rgba(8,145,178,0.24)',
              borderColor: currentQualityLabel === 'AUTO' ? 'rgba(255,255,255,0.14)' : 'rgba(103,232,249,0.32)',
              color: currentQualityLabel === 'AUTO' ? 'rgba(255,255,255,0.58)' : '#67e8f9',
              backdropFilter: 'blur(12px)',
            }}
          >
            {currentQualityLabel}
          </div>
          {stallCount > 0 && (
            <div className="px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase"
              style={{ background: 'rgba(8,145,178,0.18)', border: '1px solid rgba(103,232,249,0.28)', color: 'rgba(207,250,254,0.78)' }}>
              ⟳ recuperando
            </div>
          )}
        </div>
      )}

      {/* ── Intro / splash — TV Moderno pula vinheta web (ExoPlayer pode tocar via EXTRA_INTRO_URL se quisermos). ── */}
      {!hasNativePlayer() && showIntro && introVideoSrc && (
        <div className="absolute inset-0 bg-black z-[15000] flex items-center justify-center">
          <video
            key={introVideoSrc}
            ref={(el) => {
              (introVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
              if (el) {
                el.setAttribute('muted', '');
                el.muted = true;
                el.defaultMuted = true;
                el.volume = 0;
                el.setAttribute('playsinline', 'true');
                el.setAttribute('webkit-playsinline', 'true');
                el.autoplay = true;
                // Chromium >=100 (Android 9+/10+) ignora atributo autoplay sem gesture →
                // dispara play() programaticamente para sumir botão nativo gigante.
                Promise.resolve(el.play()).catch(() => {
                  // bloqueado: agenda fallback rápido (vinheta-skip) para não travar UX
                  if (introTimeoutRef.current) window.clearTimeout(introTimeoutRef.current);
                  introTimeoutRef.current = window.setTimeout(() => setShowIntro(false), 800);
                });
              }
            }}
            src={introVideoSrc}
            autoPlay
            muted
            playsInline preload="auto"
            controls={false}
            controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
            disablePictureInPicture
            disableRemotePlayback
            onEnded={() => setShowIntro(false)}
            onError={() => {
              if (introTimeoutRef.current) window.clearTimeout(introTimeoutRef.current);
              introTimeoutRef.current = window.setTimeout(() => setShowIntro(false), 1200);
            }}
            onLoadedData={() => {
              // Sempre reseta timer — sem guard para evitar race com useEffect ainda não executado
              if (introTimeoutRef.current) clearTimeout(introTimeoutRef.current);
              introTimeoutRef.current = window.setTimeout(() => setShowIntro(false), INTRO_SAFETY_MS);
            }}
            onCanPlayThrough={() => {
              if (introTimeoutRef.current) clearTimeout(introTimeoutRef.current);
              introTimeoutRef.current = window.setTimeout(() => setShowIntro(false), INTRO_SAFETY_MS);
            }}
            onTimeUpdate={(e) => {
              // Fallback para Android WebView onde onEnded não dispara: fecha quando quase no fim
              const v = e.currentTarget;
              if (v.duration > 0 && v.currentTime >= v.duration - 0.3) {
                setShowIntro(false);
              }
            }}
            className="w-full h-full object-cover"
          />
          <button
            autoFocus
            onClick={() => setShowIntro(false)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' ||
                e.key === 'OK' ||
                e.key === 'Select' ||
                e.key === 'OS_OK' ||
                e.key === 'Return' ||
                e.key === 'NumpadEnter' ||
                e.key === ' '
              ) {
                e.preventDefault();
                setShowIntro(false);
              }
            }}
            className="absolute bottom-10 right-10 z-20"
            style={{
              ...vGlass({ borderRadius: '999px', padding: '10px 28px' }),
              fontSize: 11, fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase',
              outline: 'none',
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(103,232,249,0.58)'; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
          >
            OK para pular
          </button>
        </div>
      )}

      {/* ── Buffering spinner — só após mainVideoReady para não sobrepor o loading inicial ── */}
      <AnimatePresence>
        {isBuffering && mainVideoReady && !streamError && !showIntro && (
          <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div
              className="w-16 h-16 rounded-full animate-spin"
              style={{ border: '3px solid rgba(255,255,255,0.16)', borderTopColor: '#67e8f9' }}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ── Stream error / retrying ── */}
      <PlayerErrorScreen
        streamError={streamError}
        streamRetrying={streamRetrying}
        onRetry={retryStream}
        onClose={onClose}
        streamUrl={sourceUrl}
      />

      {/* ── Resume overlay ── */}
      <PlayerResumeOverlay
        visible={showResumeOverlay}
        savedProgress={savedProgress}
        resumeCountdown={resumeCountdown}
        focusedAction={focusedResumeAction}
        onContinue={continueFromSavedProgress}
        onRestart={restartFromBeginning}
        onFocusAction={setFocusedResumeAction}
      />

      {/* ── HUD ── */}
      <motion.div
        animate={{ opacity: (showControls || !isPlaying) && !showIntro ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="absolute bottom-6 left-1/2 z-[100] flex flex-col gap-3"
        style={{ ...VISION_HUD_STYLE, transform: 'translateX(-50%)' }}
      >
        {/* Row 1: Logo/title + mark watched */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl} alt={media.title}
                className="h-8 max-h-10 w-auto max-w-[min(240px,42vw)] object-contain object-left"
                style={{
                  // Sombra 3D sólida (alpha 1, sem opacidade) + contorno claro: dá relevo
                  // e garante que logos escuras/pretas apareçam sobre a imagem do título.
                  filter:
                    'drop-shadow(0 0 1px rgba(255,255,255,1)) drop-shadow(0 0 2px rgba(255,255,255,1)) drop-shadow(2px 2px 0 rgba(0,0,0,1)) drop-shadow(0 5px 6px rgba(0,0,0,1))',
                }}
              />
            ) : (
              // Sem fallback de texto: evita o flash do nome antes da logo TMDB carregar.
              // Título fica só p/ leitores de tela (a11y), sem texto visível.
              <span className="sr-only">{media.title}</span>
            )}
            <span className="vision-hud-meta" style={{ flexShrink: 0 }}>
              {isSeries
                ? hasEpisodeContext
                  ? `S${String(media.season_number || 1).padStart(2, '0')} E${String(media.episode_number || 1).padStart(2, '0')}${media.episode_title ? ` — ${media.episode_title}` : ''}`
                  : media.year
                    ? `${media.year}`
                    : 'Serie'
                : media.year ? `${media.year}` : ''}
            </span>
          </div>
        </div>

        {/* Row 2: Progress bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5" style={{ fontSize: 11, fontWeight: 700, color: G.textSec, letterSpacing: '0.04em' }}>
            <span>{formatTime(currentTime)}</span>
            <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 10 }}>
              RESTAM {formatTime(Math.max(0, duration - currentTime))}
            </span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Clickable progress bar */}
          <div
            ref={progressBarRef}
            className="vision-progress-bar"
            onClick={handleProgressClick}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={() => setProgressTooltip(null)}
            style={{ position: 'relative' }}
            role="slider"
            aria-label="Progresso da reprodução"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(duration || 0))}
            aria-valuenow={Math.max(0, Math.round(currentTime || 0))}
            aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
          >
            <div
              className="vision-progress-fill"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
            {/* Thumb */}
            <div
              className="vision-progress-thumb"
              style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
            />
            {/* Hover tooltip */}
            {progressTooltip && (
              <div
                style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)',
                  left: progressTooltip.x, transform: 'translateX(-50%)',
                  ...vGlass({ borderRadius: '8px', padding: '3px 8px' }),
                  fontSize: 10, fontWeight: 700, color: G.textPrimary,
                  pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
                }}
              >
                {formatTime(progressTooltip.time)}
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Controls */}
        <div className="flex items-center justify-between gap-2">
          {/* Left group */}
          <div className="flex items-center gap-2">
            {/* Back */}
            <button className={vBtn('back')} {...playerControlAttrs('back')} onClick={onClose} title="Voltar" aria-label="Voltar e fechar o player">
              <ArrowLeft size={20} />
            </button>
            {/* Rewind */}
            <button className={vBtn('rewind')} {...playerControlAttrs('rewind')} onClick={() => seek(-SEEK_STEP)} title="-30s" aria-label={`Voltar ${SEEK_STEP} segundos`}>
              <Rewind size={18} />
            </button>
            {/* Play/Pause */}
            <button
              className={`vision-play-btn${currentControl === 'play' ? ' v-active' : ''}`}
              {...playerControlAttrs('play')}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pausar reprodução' : 'Reproduzir'}
              aria-pressed={isPlaying}
            >
              {isPlaying
                ? <Pause size={26} fill="currentColor" />
                : <Play size={26} fill="currentColor" style={{ marginLeft: 2 }} />
              }
            </button>
            {/* Forward */}
            <button className={vBtn('forward')} {...playerControlAttrs('forward')} onClick={() => seek(SEEK_STEP)} title="+30s" aria-label={`Avançar ${SEEK_STEP} segundos`}>
              <FastForward size={18} />
            </button>
          </div>

          {/* Right group */}
          <div className="flex items-center gap-2">
            {canBrowseEpisodes && (
              <button
                className={vBtn('episodes')}
                {...playerControlAttrs('episodes')}
                onClick={() => { setShowEpisodes(true); setFocusArea('episodes-seasons'); videoRef.current?.pause(); }}
                title="Episódios"
                aria-label="Abrir temporadas e episódios"
                aria-expanded={showEpisodes}
              >
                <List size={18} />
              </button>
            )}
            <button
              className={vBtn('cast')}
              {...playerControlAttrs('cast')}
              onClick={() => {
                if (showCast) { setShowCast(false); setFocusArea('controls'); videoRef.current?.play(); }
                else { setShowCast(true); setFocusArea('cast'); setFocusedCastIdx(0); videoRef.current?.pause(); }
              }}
              title="Elenco"
              aria-label={showCast ? 'Fechar elenco' : 'Abrir elenco'}
              aria-expanded={showCast}
            >
              <Users size={18} />
            </button>
            {/* Speed button */}
            <div style={{ position: 'relative' }}>
              {showSpeedPanel && (
                <div className="vision-speed-panel" style={vGlass({ background: 'rgba(72,18,120,0.60)' })}>
                  {SPEED_OPTIONS.map((rate, idx) => (
                    <button
                      key={rate}
                      className={`vision-speed-opt${playbackRate === rate ? ' sel' : ''}${focusArea === 'speed' && focusedSpeedIdx === idx ? ' sel' : ''}`}
                      style={focusArea === 'speed' && focusedSpeedIdx === idx ? { background: 'rgba(255,255,255,0.28)', color: '#fff', boxShadow: '0 0 0 2px rgba(255,255,255,0.55)' } : undefined}
                      onClick={() => { applySpeed(rate); setFocusArea('controls'); }}
                      aria-label={`Velocidade ${rate === 1 ? 'normal' : `${rate} vezes`}`}
                      aria-pressed={playbackRate === rate}
                    >
                      {rate === 1 ? '1×' : `${rate}×`}
                      {playbackRate === rate && <Check size={10} style={{ display: 'inline', marginLeft: 4 }} />}
                    </button>
                  ))}
                </div>
              )}
              <button
                className={vBtn('speed')}
                {...playerControlAttrs('speed')}
                onClick={() => setShowSpeedPanel(p => !p)}
                title="Velocidade"
                aria-label={`Velocidade atual ${playbackRate === 1 ? 'normal' : `${playbackRate} vezes`}`}
                aria-expanded={showSpeedPanel}
                style={{ fontSize: 11, fontWeight: 900, letterSpacing: '-0.02em', width: 44, height: 44 }}
              >
                {playbackRate === 1 ? '1×' : `${playbackRate}×`}
              </button>
            </div>

            {/* Volume */}
            <div style={{ position: 'relative' }}>
              {currentControl === 'volume' && (
                <div
                  style={{
                    position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                    ...vGlass({ background: 'rgba(72,18,120,0.58)' }),
                    borderRadius: '16px', padding: '12px 10px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 44,
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 900, color: G.textSec, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {isMuted ? 'Mudo' : `${Math.round(volume * 100)}%`}
                  </span>
                  <div style={{ width: 6, height: 72, background: G.progressTrack, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}>
                    <div style={{ width: '100%', background: G.progressFill, borderRadius: 4, height: `${isMuted ? 0 : volume * 100}%`, transition: 'height 150ms' }} />
                  </div>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.30)' }}>▲▼</span>
                </div>
              )}
              <button
                className={vBtn('volume')}
                {...playerControlAttrs('volume')}
                onClick={() => {
                  const newMuted = !isMuted;
                  setIsMuted(newMuted);
                  if (videoRef.current) { videoRef.current.muted = newMuted; if (!newMuted && volume === 0) { setVolume(0.5); videoRef.current.volume = 0.5; } }
                }}
                aria-label={isMuted || volume === 0 ? 'Ativar som' : 'Silenciar'}
                aria-pressed={isMuted || volume === 0}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} style={{ color: 'rgba(255,255,255,0.45)' }} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
              </button>
            </div>

            {nextEpisode && hasEpisodeContext && (
              <button className={vBtn('next')} {...playerControlAttrs('next')} onClick={onPlayNext} aria-label="Reproduzir próximo episódio">
                <SkipForward size={18} />
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Next episode card (mesmo glass / hierarquia do painel Elenco) ── */}
      <AnimatePresence>
        {nextEpisode && hasEpisodeContext && isPlaying && duration > 0 && (duration - currentTime < NEXT_EPISODE_TRIGGER_SECS) && (
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            className="absolute right-6 z-[210] bottom-[min(46vh,320px)] max-xl:bottom-52"
            style={{
              ...VISION_FLOAT_STYLE,
              width: 'min(400px, calc(100vw - 3rem))',
              padding: '22px 26px 24px',
            }}
          >
            <p style={{ fontSize: 9, fontWeight: 900, color: G.textSec, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>
              Próximo episódio
            </p>
            <div className="flex items-start gap-5">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${G.border}`,
                  boxShadow: '0 0 14px rgba(8,145,178,0.20)',
                }}
              >
                <Tv size={24} style={{ color: 'rgba(255,255,255,0.42)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 style={{ fontSize: 15, fontWeight: 800, color: G.textPrimary, marginBottom: 12, lineHeight: 1.35, letterSpacing: '-0.02em' }}>
                  {nextEpisode.title}
                </h4>
                {nextCountdown !== null && (
                  <div style={{ marginBottom: 14 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: G.textSec, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Auto-play em</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: G.textPrimary }}>{nextCountdown}s</span>
                    </div>
                    <div style={{ height: 3, width: '100%', borderRadius: 4, background: G.progressTrack, overflow: 'hidden' }}>
                      <motion.div
                        style={{ height: '100%', background: G.progressFill, borderRadius: 4 }}
                        animate={{ width: `${(nextCountdown / NEXT_EPISODE_AUTOPLAY_SECS) * 100}%` }}
                        transition={{ duration: 0.9, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}
                <button
                  ref={nextEpisodeBtnRef}
                  onClick={onPlayNext}
                  className={`w-full flex items-center justify-center gap-2 focus:outline-none transition-all${currentControl === 'next' ? ' scale-[1.02]' : ''}`}
                  style={{
                    padding: '11px 0', borderRadius: 14,
                    background: 'linear-gradient(135deg,#0891b2,#0f172a)',
                    border: '1px solid rgba(103,232,249,0.30)',
                    color: '#fff',
                    fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                    boxShadow:
                      currentControl === 'next'
                        ? '0 0 0 2px rgba(103,232,249,0.58), 0 0 20px rgba(8,145,178,0.32)'
                        : '0 0 14px rgba(8,145,178,0.22)',
                  }}
                >
                  Reproduzir agora <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cast panel ── */}
      <PlayerCastPanel
        visible={showCast}
        cast={cast}
        focusArea={focusArea}
        focusedCastIdx={focusedCastIdx}
        onClose={() => { setShowCast(false); setFocusArea('controls'); videoRef.current?.play(); }}
      />

      {/* ── Settings modal ── */}
      <PlayerSettingsModal
        showSettings={showSettings}
        qualities={qualities}
        currentQuality={currentQuality}
        focusedSettingsIdx={focusedSettingsIdx}
        onSelectQuality={(idx) => {
          if (hlsRef.current) {
            const level = idx === 0 ? -1 : idx - 1;
            hlsRef.current.currentLevel = level;
            hlsRef.current.nextLevel = level;
            setCurrentQuality(level);
            localStorage.setItem('redx-player-quality', String(level));
            const levels = hlsRef.current.levels || [];
            if (level === -1) { setCurrentQualityLabel('AUTO'); }
            else { const h = levels[level]?.height; setCurrentQualityLabel(h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : '360p'); }
          }
        }}
        onClose={() => { setShowSettings('none'); setFocusArea('controls'); }}
      />

      {/* ── Episodes selector ── */}
      <PlayerEpisodesPanel
        visible={showEpisodes}
        seasons={seasons}
        episodes={episodes}
        selectedSeasonNum={selectedSeasonNum}
        focusArea={focusArea}
        focusedSeasonIdx={focusedSeasonIdx}
        focusedEpisodeIdx={focusedEpisodeIdx}
        media={media}
        videoRef={videoRef}
        onClose={() => { setShowEpisodes(false); setFocusArea('controls'); }}
        onSelectEpisode={onSelectEpisode}
        onSeasonFocus={(idx, seasonNum) => { setFocusedSeasonIdx(idx); setSelectedSeasonNum(seasonNum); }}
        onSeasonClick={(idx, seasonNum) => {
          setFocusedSeasonIdx(idx);
          setSelectedSeasonNum(seasonNum);
          setFocusArea('episodes-list');
          setFocusedEpisodeIdx(0);
        }}
      />

    </div>
  );
};

/**
 * Player principal.
 * TV nativa usa Media3 (ExoPlayer) — inclusive WebView antigo, porque o player é uma
 * Activity Android nativa e independe da versão do Chromium. Só Firestick fica no
 * HTML5/HLS.js. NÃO recolocar isLegacyHtml5OnlyTV() neste gate: bloquear o nativo por
 * versão de WebView quebra VOD em TVs com WebView antigo (ex.: TCL) — regressão 2026-05.
 */
const Player: React.FC<PlayerProps> = (props) => {
  if (
    runtimeFlags.isTvBuild &&
    runtimeFlags.nativeAndroidPlayerEnabled &&
    !isFireTV() &&
    isNativePlatform()
  ) {
    return <NativeVodPlayer {...props} />;
  }
  return <PlayerImpl {...props} />;
};

export default React.memo(Player);
