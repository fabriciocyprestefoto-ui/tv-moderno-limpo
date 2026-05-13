import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tv } from 'lucide-react';
import { normalizeRemoteKey } from '../hooks/useRemoteControl';

interface NewEpisodeToastProps {
  seriesName: string;
  seasonEpisode: string; // e.g. "S02E05"
  onDismiss?: () => void;
  autoDismissMs?: number;
}

/**
 * NewEpisodeToast — Netflix-style toast notification for new episodes.
 * Positioned top-right, auto-dismisses after 5 seconds.
 * Animated in/out with Framer Motion.
 */
const NewEpisodeToast: React.FC<NewEpisodeToastProps> = ({
  seriesName,
  seasonEpisode,
  onDismiss,
  autoDismissMs = 5000,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss?.(), 400);
    }, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const key = normalizeRemoteKey(e);
    if (key === 'Enter' || key === 'Escape' || key === 'Backspace') {
      e.preventDefault();
      setVisible(false);
      setTimeout(() => onDismiss?.(), 400);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-6 right-6 z-[9999] max-w-sm"
        >
          <button
            type="button"
            tabIndex={0}
            data-nav-item
            onKeyDown={handleKeyDown}
            onClick={() => {
              setVisible(false);
              setTimeout(() => onDismiss?.(), 400);
            }}
            className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-white/15 bg-[#0d0d14]/95 backdrop-blur-sm shadow-2xl shadow-black/60 outline-none transition-all hover:bg-white/10 focus:ring-2 focus:ring-purple-500/50 focus-visible:ring-2 focus-visible:ring-purple-500/50"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-600/20 text-red-500">
              <Tv size={20} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-0.5">
                Novo episodio disponivel
              </p>
              <p className="text-sm font-bold text-white leading-tight">{seriesName}</p>
              <p className="text-xs text-white/60 font-semibold">{seasonEpisode}</p>
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NewEpisodeToast;
