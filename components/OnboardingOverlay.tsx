import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Search, Plus, MonitorPlay } from 'lucide-react';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

const ONBOARDING_STORAGE_KEY = 'redx-onboarding-completed';

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: (
      <div className="flex items-center gap-1">
        <ArrowUp size={20} />
        <ArrowDown size={20} />
        <ArrowLeft size={20} />
        <ArrowRight size={20} />
      </div>
    ),
    title: 'Navegue com o controle remoto',
    description:
      'Use as setas do controle remoto para navegar entre os conteudos. Pressione OK para selecionar.',
  },
  {
    icon: <Search size={28} />,
    title: 'Busque conteudo',
    description:
      'Acesse a pagina de busca no menu lateral para encontrar filmes e series pelo titulo.',
  },
  {
    icon: <Plus size={28} />,
    title: 'Salve na Minha Lista',
    description:
      'Adicione filmes e series a sua lista pessoal para assistir depois. Acesse pelo menu lateral.',
  },
  {
    icon: <MonitorPlay size={28} />,
    title: 'Aproveite o conteudo',
    description:
      'Pressione Assistir para comecar a reproducao. Use as setas durante o video para avancar ou voltar.',
  },
];

/**
 * OnboardingOverlay — Simple tutorial overlay for first-time users.
 * Shows 4 steps explaining remote navigation, search, My List, and playback.
 * Uses localStorage to track completion. Dismissed with Enter or after all steps.
 */
const OnboardingOverlay: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!completed) {
        setShow(true);
      }
    } catch {
      // localStorage unavailable — skip onboarding
    }
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {}
    onComplete?.();
  }, [onComplete]);

  const nextStep = useCallback(() => {
    if (currentStep >= STEPS.length - 1) {
      dismiss();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, dismiss]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const key = normalizeRemoteKey(e);
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        nextStep();
      } else if (key === 'Escape' || key === 'Backspace') {
        e.preventDefault();
        dismiss();
      } else if (key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentStep((prev) => Math.max(0, prev - 1));
      }
    },
    [nextStep, dismiss]
  );

  // Auto-focus on mount
  const containerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (show) {
      setTimeout(() => containerRef.current?.focus(), 100);
    }
  }, [show]);

  if (!show) return null;

  const step = STEPS[currentStep];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[10000] flex items-center justify-center onboarding-overlay outline-none"
      style={{ background: 'rgba(0, 0, 0, 0.85)' }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-lg mx-4"
        >
          <div className="rounded-3xl border border-white/15 bg-[#0d0d14]/95 p-8 shadow-2xl">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentStep
                      ? 'w-8 bg-purple-500'
                      : idx < currentStep
                        ? 'w-3 bg-purple-500/40'
                        : 'w-3 bg-white/15'
                  }`}
                />
              ))}
            </div>

            {/* Icon */}
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-5 rounded-2xl bg-purple-500/15 text-purple-400">
              {step.icon}
            </div>

            {/* Content */}
            <h2 className="text-xl font-black uppercase tracking-tight text-center text-white mb-3">
              {step.title}
            </h2>
            <p className="text-sm text-white/60 text-center leading-relaxed mb-6">
              {step.description}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                tabIndex={0}
                data-nav-item
                onClick={nextStep}
                className="px-8 py-3 rounded-2xl bg-purple-600 text-white font-bold text-sm uppercase tracking-wider hover:bg-purple-500 transition-colors outline-none focus:ring-2 focus:ring-purple-400/50 focus-visible:ring-2 focus-visible:ring-purple-400/50"
              >
                {currentStep >= STEPS.length - 1 ? 'Comecar' : 'Proximo'}
              </button>
              {currentStep < STEPS.length - 1 && (
                <button
                  type="button"
                  tabIndex={0}
                  data-nav-item
                  onClick={dismiss}
                  className="px-6 py-3 rounded-2xl border border-white/15 text-white/60 font-bold text-sm uppercase tracking-wider hover:bg-white/5 transition-colors outline-none focus:ring-2 focus:ring-white/20 focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  Pular
                </button>
              )}
            </div>

            {/* Keyboard hint */}
            <p className="text-[9px] text-white/25 text-center mt-4 font-bold uppercase tracking-[0.2em]">
              OK para avancar · VOLTAR para pular
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default OnboardingOverlay;
