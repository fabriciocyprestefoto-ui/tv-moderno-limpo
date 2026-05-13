export const LIVE_TV_MAX_NETWORK_RECOVERIES = 3;
export const LIVE_TV_MAX_MEDIA_RECOVERIES = 2;

/** Limites mais altos para players embutidos (TV Box / rede instável). */
export const LIVE_TV_EMBEDDED_MAX_NETWORK_RECOVERIES = 5;
export const LIVE_TV_EMBEDDED_MAX_MEDIA_RECOVERIES = 3;

export type LiveTvRecoveryDecision =
  | { action: 'retry-network'; delayMs: number }
  | { action: 'recover-media' }
  | { action: 'fail' };

export const getLiveTvRecoveryDelayMs = (attempt: number): number =>
  Math.min(Math.max(attempt, 1) * 1000, 5000);

export const getLiveTvRecoveryDelayMsExponential = (networkRetryCount: number): number =>
  Math.min(1000 * Math.pow(2, Math.max(0, networkRetryCount - 1)), 16000);

export const getLiveTvRecoveryDecision = ({
  errorType,
  networkRetries,
  mediaRetries,
  maxNetworkRetries = LIVE_TV_MAX_NETWORK_RECOVERIES,
  maxMediaRetries = LIVE_TV_MAX_MEDIA_RECOVERIES,
  delayMode = 'linear',
}: {
  errorType: string;
  networkRetries: number;
  mediaRetries: number;
  maxNetworkRetries?: number;
  maxMediaRetries?: number;
  /** `linear` = mesma política que a página LiveTV; `exponential` = embeds (LiveTVVideo). */
  delayMode?: 'linear' | 'exponential';
}): LiveTvRecoveryDecision => {
  if (errorType === 'networkError' && networkRetries < maxNetworkRetries) {
    const attempt = networkRetries + 1;
    const delayMs =
      delayMode === 'exponential'
        ? getLiveTvRecoveryDelayMsExponential(attempt)
        : getLiveTvRecoveryDelayMs(attempt);
    return { action: 'retry-network', delayMs };
  }

  if (errorType === 'mediaError' && mediaRetries < maxMediaRetries) {
    return { action: 'recover-media' };
  }

  return { action: 'fail' };
};

export const getAdjacentLiveTvChannelIndex = ({
  channelCount,
  currentIndex,
  direction,
}: {
  channelCount: number;
  currentIndex: number;
  direction: -1 | 1;
}): number => {
  if (channelCount <= 0) return -1;
  const safeIndex = currentIndex >= 0 && currentIndex < channelCount ? currentIndex : 0;
  return (safeIndex + direction + channelCount) % channelCount;
};
