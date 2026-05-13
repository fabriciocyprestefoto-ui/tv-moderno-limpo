import { logger } from './logger';

export interface VideoSourceProbeResult {
  ok: boolean;
  reason: 'ok' | 'empty' | 'timeout' | 'media_error' | 'unsupported' | 'unavailable';
  event?: string;
  mediaErrorCode?: number | null;
}

const pendingProbes = new Map<string, Promise<VideoSourceProbeResult>>();

function normalizeProbeKey(url: string): string {
  return String(url || '').trim();
}

export function probeVideoSource(
  url: string,
  options: { timeoutMs?: number; requirePlaying?: boolean } = {}
): Promise<VideoSourceProbeResult> {
  const targetUrl = normalizeProbeKey(url);
  if (!targetUrl) {
    return Promise.resolve({ ok: false, reason: 'empty' });
  }

  if (typeof document === 'undefined') {
    return Promise.resolve({ ok: true, reason: 'unavailable' });
  }

  const timeoutMs = Math.max(2000, Number(options.timeoutMs || 12000));
  const requirePlaying = Boolean(options.requirePlaying);
  const cacheKey = `${targetUrl}::${timeoutMs}::${requirePlaying ? 'playing' : 'ready'}`;
  const cached = pendingProbes.get(cacheKey);
  if (cached) return cached;

  const probePromise = new Promise<VideoSourceProbeResult>((resolve) => {
    const video = document.createElement('video');
    const cleanupFns: Array<() => void> = [];
    let settled = false;
    let timeoutId: number | null = null;

    const finish = (result: VideoSourceProbeResult) => {
      if (settled) return;
      settled = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      for (const cleanup of cleanupFns) cleanup();

      try {
        video.pause();
      } catch {
        // Ignore teardown issues.
      }

      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        // Ignore teardown issues.
      }

      if (video.parentNode) video.parentNode.removeChild(video);
      pendingProbes.delete(cacheKey);
      resolve(result);
    };

    const addListener = (eventName: string, listener: EventListener) => {
      video.addEventListener(eventName, listener);
      cleanupFns.push(() => video.removeEventListener(eventName, listener));
    };

    const handleSuccess = (eventName: string) => {
      finish({ ok: true, reason: 'ok', event: eventName });
    };

    addListener('loadeddata', () => {
      if (!requirePlaying) handleSuccess('loadeddata');
    });
    addListener('canplay', () => {
      if (!requirePlaying) handleSuccess('canplay');
    });
    addListener('playing', () => handleSuccess('playing'));
    addListener('error', () => {
      const mediaErrorCode = video.error?.code ?? null;
      finish({
        ok: false,
        reason:
          mediaErrorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'unsupported' : 'media_error',
        event: 'error',
        mediaErrorCode,
      });
    });

    video.preload = 'auto';
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';

    document.body.appendChild(video);

    timeoutId = window.setTimeout(() => {
      finish({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    video.src = targetUrl;
    video.load();

    const playPromise = video.play();
    playPromise?.catch((error) => {
      if (error?.name === 'AbortError' || error?.name === 'NotAllowedError') return;
      logger.warn('[videoSourceProbe] play() falhou durante preflight:', error);
    });
  });

  pendingProbes.set(cacheKey, probePromise);
  return probePromise;
}
