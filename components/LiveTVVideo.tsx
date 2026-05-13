import React, { useCallback, useEffect, useRef, useState } from 'react';
import type HlsType from 'hls.js';
import { logger } from '@/utils/logger';
import { isModernAndroidTVWebView, isTVBox, isLowPower } from '@/utils/tvBoxDetector';
import { playWhenVideoReady, playWithAutoplayPolicy, prepareVideoForAutoplay } from '@/utils/videoAutoplay';
import { normalizeRemoteKey } from '@/hooks/useRemoteControl';
import {
  getLiveTvRecoveryDecision,
  LIVE_TV_EMBEDDED_MAX_MEDIA_RECOVERIES,
  LIVE_TV_EMBEDDED_MAX_NETWORK_RECOVERIES,
} from '@/utils/liveTvControls';

type HlsErrorData = {
  fatal: boolean;
  type: string;
  details?: string;
};

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

  const clearRetryTimers = useCallback(() => {
    retryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    retryTimersRef.current = [];
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || isYouTube) return;
    const url = streamUrl.trim();
    if (!url) return;
    let cancelled = false;

    const scheduleRetry = (callback: () => void, delayMs: number) => {
      const timerId = window.setTimeout(() => {
        retryTimersRef.current = retryTimersRef.current.filter((id) => id !== timerId);
        if (!cancelled) callback();
      }, delayMs);
      retryTimersRef.current.push(timerId);
    };

    setLoading(true);
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

    logger.log('[LiveTV] Carregando stream:', url);
    let networkRetries = 0;
    let mediaRetries = 0;
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
            lowLatencyMode: !constrained,
            backBufferLength: constrained ? 10 : 30,
            maxBufferLength: constrained ? 15 : 30,
          });
          hlsRef.current = hls;

          // Evita ícone de play nativo em WebView moderno ao anexar mídia HLS.
          prepareVideoForAutoplay(video, requiresMutedAutoplay);
          hls.loadSource(url);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            logger.log('[LiveTV] HLS manifest parsed');
            if (!cancelled) tryPlayWhenReady(video);
          });

          hls.on(Hls.Events.ERROR, (_event: unknown, data: HlsErrorData) => {
            if (!data.fatal) return;
            logger.error('[LiveTV] HLS fatal error:', data.type, data.details);
            if (cancelled) return;

            const decision = getLiveTvRecoveryDecision({
              errorType: data.type,
              networkRetries,
              mediaRetries,
              maxNetworkRetries: LIVE_TV_EMBEDDED_MAX_NETWORK_RECOVERIES,
              maxMediaRetries: LIVE_TV_EMBEDDED_MAX_MEDIA_RECOVERIES,
              delayMode: 'exponential',
            });

            if (decision.action === 'retry-network') {
              networkRetries++;
              logger.warn(
                `[LiveTV] Retry rede ${networkRetries}/${LIVE_TV_EMBEDDED_MAX_NETWORK_RECOVERIES} em ${decision.delayMs}ms`
              );
              scheduleRetry(() => hls.startLoad(), decision.delayMs);
              return;
            }

            if (decision.action === 'recover-media') {
              mediaRetries++;
              const delayMs = Math.min(1000 * Math.pow(2, mediaRetries - 1), 16000);
              logger.warn(
                `[LiveTV] Recuperação mídia ${mediaRetries}/${LIVE_TV_EMBEDDED_MAX_MEDIA_RECOVERIES} em ${delayMs}ms`
              );
              scheduleRetry(() => hls.recoverMediaError(), delayMs);
              return;
            }

            logger.error('[LiveTV] Max retries HLS atingido, desistindo');
            setLoading(false);
            onStreamError?.();
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
          logger.warn('[LiveTV] Erro no stream:', streamUrl?.substring(0, 50));
          setLoading(false);
          // Notificar erro para o componente pai (LiveTV.tsx)
          onStreamError?.();
        }}
      />
    </div>
  );
};

export default LiveTVVideo;
