import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isNativePlatform } from '@/services/nativePlayerService';
import { platformBannerFallbackUrls } from '@/utils/publicAssetUrl';

interface AppBootScreenProps {
  onComplete: () => void;
}

const VINHETA_URLS = platformBannerFallbackUrls('vinheta-tv.mp4', import.meta.env.VITE_APP_VERSION ?? '1');
const MAX_BOOT_MS = 7000;
const MIN_BOOT_MS = 1200;

const AppBootScreen: React.FC<AppBootScreenProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startedAtRef = useRef(Date.now());
  const doneRef = useRef(false);
  const [sourceIndex, setSourceIndex] = useState(0);

  const nativeAndroid = typeof window !== 'undefined' && isNativePlatform();
  const skipBoot =
    typeof window !== 'undefined' &&
    (nativeAndroid ||
      (window as unknown as Record<string, unknown>).__REDX_SKIP_BOOT === true ||
      (!nativeAndroid && localStorage.getItem('redx-skip-boot') === '1'));

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const elapsed = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, MIN_BOOT_MS - elapsed);
    window.setTimeout(onComplete, remaining);
  }, [onComplete]);

  useEffect(() => {
    if (skipBoot) {
      onComplete();
      return;
    }

    startedAtRef.current = Date.now();
    doneRef.current = false;
    setSourceIndex(0);

    const hardTimeout = window.setTimeout(finish, MAX_BOOT_MS);
    return () => window.clearTimeout(hardTimeout);
  }, [finish, onComplete, skipBoot]);

  useEffect(() => {
    if (skipBoot) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.play().catch(() => {
      window.setTimeout(finish, MIN_BOOT_MS);
    });
  }, [finish, skipBoot, sourceIndex]);

  if (skipBoot) return null;

  return (
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-black select-none">
      <video
        key={sourceIndex}
        ref={videoRef}
        src={VINHETA_URLS[sourceIndex] ?? VINHETA_URLS[0]}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        playsInline
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        preload="auto"
        aria-hidden="true"
        onEnded={finish}
        onError={() => {
          if (sourceIndex + 1 < VINHETA_URLS.length) {
            setSourceIndex((current) => current + 1);
            return;
          }
          finish();
        }}
      />
    </div>
  );
};

export default AppBootScreen;
