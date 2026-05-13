type VideoDiagCleanup = () => void;

const DIAG_KEY = 'redx-video-diag';
let globalPatched = false;

function nowIso(): string {
  return new Date().toISOString();
}

function safeSrc(v: HTMLVideoElement): string {
  return v.currentSrc || v.src || '';
}

function stackTrace(): string {
  try {
    throw new Error('video-diagnostics');
  } catch (e) {
    const s = (e as Error).stack || '';
    return s.split('\n').slice(2, 8).join(' | ');
  }
}

function print(label: string, phase: string, data: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`[VIDEO_DIAG][${nowIso()}][${label}][${phase}]`, data);
}

function videoLabel(el: HTMLVideoElement): string {
  const cls = (el.className || '').toString().replace(/\s+/g, '.');
  return `video#${el.id || '-'}${cls ? '.' + cls : ''}`;
}

function isEnabledByRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ls = window.localStorage.getItem(DIAG_KEY);
    if (ls === '1' || ls === 'true') return true;
  } catch {
    // ignore
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('video_diag') === '1';
}

export function initGlobalVideoDiagnostics(): void {
  if (globalPatched) return;
  if (!isEnabledByRuntime()) return;
  if (typeof window === 'undefined') return;
  globalPatched = true;

  const mediaProto = HTMLMediaElement.prototype as HTMLMediaElement & {
    __redxDiagLoadPatched?: boolean;
    __redxDiagPlayPatched?: boolean;
    __redxDiagPausePatched?: boolean;
  };
  const videoProto = HTMLVideoElement.prototype as HTMLVideoElement & {
    __redxDiagSrcPatched?: boolean;
  };

  if (!mediaProto.__redxDiagLoadPatched) {
    mediaProto.__redxDiagLoadPatched = true;
    const origLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function patchedLoad(this: HTMLMediaElement): void {
      if (this instanceof HTMLVideoElement) {
        print(videoLabel(this), 'CALL', {
          fn: 'load',
          src: safeSrc(this),
          stack: stackTrace(),
        });
      }
      return origLoad.call(this);
    };
  }

  if (!mediaProto.__redxDiagPlayPatched) {
    mediaProto.__redxDiagPlayPatched = true;
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patchedPlay(this: HTMLMediaElement): Promise<void> {
      if (this instanceof HTMLVideoElement) {
        print(videoLabel(this), 'CALL', {
          fn: 'play',
          src: safeSrc(this),
          stack: stackTrace(),
        });
      }
      return origPlay.call(this);
    };
  }

  if (!mediaProto.__redxDiagPausePatched) {
    mediaProto.__redxDiagPausePatched = true;
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function patchedPause(this: HTMLMediaElement): void {
      if (this instanceof HTMLVideoElement) {
        print(videoLabel(this), 'CALL', {
          fn: 'pause',
          src: safeSrc(this),
          stack: stackTrace(),
        });
      }
      return origPause.call(this);
    };
  }

  if (!videoProto.__redxDiagSrcPatched) {
    videoProto.__redxDiagSrcPatched = true;
    const desc = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'src');
    if (desc?.get && desc?.set) {
      Object.defineProperty(HTMLVideoElement.prototype, 'src', {
        configurable: true,
        enumerable: desc.enumerable ?? true,
        get: function getSrc(this: HTMLVideoElement): string {
          return desc.get!.call(this);
        },
        set: function setSrc(this: HTMLVideoElement, value: string): void {
          print(videoLabel(this), 'CALL', {
            fn: 'src=',
            value,
            stack: stackTrace(),
          });
          desc.set!.call(this, value);
        },
      });
    }
  }
}

function auditAncestors(video: HTMLVideoElement, label: string): void {
  const rows: Record<string, unknown>[] = [];
  let n: HTMLElement | null = video;
  while (n) {
    const cs = window.getComputedStyle(n);
    rows.push({
      node: n.tagName.toLowerCase(),
      id: n.id || '',
      className: n.className || '',
      position: cs.position,
      zIndex: cs.zIndex,
      opacity: cs.opacity,
      transform: cs.transform,
      filter: cs.filter,
      backdropFilter:
        (cs as CSSStyleDeclaration & { backdropFilter?: string }).backdropFilter || '',
      mixBlendMode: cs.mixBlendMode,
      display: cs.display,
      visibility: cs.visibility,
    });
    if (n.tagName.toLowerCase() === 'html') break;
    n = n.parentElement;
  }
  print(label, 'ANCESTORS', { chain: rows });
}

