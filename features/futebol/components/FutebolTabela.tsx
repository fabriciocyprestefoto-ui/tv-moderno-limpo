import React, { memo } from 'react';
import { TabelaBrasileiraoRow } from '@/features/futebol/services/futebolService';
import { playSelectSound } from '@/utils/soundEffects';

interface FutebolTabelaProps {
  tabela: TabelaBrasileiraoRow[];
  loadingTabela: boolean;
  onSelectTeam: (teamName: string | null, explicitId?: string | null) => void;
  getBadge: (teamName: string | null, explicitBadge?: string | null) => string;
}

// ── Zonas da tabela do Brasileirão Série A ──────────────────────────────────
// Pos 1       → Campeão
// Pos 2–4     → Copa Libertadores (fase de grupos)
// Pos 5–6     → Copa Libertadores (pré)
// Pos 7–8     → Copa Sul-Americana
// Pos 17–20   → Rebaixamento para Série B
const ZONA: Record<number, { label: string; color: string; borderColor: string }> = {
  1:  { label: 'Campeão', color: '#facc14', borderColor: 'rgba(250,204,21,0.70)' },
  2:  { label: 'Libertadores', color: '#4ade80', borderColor: 'rgba(74,222,128,0.55)' },
  3:  { label: 'Libertadores', color: '#4ade80', borderColor: 'rgba(74,222,128,0.55)' },
  4:  { label: 'Libertadores', color: '#4ade80', borderColor: 'rgba(74,222,128,0.55)' },
  5:  { label: 'Libertadores (pré)', color: '#86efac', borderColor: 'rgba(134,239,172,0.40)' },
  6:  { label: 'Libertadores (pré)', color: '#86efac', borderColor: 'rgba(134,239,172,0.40)' },
  7:  { label: 'Sul-Americana', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.45)' },
  8:  { label: 'Sul-Americana', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.45)' },
  17: { label: 'Rebaixamento', color: '#f87171', borderColor: 'rgba(248,113,113,0.55)' },
  18: { label: 'Rebaixamento', color: '#f87171', borderColor: 'rgba(248,113,113,0.55)' },
  19: { label: 'Rebaixamento', color: '#f87171', borderColor: 'rgba(248,113,113,0.55)' },
  20: { label: 'Rebaixamento', color: '#f87171', borderColor: 'rgba(248,113,113,0.55)' },
};

const posColor: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-slate-300',
  3: 'text-amber-500',
  4: 'text-emerald-400',
  5: 'text-emerald-400',
  6: 'text-emerald-400',
  7: 'text-sky-400',
  8: 'text-sky-400',
};

const posBg: Record<number, string> = {
  1: 'rgba(250,204,21,0.12)',
  2: 'rgba(203,213,225,0.08)',
  3: 'rgba(245,158,11,0.10)',
};

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse">
    <div className="h-5 w-6 bg-white/10 rounded shrink-0" />
    <div className="size-9 rounded-xl bg-white/10 shrink-0" />
    <div className="flex-1 h-4 bg-white/10 rounded" />
    <div className="flex gap-3 shrink-0">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-4 w-5 bg-white/10 rounded" />
      ))}
    </div>
    <div className="h-5 w-7 bg-white/10 rounded shrink-0 ml-2" />
  </div>
);

const FutebolTabelaComponent: React.FC<FutebolTabelaProps> = ({
  tabela,
  loadingTabela,
  onSelectTeam,
  getBadge,
}) => {
  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 text-white/35 text-[10px] uppercase tracking-[0.18em] font-black">
        <span className="w-6 shrink-0 text-center">#</span>
        <span className="flex-1">Time</span>
        <div className="hidden sm:flex gap-4 shrink-0 text-center">
          <span className="w-5">J</span>
          <span className="w-5">V</span>
          <span className="w-5">E</span>
          <span className="w-5">D</span>
          <span className="w-6">SG</span>
        </div>
        <span className="w-8 text-right shrink-0">Pts</span>
      </div>

      {/* Rows */}
      {tabela.map((row, idx) => {
        const pos = row.posicao ?? idx + 1;
        const rankColorClass = posColor[pos] ?? 'text-white/40';
        const rowBg = posBg[pos] ?? 'transparent';

        const zona = ZONA[pos] ?? null;

        return (
          <div
            key={`${row.nomeTime}-${idx}`}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 cursor-pointer outline-none
              hover:bg-white/[0.07] focus:bg-white/[0.07] focus:ring-2 focus:ring-purple-400/40"
            style={{
              background:
                pos <= 3
                  ? rowBg
                  : idx % 2 === 0
                    ? 'rgba(255,255,255,0.03)'
                    : 'rgba(255,255,255,0.015)',
              borderColor: zona
                ? zona.borderColor
                : pos === 1
                  ? 'rgba(250,204,21,0.20)'
                  : pos <= 3
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(255,255,255,0.05)',
              borderLeft: zona ? `3px solid ${zona.color}` : undefined,
            }}
            tabIndex={0}
            data-nav-item
            data-nav-row="4"
            data-nav-col={0}
            onClick={() => {
              playSelectSound();
              onSelectTeam(row.nomeTime, row.teamId);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                playSelectSound();
                onSelectTeam(row.nomeTime, row.teamId);
              }
            }}
          >
            {/* Position */}
            <span className={`text-base font-black w-6 text-center shrink-0 ${rankColorClass}`}>
              {String(pos).padStart(2, '0')}
            </span>

            {/* Badge */}
            <div className="size-9 rounded-xl overflow-hidden shrink-0 bg-white/[0.06] p-1 border border-white/[0.07]">
              <img
                src={getBadge(row.nomeTime)}
                alt={row.nomeTime}
                loading="lazy"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0';
                }}
              />
            </div>

            {/* Name */}
            <span className="flex-1 font-bold text-sm truncate">{row.nomeTime}</span>

            {/* Stats — hidden on xs */}
            <div className="hidden sm:flex gap-4 shrink-0 text-center text-[12px] text-white/50 font-semibold">
              <span className="w-5">{row.jogos ?? '-'}</span>
              <span className="w-5 text-emerald-400/80">{row.vitorias ?? '-'}</span>
              <span className="w-5 text-white/40">{row.empates ?? '-'}</span>
              <span className="w-5 text-red-400/70">{row.derrotas ?? '-'}</span>
              <span className="w-6 text-sky-400/80">{row.saldoGols ?? '-'}</span>
            </div>

            {/* Points */}
            <div className="flex flex-col items-end shrink-0 ml-2">
              <span className="text-xl font-black text-[#a855f7] leading-none">
                {row.pontos ?? '-'}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold">
                pts
              </span>
            </div>
          </div>
        );
      })}

      {/* Skeleton */}
      {!tabela.length && loadingTabela && (
        <>
          {[...Array(8)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </>
      )}

      {/* Empty */}
      {!tabela.length && !loadingTabela && (
        <div className="px-4 py-8 text-center text-white/40 text-sm font-semibold">
          Tabela indisponível no momento.
        </div>
      )}

      {/* Legenda de zonas */}
      {tabela.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-2 pt-3 text-[10px] font-bold uppercase tracking-[0.14em]">
          <span className="flex items-center gap-1.5 text-yellow-400">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
            Campeão
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            Libertadores
          </span>
          <span className="flex items-center gap-1.5 text-sky-400">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
            Sul-Americana
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
            Rebaixamento
          </span>
        </div>
      )}
    </div>
  );
};

export const FutebolTabela = memo(FutebolTabelaComponent);
