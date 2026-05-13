/**
 * AppBootScreen.tsx — Tela de boot cinematográfica (real-load aware)
 * ══════════════════════════════════════════════════════════════════════
 * v5: Moving Letters Effect 9 (Tobias Ahlin) integrado.
 * Frases animadas com scale elástico letra-a-letra, sem dependências externas.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSignal } from '@/utils/appSignals';
import { isLiteMode } from '@/utils/liteMode';

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

// ── Fases (ms desde mount) ─────────────────────────────────────────────────
const T = {
  LOGO_RISE: 800, // logo sobe
  BAR_START: 1400, // barra começa
  BAR_FULL: 5000, // barra visual 100% (mais lenta para dar tempo real de carga)
  CHECK_START: 5500, // começa a verificar flags reais (após barra completa)
  MIN_TOTAL: 7000, // tempo mínimo visual garantido (7s para garantir carga completa)
  MAX_WAIT: 90000, // timeout de segurança (90s)
  EXIT_DUR: 350, // duração do zoom-out
  FLASH_DUR: 450, // duração do flash
};

// ── Componente ──────────────────────────────────────────────────────────────
const AppBootScreen: React.FC<AppBootScreenProps> = ({ onComplete }) => {
  // E2E/test bypass: set window.__REDX_SKIP_BOOT=true or localStorage 'redx-skip-boot'='1'
  // Lite mode (device antigo / rede lenta): pula animação pesada de 7s
  const skipBoot =
    typeof window !== 'undefined' &&
    ((window as unknown as Record<string, unknown>).__REDX_SKIP_BOOT === true ||
      localStorage.getItem('redx-skip-boot') === '1' ||
      isLiteMode());

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

        // Abre quando o catálogo home estiver pronto (ou timeout de segurança)
        if ((homeReady && timerOk) || maxExceeded) {
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

  // ── Estilos ───────────────────────────────────────────────────────────────
  const wrapCls = [
    'fixed inset-0 z-[99999] overflow-hidden select-none',
    flashing ? 'opacity-0 scale-105' : 'opacity-100 scale-100',
    exiting ? 'transition-all duration-[350ms] ease-in' : '',
    flashing ? 'transition-all duration-[450ms] ease-in' : '',
  ].join(' ');

  return (
    <div className={wrapCls} style={{ backgroundColor: '#060010' }}>
      {/* ── Partículas ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              opacity: p.opacity,
              animation: `bootFloat ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* ── Glow radial ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 65% 55% at 50% 40%,
          rgba(124,58,237,${(glow * 0.22).toFixed(2)}) 0%,
          rgba(236,72,153,${(glow * 0.1).toFixed(2)}) 40%,
          transparent 70%)`,
        }}
      />

      {/* ── Grade sutil ── */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
          linear-gradient(rgba(168,85,247,.6) 1px, transparent 1px),
          linear-gradient(90deg, rgba(168,85,247,.6) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* ── Conteúdo central ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
        {/* Halo externo do logo */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: '300px',
            height: '300px',
            background: `radial-gradient(circle, rgba(124,58,237,${(glow * 0.14).toFixed(2)}) 0%, transparent 70%)`,
            filter: 'blur(28px)',
            transform: `scale(${(0.8 + glow * 0.35).toFixed(3)})`,
          }}
        />

        {/* Logo */}
        <img
          src="/logored.png"
          alt="RedFlix"
          draggable={false}
          style={{
            height: '76px',
            width: 'auto',
            objectFit: 'contain',
            transform: `scale(${logoScale})`,
            opacity: logoAlpha,
            filter: `drop-shadow(0 0 ${(glow * 42).toFixed(0)}px rgba(168,85,247,.85))
                     drop-shadow(0 0 ${(glow * 20).toFixed(0)}px rgba(236,72,153,.55))`,
          }}
        />

        {/* ── Moving Letters: frases animadas ── */}
        <div style={{ opacity: logoAlpha, minHeight: '56px' }}>
          <MovingLetters visible={logoAlpha > 0.7} />
        </div>

        {/* Barra de progresso */}
        <div
          style={{
            width: '260px',
            height: '3px',
            background: 'rgba(255,255,255,0.07)',
            borderRadius: '9999px',
            overflow: 'hidden',
            opacity: logoAlpha,
            position: 'relative',
          }}
        >
          {/* Trilha */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg,#7c3aed,#a855f7,#ec4899)',
              width: `${progress}%`,
              transition: 'width 0.06s linear',
              boxShadow: '0 0 14px rgba(168,85,247,.95), 0 0 4px rgba(236,72,153,.7)',
              borderRadius: '9999px',
            }}
          />
          {/* Pulso na ponta */}
          {progress > 1 && progress < 99.5 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                left: `calc(${progress}% - 5px)`,
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#f0abfc',
                boxShadow: '0 0 8px #a855f7',
                animation: 'bootPulse .55s ease-in-out infinite alternate',
              }}
            />
          )}
        </div>

        {/* Texto de status */}
        <p
          style={{
            fontSize: '10px',
            letterSpacing: '0.38em',
            color: `rgba(255,255,255,${(logoAlpha * 0.38).toFixed(2)})`,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {statusTxt}
        </p>
      </div>

      {/* ── Scanlines ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.5) 2px,rgba(0,0,0,.5) 4px)',
        }}
      />

      {/* ── Borda interior ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 80px rgba(124,58,237,${(glow * 0.07).toFixed(2)})`,
        }}
      />

      <style>{`
        @keyframes bootFloat {
          from { transform: translate(0,0); }
          to   { transform: translate(10px,-22px); }
        }
        @keyframes bootPulse {
          from { transform: translateY(-50%) scale(1); opacity: 1; }
          to   { transform: translateY(-50%) scale(1.7); opacity: .35; }
        }
      `}</style>
    </div>
  );
};

export default AppBootScreen;
