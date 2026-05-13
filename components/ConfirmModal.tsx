import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { playSelectSound, playNavigateSound, playBackSound } from '../utils/soundEffects';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}) => {
  const [focused, setFocused] = useState<'cancel' | 'confirm'>('cancel');
  const focusedRef = React.useRef<'cancel' | 'confirm'>('cancel');
  const cancelBtnRef = React.useRef<HTMLButtonElement>(null);
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);

  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  // Reset focus when modal opens
  useEffect(() => {
    if (open) {
      setFocused('cancel');
      setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 10);
    }
  }, [open]);

  // D-pad keyboard navigation
  useEffect(() => {
    if (!open) return;
    window.__modalTrapDepth = (window.__modalTrapDepth || 0) + 1;
    const handler = (e: KeyboardEvent) => {
      e.stopPropagation();
      const key = normalizeRemoteKey(e);
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault();
        playNavigateSound();
        setFocused((prev) => {
          const next = prev === 'cancel' ? 'confirm' : 'cancel';
          setTimeout(() => {
            if (next === 'cancel') cancelBtnRef.current?.focus();
            else confirmBtnRef.current?.focus();
          }, 10);
          return next;
        });
      } else if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        playSelectSound();
        if (focusedRef.current === 'confirm') onConfirm();
        else onCancel();
      } else if (key === 'Escape' || key === 'Backspace') {
        e.preventDefault();
        playBackSound();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.__modalTrapDepth = Math.max(0, (window.__modalTrapDepth || 1) - 1);
      window.removeEventListener('keydown', handler, { capture: true });
      setFocused('cancel');
    };
  }, [open, onConfirm, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[32px] p-8 max-w-sm w-full mx-5 flex flex-col items-center gap-5"
            style={{
              background:
                'linear-gradient(135deg, rgba(88, 28, 135, 0.5) 0%, rgba(30, 10, 60, 0.7) 100%)',
              border: '1.5px solid rgba(167, 139, 250, 0.3)',
              boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(248,113,113,0.15)',
                border: '1px solid rgba(248,113,113,0.3)',
              }}
            >
              <AlertTriangle size={26} className="text-red-400" />
            </div>

            <h3 className="text-xl font-bold text-white uppercase tracking-wider text-center">
              {title}
            </h3>
            <p className="text-white/50 text-center text-[13px] leading-relaxed">{message}</p>

            <div className="flex gap-4 w-full mt-2">
              <button
                ref={cancelBtnRef}
                className={`flex-1 py-4 rounded-2xl text-[13px] font-bold uppercase tracking-[0.15em] transition-all duration-200 outline-none ${
                  focused === 'cancel'
                    ? 'bg-white/15 text-white border-2 border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.1)] scale-105'
                    : 'bg-white/5 text-white/50 border border-white/10'
                }`}
                onClick={() => {
                  playSelectSound();
                  onCancel();
                }}
                onFocus={() => setFocused('cancel')}
                onMouseEnter={() => {
                  setFocused('cancel');
                  playNavigateSound();
                }}
                tabIndex={focused === 'cancel' ? 0 : -1}
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmBtnRef}
                className={`flex-1 py-4 rounded-2xl text-[13px] font-bold uppercase tracking-[0.15em] transition-all duration-200 outline-none ${
                  focused === 'confirm'
                    ? 'bg-red-600/80 text-white border-2 border-red-400/60 shadow-[0_0_20px_rgba(248,113,113,0.3)] scale-105'
                    : 'bg-red-600/30 text-red-300/60 border border-red-400/20'
                }`}
                onClick={() => {
                  playSelectSound();
                  onConfirm();
                }}
                onFocus={() => setFocused('confirm')}
                onMouseEnter={() => {
                  setFocused('confirm');
                  playNavigateSound();
                }}
                tabIndex={focused === 'confirm' ? 0 : -1}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
