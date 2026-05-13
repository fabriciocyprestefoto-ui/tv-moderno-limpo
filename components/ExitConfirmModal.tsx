import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

interface ExitConfirmModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ExitConfirmModal: React.FC<ExitConfirmModalProps> = ({
  visible,
  onConfirm,
  onCancel,
}) => {
  const yesRef = useRef<HTMLButtonElement>(null);

  // Foca no botão "Não" (cancelar) por padrão — evitar saída acidental
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => {
      yesRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [visible]);

  // D-pad: setas navegam entre botões, Enter confirma/cancela
  useEffect(() => {
    if (!visible) return undefined;
    window.__modalTrapDepth = (window.__modalTrapDepth || 0) + 1;

    const handler = (e: KeyboardEvent) => {
      e.stopPropagation();
      const key = normalizeRemoteKey(e);
      if (key === 'Enter') {
        // Enter no botão focado — já vai direto pelo onClick nativo
        return;
      }
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        // Alterna foco entre Não e Sim
        if (document.activeElement === yesRef.current) {
          onCancel();
          // re-focar após render
          setTimeout(() => {
            const btn = document.querySelector('[data-exit-cancel]') as HTMLButtonElement | null;
            btn?.focus();
          }, 50);
        } else {
          yesRef.current?.focus();
        }
        e.preventDefault();
      }
      if (key === 'Escape' || key === 'Backspace') {
        onCancel();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.__modalTrapDepth = Math.max(0, (window.__modalTrapDepth || 1) - 1);
      window.removeEventListener('keydown', handler, { capture: true });
    };
  }, [visible, onConfirm, onCancel]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-zinc-900 border border-white/20 rounded-3xl px-10 py-8 flex flex-col items-center gap-6 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ícone de warning */}
            <div className="w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p className="text-white text-xl font-bold text-center">Sair do RedFlix?</p>

            <div className="flex gap-4 w-full">
              {/* Não — fica em cima (focado por padrão) */}
              <button
                ref={yesRef}
                data-exit-cancel
                onClick={onCancel}
                className="flex-1 py-3 px-4 rounded-xl border border-white/30 bg-white/10 text-white font-bold text-sm uppercase tracking-wider hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
              >
                Não
              </button>

              {/* Sim — vermelho para evitar confusão */}
              <button
                onClick={onConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
              >
                Sim
              </button>
            </div>

            <p className="text-white/40 text-xs text-center">← → navegar • Enter confirmar</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
