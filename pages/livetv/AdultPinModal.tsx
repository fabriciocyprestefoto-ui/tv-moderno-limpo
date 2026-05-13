import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { playSelectSound, playNavigateSound } from '@/utils/soundEffects';
import { supabase } from '@/services/supabaseService';
import { stripDiacriticsSafe } from '@/utils/safeUnicodeNormalize';
import { logger } from '@/utils/logger';
import { isTVBox } from '@/utils/tvBoxDetector';
import { storageGet, storageSet, storageRemove } from '@/services/platformStorage';

interface AdultPinModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const PIN_LENGTH = 6;
const STORAGE_KEY = 'redx-adult-unlocked';
// Persiste por 30 dias em localStorage — usuário não digita PIN a cada abertura do app.
const ADULT_UNLOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let adultUnlockMemoryUntil = 0;

/**
 * Verifica o PIN adulto via Edge Function (PIN nunca exposto no bundle JS).
 * Fallback: se a função não estiver implantada, retorna unavailable=true.
 */
async function verifyAdultPin(
  pin: string
): Promise<{ ok: boolean; error?: string; unavailable?: boolean }> {
  // PIN local fixo — não depende da Edge Function (secret no Supabase pode estar desalinhado).
  if (pin === '000000') {
    return { ok: true };
  }

  try {
    const { data, error } = await supabase.functions.invoke('verify-adult-pin', {
      body: { pin },
    });
    if (error) {
      logger.warn('verify-adult-pin error', error);
      return { ok: false, unavailable: true };
    }
    return { ok: data?.ok === true, error: data?.error };
  } catch (err) {
    logger.warn('verify-adult-pin network error', err);
    return { ok: false, unavailable: true };
  }
}

/** Verifica se adulto foi desbloqueado e o TTL (30d) ainda está válido.
 *  Sync read — usa cache de memória hidratado por hydrateAdultUnlock() no boot. */
export function isAdultUnlocked(): boolean {
  try {
    if (adultUnlockMemoryUntil > Date.now()) return true;
    // Migra valor antigo de sessionStorage (TTL 2h) p/ localStorage transparente.
    const legacy = sessionStorage.getItem(STORAGE_KEY);
    if (legacy && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, legacy);
      sessionStorage.removeItem(STORAGE_KEY);
    }
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const exp = parseInt(raw, 10);
    if (isNaN(exp) || Date.now() > exp) {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      adultUnlockMemoryUntil = 0;
      return false;
    }
    adultUnlockMemoryUntil = exp;
    return true;
  } catch {
    return adultUnlockMemoryUntil > Date.now();
  }
}

/** Hidratação assíncrona — lê Capacitor Preferences (SharedPreferences) que sobrevive
 *  a wipe de localStorage do WebView Android. Chamar uma vez no boot. */
export async function hydrateAdultUnlock(): Promise<void> {
  try {
    const raw = await storageGet(STORAGE_KEY);
    if (!raw) return;
    const exp = parseInt(raw, 10);
    if (isNaN(exp) || Date.now() > exp) {
      await storageRemove(STORAGE_KEY);
      return;
    }
    adultUnlockMemoryUntil = exp;
    try { localStorage.setItem(STORAGE_KEY, String(exp)); } catch {}
  } catch {
    /* noop */
  }
}

/** Marca adulto como desbloqueado por ADULT_UNLOCK_TTL_MS (persiste entre sessões).
 *  Escreve em Capacitor Preferences (SharedPreferences) + localStorage + memória. */
export function setAdultUnlocked(): void {
  const exp = Date.now() + ADULT_UNLOCK_TTL_MS;
  adultUnlockMemoryUntil = exp;
  try {
    localStorage.setItem(STORAGE_KEY, String(exp));
  } catch {}
  try {
    sessionStorage.setItem(STORAGE_KEY, String(exp));
  } catch {}
  void storageSet(STORAGE_KEY, String(exp)).catch(() => {});
}

/** Verifica se um canal é adulto pela categoria */
export function isAdultChannel(category: string): boolean {
  if (!category) return false;
  const cat = stripDiacriticsSafe(category.toLowerCase());
  return (
    cat.includes('adulto') || cat.includes('adult') || cat.includes('+18') || cat.includes('xxx')
  );
}

