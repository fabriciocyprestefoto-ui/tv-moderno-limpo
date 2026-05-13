export interface PlaybackUrlResolution {
  originalUrl: string;
  playbackUrl: string;
  upgradedToHttps: boolean;
  cleartextWouldBeBlocked: boolean;
}

export function resolvePlaybackUrl(rawUrl: string): PlaybackUrlResolution {
  const originalUrl = String(rawUrl || '').trim();
  if (!originalUrl) {
    return {
      originalUrl,
      playbackUrl: originalUrl,
      upgradedToHttps: false,
      cleartextWouldBeBlocked: false,
    };
  }

  // In TV Box mode with Capacitor, we allow HTTP streams to avoid "Mixed Content" issues
  // especially after changing the app scheme to http.
  return {
    originalUrl,
    playbackUrl: originalUrl,
    upgradedToHttps: false,
    cleartextWouldBeBlocked: false,
  };
}

export function getPlaybackFailureHint(_resolution: PlaybackUrlResolution): string | null {
  return null;
}
