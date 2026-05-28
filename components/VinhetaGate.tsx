import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DETAILS_VINHETA_MAX_MS } from '@/config/playerDefaults';
import { playWhenVideoReady, prepareVideoForAutoplay } from '@/utils/videoAutoplay';
import { hasNativePlayer } from '@/utils/tvModernoBridge';
import { platformBannerFallbackUrls } from '@/utils/publicAssetUrl';

interface VinhetaGateProps {
  active: boolean;
  onComplete: () => void;
  onCancel?: () => void;
}

const VINHETA_URLS = platformBannerFallbackUrls('vinheta-tv.mp4', import.meta.env.VITE_APP_VERSION ?? '1');
const FAILSAFE_MS = DETAILS_VINHETA_MAX_MS;
// Tempo mínimo de exibição: garante presença visual sem bloquear a navegação por 8s.
// FAILSAFE é o teto máximo para vídeos que nunca disparam onEnded (WebView antigo).
const MIN_DISPLAY_MS = 1_500;

const VinhetaGate: React.FC<VinhetaGateProps> = ({ active, onComplete, onCancel }) => {
  const completedRef = useRef(false);
  const mountedAtRef = useRef(0);
  const minTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loggedPlaySuccessRef = useRef(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [showSoundUnlock, setShowSoundUnlock] = useState(false);

  const unlockSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;
    console.log('[IntroLegacy] muted=false');
    console.log('[IntroLegacy] volume=1');
    void video.play().then(() => {
      setShowSoundUnlock(false);
    }).catch(() => {
      // Mantém o aviso visível se o browser ainda bloquear o unmute.
      setShowSoundUnlock(true);
    });
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    // Seta TRUE imediatamente — bloqueia qualquer chamada concorrente (FAILSAFE, onError, etc.)
    completedRef.current = true;

    // Garante exibição mínima de preload mesmo quando o vídeo termina rápido
    const elapsed = Date.now() - mountedAtRef.current;
    const remaining = MIN_DISPLAY_MS - elapsed;
    if (remaining > 0) {
      minTimerRef.current = window.setTimeout(() => {
        minTimerRef.current = null;
        onComplete();
      }, remaining);
      return;
    }
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!active) return;
    completedRef.current = false;
    loggedPlaySuccessRef.current = false;
    mountedAtRef.current = Date.now();
    setSourceIndex(0);
    setShowSoundUnlock(false);
    console.log('[IntroLegacy] userGesture=true');
    // TV Moderno: NÃO toca vinheta web — pula direto pro onComplete.
    // Vinheta deveria rodar em ExoPlayer nativo (EXTRA_INTRO_URL) — não implementado
    // nessa build pra evitar timer preso. Skip completo é OK funcionalmente.
    if (hasNativePlayer()) {
      window.setTimeout(() => onComplete(), 50);
      return;
    }
    const timer = window.setTimeout(() => finish(), FAILSAFE_MS);
    return () => {
      window.clearTimeout(timer);
      if (minTimerRef.current !== null) {
        window.clearTimeout(minTimerRef.current);
        minTimerRef.current = null;
      }
    };
  }, [active, finish, onComplete]);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;
    // Legacy/WebView: tenta tocar com som quando a vinheta vem de clique do usuário.
    // Se autoplay com som falhar, cai para muted e exibe prompt para ativar som.
    prepareVideoForAutoplay(video, false);
    console.log('[IntroLegacy] muted=false');
    console.log('[IntroLegacy] volume=1');
    const cleanupReadyPlay = playWhenVideoReady(video, {
      mutedFirst: false,
      mutedFallback: true,
      onMutedFallback: () => {
        console.log('[IntroLegacy] autoplay with sound blocked, waiting user OK');
        setShowSoundUnlock(true);
      },
    });
    // Detecção de stall — Firestick / WebView antigo pode ficar networkState=2
    // ("carregando") mas readyState nunca progride (codec não suportado, rede lenta
    // ou falha silenciosa). Verificamos APENAS readyState após 1500ms — se o elemento
    // ainda não tem dados suficientes para renderizar um frame (readyState < 2),
    // chamamos finish() que garante MIN_DISPLAY_MS de overlay antes de liberar.
    const stallTimer = window.setTimeout(() => {
      if (video.readyState < 2 /* HAVE_CURRENT_DATA */) {
        finish();
      }
    }, 1500);
    // Segundo check a 4s: cobre WebViews que ficam em readyState=1 (HAVE_METADATA)
    // mas nunca recebem dados suficientes para play.
    const stallTimer2 = window.setTimeout(() => {
      if (!completedRef.current && video.readyState < 3 /* HAVE_FUTURE_DATA */) {
        finish();
      }
    }, 4000);
    // Erro no play(): não finaliza imediatamente — o MIN_DISPLAY_MS garante o preload
    return () => {
      window.clearTimeout(stallTimer);
      window.clearTimeout(stallTimer2);
      cleanupReadyPlay();
    };
  }, [active, finish, sourceIndex]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const key = event.key;
      if (showSoundUnlock && (key === 'Enter' || key === ' ' || key === 'OK')) {
        unlockSound();
        return;
      }

      if (key === 'Escape' || key === 'Backspace' || key === 'Back') {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [active, onCancel, showSoundUnlock, unlockSound]);

  if (!active) return null;
  // TV Moderno: nenhum <video> montado — onComplete já foi agendado no effect acima.
  if (hasNativePlayer()) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Introdução"
      className="fixed inset-0 flex items-center justify-center bg-black"
      style={{ zIndex: 30000 }}
    >
      <video
        ref={(el) => {
          videoRef.current = el;
          if (el) {
            el.removeAttribute('muted');
            el.muted = false;
            el.defaultMuted = false;
            el.volume = 1;
          }
        }}
        src={VINHETA_URLS[sourceIndex] ?? VINHETA_URLS[0]}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        preload="auto"
        aria-hidden="true"
        onPlaying={(e) => {
          if (loggedPlaySuccessRef.current) return;
          const v = e.currentTarget;
          if (!v.muted && v.volume > 0) {
            loggedPlaySuccessRef.current = true;
            console.log('[IntroLegacy] play success');
          }
        }}
        onEnded={finish}
        onError={() => {
          if (sourceIndex + 1 < VINHETA_URLS.length) {
            setSourceIndex((current) => current + 1);
            return;
          }
          finish();
        }}
      />
      {showSoundUnlock && (
        <div className="absolute inset-x-0 bottom-10 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={unlockSound}
            className="pointer-events-auto rounded-xl bg-white/18 border border-white/35 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white"
          >
            Ativar som (OK)
          </button>
        </div>
      )}
    </div>
  );
};

export default VinhetaGate;
