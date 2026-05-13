import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { G, VISION_MODAL_STYLE } from './playerTokens';
import type { QualityLevel } from '../../types/player';

type SettingsPanel = 'none' | 'quality';

interface PlayerSettingsModalProps {
  showSettings: SettingsPanel;
  qualities: QualityLevel[];
  currentQuality: number;
  focusedSettingsIdx: number;
  onSelectQuality: (idx: number) => void;
  onClose: () => void;
}

const PlayerSettingsModal: React.FC<PlayerSettingsModalProps> = ({
  showSettings,
  qualities,
  currentQuality,
  focusedSettingsIdx,
  onSelectQuality,
  onClose,
}) => {
  const settingsOptions: Array<{ name?: string; height?: number }> = [
    { height: -1, name: 'AUTO (Adaptável)' },
    ...qualities,
  ];

  const handleSelect = (idx: number) => {
    onSelectQuality(idx);
    onClose();
  };

  const isSelected = (idx: number): boolean => currentQuality === (idx === 0 ? -1 : idx - 1);

  const label = (item: { name?: string; height?: number }, idx: number): string => {
    if (idx === 0) return item.name || 'AUTO';
    return item.height && item.height > 0 ? `${item.height}p` : item.name || 'AUTO';
  };

  return (
    <AnimatePresence>
      {showSettings !== 'none' && (
        <div
          className="absolute inset-0 z-[150] flex items-center justify-center"
          style={{ background: 'rgba(55,10,100,0.50)', backdropFilter: 'blur(18px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            style={VISION_MODAL_STYLE}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: G.textSec,
                textTransform: 'uppercase',
                letterSpacing: '0.35em',
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              Qualidade
            </h2>
            <div className="flex flex-col gap-2">
              {settingsOptions.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: 16,
                    background: focusedSettingsIdx === idx ? G.btnFocus : 'rgba(124,58,237,0.06)',
                    border: `1px solid ${focusedSettingsIdx === idx ? 'rgba(124,58,237,0.45)' : 'rgba(124,58,237,0.10)'}`,
                    color: G.textPrimary,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    outline: 'none',
                    boxShadow:
                      focusedSettingsIdx === idx ? '0 0 0 2px rgba(124,58,237,0.45)' : undefined,
                  }}
                >
                  <span>{label(item, idx)}</span>
                  {isSelected(idx) && (
                    <Check size={18} style={{ color: 'rgba(255,255,255,0.80)' }} />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PlayerSettingsModal;
