import React, { memo } from 'react';
import { History } from 'lucide-react';
import type { FutebolEvento } from '@/features/futebol/types';

interface ResultadosTimeProps {
  jogos: FutebolEvento[];
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

const ResultadoTimeCard: React.FC<{ jogo: FutebolEvento; index: number }> = memo(
  ({ jogo, index }) => {
    const homeScore = jogo.intHomeScore ?? '-';
    const awayScore = jogo.intAwayScore ?? '-';

    return (
      <article
        tabIndex={0}
        data-nav-item
        data-nav-col={index}
        className="w-[290px] md:w-[320px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] focus:bg-white/[0.1] outline-none focus:ring-2 focus:ring-white/40 transition-colors"
      >
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/45 block mb-3">
          {formatDate(jogo.dateEvent)}
        </span>
        <div className="flex items-center justify-between gap-3">
          <div className="w-[38%] flex items-center gap-2 min-w-0">
            <div className="size-8 rounded-lg bg-white/5 border border-white/10 p-1">
              {jogo.strHomeTeamBadge ? (
                <img
                  src={jogo.strHomeTeamBadge}
                  alt={jogo.strHomeTeam || 'Mandante'}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : null}
            </div>
            <span className="text-sm font-bold truncate">{jogo.strHomeTeam || 'Mandante'}</span>
          </div>
          <span className="text-xl font-black px-2 whitespace-nowrap">
            {homeScore} x {awayScore}
          </span>
          <div className="w-[38%] flex items-center justify-end gap-2 min-w-0">
            <span className="text-sm font-bold truncate text-right">
              {jogo.strAwayTeam || 'Visitante'}
            </span>
            <div className="size-8 rounded-lg bg-white/5 border border-white/10 p-1">
              {jogo.strAwayTeamBadge ? (
                <img
                  src={jogo.strAwayTeamBadge}
                  alt={jogo.strAwayTeam || 'Visitante'}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : null}
            </div>
          </div>
        </div>
      </article>
    );
  }
);

ResultadoTimeCard.displayName = 'ResultadoTimeCard';

const ResultadosTime: React.FC<ResultadosTimeProps> = memo(({ jogos }) => {
  return (
    <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10" data-nav-row="3">
      <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight mb-5 flex items-center gap-2">
        <History size={20} className="text-amber-400" />
        Ultimos Resultados
      </h2>

      {jogos.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/65">
          Nenhum resultado recente encontrado para este time.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {jogos.slice(0, 5).map((jogo, index) => (
            <ResultadoTimeCard key={jogo.idEvent} jogo={jogo} index={index} />
          ))}
        </div>
      )}
    </section>
  );
});

ResultadosTime.displayName = 'ResultadosTime';

export default ResultadosTime;
