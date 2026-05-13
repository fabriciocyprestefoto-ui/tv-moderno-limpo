import React, { memo } from 'react';
import { Calendar, Clock3, Tv } from 'lucide-react';
import type { FutebolEvento } from '@/features/futebol/types';

interface ProximosJogosTimeProps {
  jogos: FutebolEvento[];
}

function formatDate(dateEvent: string | null): string {
  if (!dateEvent) return 'Data a confirmar';
  const date = new Date(`${dateEvent}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Data a confirmar';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(strTime: string | null): string {
  if (!strTime) return 'Horário a confirmar';
  const match = strTime.trim().match(/^(\d{2}:\d{2})/);
  return match ? match[1] : 'Horário a confirmar';
}

const ProximoJogoTimeCard: React.FC<{ jogo: FutebolEvento; index: number }> = memo(
  ({ jogo, index }) => {
    return (
      <article
        tabIndex={0}
        data-nav-item
        data-nav-col={index}
        className="w-[300px] md:w-[330px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:bg-white/[0.07] focus:bg-white/[0.1] outline-none focus:ring-2 focus:ring-white/40 transition-colors"
      >
        <div className="text-center">
          <div className="flex items-center justify-between gap-3">
            <div className="w-[42%] flex flex-col items-center gap-1 min-w-0">
              <div className="size-12 rounded-xl bg-white/5 border border-white/10 p-1.5">
                {jogo.strHomeTeamBadge ? (
                  <img
                    src={jogo.strHomeTeamBadge}
                    alt={jogo.strHomeTeam || 'Mandante'}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <p className="text-sm font-bold truncate max-w-full">
                {jogo.strHomeTeam || 'Time Mandante'}
              </p>
            </div>
            <p className="text-xl font-black text-white/45 my-1">X</p>
            <div className="w-[42%] flex flex-col items-center gap-1 min-w-0">
              <div className="size-12 rounded-xl bg-white/5 border border-white/10 p-1.5">
                {jogo.strAwayTeamBadge ? (
                  <img
                    src={jogo.strAwayTeamBadge}
                    alt={jogo.strAwayTeam || 'Visitante'}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <p className="text-sm font-bold truncate max-w-full">
                {jogo.strAwayTeam || 'Time Visitante'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/75 space-y-2">
          <div className="flex items-center gap-2">
            <Calendar size={13} />
            <span>{formatDate(jogo.dateEvent)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock3 size={13} />
            <span>{formatTime(jogo.strTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Tv size={13} />
            <span>{jogo.strTVStation || 'Transmissão a confirmar'}</span>
          </div>
        </div>
      </article>
    );
  }
);

ProximoJogoTimeCard.displayName = 'ProximoJogoTimeCard';

const ProximosJogosTime: React.FC<ProximosJogosTimeProps> = memo(({ jogos }) => {
  return (
    <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10" data-nav-row="2">
      <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight mb-5">
        Proximos Jogos
      </h2>

      {jogos.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/65">
          Nenhum proximo jogo encontrado para este time.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {jogos.slice(0, 5).map((jogo, index) => (
            <ProximoJogoTimeCard key={jogo.idEvent} jogo={jogo} index={index} />
          ))}
        </div>
      )}
    </section>
  );
});

ProximosJogosTime.displayName = 'ProximosJogosTime';

export default ProximosJogosTime;
