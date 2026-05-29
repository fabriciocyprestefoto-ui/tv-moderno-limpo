import React, { memo, useMemo } from 'react';
import '../futebolVisionOS.css';

export type FutebolMatchCardMode = 'upcoming' | 'result';

export interface FutebolMatchCardProps {
  mode: FutebolMatchCardMode;
  weekday: string;
  timeOrSecondary: string;
  eyebrow?: string | null;
  competition?: string | null;
  venue?: string | null;
  homeName: string | null;
  awayName: string | null;
  homeBadge: string;
  awayBadge: string;
  homeColor?: string | null;
  awayColor?: string | null;
  eventThumb?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  onSelectHome: () => void;
  onSelectAway: () => void;
  homeScore?: string | number | null;
  awayScore?: string | number | null;
  channelLogo?: string | null;
  channelName?: string | null;
  onSelectChannel?: () => void;
  navRow?: string;
  navColBase?: number;
}

/* ─── utilidades de cor ───────────────────────────────────────── */
type RGB = [number, number, number];

function parseHex(hex: string | null | undefined, fallback: RGB = [30, 30, 40]): RGB {
  const raw = String(hex ?? '')
    .trim()
    .replace(/^#/, '');
  const exp =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(exp)) return fallback;
  const n = parseInt(exp, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbStr([r, g, b]: RGB, a = 1): string {
  return `rgba(${r},${g},${b},${a})`;
}

/** Versão ligeiramente mais escura para profundidade no canto */
function darken([r, g, b]: RGB, f: number): RGB {
  return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
}

/** Versão mais clara/saturada para brilho central */
function brighten([r, g, b]: RGB, f: number): RGB {
  return [
    Math.min(255, Math.round(r * f + 20)),
    Math.min(255, Math.round(g * f + 20)),
    Math.min(255, Math.round(b * f + 20)),
  ];
}

function luminance([r, g, b]: RGB): number {
  const c = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** Texto claro em fundo escuro, escuro em fundo claro */
function textColor(bg: RGB): string {
  return luminance(bg) > 0.25 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)';
}

function getWinner(
  homeScore: string | number | null | undefined,
  awayScore: string | number | null | undefined
): 'home' | 'away' | 'draw' | null {
  if (homeScore == null || awayScore == null) return null;
  const h = Number(homeScore);
  const a = Number(awayScore);
  if (isNaN(h) || isNaN(a)) return null;
  if (h > a) return 'home';
  if (a > h) return 'away';
  return 'draw';
}

/* ─── componente ──────────────────────────────────────────────── */
const FutebolMatchCardComponent: React.FC<FutebolMatchCardProps> = ({
  mode,
  weekday,
  timeOrSecondary,
  eyebrow,
  competition,
  venue,
  homeName,
  awayName,
  homeBadge,
  awayBadge,
  homeColor,
  awayColor,
  eventThumb: _eventThumb,
  onSelectHome,
  onSelectAway,
  homeScore,
  awayScore,
  channelLogo,
  channelName,
  onSelectChannel,
  navRow = '3',
  navColBase = 0,
}) => {
  const homeRgb = useMemo(() => parseHex(homeColor, [140, 18, 18]), [homeColor]);
  const awayRgb = useMemo(() => parseHex(awayColor, [18, 80, 40]), [awayColor]);

  const c = useMemo(
    () => ({
      /* Cores sólidas vibrantes — sem escurecer com overlay */
      homeSolid: `#${homeRgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
      awaySolid: `#${awayRgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
      /* Gradiente interno sutil para profundidade (da borda p/ centro) */
      homeGrad: `radial-gradient(ellipse at 30% 50%, ${rgbStr(brighten(homeRgb, 1.18))} 0%, ${rgbStr(homeRgb)} 55%, ${rgbStr(darken(homeRgb, 0.55))} 100%)`,
      awayGrad: `radial-gradient(ellipse at 70% 50%, ${rgbStr(brighten(awayRgb, 1.18))} 0%, ${rgbStr(awayRgb)} 55%, ${rgbStr(darken(awayRgb, 0.55))} 100%)`,
      /* Glow do escudo */
      homeGlow: rgbStr(brighten(homeRgb, 1.3), 0.55),
      awayGlow: rgbStr(brighten(awayRgb, 1.3), 0.55),
      /* Neon para VS/placar */
      homeNeon: rgbStr(brighten(homeRgb, 1.5), 0.9),
      awayNeon: rgbStr(brighten(awayRgb, 1.5), 0.9),
      /* Cor do texto sobre o fundo do time */
      homeText: textColor(homeRgb),
      awayText: textColor(awayRgb),
      /* Borda decorativa do card */
      homeBorder: rgbStr(brighten(homeRgb, 1.2), 0.6),
      awayBorder: rgbStr(brighten(awayRgb, 1.2), 0.6),
    }),
    [homeRgb, awayRgb]
  );

  const winner = useMemo(
    () => (mode === 'result' ? getWinner(homeScore, awayScore) : null),
    [mode, homeScore, awayScore]
  );

  /* ── clip-path do corte diagonal (50% com inclinação ~8°) ── */
  const homeClip = 'polygon(0 0, 56% 0, 44% 100%, 0 100%)';
  const awayClip = 'polygon(56% 0, 100% 0, 100% 100%, 44% 100%)';
  const matchupLabel = `${homeName ?? 'Mandante'} contra ${awayName ?? 'Visitante'}`;
  const statusLabel =
    mode === 'result'
      ? `resultado ${homeScore ?? '-'} a ${awayScore ?? '-'}`
      : `jogo em ${weekday} às ${timeOrSecondary}`;

  return (
    <article
      className="fut-match-card"
      style={{ border: `1px solid ${c.homeBorder}` }}
      aria-label={`${matchupLabel}, ${competition ?? 'campeonato'}, ${statusLabel}`}
    >
      {/* ══ FUNDO DIAGONAL SÓLIDO ════════════════════════════════════ */}

      {/* Metade esquerda — cor do time da casa */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: c.homeGrad, clipPath: homeClip }}
      />

      {/* Metade direita — cor do visitante */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: c.awayGrad, clipPath: awayClip }}
      />

      {/* Linha diagonal de divisão — glow neon sutil */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(to bottom right,
            transparent 0%,
            transparent calc(50% - 2px),
            rgba(255,255,255,0.25) calc(50% - 1px),
            rgba(255,255,255,0.45) 50%,
            rgba(255,255,255,0.25) calc(50% + 1px),
            transparent calc(50% + 2px),
            transparent 100%
          )`,
        }}
      />

      {/* Overlay mínimo só no topo para legibilidade; rodapé tem seu próprio fundo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, transparent 30%, transparent 100%)',
        }}
      />

      {/* ══ CONTEÚDO ═════════════════════════════════════════════════ */}
      <div className="relative flex flex-col h-full">
        {/* ── Header: eyebrow + competição ── */}
        <div className="flex items-start justify-between px-3 pt-2.5 pb-0 min-h-[28px]">
          {eyebrow && (
            <span className="inline-flex rounded-sm bg-black/50 backdrop-blur-sm px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/90">
              {eyebrow}
            </span>
          )}
          {competition && (
            <span className="ml-auto inline-flex rounded bg-white/90 text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest shadow-md">
              {competition}
            </span>
          )}
        </div>

        {/* ── Times: grid 3 colunas ── */}
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center px-2 py-4 gap-1 flex-1">
          {/* Time da casa */}
          <button
            type="button"
            onClick={onSelectHome}
            className="flex flex-col items-center gap-2.5 outline-none group"
            data-nav-item
            data-nav-row={navRow}
            data-nav-col={navColBase}
            aria-label={`Abrir página de ${homeName ?? 'Mandante'}`}
          >
            {/* Nome do time */}
            <span
              className="text-[11px] font-black uppercase tracking-wide text-center line-clamp-1 w-full px-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
              style={{ color: c.homeText }}
            >
              {homeName ?? 'Mandante'}
            </span>

            {/* Escudo com glow */}
            <div className="relative flex items-center justify-center">
              {/* Halo de luz */}
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: winner === 'home' ? 108 : 96,
                  height: winner === 'home' ? 108 : 96,
                  background: `radial-gradient(circle, ${c.homeGlow} 0%, transparent 70%)`,
                  filter: 'blur(10px)',
                  opacity: winner === 'home' ? 0.9 : 0.6,
                  transition: 'all 0.4s ease',
                }}
              />
              {winner === 'home' && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[13px] leading-none select-none z-20"
                  style={{ filter: 'drop-shadow(0 0 5px gold)' }}
                >
                  👑
                </div>
              )}
              <img
                src={homeBadge}
                alt={homeName ?? 'Mandante'}
                className={`relative z-10 object-contain transition-all duration-400 group-hover:scale-110 drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] ${
                  mode === 'result' && winner !== 'home' && winner !== 'draw'
                    ? 'opacity-60 scale-90'
                    : winner === 'home'
                      ? 'scale-105'
                      : ''
                }`}
                style={{
                  width: 88,
                  height: 88,
                  filter: `drop-shadow(0 0 14px ${c.homeGlow}) drop-shadow(0 3px 12px rgba(0,0,0,0.95))`,
                }}
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logored.webp';
                }}
              />
            </div>
          </button>

          {/* Centro: VS ou Placar */}
          <div className="flex flex-col items-center z-10 gap-1">
            {mode === 'result' ? (
              /* Placar */
              <div
                className="fut-diag-score flex flex-col items-center rounded-xl px-3 py-2"
                style={{
                  background: 'rgba(0,0,0,0.72)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: `0 0 20px ${c.homeNeon}, 0 0 20px ${c.awayNeon}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  minWidth: 80,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-black tabular-nums leading-none"
                    style={{
                      fontSize: '1.875rem',
                      color: winner === 'home' ? '#fff' : 'rgba(255,255,255,0.4)',
                      textShadow:
                        winner === 'home'
                          ? `0 0 18px ${c.homeNeon}, 0 0 36px ${c.homeNeon}`
                          : 'none',
                    }}
                  >
                    {homeScore ?? '-'}
                  </span>
                  <span className="text-white/35 font-black text-xl leading-none">:</span>
                  <span
                    className="font-black tabular-nums leading-none"
                    style={{
                      fontSize: '1.875rem',
                      color: winner === 'away' ? '#fff' : 'rgba(255,255,255,0.4)',
                      textShadow:
                        winner === 'away'
                          ? `0 0 18px ${c.awayNeon}, 0 0 36px ${c.awayNeon}`
                          : 'none',
                    }}
                  >
                    {awayScore ?? '-'}
                  </span>
                </div>
                <span
                  className="text-[7px] font-black uppercase tracking-widest mt-0.5"
                  style={{
                    color: winner === 'draw' ? 'rgba(156,163,175,0.9)' : 'rgba(52,211,153,0.9)',
                    textShadow:
                      winner === 'draw'
                        ? '0 0 6px rgba(156,163,175,0.7)'
                        : '0 0 8px rgba(52,211,153,0.8)',
                  }}
                >
                  {winner === 'draw' ? 'EMPATE' : 'ENCERRADO'}
                </span>
              </div>
            ) : (
              /* VS */
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: 52,
                  height: 52,
                  background: 'rgba(0,0,0,0.65)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 0 20px ${c.homeNeon}, 0 0 20px ${c.awayNeon}`,
                }}
              >
                <span className="text-[11px] font-black uppercase tracking-tight text-white">
                  VS
                </span>
              </div>
            )}
          </div>

          {/* Time visitante */}
          <button
            type="button"
            onClick={onSelectAway}
            className="flex flex-col items-center gap-2.5 outline-none group"
            data-nav-item
            data-nav-row={navRow}
            data-nav-col={navColBase + 1}
            aria-label={`Abrir página de ${awayName ?? 'Visitante'}`}
          >
            <span
              className="text-[11px] font-black uppercase tracking-wide text-center line-clamp-1 w-full px-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
              style={{ color: c.awayText }}
            >
              {awayName ?? 'Visitante'}
            </span>
            <div className="relative flex items-center justify-center">
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: winner === 'away' ? 108 : 96,
                  height: winner === 'away' ? 108 : 96,
                  background: `radial-gradient(circle, ${c.awayGlow} 0%, transparent 70%)`,
                  filter: 'blur(10px)',
                  opacity: winner === 'away' ? 0.9 : 0.6,
                  transition: 'all 0.4s ease',
                }}
              />
              {winner === 'away' && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[13px] leading-none select-none z-20"
                  style={{ filter: 'drop-shadow(0 0 5px gold)' }}
                >
                  👑
                </div>
              )}
              <img
                src={awayBadge}
                alt={awayName ?? 'Visitante'}
                className={`relative z-10 object-contain transition-all duration-400 group-hover:scale-110 ${
                  mode === 'result' && winner !== 'away' && winner !== 'draw'
                    ? 'opacity-60 scale-90'
                    : winner === 'away'
                      ? 'scale-105'
                      : ''
                }`}
                style={{
                  width: 88,
                  height: 88,
                  filter: `drop-shadow(0 0 14px ${c.awayGlow}) drop-shadow(0 3px 12px rgba(0,0,0,0.95))`,
                }}
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logored.webp';
                }}
              />
            </div>
          </button>
        </div>

        {/* ── Rodapé: data/hora + canal ── */}
        <div
          className="flex items-center justify-between gap-2 px-3 py-2.5"
          style={{
            background:
              'linear-gradient(135deg, rgba(88,28,135,0.82) 0%, rgba(109,40,217,0.72) 50%, rgba(67,20,105,0.85) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(167,139,250,0.25)',
            boxShadow: 'inset 0 1px 0 rgba(167,139,250,0.15)',
          }}
        >
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[12px] font-bold text-white truncate drop-shadow-sm">
              {weekday} às {timeOrSecondary}
            </span>
            {venue && (
              <span className="text-[9px] text-purple-200/70 mt-0.5 truncate">• {venue}</span>
            )}
          </div>

          {(() => {
            if (!channelLogo && !channelName) return null;
            const initials = (channelName ?? '')
              .replace(/[^a-zA-Z0-9 ]/g, '')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join('')
              .toUpperCase();
            const inner = channelLogo ? (
              <img
                src={channelLogo}
                alt={channelName ?? 'Canal'}
                className="h-8 w-12 object-contain"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="flex h-8 min-w-[48px] items-center justify-center px-2 text-[11px] font-black tracking-wide text-purple-100">
                {initials || 'TV'}
              </span>
            );
            return onSelectChannel ? (
              <button
                type="button"
                onClick={onSelectChannel}
                className="shrink-0 rounded-xl p-1.5 transition active:scale-95 focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(167,139,250,0.35)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 0 12px rgba(124,58,237,0.35)',
                }}
                data-nav-item
                data-nav-row={navRow}
                data-nav-col={navColBase + 2}
                aria-label={`Assistir em ${channelName ?? 'canal'}`}
              >
                {inner}
              </button>
            ) : (
              <div
                className="shrink-0 rounded-xl p-1.5"
                style={{
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(167,139,250,0.25)',
                }}
              >
                {inner}
              </div>
            );
          })()}
        </div>
      </div>
    </article>
  );
};

export const FutebolMatchCard = memo(FutebolMatchCardComponent);
