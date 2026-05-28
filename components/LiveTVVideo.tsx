import React, { useCallback, useEffect, useRef, useState } from 'react';
import type HlsType from 'hls.js';
import { logger } from '@/utils/logger';
import { isModernAndroidTVWebView, isTVBox, isLowPower } from '@/utils/tvBoxDetector';
import { playWhenVideoReady, playWithAutoplayPolicy, prepareVideoForAutoplay } from '@/utils/videoAutoplay';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';

type HlsErrorData = {
  fatal: boolean;
  type: string;
  details?: string;
};

const LIVE_STREAM_UNAVAILABLE_MESSAGE = 'Canal indisponível ou servidor não respondeu.';
const LIVE_HLS_LOAD_TIMEOUT_MS = 12_000;
const LIVE_HLS_TIMEOUT_MS = 8_000;
const LIVE_HLS_MAX_RETRIES = 0;
const SENSITIVE_QUERY_RE = /^(token|access_token|auth|authorization|signature|sig|expires|expires_at|key|jwt)$/i;

function maskLiveTvUrlForLog(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_RE.test(key)) {
        parsed.searchParams.set(key, '***MASKED***');
      }
    }
    const query = parsed.searchParams.toString();
    return `${parsed.host}${parsed.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return raw
      .replace(/([?&](?:token|access_token|auth|authorization|signature|sig|expires|expires_at|key|jwt)=)[^&\s]+/gi, '$1***MASKED***')
      .slice(0, 180);
  }
}

function isHlsTimeoutDetails(details: unknown): boolean {
  return String(details || '').toLowerCase().includes('timeout');
}

function isHlsManifestLoadError(details: unknown): boolean {
  return String(details || '').toLowerCase().includes('manifestloaderror');
}

interface LiveTVVideoProps {
  streamUrl: string;
  channelName: string;
  logoUrl?: string;
  isYouTube?: boolean;
  onBack?: () => void;
  onStreamReady?: () => void;
  onStreamError?: () => void;
  style?: React.CSSProperties;
}

/**
 * Player LiveTV com detecção automática:
 * - TV antiga/Firestick: HTML5 nativo (suporta .m3u8)
 * - TV nova/Chrome: HLS.js (não suporta .m3u8 nativamente)
 * - onError apenas loga, NUNCA esconde o vídeo
 * - play() sem mute primeiro → fallback muted
 */
const LiveTVVideo: React.FC<LiveTVVideoProps> = ({
  streamUrl,
  isYouTube,
  onStreamReady,
  onStreamError,
  style,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<InstanceType<typeof HlsType> | null>(null);
  const retryTimersRef = useRef<number[]>([]);
  const readyPlayCleanupRef = useRef<(() => void) | null>(null);
  const activeUrlRef = useRef<string>('');
  const readyNotifiedForRef = useRef<string>('');
  const [muted, setMuted] = useState(false);
  const [showMutedHint, setShowMutedHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);

  const clearRetryTimers = useCallback(() => {
    retryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    retryTimersRef.current = [];
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || isYouTube) return;
    const url = streamUrl.trim();
    if (!url) return;
    const maskedUrl = maskLiveTvUrlForLog(url);
    let cancelled = false;
    let loadTimeoutId: number | null = null;

    const clearLoadTimeout = () => {
      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = null;
      }
    };

    const markUnavailable = (reason: string) => {
      if (cancelled) return;
      clearLoadTimeout();
      logger.warn('[LiveTV] canal indisponível', { reason, url: maskedUrl });
      setLoading(false);
      setStreamError(LIVE_STREAM_UNAVAILABLE_MESSAGE);
      onStreamError?.();
      try {
        hlsRef.current?.stopLoad?.();
      } catch {
        /* noop */
      }
    };

    const startLoadTimeout = () => {
      clearLoadTimeout();
      loadTimeoutId = window.setTimeout(() => {
        logger.warn(`[LiveTV] HLS timeout url=${maskedUrl} timeoutMs=${LIVE_HLS_LOAD_TIMEOUT_MS}`);
        markUnavailable('timeout');
      }, LIVE_HLS_LOAD_TIMEOUT_MS);
    };

    const scheduleRetry = (callback: () => void, delayMs: number) => {
      const timerId = window.setTimeout(() => {
        retryTimersRef.current = retryTimersRef.current.filter((id) => id !== timerId);
        if (!cancelled) callback();
      }, delayMs);
      retryTimersRef.current.push(timerId);
    };

    setLoading(true);
    setStreamError(null);
    setShowMutedHint(false);
    readyNotifiedForRef.current = '';
    clearRetryTimers();
    readyPlayCleanupRef.current?.();
    readyPlayCleanupRef.current = null;

    // Limpar stream anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
    activeUrlRef.current = url;

    logger.log('[LiveTV] Carregando stream:', maskedUrl);
    const requiresMutedAutoplay = isModernAndroidTVWebView();

    const isHLS = url.includes('.m3u8');
    const canPlayHLSNatively = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (isHLS && !canPlayHLSNatively) {
      // TV nova/Chrome: carregar HLS.js dinamicamente
      logger.log('[LiveTV] Carregando HLS.js dinamicamente...');
      import('hls.js')
        .then((HlsModule) => {
          if (cancelled) return;
          const Hls = HlsModule.default;

          if (!Hls.isSupported()) {
            logger.warn('[LiveTV] HLS.js não suportado, usando HTML5 nativo');
            prepareVideoForAutoplay(video, requiresMutedAutoplay);
            video.src = url;
            video.load();
            tryPlayWhenReady(video);
            return;
          }

          logger.log('[LiveTV] Usando HLS.js');
          const constrained = isTVBox() || isLowPower();
          const hls = new Hls({
            enableWorker: !constrained,
            lowLatencyMode: false,
            backBufferLength: constrained ? 10 : 30,
            maxBufferLength: constrained ? 15 : 30,
            manifestLoadingTimeOut: LIVE_HLS_TIMEOUT_MS,
            manifestLoadingMaxRetry: LIVE_HLS_MAX_RETRIES,
            manifestLoadingRetryDelay: 1000,
            manifestLoadingMaxRetryTimeout: 3000,
            levelLoadingTimeOut: LIVE_HLS_TIMEOUT_MS,
            levelLoadingMaxRetry: LIVE_HLS_MAX_RETRIES,
            levelLoadingRetryDelay: 1000,
            levelLoadingMaxRetryTimeout: 3000,
            fragLoadingTimeOut: LIVE_HLS_TIMEOUT_MS,
            fragLoadingMaxRetry: LIVE_HLS_MAX_RETRIES,
            fragLoadingRetryDelay: 1000,
            fragLoadingMaxRetryTimeout: 3000,
          });
          hlsRef.current = hls;

          // Evita ícone de play nativo em WebView moderno ao anexar mídia HLS.
          prepareVideoForAutoplay(video, requiresMutedAutoplay);
          console.warn(`[LiveTV] HLS loadSource url=${maskedUrl}`);
          startLoadTimeout();
          hls.loadSource(url);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            clearLoadTimeout();
            logger.log('[LiveTV] HLS manifest parsed');
            if (!cancelled) tryPlayWhenReady(video);
          });

          hls.on(Hls.Events.ERROR, (_event: unknown, data: HlsErrorData) => {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              logger.warn(`[LiveTV] HLS NETWORK_ERROR details=${String(data.details || '')} fatal=${Boolean(data.fatal)} url=${maskedUrl}`);
              if (isHlsTimeoutDetails(data.details) || isHlsManifestLoadError(data.details)) {
                logger.warn(`[LiveTV] HLS timeout details=${String(data.details || '')} url=${maskedUrl}`);
              }
            }
            if (!data.fatal) return;
            logger.error('[LiveTV] HLS fatal error:', data.type, data.details);
            if (cancelled) return;

            markUnavailable(
              isHlsManifestLoadError(data.details)
                ? 'manifestLoadError'
                : isHlsTimeoutDetails(data.details)
                  ? 'timeout'
                  : data.type === Hls.ErrorTypes.NETWORK_ERROR
                    ? 'network'
                    : 'fatal'
            );
          });
        })
        .catch((err) => {
          logger.error('[LiveTV] Erro ao carregar HLS.js:', err);
          if (cancelled) return;
          // Fallback para HTML5 nativo
          prepareVideoForAutoplay(video, requiresMutedAutoplay);
          video.src = url;
          video.load();
          tryPlayWhenReady(video);
        });
    } else {
      // TV antiga/Firestick ou não-HLS: HTML5 nativo
      logger.log('[LiveTV] Usando HTML5 nativo');
      if (url.includes('supabase')) {
        video.crossOrigin = 'anonymous';
      } else {
        video.removeAttribute('crossorigin');
      }
      prepareVideoForAutoplay(video, requiresMutedAutoplay);
      video.src = url;
      video.load();
      tryPlayWhenReady(video);
    }

    function tryPlayWhenReady(v: HTMLVideoElement) {
      if (cancelled) return;
      prepareVideoForAutoplay(v, requiresMutedAutoplay);

      readyPlayCleanupRef.current?.();
      readyPlayCleanupRef.current = playWhenVideoReady(v, {
        mutedFirst: requiresMutedAutoplay,
        mutedFallback: requiresMutedAutoplay,
        onMutedFallback: () => {
          setMuted(true);
          setShowMutedHint(true);
          logger.log('[LiveTV] Play muted fallback (autoplay bloqueado)');
        },
      });

      if (requiresMutedAutoplay) {
        setMuted(true);
        setShowMutedHint(true);
        scheduleRetry(async () => {
          if (!v.paused || v.readyState < 2) return;
          await playWithAutoplayPolicy(v, {
            mutedFirst: true,
            mutedFallback: true,
          });
        }, 1000);
        scheduleRetry(async () => {
          if (!v.paused || v.readyState < 2) return;
          await playWithAutoplayPolicy(v, {
            mutedFirst: true,
            mutedFallback: true,
          });
        }, 2000);
      } else {
        setMuted(false);
        setShowMutedHint(false);
      }
    }

    return () => {
      cancelled = true;
      clearLoadTimeout();
      clearRetryTimers();
      readyPlayCleanupRef.current?.();
      readyPlayCleanupRef.current = null;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
      setLoading(true);
      setStreamError(null);
      setShowMutedHint(false);
      activeUrlRef.current = '';
    };
  }, [clearRetryTimers, streamUrl, isYouTube, onStreamError]);

  // Listener OK/Enter para desmutar quando muted fallback ativo
  useEffect(() => {
    if (!showMutedHint) return;
    const handleUnmute = (e: KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (key !== 'Enter' && key !== ' ' && key !== 'MediaPlayPause') return;
      const v = videoRef.current;
      if (!v) return;
      e.preventDefault();
      v.muted = false;
      v.volume = 1;
      void v.play();
      setMuted(false);
      setShowMutedHint(false);
    };
    window.addEventListener('keydown', handleUnmute, { capture: true });
    return () => window.removeEventListener('keydown', handleUnmute, { capture: true });
  }, [showMutedHint]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      clearRetryTimers();
      readyPlayCleanupRef.current?.();
      readyPlayCleanupRef.current = null;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      activeUrlRef.current = '';
    };
  }, [clearRetryTimers]);

  if (isYouTube) return null;

  const handleReady = () => {
    setLoading(false);
    if (readyNotifiedForRef.current === streamUrl) return;
    readyNotifiedForRef.current = streamUrl;
    onStreamReady?.();
  };

  return (
    <div
      className="live-tv-video absolute inset-0 w-full h-full min-w-full min-h-full flex items-center justify-center"
      style={{ width: '100%', height: '100%', ...style }}
    >
      {loading && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70 backdrop-blur-sm z-10">
          Transmissão iniciando...
        </div>
      )}
      {showMutedHint && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur-md" style={{ background: 'rgba(138,43,226,0.75)', border: '1px solid rgba(167,139,250,0.5)' }}>
          <span>🔇</span>
          <span>Pressione OK para ativar o som</span>
        </div>
      )}
      {streamError && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/60 px-8 text-center">
          <div className="rounded-xl border border-white/10 bg-black/70 px-6 py-5 text-white/85">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
              Canal indisponível
            </p>
            <p className="mt-2 text-sm font-bold">{streamError}</p>
          </div>
        </div>
      )}
      <video
        ref={(el) => {
          (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
          if (el) {
            el.setAttribute('playsinline', 'true');
            el.setAttribute('webkit-playsinline', 'true');
          }
        }}
        autoPlay
        playsInline
        muted={muted}
        preload="auto"
        controls={false}
        className="redx-live-video absolute inset-0 w-full h-full min-w-full min-h-full"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onLoadedMetadata={handleReady}
        onLoadedData={handleReady}
        onCanPlay={handleReady}
        onError={() => {
          logger.warn('[LiveTV] Erro no stream:', maskLiveTvUrlForLog(streamUrl || ''));
          setLoading(false);
          setStreamError(LIVE_STREAM_UNAVAILABLE_MESSAGE);
          // Notificar erro para o componente pai (LiveTV.tsx)
          onStreamError?.();
        }}
      />
    </div>
  );
};

export default LiveTVVideo;
