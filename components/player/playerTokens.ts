/**
 * playerTokens.ts — Design tokens do Player
 * Centraliza G, vGlass e PLAYER_CSS para evitar duplicação entre sub-componentes.
 */

export const G = {
  surface: 'rgba(24,10,45,0.58)' as const,
  surfaceDark: 'rgba(10,4,22,0.74)' as const,
  border: 'rgba(216,180,254,0.20)' as const,
  blur: 'blur(40px) saturate(180%)' as const,
  blurHeavy: 'blur(60px) saturate(200%)' as const,
  textPrimary: 'rgba(255,255,255,0.95)' as const,
  textSec: 'rgba(255,255,255,0.62)' as const,
  accent: '#c084fc' as const,
  btnIdle: 'rgba(255,255,255,0.10)' as const,
  btnFocus: 'rgba(168,85,247,0.32)' as const,
  progressTrack: 'rgba(255,255,255,0.18)' as const,
  progressFill: 'linear-gradient(90deg,#6d28d9,#a855f7,#ec4899)' as const,
  shadow: '0 16px 48px rgba(0,0,0,0.50), 0 0 36px rgba(124,58,237,0.18), 0 0 0 1px rgba(255,255,255,0.08)' as const,
};

export const vGlass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: G.surface,
  border: `1px solid ${G.border}`,
  backdropFilter: G.blur,
  WebkitBackdropFilter: G.blur,
  boxShadow: G.shadow,
  ...extra,
});

export const VISION_HUD_STYLE: React.CSSProperties = {
  ...vGlass(),
  borderRadius: '38px',
  width: 'min(900px, calc(100vw - 2rem))',
  padding: '18px 20px 16px',
};

export const VISION_MODAL_STYLE: React.CSSProperties = {
  ...vGlass({ background: 'rgba(0,0,0,0.72)' }),
  borderRadius: '34px',
  width: 'min(720px, calc(100vw - 3rem))',
  padding: '28px',
};

export const VISION_FLOAT_STYLE: React.CSSProperties = {
  ...vGlass({ background: 'rgba(0,0,0,0.64)' }),
  borderRadius: '30px',
};

export const PLAYER_CSS = `
.vision-btn {
  width:44px;height:44px;border-radius:50%;
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.16);
  backdrop-filter:blur(20px);
  display:flex;align-items:center;justify-content:center;
  transition:all 200ms;
  color:rgba(255,255,255,0.90);
  outline:none;cursor:pointer;flex-shrink:0;
}
.vision-btn.v-active,.vision-btn:focus-visible,.vision-btn:focus,[data-player-control][aria-current='true'] {
  background:linear-gradient(135deg,rgba(109,40,217,0.46),rgba(168,85,247,0.34));
  box-shadow:0 0 0 2px rgba(216,180,254,0.58),0 0 22px rgba(168,85,247,0.38);
  transform:scale(1.08);
}
.vision-play-btn {
  width:60px;height:60px;border-radius:50%;
  background:linear-gradient(135deg,rgba(109,40,217,0.48),rgba(168,85,247,0.30),rgba(236,72,153,0.20));
  border:1.5px solid rgba(216,180,254,0.38);
  backdrop-filter:blur(20px);
  display:flex;align-items:center;justify-content:center;
  transition:all 200ms;cursor:pointer;outline:none;
  color:rgba(255,255,255,0.95);flex-shrink:0;
}
.vision-play-btn.v-active,.vision-play-btn:focus-visible,.vision-play-btn:focus,[data-player-control='play'][aria-current='true'] {
  background:linear-gradient(135deg,rgba(109,40,217,0.68),rgba(168,85,247,0.52),rgba(236,72,153,0.34));
  box-shadow:0 0 0 2px rgba(216,180,254,0.72),0 8px 32px rgba(0,0,0,0.55),0 0 26px rgba(168,85,247,0.42);
  transform:scale(1.10);
}
.vision-progress-bar {
  position:relative;height:4px;border-radius:4px;
  background:rgba(255,255,255,0.18);
  cursor:pointer;overflow:visible;
}
.vision-progress-bar:hover,.vision-progress-bar:focus { height:6px;box-shadow:0 0 0 2px rgba(216,180,254,0.42); }
.vision-progress-fill {
  height:100%;border-radius:4px;
  background:linear-gradient(90deg,#6d28d9,#a855f7,#ec4899);
  pointer-events:none;
}
.vision-progress-thumb {
  position:absolute;top:50%;right:0;
  transform:translate(50%,-50%) scale(0);
  width:14px;height:14px;border-radius:50%;
  background:#d8b4fe;
  box-shadow:0 2px 8px rgba(0,0,0,0.70),0 0 14px rgba(168,85,247,0.60);
  transition:transform 150ms;pointer-events:none;
}
.vision-progress-bar:hover .vision-progress-thumb,.vision-progress-bar:focus .vision-progress-thumb { transform:translate(50%,-50%) scale(1); }
.vision-speed-panel {
  position:absolute;bottom:calc(100% + 10px);left:50%;
  transform:translateX(-50%);
  display:flex;flex-direction:column;gap:4px;
  padding:10px 8px;border-radius:18px;min-width:80px;z-index:10;
}
.vision-speed-opt {
  width:100%;padding:6px 12px;border-radius:12px;border:none;
  background:transparent;color:rgba(210,190,255,0.80);
  font-size:12px;font-weight:700;cursor:pointer;text-align:center;
  transition:all 150ms;outline:none;
}
.vision-speed-opt:hover,.vision-speed-opt.sel { background:rgba(168,85,247,0.28);color:#fff; }
.vision-hud-meta { font-size:11px;color:rgba(210,190,255,0.62);font-weight:600;letter-spacing:.04em; }
.vision-scroll::-webkit-scrollbar { width:4px; }
.vision-scroll::-webkit-scrollbar-track { background:transparent; }
.vision-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.22);border-radius:4px; }
.cast-grid-scroll { scrollbar-width:none; -ms-overflow-style:none; }
.cast-grid-scroll::-webkit-scrollbar { display:none; width:0; height:0; }
`;

import type React from 'react';
