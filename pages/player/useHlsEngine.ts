import React, { useState, useRef, useCallback, useEffect } from 'react';
import type HlsType from 'hls.js';
import type { QualityLevel } from '../../types/player';
import { hlsErrorToDetails } from '../../utils/hlsSentry';
import { markPlaybackUrlsFailed, markPlaybackUrlsHealthy } from '../../utils/playbackHealth';
import { isTVBox, isLowPower, isModernAndroidTVWebView } from '../../utils/tvBoxDetector';
import { logger } from '../../utils/logger';
import { isNativePlatform } from '../../services/nativePlayerService';
import { playWhenVideoReady, playWithAutoplayPolicy, prepareVideoForAutoplay } from '../../utils/videoAutoplay';

interface UseHlsEngineOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  sourceUrl: string | undefined;
  showIntroRef: React.RefObject<boolean>;
  onStreamFailed?: (url: string) => void | Promise<void>;
  /** Chamado quando autoplay é bloqueado e fallback muted é ativado */
  onMutedFallback?: () => void;
  nativeFallback?: {
    enabled: boolean;
    title?: string;
    isLive?: boolean;
    onComplete?: (position: number) => void;
  };
}

export interface UseHlsEngineResult {
  hlsRef: React.RefObject<InstanceType<typeof HlsType> | null>;
  hlsInitTimeoutRef: React.RefObject<number | null>;
  networkRetryTimerRef: React.RefObject<number | null>;
  // Stream state
  isBuffering: boolean;
  streamError: boolean;
  streamRetrying: boolean;
  stallCount: number;
  setIsBuffering: (v: boolean) => void;
  setStreamError: (v: boolean) => void;
  setStreamRetrying: (v: boolean) => void;
  setStallCount: React.Dispatch<React.SetStateAction<number>>;
  // Tracks / quality
  qualities: QualityLevel[];
  currentQuality: number;
  currentQualityLabel: string;
  setCurrentQuality: (idx: number) => void;
  setCurrentQualityLabel: (label: string) => void;
  // Actions
  setupPlayer: () => Promise<void>;
  retryStream: () => void;
  openNativeFallback: (reason: string, details?: Record<string, unknown>) => boolean;
  reportStreamFailure: (url: string, details?: Record<string, unknown>) => void;
  reportStreamHealthy: (url: string) => void;
}

