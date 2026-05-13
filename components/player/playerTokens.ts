/**
 * playerTokens.ts — Design tokens do Player
 * Centraliza G, vGlass e PLAYER_CSS para evitar duplicação entre sub-componentes.
 */

export const G = {
  surface: 'rgba(8,12,18,0.58)' as const,
  surfaceDark: 'rgba(0,0,0,0.72)' as const,
  border: 'rgba(255,255,255,0.16)' as const,
  blur: 'blur(40px) saturate(180%)' as const,
  blurHeavy: 'blur(60px) saturate(200%)' as const,
  textPrimary: 'rgba(255,255,255,0.95)' as const,
  textSec: 'rgba(255,255,255,0.62)' as const,
  accent: '#67e8f9' as const,
  btnIdle: 'rgba(255,255,255,0.10)' as const,
  btnFocus: 'rgba(6,182,212,0.28)' as const,
  progressTrack: 'rgba(255,255,255,0.18)' as const,
  progressFill: '#06b6d4' as const,
  shadow: '0 16px 48px rgba(0,0,0,0.48), 0 0 0 1px rgba(255,255,255,0.08)' as const,
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
.vision-btn.v-active,.vision-btn:focus-visible {
  background:rgba(6,182,212,0.24);
  box-shadow:0 0 0 2px rgba(103,232,249,0.65),0 0 18px rgba(6,182,212,0.32);
  transform:scale(1.08);
}
.vision-play-btn {
  width:60px;height:60px;border-radius:50%;
  background:rgba(6,182,212,0.18);
  border:1.5px solid rgba(103,232,249,0.35);
  backdrop-filter:blur(20px);
  display:flex;align-items:center;justify-content:center;
  transition:all 200ms;cursor:pointer;outline:none;
  color:rgba(255,255,255,0.95);flex-shrink:0;
}
.vision-play-btn.v-active,.vision-play-btn:focus-visible {
  background:rgba(6,182,212,0.34);
  box-shadow:0 0 0 2px rgba(103,232,249,0.72),0 8px 32px rgba(0,0,0,0.55);
  transform:scale(1.10);
}
.vision-progress-bar {
  position:relative;height:4px;border-radius:4px;
  background:rgba(255,255,255,0.18);
  cursor:pointer;overflow:visible;
}
.vision-progress-bar:hover { height:6px; }
.vision-progress-fill {
  height:100%;border-radius:4px;
  background:linear-gradient(90deg,#0891b2,#67e8f9);
  pointer-events:none;
}
.vision-progress-thumb {
  position:absolute;top:50%;right:0;
  transform:translate(50%,-50%) scale(0);
  width:14px;height:14px;border-radius:50%;
  background:#67e8f9;
  box-shadow:0 2px 8px rgba(0,0,0,0.70),0 0 12px rgba(6,182,212,0.55);
  transition:transform 150ms;pointer-events:none;
}
.vision-progress-bar:hover .vision-progress-thumb { transform:translate(50%,-50%) scale(1); }
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
.vision-speed-opt:hover,.vision-speed-opt.sel { background:rgba(6,182,212,0.24);color:#fff; }
.vision-hud-meta { font-size:11px;color:rgba(210,190,255,0.62);font-weight:600;letter-spacing:.04em; }
.vision-scroll::-webkit-scrollbar { width:4px; }
.vision-scroll::-webkit-scrollbar-track { background:transparent; }
.vision-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.22);border-radius:4px; }
.cast-grid-scroll { scrollbar-width:none; -ms-overflow-style:none; }
.cast-grid-scroll::-webkit-scrollbar { display:none; width:0; height:0; }
`;

import type React from 'react';
