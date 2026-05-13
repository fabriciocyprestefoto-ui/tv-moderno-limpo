import React, { memo } from 'react';
import { Shield } from 'lucide-react';
import type { TimeSerieA } from '@/features/futebol/types';
import { getTeamBadge } from '@/services/brasileiraoData';

interface TimesSerieAProps {
  times: TimeSerieA[];
  onTeamClick: (teamId: string) => void;
  badgeMap?: Record<string, string>;
}

const TeamShieldCard: React.FC<{
  team: TimeSerieA;
  row: number;
  col: number;
  onTeamClick: (teamId: string) => void;
  badgeMap?: Record<string, string>;
}> = memo(({ team, row, col, onTeamClick, badgeMap }) => {
  const mapped = badgeMap?.[team.strTeam] || null;
  return (
    <button
      tabIndex={0}
      data-nav-item
      data-nav-row={row}
      data-nav-col={col}
      onClick={() => onTeamClick(team.idTeam)}
      className="w-[110px] md:w-[130px] rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col items-center justify-center gap-3 hover:bg-white/[0.08] focus:bg-white/[0.12] outline-none focus:ring-2 focus:ring-white/45 transition-colors"
    >
      <div className="w-16 h-16 flex items-center justify-center overflow-hidden">
        {mapped || team.strTeamBadge ? (
          <img
            src={mapped || getTeamBadge(team.strTeam) || team.strTeamBadge!}
            alt={team.strTeam}
            className="w-full h-full object-contain"
            loading="lazy"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.55))' }}
          />
        ) : (
          <Shield size={28} className="text-white/65" />
        )}
      </div>
      <span className="text-xs font-bold text-center line-clamp-2">{team.strTeam}</span>
    </button>
  );
});

TeamShieldCard.displayName = 'TeamShieldCard';

const TimesSerieA: React.FC<TimesSerieAProps> = memo(({ times, onTeamClick, badgeMap }) => {
  const sorted = [...times].sort((a, b) => a.strTeam.localeCompare(b.strTeam, 'pt-BR'));
  const top = sorted.slice(0, 20);
  const row1 = top.slice(0, 7);
  const row2 = top.slice(7, 14);
  const row3 = top.slice(14, 20);
  return (
    <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10 pb-12">
      <h2 className="text-2xl font-black uppercase tracking-tight mb-5">Escudos da Série A</h2>

      {top.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/60">
          Escudos indisponíveis no momento.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 justify-between md:justify-between" data-nav-row="1">
            {row1.map((team, i) => (
              <TeamShieldCard
                key={team.idTeam}
                team={team}
                row={1}
                col={i}
                onTeamClick={onTeamClick}
                badgeMap={badgeMap}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 justify-between md:justify-between" data-nav-row="2">
            {row2.map((team, i) => (
              <TeamShieldCard
                key={team.idTeam}
                team={team}
                row={2}
                col={i}
                onTeamClick={onTeamClick}
                badgeMap={badgeMap}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 justify-center md:justify-center" data-nav-row="3">
            {row3.map((team, i) => (
              <TeamShieldCard
                key={team.idTeam}
                team={team}
                row={3}
                col={i}
                onTeamClick={onTeamClick}
                badgeMap={badgeMap}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
});

TimesSerieA.displayName = 'TimesSerieA';

export default TimesSerieA;
