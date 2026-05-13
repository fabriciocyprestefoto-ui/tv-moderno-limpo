import React, { useCallback, useEffect, useRef } from 'react';
import { DETAILS_VINHETA_MAX_MS } from '@/config/playerDefaults';
import { playWhenVideoReady, prepareVideoForAutoplay } from '@/utils/videoAutoplay';
import { hasNativePlayer } from '@/utils/tvModernoBridge';

interface VinhetaGateProps {
  active: boolean;
  onComplete: () => void;
  onCancel?: () => void;
}

// Sempre absoluto — base: './' no vite.config causaria path errado em rotas como /details/123
const VINHETA_URL = `/vinheta-tv.mp4?v=${import.meta.env.VITE_APP_VERSION ?? '1'}`;
const FAILSAFE_MS = DETAILS_VINHETA_MAX_MS;
// Tempo mínimo de exibição: garante presença visual sem bloquear a navegação por 8s.
// FAILSAFE é o teto máximo para vídeos que nunca disparam onEnded (WebView antigo).
const MIN_DISPLAY_MS = 1_500;

const VinhetaGate: React.FC<VinhetaGateProps> = ({ active, onComplete, onCancel }) => {
  const completedRef = useRef(false);
  const mountedAtRef = useRef(0);
  const minTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
    mountedAtRef.current = Date.now();
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
    // Vinheta sempre muted — política de autoplay compatível com WebView legado
    // (Firestick) e moderno (Android TV). Som da vinheta nunca toca.
    prepareVideoForAutoplay(video, true);
    const cleanupReadyPlay = playWhenVideoReady(video, {
      mutedFirst: true,
      mutedFallback: true,
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
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const key = event.key;
      if (key === 'Escape' || key === 'Backspace' || key === 'Back') {
        onCancel?.();
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [active, onCancel]);

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
            el.setAttribute('muted', '');
            el.muted = true;
            el.defaultMuted = true;
            el.volume = 0;
          }
        }}
        src={VINHETA_URL}
        className="h-full w-full object-cover"
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
        onError={finish}
      />
    </div>
  );
};

export default VinhetaGate;
