import React, { memo } from 'react';
import { CalendarClock } from 'lucide-react';
import type { FutebolEvento } from '@/features/futebol/types';

interface ResultadosRecentesProps {
  jogos: FutebolEvento[];
  onTeamClick?: (teamId: string) => void;
  resolverTeamId?: (
    teamName: string | null | undefined,
    explicitTeamId?: string | null
  ) => string | null;
}

function formatDate(dateEvent: string | null): string {
  if (!dateEvent) return 'Data indisponivel';
  const date = new Date(`${dateEvent}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Data indisponivel';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const ResultadoCard: React.FC<{
  jogo: FutebolEvento;
  index: number;
  onTeamClick?: (teamId: string) => void;
  resolverTeamId?: (
    teamName: string | null | undefined,
    explicitTeamId?: string | null
  ) => string | null;
}> = memo(({ jogo, index, onTeamClick, resolverTeamId }) => {
  const homeTeamId = resolverTeamId?.(jogo.strHomeTeam, jogo.idHomeTeam || null) || null;
  const awayTeamId = resolverTeamId?.(jogo.strAwayTeam, jogo.idAwayTeam || null) || null;

  const homeScore = jogo.intHomeScore ?? '-';
  const awayScore = jogo.intAwayScore ?? '-';

  const renderTeam = (teamName: string | null, teamId: string | null, align: 'left' | 'right') => {
    if (teamId && onTeamClick) {
      return (
        <button
          onClick={() => onTeamClick(teamId)}
          className={`text-sm font-bold truncate max-w-[120px] ${
            align === 'right' ? 'text-right' : 'text-left'
          } outline-none focus:ring-2 focus:ring-white/40 rounded-md px-1`}
        >
          {teamName || 'Time'}
        </button>
      );
    }

    return (
      <span
        className={`text-sm font-bold truncate max-w-[120px] ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        {teamName || 'Time'}
      </span>
    );
  };

  return (
    <article
      tabIndex={0}
      data-nav-item
      data-nav-col={index}
      className="w-[290px] md:w-[320px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06] focus:bg-white/[0.1] outline-none focus:ring-2 focus:ring-white/40 transition-colors"
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45 mb-4">
        {formatDate(jogo.dateEvent)}
      </div>
      <div className="flex items-center justify-between gap-3">
        {renderTeam(jogo.strHomeTeam, homeTeamId, 'left')}
        <div className="text-xl font-black px-2 shrink-0">
          {homeScore} x {awayScore}
        </div>
        {renderTeam(jogo.strAwayTeam, awayTeamId, 'right')}
      </div>
    </article>
  );
});

ResultadoCard.displayName = 'ResultadoCard';

const ResultadosRecentes: React.FC<ResultadosRecentesProps> = memo(
  ({ jogos, onTeamClick, resolverTeamId }) => {
    return (
      <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10" data-nav-row="3">
        <h2 className="text-2xl font-black uppercase tracking-tight mb-5 flex items-center gap-3">
          <CalendarClock size={22} className="text-amber-400" />
          Resultados Recentes
        </h2>

        {jogos.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-white/55">
            Nenhum resultado recente disponivel.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {jogos.map((jogo, index) => (
              <ResultadoCard
                key={jogo.idEvent}
                jogo={jogo}
                index={index}
                onTeamClick={onTeamClick}
                resolverTeamId={resolverTeamId}
              />
            ))}
          </div>
        )}
      </section>
    );
  }
);

ResultadosRecentes.displayName = 'ResultadosRecentes';

export default ResultadosRecentes;
