import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity } from 'lucide-react';
import { vGlass } from './playerTokens';

interface PlayerErrorScreenProps {
  streamError: boolean;
  streamRetrying: boolean;
  onRetry: () => void;
  onClose: () => void;
  /** URL do stream — mantido na interface para compatibilidade; não é mais exibido. */
  streamUrl?: string;
}

const PlayerErrorScreen: React.FC<PlayerErrorScreenProps> = ({
  streamError,
  streamRetrying,
  onRetry,
  onClose,
}) => (
  <AnimatePresence>
    {streamError && !streamRetrying && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[12000] flex flex-col items-center justify-center gap-8"
        style={{ background: 'transparent' }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="player-error-title"
        aria-describedby="player-error-description"
      >
        <div
          className="w-full max-w-lg rounded-3xl p-8"
          style={{ ...vGlass({ background: 'rgba(10,10,14,0.96)' }) }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(8,145,178,0.16)', border: '1px solid rgba(103,232,249,0.30)' }}
          >
            <Activity size={36} style={{ color: '#67e8f9' }} />
          </div>
          <div className="text-center">
            <h2 id="player-error-title" className="text-2xl font-black text-white mb-2 tracking-tight">
              Falha na reprodução
            </h2>
            <p id="player-error-description" style={{ color: 'rgba(255,255,255,0.58)', fontSize: 14 }}>
              O stream não pôde ser carregado.
            </p>
          </div>
          <div className="flex gap-3 justify-center mt-7">
            <button
              autoFocus
              onClick={onRetry}
              aria-label="Tentar carregar a reprodução novamente"
              className="focus:outline-none transition-all"
              style={{
                padding: '14px 32px',
                borderRadius: '18px',
                background: 'linear-gradient(135deg,#0891b2,#0f172a)',
                border: '1px solid rgba(103,232,249,0.30)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                boxShadow: '0 0 24px rgba(8,145,178,0.32)',
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow =
                  '0 0 0 3px rgba(103,232,249,0.55),0 0 24px rgba(8,145,178,0.32)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 24px rgba(8,145,178,0.32)';
              }}
            >
              ↺ Tentar novamente
            </button>
            <button
              tabIndex={0}
              onClick={onClose}
              aria-label="Voltar e fechar o player"
              className="focus:outline-none transition-all"
              style={{
                padding: '14px 32px',
                borderRadius: '18px',
                ...vGlass(),
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.90)',
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(103,232,249,0.50)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              Voltar
            </button>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: 600, marginTop: 16, textAlign: 'center' }}>
            Pressione{' '}
            <kbd
              style={{
                padding: '1px 8px',
                borderRadius: 6,
                background: 'rgba(8,145,178,0.14)',
                fontFamily: 'monospace',
                border: '1px solid rgba(103,232,249,0.24)',
              }}
            >
              OK
            </kbd>{' '}
            para tentar novamente
          </p>
        </div>
      </motion.div>
    )}
    {streamRetrying && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[12000] flex items-center justify-center"
        style={{ background: 'transparent' }}
        role="status"
        aria-live="polite"
        aria-label="Reconectando reprodução"
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-14 h-14 rounded-full animate-spin"
            style={{ border: '3px solid rgba(255,255,255,0.16)', borderTopColor: '#67e8f9' }}
          />
          <p
            style={{
              color: 'rgba(255,255,255,0.62)',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            Reconectando...
          </p>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default PlayerErrorScreen;
