import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play } from 'lucide-react';
import { vGlass } from './playerTokens';
import type { ResumeAction } from '../../utils/playerTvControls';

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface PlayerResumeOverlayProps {
  visible: boolean;
  savedProgress: number;
  resumeCountdown: number;
  focusedAction: ResumeAction;
  onContinue: () => void;
  onRestart: () => void;
  onFocusAction: (action: ResumeAction) => void;
}

const PlayerResumeOverlay: React.FC<PlayerResumeOverlayProps> = ({
  visible,
  savedProgress,
  resumeCountdown,
  focusedAction,
  onContinue,
  onRestart,
  onFocusAction,
}) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[13000] flex items-center justify-center"
        style={{ background: 'transparent' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-resume-title"
        aria-describedby="player-resume-description"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            ...vGlass({ background: 'rgba(18,18,22,0.94)' }),
            borderRadius: '32px',
            padding: '36px 40px',
            textAlign: 'center',
            maxWidth: 440,
            width: 'calc(100vw - 3rem)',
          }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{
              background: 'rgba(124,58,237,0.16)',
              border: '1px solid rgba(124,58,237,0.32)',
            }}
          >
            <Play size={24} style={{ color: '#a78bfa', marginLeft: 2 }} fill="#a78bfa" />
          </div>
          <h2
            id="player-resume-title"
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: 'rgba(255,255,255,0.95)',
              marginBottom: 8,
              letterSpacing: '-0.02em',
            }}
          >
            Continuar de onde parou?
          </h2>
          <p id="player-resume-description" style={{ fontSize: 14, color: 'rgba(210,190,255,0.55)', marginBottom: 28 }}>
            Você parou em <strong style={{ color: '#a78bfa' }}>{formatTime(savedProgress)}</strong>
          </p>
          <div className="flex gap-3 justify-center">
            <button
              id="resume-action-continue"
              autoFocus={focusedAction === 'continue'}
              onClick={onContinue}
              aria-label={`Continuar reprodução de ${formatTime(savedProgress)}. Seleção automática em ${resumeCountdown} segundos`}
              style={{
                padding: '12px 24px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg,#7c3aed,#581c87)',
                border: '1px solid rgba(167,117,255,0.30)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'all 150ms',
                outline: 'none',
                boxShadow: '0 0 20px rgba(124,58,237,0.35)',
              }}
              onFocus={(e) => {
                onFocusAction('continue');
                (e.currentTarget as HTMLElement).style.boxShadow =
                  '0 0 0 3px rgba(167,117,255,0.60),0 0 20px rgba(124,58,237,0.35)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(124,58,237,0.35)';
              }}
            >
              Continuar ({resumeCountdown}s)
            </button>
            <button
              id="resume-action-restart"
              onClick={onRestart}
              aria-label="Começar a reprodução do início"
              style={{
                padding: '12px 24px',
                borderRadius: '16px',
                ...vGlass(),
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'all 150ms',
                outline: 'none',
                color: 'rgba(210,190,255,0.85)',
              }}
              onFocus={(e) => {
                onFocusAction('restart');
                (e.currentTarget as HTMLElement).style.boxShadow =
                  '0 0 0 2px rgba(124,58,237,0.55)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              Começar do início
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default PlayerResumeOverlay;
