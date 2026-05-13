/**
 * Vinheta em tela cheia enquanto detalhes de filme/série carregam (substitui spinner/skeleton).
 */
import { useEffect, useRef } from 'react';
import { getDetailsVinhetaSrc } from '@/config/playerDefaults';
import { hasNativePlayer } from '@/utils/tvModernoBridge';

export function DetailsVinhetaFill({ loop = true }: { loop?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (hasNativePlayer()) return;
    const v = ref.current;
    if (!v) return;
    v.setAttribute('muted', '');
    v.muted = true;
    v.defaultMuted = true;
    v.volume = 0;
    void v.play().catch(() => {});
  }, []);
  // TV Moderno: render fundo escuro estático em vez de <video> (sem play gigante).
  if (hasNativePlayer()) {
    return (
      <div
        className="absolute inset-0 h-full w-full"
        style={{ background: 'linear-gradient(180deg,#0a0416 0%,#1a0a2e 100%)' }}
        aria-hidden
      />
    );
  }
  return (
    <>
      <video
        ref={ref}
        src={getDetailsVinhetaSrc()}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        loop={loop}
        preload="auto"
        autoPlay
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(12,6,28,0.2) 0%, transparent 40%, rgba(10,4,22,0.35) 100%)',
        }}
      />
    </>
  );
}
