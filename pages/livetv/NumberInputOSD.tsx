import React, { memo } from 'react';

interface NumberInputOSDProps {
  digits: string;
}

/** OSD que mostra os dígitos digitados no controle remoto para troca direta de canal */
const NumberInputOSD: React.FC<NumberInputOSDProps> = ({ digits }) => {
  if (!digits) return null;

  return (
    <div className="absolute top-8 right-8 z-[100] animate-in fade-in slide-in-from-right-4 duration-200 pointer-events-none">
      <div
        className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-white/15 shadow-[0_8px_40px_rgba(0,0,0,0.7)]"
        style={{
          background: 'rgba(0, 0, 0, 0.92)',
        }}
      >
        <span className="text-[8px] font-black text-[#E50914] uppercase tracking-[0.3em] mr-2">
          CH
        </span>
        {digits.split('').map((d, i) => (
          <span
            key={i}
            className="text-3xl font-black text-white tabular-nums tracking-wider"
            style={{
              textShadow: '0 0 20px rgba(229,9,20,0.5)',
              minWidth: '28px',
              textAlign: 'center',
              display: 'inline-block',
            }}
          >
            {d}
          </span>
        ))}
        {/* Placeholder para dígitos restantes */}
        {digits.length < 3 &&
          Array.from({ length: 3 - digits.length }).map((_, i) => (
            <span
              key={`placeholder-${i}`}
              className="text-3xl font-black text-white/15 tabular-nums tracking-wider"
              style={{ minWidth: '28px', textAlign: 'center', display: 'inline-block' }}
            >
              _
            </span>
          ))}
      </div>
    </div>
  );
};

export default memo(NumberInputOSD);