export function startVideoDiagnostics(video: HTMLVideoElement, label: string): VideoDiagCleanup {
  if (!isEnabledByRuntime()) return () => {};
  if (!video) return () => {};

  const events = [
    'loadstart',
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'canplaythrough',
    'play',
    'playing',
    'pause',
    'waiting',
    'stalled',
    'suspend',
    'abort',
    'emptied',
    'ended',
    'error',
  ] as const;

  let stop = false;
  let lastFrameAt = 0;

  const onEvent = (ev: Event) => {
    const err = video.error;
    print(label, 'EVENT', {
      type: ev.type,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: video.currentTime,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      paused: video.paused,
      muted: video.muted,
      src: safeSrc(video),
      errorCode: err?.code ?? null,
      errorMessage: err?.message ?? null,
    });
  };

  events.forEach((e) => video.addEventListener(e, onEvent));
  auditAncestors(video, label);

  const sampleTimer = window.setInterval(() => {
    const rect = video.getBoundingClientRect();
    const cs = window.getComputedStyle(video);
    const allVideos = Array.from(document.querySelectorAll('video'));
    const allInfo = allVideos.map((v) => ({
      label: videoLabel(v),
      src: safeSrc(v),
      readyState: v.readyState,
      paused: v.paused,
      muted: v.muted,
      currentTime: v.currentTime,
      width: v.videoWidth,
      height: v.videoHeight,
    }));

    const webkitV = video as HTMLVideoElement & {
      webkitDecodedFrameCount?: number;
      webkitDroppedFrameCount?: number;
    };
    const decoded = webkitV.webkitDecodedFrameCount ?? null;
    const dropped = webkitV.webkitDroppedFrameCount ?? null;

    print(label, 'TICK', {
      readyState: video.readyState,
      networkState: video.networkState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      currentTime: video.currentTime,
      paused: video.paused,
      muted: video.muted,
      src: safeSrc(video),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      style: {
        opacity: cs.opacity,
        visibility: cs.visibility,
        zIndex: cs.zIndex,
        display: cs.display,
        position: cs.position,
      },
      webkitDecodedFrameCount: decoded,
      webkitDroppedFrameCount: dropped,
      videoElementsCount: allVideos.length,
      videos: allInfo,
    });

    if (
      video.videoWidth > 0 &&
      video.readyState >= 2 &&
      !video.paused &&
      lastFrameAt > 0 &&
      Date.now() - lastFrameAt > 2000
    ) {
      print(label, 'GPU_FAILURE', {
        message: 'VIDEO DECODER ACTIVE BUT GPU SURFACE NOT COMPOSITED',
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        currentTime: video.currentTime,
        src: safeSrc(video),
      });
    }
  }, 500);

  const hasRVFC =
    typeof (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (
          cb: (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => void
        ) => number;
      }
    ).requestVideoFrameCallback === 'function';

  let rvfcId: number | null = null;
  const rvfcVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (
      cb: (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => void
    ) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };

  const onFrame = (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => {
    if (stop) return;
    lastFrameAt = Date.now();
    print(label, 'FRAME', {
      now,
      mediaTime: meta.mediaTime,
      presentedFrames: meta.presentedFrames,
      width: video.videoWidth,
      height: video.videoHeight,
    });
    rvfcId = rvfcVideo.requestVideoFrameCallback?.(onFrame) ?? null;
  };

  if (hasRVFC) {
    rvfcId = rvfcVideo.requestVideoFrameCallback?.(onFrame) ?? null;
  } else {
    print(label, 'INFO', { message: 'requestVideoFrameCallback not supported' });
  }

  print(label, 'START', { src: safeSrc(video) });

  return () => {
    stop = true;
    window.clearInterval(sampleTimer);
    events.forEach((e) => video.removeEventListener(e, onEvent));
    if (rvfcId !== null && rvfcVideo.cancelVideoFrameCallback) {
      rvfcVideo.cancelVideoFrameCallback(rvfcId);
    }
    print(label, 'STOP', { src: safeSrc(video) });
  };
}

export function setVideoDiagnosticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DIAG_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}
