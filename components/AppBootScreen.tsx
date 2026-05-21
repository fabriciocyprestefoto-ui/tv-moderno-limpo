/**
 * AppBootScreen.tsx — Tela de boot cinematográfica (real-load aware)
 * ══════════════════════════════════════════════════════════════════════
 * v5: Moving Letters Effect 9 (Tobias Ahlin) integrado.
 * Frases animadas com scale elástico letra-a-letra, sem dependências externas.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { runtimeFlags } from '@/config/runtimeFlags';
import { isNativePlatform } from '@/services/nativePlayerService';
import { getSignal } from '@/utils/appSignals';

// ── Moving Letters: frases que rotacionam durante o boot ───────────────────
const PHRASES = ['Filmes', 'Séries', 'Canais ao Vivo', 'A Melhor IPTV do Brasil', 'Redflix'];

interface MovingLettersProps {
  visible: boolean; // aparece depois que o logo sobe
}

const MovingLetters: React.FC<MovingLettersProps> = ({ visible }) => {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [letters, setLetters] = useState<string[]>([]);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monta array de letras (espaço vira entidade non-breaking para animar)
  useEffect(() => {
    const phrase = PHRASES[phraseIdx];
    setLetters(phrase.split(''));
    setPhase('in');
  }, [phraseIdx]);

  // Sequência in → hold → out → próxima frase
  useEffect(() => {
    if (!visible) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const letterCount = PHRASES[phraseIdx].replace(/ /g, '').length;
    const inDur = 300 + letterCount * 45 + 600; // tempo de entrada
    const holdDur = 900;
    const outDur = 700;

    if (phase === 'in') {
      timerRef.current = setTimeout(() => setPhase('hold'), inDur);
    } else if (phase === 'hold') {
      timerRef.current = setTimeout(() => setPhase('out'), holdDur);
    } else {
      timerRef.current = setTimeout(() => {
        setPhraseIdx((i) => (i + 1) % PHRASES.length);
      }, outDur);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, phraseIdx, visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          paddingTop: '0.2em',
          paddingBottom: '0.1em',
          paddingRight: '0.05em',
          overflow: 'hidden',
          opacity: phase === 'out' ? 0 : 1,
          transition: phase === 'out' ? 'opacity 0.6s cubic-bezier(0.19,1,0.22,1)' : 'none',
        }}
      >
        {letters.map((char, i) => {
          const nonSpace = PHRASES[phraseIdx].substring(0, i + 1).replace(/ /g, '').length - 1;
          const delay = phase === 'in' ? 45 * (nonSpace + 1) : 0;
          const isSpace = char === ' ';

          return (
            <span
              key={`${phraseIdx}-${i}`}
              style={{
                display: 'inline-block',
                lineHeight: '1em',
                transformOrigin: '50% 100%',
                ...(isSpace ? { width: '0.3em' } : {}),
                transform: phase === 'in' ? 'scale(1)' : undefined,
                animation:
                  phase === 'in' && !isSpace
                    ? `mlLetterIn 1.2s cubic-bezier(0.175,0.885,0.32,1.275) ${delay}ms both`
                    : 'none',
                fontSize: 'clamp(1.3rem, 4vw, 2rem)',
                fontWeight: 200,
                color: 'rgba(255,255,255,0.92)',
                letterSpacing: '0.02em',
                // Gradiente dourado na última frase (Redflix)
                ...(phraseIdx === PHRASES.length - 1
                  ? {
                      background: 'linear-gradient(90deg, #c084fc, #ec4899, #f0abfc)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fontWeight: 600,
                    }
                  : {}),
              }}
            >
              {isSpace ? '\u00A0' : char}
            </span>
          );
        })}
      </span>

      <style>{`
        @keyframes mlLetterIn {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          80%  { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

interface AppBootScreenProps {
  onComplete: () => void;
}

// ── Partículas geradas uma única vez (fora do componente) ──────────────────
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  color: string;
}
function genParticles(n: number): Particle[] {
  const colors = ['#a855f7', '#ec4899', '#8b5cf6', '#c084fc', '#ffffff', '#f0abfc'];
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    opacity: Math.random() * 0.55 + 0.08,
    duration: Math.random() * 4 + 3,
    delay: Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
}
const PARTICLES = genParticles(80);
void MovingLetters;
void PARTICLES;

// ── Fases (ms desde mount) ─────────────────────────────────────────────────
const T = {
  LOGO_RISE: 800, // logo sobe
  BAR_START: 1400, // barra começa
  BAR_FULL: 3200, // barra visual 100%
  CHECK_START: 3500, // começa a liberar a entrada após a vinheta inicial
  MIN_TOTAL: 4500, // tempo mínimo visual garantido antes do login/home
  MAX_WAIT: 90000, // timeout de segurança (90s)
  EXIT_DUR: 350, // duração do zoom-out
  FLASH_DUR: 450, // duração do flash
};

// ── Componente ──────────────────────────────────────────────────────────────
const AppBootScreen: React.FC<AppBootScreenProps> = ({ onComplete }) => {
  // E2E/test bypass: set window.__REDX_SKIP_BOOT=true or localStorage 'redx-skip-boot'='1'
  // Nao pular em Android TV: a vinheta substitui o preload antes do login.
  const skipBoot =
    typeof window !== 'undefined' &&
    ((window as unknown as Record<string, unknown>).__REDX_SKIP_BOOT === true ||
      localStorage.getItem('redx-skip-boot') === '1');

  const [progress, setProgress] = useState(0);
  const [statusTxt, setStatus] = useState('Iniciando…');
  const [logoScale, setLogoScale] = useState(0.65);
  const [logoAlpha, setLogoAlpha] = useState(0);
  const [glow, setGlow] = useState(0);
  const [exiting, setExiting] = useState(false); // zoom-out
  const [flashing, setFlashing] = useState(false); // fade branco

  const doneRef = useRef(false);
  const rafRef = useRef<number>(0);
  const startRef = useRef(Date.now());
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sequência de saída ────────────────────────────────────────────────────
  const triggerExit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);

    setProgress(100);
    setStatus('Bem-vindo!');
    setExiting(true);

    exitTimerRef.current = setTimeout(() => {
      setFlashing(true);
      flashTimerRef.current = setTimeout(onComplete, T.FLASH_DUR);
    }, T.EXIT_DUR);
  }, [onComplete]);

  // ── RAF principal ────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const e = Date.now() - startRef.current;
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const playbackRouteActive =
      pathname.startsWith('/watch/') ||
      pathname.startsWith('/canais') ||
      pathname.startsWith('/adulto');
    if (getSignal('playerActive') || getSignal('livetvActive') || playbackRouteActive) {
      triggerExit();
      return;
    }

    /* 1. Logo rise */
    if (e < T.LOGO_RISE) {
      const t = e / T.LOGO_RISE;
      const ease = 1 - Math.pow(1 - t, 3);
      setLogoScale(0.65 + 0.35 * ease);
      setLogoAlpha(ease);
      setGlow(ease * 0.45);
    } else if (e < T.BAR_START) {
      /* 2. Logo idle + glow pulse */
      setLogoScale(1);
      setLogoAlpha(1);
      setGlow(0.45 + Math.sin((e / 380) * Math.PI) * 0.12);
    } else if (e < T.BAR_FULL) {
      /* 3. Barra de progresso */
      const bt = (e - T.BAR_START) / (T.BAR_FULL - T.BAR_START);
      const eased = bt < 0.5 ? 2 * bt * bt : 1 - Math.pow(-2 * bt + 2, 2) / 2;
      setProgress(eased * 100);
      setGlow(0.35 + eased * 0.55);
      if (bt < 0.33) setStatus('Sincronizando canais…');
      else if (bt < 0.66) setStatus('Carregando catálogo…');
      else setStatus('Quase pronto…');
    } else if (!doneRef.current) {
      /* 4. Barra visual completa — aguarda dados reais */
      setProgress(100);
      // Glow pulsa devagar enquanto aguarda
      setGlow(0.85 + Math.sin((e / 350) * Math.PI) * 0.25);

      if (e >= T.CHECK_START) {
        const homeReady = getSignal('homeReady');
        const timerOk = e >= T.MIN_TOTAL;
        const maxExceeded = e >= T.MAX_WAIT;

        // Texto de status reflete o que está sendo aguardado
        if (!homeReady) setStatus('Carregando catálogo…');
        else setStatus('Pronto!');

        // A vinheta de boot sempre libera após o tempo mínimo, mesmo antes do login.
        if (timerOk || maxExceeded) {
          triggerExit();
          return;
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (skipBoot) {
      onComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    const hardTimeout = setTimeout(() => {
      triggerExit();
    }, T.MAX_WAIT + 1000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(hardTimeout);
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, [tick, skipBoot, onComplete]);

  if (skipBoot) return null;
  void progress;
  void logoScale;
  void logoAlpha;
  void glow;

  const useStaticBoot =
    runtimeFlags.isTvBuild &&
    typeof window !== 'undefined' &&
    isNativePlatform();

  // ── Estilos ───────────────────────────────────────────────────────────────
  const wrapCls = [
    'fixed inset-0 z-[99999] overflow-hidden select-none',
    flashing ? 'opacity-0 scale-105' : 'opacity-100 scale-100',
    exiting ? 'transition-all duration-[350ms] ease-in' : '',
    flashing ? 'transition-all duration-[450ms] ease-in' : '',
  ].join(' ');

  return (
    <div className={wrapCls} style={{ backgroundColor: '#000' }}>
      {useStaticBoot ? (
        <div className="absolute inset-0 overflow-hidden bg-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(168,85,247,0.28),rgba(0,0,0,0)_38%),linear-gradient(135deg,rgba(126,34,206,0.28),rgba(236,72,153,0.14)_42%,rgba(0,0,0,0.92)_78%)]" />
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-400/20 bg-purple-500/10 blur-3xl" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              style={{
                transform: `scale(${logoScale})`,
                opacity: logoAlpha,
                filter: `drop-shadow(0 0 ${18 + glow * 24}px rgba(192,132,252,0.55))`,
                transition: 'filter 120ms linear',
              }}
              className="text-center"
            >
              <div className="text-4xl font-black tracking-[0.28em] text-white sm:text-6xl">
                RED<span className="bg-gradient-to-r from-fuchsia-400 to-red-500 bg-clip-text text-transparent">X</span>
              </div>
              <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 transition-[width] duration-150"
                  style={{ width: `${Math.max(8, progress)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <video
          src="/vinheta-tv.mp4"
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 pointer-events-none bg-black/10" />
      <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center">
        <p
          style={{
            fontSize: '10px',
            letterSpacing: '0.34em',
            color: 'rgba(255,255,255,0.62)',
            fontWeight: 700,
            textTransform: 'uppercase',
            textShadow: '0 2px 18px rgba(0,0,0,0.85)',
          }}
        >
          {statusTxt}
        </p>
      </div>
    </div>
  );
};

export default AppBootScreen;