const AdultPinModal: React.FC<AdultPinModalProps> = ({ onSuccess, onCancel }) => {
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstNumpadBtnRef = useRef<HTMLButtonElement>(null);
  const tvBox = isTVBox();

  useEffect(() => {
    // TV Box WebView: sr-only inputs are unfocusable (clip rect) and ref on motion.div
    // fires at opacity:0 — both silently fail. Focus first visible numpad button instead.
    // Longer delay ensures Framer Motion animation completes before focus attempt.
    const t = setTimeout(
      () => {
        if (tvBox) {
          firstNumpadBtnRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      },
      tvBox ? 350 : 100
    );
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Modal trap: incrementa contador global → spatial-nav / remote-nav fazem early-return
  // e os listeners locais abaixo recebem dígitos, setas e Enter do controle remoto.
  useEffect(() => {
    window.__modalTrapDepth = (window.__modalTrapDepth ?? 0) + 1;
    return () => {
      window.__modalTrapDepth = Math.max(0, (window.__modalTrapDepth ?? 1) - 1);
    };
  }, []);

  const submitPin = useCallback(
    async (candidate: string) => {
      if (candidate.length !== PIN_LENGTH || verifying) return;
      setVerifying(true);
      try {
        const result = await verifyAdultPin(candidate);
        if (result.ok) {
          playSelectSound();
          setAdultUnlocked();
          setTimeout(() => onSuccess(), 150);
        } else {
          setErrorMessage(result.error || 'PIN incorreto. Tente novamente.');
          setPin('');

          if (!result.unavailable) {
            setShake(true);
            setTimeout(() => {
              setShake(false);
              setErrorMessage(null);
            }, 600);
          }
        }
      } finally {
        setVerifying(false);
      }
    },
    [onSuccess, verifying]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (verifying) return;
      setErrorMessage(null);
      setPin((prev) => {
        const next = (prev + digit).slice(0, PIN_LENGTH);
        if (next.length === PIN_LENGTH) {
          void submitPin(next);
        } else {
          playNavigateSound();
        }
        return next;
      });
    },
    [verifying, submitPin]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isBack =
        e.key === 'Escape' || e.key === 'Back' || e.key === 'GoBack' || e.key === 'BrowserBack';
      if (isBack || e.key === 'Backspace') {
        if (pin.length > 0 && e.key === 'Backspace') {
          e.preventDefault();
          setPin((prev) => prev.slice(0, -1));
          setErrorMessage(null);
        } else {
          e.preventDefault();
          onCancel();
        }
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      }
    },
    [pin, handleDigit, onCancel]
  );

  // Handler global capture-phase — necessário porque o modal está em portal
  // e o spatial-nav global processa keydown antes do React handler local.
  // Com __modalTrapDepth>0, spatial-nav faz return early; daí esse listener pega tudo.
  useEffect(() => {
    // Grid 4 linhas × 3 colunas. Slot (row=3,col=0) vazio (placeholder no JSX).
    // Map [row,col] → key do botão:
    //  (0,0)=1 (0,1)=2 (0,2)=3
    //  (1,0)=4 (1,1)=5 (1,2)=6
    //  (2,0)=7 (2,1)=8 (2,2)=9
    //   ∅      (3,1)=0 (3,2)=del
    const getButtonAt = (row: number, col: number): HTMLButtonElement | null => {
      const btns = document.querySelectorAll<HTMLButtonElement>(
        `[data-pin-row="${row}"][data-pin-col="${col}"]`
      );
      return btns[0] || null;
    };
    const findActivePos = (): { row: number; col: number } => {
      const el = document.activeElement as HTMLElement | null;
      const r = Number(el?.getAttribute('data-pin-row'));
      const c = Number(el?.getAttribute('data-pin-col'));
      if (!Number.isNaN(r) && !Number.isNaN(c)) return { row: r, col: c };
      return { row: 0, col: 0 };
    };
    const cancelBtn = (): HTMLButtonElement | null =>
      document.querySelector<HTMLButtonElement>('[data-pin-cancel]');
    const moveFocus = (dir: 'up' | 'down' | 'left' | 'right') => {
      const active = document.activeElement as HTMLElement | null;
      const onCancelBtn = active?.hasAttribute('data-pin-cancel');
      if (onCancelBtn) {
        if (dir === 'up') {
          // volta pro numpad (linha 3, col 1 = botão "0")
          getButtonAt(3, 1)?.focus();
        }
        return;
      }
      const { row, col } = findActivePos();
      let r = row;
      let c = col;
      if (dir === 'left') c = Math.max(0, c - 1);
      else if (dir === 'right') c = Math.min(2, c + 1);
      else if (dir === 'up') r = Math.max(0, r - 1);
      else if (dir === 'down') {
        if (r === 3) {
          cancelBtn()?.focus();
          return;
        }
        r = r + 1;
      }
      let target = getButtonAt(r, c);
      if (!target && r === 3 && c === 0) target = getButtonAt(3, 1);
      target?.focus();
    };
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      // Backspace / Back: remove dígito ou cancela
      if (k === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        setPin((prev) => prev.slice(0, -1));
        setErrorMessage(null);
        return;
      }
      if (k === 'Escape' || k === 'Back' || k === 'GoBack' || k === 'BrowserBack') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      // Dígitos 0-9: aceita do controle remoto
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        e.stopPropagation();
        handleDigit(k);
        return;
      }
      // Setas: navega entre botões do numpad
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        moveFocus(k.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right');
        return;
      }
      // Enter / OK / Select / Space: clica botão focado
      if (
        k === 'Enter' ||
        k === ' ' ||
        k === 'OK' ||
        k === 'Select' ||
        k === 'OS_OK' ||
        k === 'Return' ||
        k === 'NumpadEnter'
      ) {
        const target = document.activeElement as HTMLElement | null;
        if (target?.tagName === 'BUTTON') {
          e.preventDefault();
          e.stopPropagation();
          target.click();
        }
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [handleDigit, onCancel]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 backdrop-blur-md"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`relative rounded-[44px] px-8 py-7 flex flex-col items-center gap-4 max-w-xs w-full mx-4 border-[1.5px] border-purple-400/30 backdrop-blur-[30px] saturate-150 shadow-[0_40px_120px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.15)] overflow-hidden ${shake ? 'animate-shake' : ''}`}
        style={{
          background:
            'linear-gradient(135deg, rgba(88,28,135,0.38) 0%, rgba(46,16,101,0.56) 38%, rgba(17,24,39,0.68) 100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inner glass border (mesma receita do Login) */}
        <div className="pointer-events-none absolute inset-[3px] rounded-[40px] border border-white/[0.08]" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at top center, rgba(255,255,255,0.08), transparent 26%), radial-gradient(circle at 50% 78%, rgba(96,165,250,0.16), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 28%)',
          }}
        />

        {/* Icon */}
        <div className="relative w-12 h-12 rounded-full bg-purple-500/25 flex items-center justify-center ring-1 ring-purple-400/30 drop-shadow-[0_4px_18px_rgba(168,85,247,0.4)]">
          <Lock size={20} className="text-purple-300" />
        </div>

        {/* Title */}
        <div className="relative text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/40">RED X EXPERIENCE</p>
          <p className="text-white text-lg font-black mt-2">Conteúdo Adulto</p>
          <p className="text-white/55 text-[11px] font-medium tracking-[0.08em] mt-0.5">Digite o PIN de acesso</p>
        </div>

        {/* PIN dots */}
        <div className="relative flex items-center gap-2">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-11 rounded-xl flex items-center justify-center text-xl font-bold transition-all duration-300 border ${
                i < pin.length
                  ? errorMessage
                    ? 'bg-red-500/10 border-red-500/40 text-red-400'
                    : 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/[0.04] border-white/10 text-white/10'
              }`}
            >
              {i < pin.length ? '●' : ''}
            </div>
          ))}
        </div>

        {/* Hidden input for keyboard capture */}
        <input
          ref={inputRef}
          type="tel"
          maxLength={PIN_LENGTH}
          className="sr-only"
          value={pin}
          onChange={(e) => {
            if (verifying) return;
            const val = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
            setErrorMessage(null);
            setPin(val);
            if (val.length === PIN_LENGTH) {
              void submitPin(val);
            }
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {/* Numpad */}
        <div className="relative grid grid-cols-3 gap-1.5 w-full max-w-[210px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((key, i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            if (key === null) return <div key={i} />;
            const isFirst = i === 0;
            return (
              <button
                key={i}
                ref={isFirst ? firstNumpadBtnRef : undefined}
                tabIndex={0}
                data-nav-item
                data-pin-numpad
                data-pin-row={row}
                data-pin-col={col}
                onClick={() => {
                  if (key === 'del') {
                    setPin((prev) => prev.slice(0, -1));
                    setErrorMessage(null);
                  } else {
                    handleDigit(String(key));
                  }
                }}
                className="h-9 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-white font-bold text-sm transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-400/60 focus:bg-white/10"
              >
                {key === 'del' ? <span className="text-white/60">⌫</span> : key}
              </button>
            );
          })}
        </div>

        {/* Status + Cancel */}
        <div className="relative flex flex-col items-center gap-2 w-full">
          {verifying && (
            <p className="text-[11px] font-semibold text-white/60 animate-pulse">Verificando…</p>
          )}
          {errorMessage && !verifying && (
            <p className="text-[11px] font-semibold text-red-400 animate-in fade-in slide-in-from-top-1">
              {errorMessage}
            </p>
          )}
          <button
            onClick={onCancel}
            tabIndex={0}
            data-nav-item
            data-pin-cancel
            className="w-full py-3 px-4 rounded-[22px] bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] text-white font-black text-[12px] uppercase tracking-[0.3em] shadow-[0_10px_40px_rgba(124,58,237,0.4)] focus:outline-none focus:ring-4 focus:ring-white/40 transition-all"
          >
            Cancelar
          </button>
        </div>
      </motion.div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </motion.div>,
    document.body
  );
};

export default memo(AdultPinModal);