export function useHlsEngine({
  videoRef,
  sourceUrl,
  showIntroRef,
  onStreamFailed,
  onMutedFallback,
  nativeFallback,
}: UseHlsEngineOptions): UseHlsEngineResult {
  const hlsRef = useRef<InstanceType<typeof HlsType> | null>(null);
  const hlsInitTimeoutRef = useRef<number | null>(null);
  const networkRetryTimerRef = useRef<number | null>(null);
  const nativeFallbackTimerRef = useRef<number | null>(null);
  const retryStreamTimerRef = useRef<number | null>(null);
  const videoFrameWatchdogRef = useRef<number | null>(null);
  const autoplayRetry1Ref = useRef<number | null>(null);
  const autoplayRetry2Ref = useRef<number | null>(null);
  const readyPlayCleanupRef = useRef<(() => void) | null>(null);
  const nativeFallbackInFlightRef = useRef(false);
  const reportedFailedUrlRef = useRef<string | null>(null);

  // (Reverted) callback stabilization removida — causava efeito colateral em VOD/séries

  const [isBuffering, setIsBuffering] = useState(true);
  const [streamError, setStreamError] = useState(false);
  const [streamRetrying, setStreamRetrying] = useState(false);
  const [stallCount, setStallCount] = useState(0);

  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(() => {
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem('redx-player-quality') : null;
    return saved !== null ? parseInt(saved, 10) : -1;
  });
  const [currentQualityLabel, setCurrentQualityLabel] = useState('AUTO');

  const reportStreamFailure = useCallback(
    (failedUrl: string, details?: Record<string, unknown>) => {
      const url = String(failedUrl || '').trim();
      if (!url || reportedFailedUrlRef.current === url) return;
      reportedFailedUrlRef.current = url;
      const reason = typeof details?.reason === 'string' ? details.reason : 'player_failure';
      markPlaybackUrlsFailed(url, reason);
      if (onStreamFailed) {
        void Promise.resolve(onStreamFailed(url)).catch((e) =>
          logger.warn('[HlsEngine] onStreamFailed callback failed:', e)
        );
      }
      const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
      if (dsn) {
        void import('@sentry/react').then(({ captureMessage }) => {
          captureMessage('Stream playback failure', {
            level: 'warning',
            extra: { url: url.length > 500 ? `${url.slice(0, 500)}…` : url, ...details },
            tags: { area: 'player' },
          });
        });
      }
    },
    [onStreamFailed]
  );

  const reportStreamHealthy = useCallback((healthyUrl: string) => {
    const url = String(healthyUrl || '').trim();
    if (!url) return;
    markPlaybackUrlsHealthy(url);
    if (reportedFailedUrlRef.current === url) reportedFailedUrlRef.current = null;
  }, []);

  const clearNativeFallbackTimer = useCallback(() => {
    if (nativeFallbackTimerRef.current != null) {
      window.clearTimeout(nativeFallbackTimerRef.current);
      nativeFallbackTimerRef.current = null;
    }
  }, []);

  const clearRetryStreamTimer = useCallback(() => {
    if (retryStreamTimerRef.current != null) {
      window.clearTimeout(retryStreamTimerRef.current);
      retryStreamTimerRef.current = null;
    }
  }, []);

  const clearVideoFrameWatchdog = useCallback(() => {
    if (videoFrameWatchdogRef.current != null) {
      window.clearTimeout(videoFrameWatchdogRef.current);
      videoFrameWatchdogRef.current = null;
    }
  }, []);

  const openNativeFallback = useCallback(
    (_reason: string, _details?: Record<string, unknown>) => {
      const url = String(sourceUrl || '').trim();
      if (!url || !nativeFallback?.enabled || !isNativePlatform()) return false;
      // Fluxo de referência: não usar atalhos especiais de fallback por perfil de TV.
      if (nativeFallbackInFlightRef.current) return true;

      const launch = () => {
        nativeFallbackTimerRef.current = null;
        if (showIntroRef.current) {
          nativeFallbackTimerRef.current = window.setTimeout(launch, 250);
          return;
        }

        nativeFallbackInFlightRef.current = true;
        setIsBuffering(false);
        setStreamRetrying(false);
        setStreamError(false);

        // Mantido apenas por compatibilidade: não força troca para player nativo.
        nativeFallbackInFlightRef.current = false;
        setStreamError(true);
        setIsBuffering(false);
      };

      clearNativeFallbackTimer();
      launch();
      return true;
    },
    [
      clearNativeFallbackTimer,
      nativeFallback,
      showIntroRef,
      sourceUrl,
    ]
  );

  useEffect(() => {
    return () => {
      clearNativeFallbackTimer();
      clearRetryStreamTimer();
      clearVideoFrameWatchdog();
      if (networkRetryTimerRef.current != null) {
        window.clearTimeout(networkRetryTimerRef.current);
        networkRetryTimerRef.current = null;
      }
      if (hlsInitTimeoutRef.current != null) {
        window.clearTimeout(hlsInitTimeoutRef.current);
        hlsInitTimeoutRef.current = null;
      }
      if (autoplayRetry1Ref.current != null) {
        window.clearTimeout(autoplayRetry1Ref.current);
        autoplayRetry1Ref.current = null;
      }
      if (autoplayRetry2Ref.current != null) {
        window.clearTimeout(autoplayRetry2Ref.current);
        autoplayRetry2Ref.current = null;
      }
      readyPlayCleanupRef.current?.();
      readyPlayCleanupRef.current = null;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [clearNativeFallbackTimer, clearRetryStreamTimer, clearVideoFrameWatchdog]);

  const resolveQualityLabel = (hls: InstanceType<typeof HlsType>): string => {
    const lvl = hls.currentLevel;
    const levels = hls.levels || [];
    if (lvl === -1 || lvl >= levels.length) return 'AUTO';
    const h = levels[lvl]?.height;
    if (!h) return 'AUTO';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    return '360p';
  };

  const setupPlayer = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    clearNativeFallbackTimer();
    clearRetryStreamTimer();
    clearVideoFrameWatchdog();
    readyPlayCleanupRef.current?.();
    readyPlayCleanupRef.current = null;
    if (autoplayRetry1Ref.current != null) {
      window.clearTimeout(autoplayRetry1Ref.current);
      autoplayRetry1Ref.current = null;
    }
    if (autoplayRetry2Ref.current != null) {
      window.clearTimeout(autoplayRetry2Ref.current);
      autoplayRetry2Ref.current = null;
    }

    if (networkRetryTimerRef.current) {
      clearTimeout(networkRetryTimerRef.current);
      networkRetryTimerRef.current = null;
    }
    if (hlsInitTimeoutRef.current) {
      clearTimeout(hlsInitTimeoutRef.current);
      hlsInitTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // noop
    }

    const candidateUrl = String(sourceUrl || '').trim();
    if (!candidateUrl) {
      setStreamError(true);
      setIsBuffering(false);
      return;
    }

    setStreamError(false);
    setStreamRetrying(false);
    setIsBuffering(true);

    const requiresMutedAutoplay = isModernAndroidTVWebView();

    const scheduleAutoplayRetry = (delayMs: number, ref: React.MutableRefObject<number | null>) => {
      ref.current = window.setTimeout(async () => {
        ref.current = null;
        if (showIntroRef.current) return;
        if (!video.paused || video.readyState < 2) return;
        await playWithAutoplayPolicy(video, {
          mutedFirst: requiresMutedAutoplay,
          mutedFallback: true,
          onMutedFallback,
        });
      }, delayMs);
    };

    const isHlsUrl = candidateUrl.includes('.m3u8') || candidateUrl.includes('m3u8');
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (!isHlsUrl) {
      prepareVideoForAutoplay(video, requiresMutedAutoplay);
      video.src = candidateUrl;
      video.load();
      readyPlayCleanupRef.current = playWhenVideoReady(video, {
        mutedFirst: requiresMutedAutoplay,
        mutedFallback: true,
        canPlay: () => !showIntroRef.current,
        onMutedFallback,
      });
      return;
    }

    if (isHlsUrl && !nativeHls) {
      const { default: Hls } = await import('hls.js');

      if (Hls.isSupported()) {
        const constrained = isTVBox() || isLowPower();

        // prepareVideoForAutoplay ANTES de hls.attachMedia — sem isso, quando
        // o WebView vê video.src=blob: com autoplay=false exibe o ícone nativo de play.
        prepareVideoForAutoplay(video, requiresMutedAutoplay);

        const hls = new Hls({
          // Workers podem travar em Android WebView antigo (Chromium <72). Só
          // ativar em hardware não-constrained onde o WebView suporta workers corretamente.
          enableWorker: !constrained,
          lowLatencyMode: !constrained,
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.withCredentials = false;
          },
          startLevel: constrained ? 0 : -1,
          capLevelToPlayerSize: true,
          maxBufferLength: constrained ? 15 : 30,
          maxMaxBufferLength: constrained ? 30 : 60,
          maxBufferSize: constrained ? 10 * 1024 * 1024 : 30 * 1024 * 1024,
          backBufferLength: constrained ? 5 : 10,
          // TV Box lenta: reduz timeout para não travar 20s em fragmento ruim.
          fragLoadingTimeOut: constrained ? 12_000 : 20_000,
          manifestLoadingTimeOut: constrained ? 10_000 : 15_000,
          autoStartLoad: true,
        });

        hlsRef.current = hls;
        let manifestOk = false;

        hlsInitTimeoutRef.current = window.setTimeout(() => {
          hlsInitTimeoutRef.current = null;
          if (!manifestOk && hlsRef.current === hls) {
            hls.destroy();
            hlsRef.current = null;
            setStreamError(true);
            setIsBuffering(false);
          }
        }, 20_000);

        hls.loadSource(candidateUrl);
        hls.attachMedia(video);

        let networkRetries = 0;
        let mediaRetries = 0;

        hls.on(Hls.Events.MANIFEST_PARSED, (_event: unknown, data: { levels: QualityLevel[] }) => {
          manifestOk = true;
          if (hlsInitTimeoutRef.current) {
            clearTimeout(hlsInitTimeoutRef.current);
            hlsInitTimeoutRef.current = null;
          }

          const levels = data.levels || [];
          setQualities(levels);

          const savedQ = parseInt(localStorage.getItem('redx-player-quality') || '-1', 10);
          const maxLevel = levels.length - 1;
          const level = savedQ >= 0 && savedQ <= maxLevel ? savedQ : -1;
          hls.currentLevel = level;
          hls.nextLevel = level;
          setCurrentQuality(level);
          if (level === -1) {
            setCurrentQualityLabel('AUTO');
          } else {
            const height = levels[level]?.height;
            setCurrentQualityLabel(
              height >= 1080 ? '1080p' : height >= 720 ? '720p' : height >= 480 ? '480p' : '360p'
            );
          }

          readyPlayCleanupRef.current?.();
          readyPlayCleanupRef.current = playWhenVideoReady(video, {
            mutedFirst: requiresMutedAutoplay,
            mutedFallback: true,
            canPlay: () => !showIntroRef.current,
            onMutedFallback,
          });
          // Retry em 1s e 2s se ainda pausado (WebView pode precisar de mais tempo)
          scheduleAutoplayRetry(1000, autoplayRetry1Ref as React.MutableRefObject<number | null>);
          scheduleAutoplayRetry(2000, autoplayRetry2Ref as React.MutableRefObject<number | null>);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          setCurrentQuality(hls.currentLevel);
          setCurrentQualityLabel(resolveQualityLabel(hls));
        });

        hls.on(
          Hls.Events.ERROR,
          (_event: unknown, data: { fatal: boolean; type: string; details?: string }) => {
            const errorType = String(data.type);
            const mediaErrorType = String(Hls.ErrorTypes.MEDIA_ERROR);
            const networkErrorType = String(Hls.ErrorTypes.NETWORK_ERROR);

            if (!data.fatal) {
              if (errorType === mediaErrorType) {
                try {
                  hls.recoverMediaError();
                } catch {
                  // noop
                }
              }
              return;
            }

            if (errorType === networkErrorType && networkRetries < 3) {
              networkRetries++;
              if (networkRetryTimerRef.current) clearTimeout(networkRetryTimerRef.current);
              networkRetryTimerRef.current = window.setTimeout(() => {
                networkRetryTimerRef.current = null;
                hls.startLoad();
              }, 1000 * networkRetries);
              return;
            }

            if (errorType === mediaErrorType && mediaRetries < 2) {
              mediaRetries++;
              try {
                hls.recoverMediaError();
                return;
              } catch {
                // continue to fallback below
              }
            }

            hls.destroy();
            hlsRef.current = null;
            readyPlayCleanupRef.current?.();
            readyPlayCleanupRef.current = null;

            // Tenta fallback mp4 antes de exibir erro — URLs m3u8 às vezes têm equivalente mp4
            const mp4Url = candidateUrl
              .replace(/master\.m3u8$/i, 'video.mp4')
              .replace(/\.m3u8$/i, '.mp4');
            if (mp4Url !== candidateUrl) {
              prepareVideoForAutoplay(video, requiresMutedAutoplay);
              video.src = mp4Url;
              video.load();
              readyPlayCleanupRef.current = playWhenVideoReady(video, {
                mutedFirst: requiresMutedAutoplay,
                mutedFallback: true,
                canPlay: () => !showIntroRef.current,
                onMutedFallback,
              });
            } else {
              setStreamError(true);
              setIsBuffering(false);
              reportStreamFailure(candidateUrl, {
                reason: 'hls_fatal_error',
                details: hlsErrorToDetails(data as Parameters<typeof hlsErrorToDetails>[0]),
              });
            }
          }
        );

        return;
      }
    }

    if (nativeHls) {
      prepareVideoForAutoplay(video, requiresMutedAutoplay);
      video.src = candidateUrl;
      video.load();
      readyPlayCleanupRef.current = playWhenVideoReady(video, {
        mutedFirst: requiresMutedAutoplay,
        mutedFallback: true,
        canPlay: () => !showIntroRef.current,
        onMutedFallback,
      });
      return;
    }

    prepareVideoForAutoplay(video, requiresMutedAutoplay);
    video.src = candidateUrl;
    video.load();
    readyPlayCleanupRef.current = playWhenVideoReady(video, {
      mutedFirst: requiresMutedAutoplay,
      mutedFallback: true,
      canPlay: () => !showIntroRef.current,
      onMutedFallback,
    });
  }, [
    clearNativeFallbackTimer,
    clearRetryStreamTimer,
    clearVideoFrameWatchdog,
    reportStreamFailure,
    setCurrentQuality,
    setCurrentQualityLabel,
    showIntroRef,
    sourceUrl,
    videoRef,
    onMutedFallback,
  ]);

  const retryStream = useCallback(() => {
    setStreamError(false);
    setStreamRetrying(true);
    setIsBuffering(true);
    clearNativeFallbackTimer();
    clearRetryStreamTimer();
    clearVideoFrameWatchdog();
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    retryStreamTimerRef.current = window.setTimeout(() => {
      retryStreamTimerRef.current = null;
      setStreamRetrying(false);
      void setupPlayer();
    }, 800);
  }, [clearNativeFallbackTimer, clearRetryStreamTimer, clearVideoFrameWatchdog, setupPlayer]);

  return {
    hlsRef,
    hlsInitTimeoutRef,
    networkRetryTimerRef,
    isBuffering,
    streamError,
    streamRetrying,
    stallCount,
    setIsBuffering,
    setStreamError,
    setStreamRetrying,
    setStallCount,
    qualities,
    currentQuality,
    currentQualityLabel,
    setCurrentQuality,
    setCurrentQualityLabel,
    setupPlayer,
    retryStream,
    openNativeFallback,
    reportStreamFailure,
    reportStreamHealthy,
  };
}
