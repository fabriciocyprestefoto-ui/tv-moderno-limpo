import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GlobalLoaderProps {
  isVisible: boolean;
  message?: string;
  onFinished?: () => void;
}

export const GlobalLoader: React.FC<GlobalLoaderProps> = ({
  isVisible,
  message = 'Carregando...',
  onFinished,
}) => {
  const [internalVisible, setInternalVisible] = useState(isVisible);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (isVisible) {
      setInternalVisible(true);
    } else {
      setInternalVisible(false);
      onFinishedRef.current?.();
    }
  }, [isVisible]);

  return (
    <AnimatePresence>
      {internalVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl"
        >
          <div className="relative group">
            <div className="absolute inset-0 rounded-full bg-purple-600/20 blur-2xl animate-pulse" />
            <div className="relative flex flex-col items-center gap-6">
              <div className="relative h-16 w-16">
                <svg className="h-full w-full animate-spin text-purple-500" viewBox="0 0 100 100">
                  <circle
                    className="opacity-20"
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    className="opacity-90"
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray="264"
                    strokeDashoffset="180"
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-4 w-4 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]" />
                </div>
              </div>

              <div className="flex flex-col items-center">
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-white text-sm font-bold uppercase tracking-[0.3em] drop-shadow-lg"
                >
                  {message}
                </motion.p>
                <div className="mt-2 h-[1px] w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
