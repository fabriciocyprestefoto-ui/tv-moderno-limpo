import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getSignal } from '@/utils/appSignals';
import { LoadingScreen } from './LoadingScreen';

const PLAYBACK_FALLBACK_TIMEOUT_MS = 2200;

export const LazyFallback = () => {
  const location = useLocation();
  const [expired, setExpired] = useState(false);

  const isPlaybackRoute =
    location.pathname.startsWith('/watch/') ||
    location.pathname.startsWith('/canais') ||
    location.pathname.startsWith('/adulto');
  const playbackActive =
    isPlaybackRoute || getSignal('playerActive') || getSignal('livetvActive');

  useEffect(() => {
    if (!playbackActive) return;
    setExpired(false);
    const timer = window.setTimeout(() => setExpired(true), PLAYBACK_FALLBACK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [playbackActive, location.pathname]);

  if (playbackActive && expired) {
    return null;
  }

  if (playbackActive) {
    return (
      <LoadingScreen
        text="Carregando..."
        className="z-[20] pointer-events-none"
      />
    );
  }

  return <LoadingScreen text="Carregando..." />;
};
