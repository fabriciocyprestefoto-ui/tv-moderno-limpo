import React from 'react';

/** Mesmo fundo que `redx-bg.css` (html/body) — consistente com LegacyApp / LiveTV após o chunk. */
const BOOT_BG_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--redx-bg-darkest, #020617)',
  backgroundImage: 'var(--redx-app-gradient)',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
};

export const LoadingScreen = ({
  text = 'Carregando...',
  className = '',
}: {
  text?: string;
  className?: string;
}) => {
  const layerClass = className || 'z-[9999]';
  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${layerClass}`.trim()}
      style={BOOT_BG_STYLE}
    >
      {/* Glow de fundo atrás do logo */}
      <div
        className="absolute rounded-full"
        style={{
          width: '340px',
          height: '340px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="relative flex flex-col items-center gap-10">
        {/* Logo */}
        <img src="/logored.png" alt="Redflix" className="h-16 w-auto object-contain" />

        {/* Spinner — uiverse.io SelfMadeSystem */}
        <div className="loader-spinner">
          <svg viewBox="0 0 100 100" width="56" height="56">
            <circle
              className="dash"
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#c084fc"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle
              className="spin"
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#7c3aed"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Texto */}
        <p className="text-[11px] font-bold uppercase tracking-[0.5em] text-white/30">{text}</p>
      </div>

      <style>{`
        .loader-spinner {
          display: flex;
          margin: 0.25em 0;
        }
        .dash {
          animation: dashArray 2s ease-in-out infinite,
            dashOffset 2s linear infinite;
        }
        .spin {
          animation: spinDashArray 2s ease-in-out infinite,
            spin 8s ease-in-out infinite,
            dashOffset 2s linear infinite;
          transform-origin: center;
        }
        @keyframes dashArray {
          0%   { stroke-dasharray: 0 1 359 0; }
          50%  { stroke-dasharray: 0 359 1 0; }
          100% { stroke-dasharray: 359 1 0 0; }
        }
        @keyframes spinDashArray {
          0%   { stroke-dasharray: 270 90; }
          50%  { stroke-dasharray: 0 360; }
          100% { stroke-dasharray: 270 90; }
        }
        @keyframes dashOffset {
          0%   { stroke-dashoffset: 365; }
          100% { stroke-dashoffset: 5; }
        }
        @keyframes spin {
          0%             { rotate: 0deg; }
          12.5%, 25%     { rotate: 270deg; }
          37.5%, 50%     { rotate: 540deg; }
          62.5%, 75%     { rotate: 810deg; }
          87.5%, 100%    { rotate: 1080deg; }
        }
      `}</style>
    </div>
  );
};
