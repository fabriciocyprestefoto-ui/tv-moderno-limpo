import React, { memo } from 'react';
import { Calendar, Clock3, MapPin, Tv } from 'lucide-react';
import type { FutebolEvento } from '@/features/futebol/types';

interface ProximosJogosProps {
  jogos: FutebolEvento[];
  onTeamClick?: (teamId: string) => void;
  resolverTeamId?: (
    teamName: string | null | undefined,
    explicitTeamId?: string | null
  ) => string | null;
}

interface TeamBadgeProps {
  teamName: string | null;
  badgeUrl?: string | null;
  teamId: string | null;
  onTeamClick?: (teamId: string) => void;
  side: 'home' | 'away';
}

const TEAM_FALLBACK = 'Time';
const TRANSMISSAO_LABEL = 'Transmissão a confirmar';

function formatDate(dateEvent: string | null): string {
  if (!dateEvent) return 'Data a confirmar';
  const parsed = new Date(`${dateEvent}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Data a confirmar';
  return parsed.toLocaleDateString('pt-BR', {
    weekday: 'short',
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

const TeamBadge: React.FC<TeamBadgeProps> = memo(
  ({ teamName, badgeUrl, teamId, onTeamClick, side }) => {
    const fallbackText = (teamName || TEAM_FALLBACK).slice(0, 3).toUpperCase();
    const canOpen = !!teamId && !!onTeamClick;

    const content = (
      <>
        <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
          {badgeUrl ? (
            <img
              src={badgeUrl}
              alt={teamName || TEAM_FALLBACK}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-[10px] font-black tracking-wide">{fallbackText}</span>
          )}
        </div>
        <span
          className={`text-sm font-bold truncate ${side === 'away' ? 'text-right' : 'text-left'}`}
        >
          {teamName || TEAM_FALLBACK}
        </span>
      </>
    );

    if (canOpen) {
      return (
        <button
          onClick={() => onTeamClick(teamId)}
          className="flex flex-col items-center gap-2 min-w-0 outline-none focus:ring-2 focus:ring-white/45 rounded-xl p-1"
        >
          {content}
        </button>
      );
    }

    return <div className="flex flex-col items-center gap-2 min-w-0">{content}</div>;
  }
);

TeamBadge.displayName = 'TeamBadge';

const ProximoJogoCard: React.FC<{
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

  return (
    <article
      tabIndex={0}
      data-nav-item
      data-nav-col={index}
      className="w-[310px] md:w-[340px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm hover:bg-white/[0.07] focus:bg-white/[0.1] outline-none focus:ring-2 focus:ring-white/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <TeamBadge
          teamName={jogo.strHomeTeam}
          badgeUrl={jogo.strHomeTeamBadge || null}
          teamId={homeTeamId}
          onTeamClick={onTeamClick}
          side="home"
        />
        <span className="text-xl font-black text-white/40">X</span>
        <TeamBadge
          teamName={jogo.strAwayTeam}
          badgeUrl={jogo.strAwayTeamBadge || null}
          teamId={awayTeamId}
          onTeamClick={onTeamClick}
          side="away"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs text-white/70">
        <div className="flex items-center gap-2">
          <Calendar size={14} />
          <span>{formatDate(jogo.dateEvent)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock3 size={14} />
          <span>{formatTime(jogo.strTime)}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={14} />
          <span className="truncate">{jogo.strVenue || 'Estádio a confirmar'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/45">Status:</span>
          <span className="font-semibold text-white/90">{jogo.strStatus || 'Agendado'}</span>
        </div>
        <div className="flex items-center gap-2 text-white/85">
          <Tv size={14} />
          <span>{TRANSMISSAO_LABEL}</span>
        </div>
      </div>
    </article>
  );
});

ProximoJogoCard.displayName = 'ProximoJogoCard';

const ProximosJogos: React.FC<ProximosJogosProps> = memo(
  ({ jogos, onTeamClick, resolverTeamId }) => {
    return (
      <section className="max-w-6xl mx-auto px-6 md:px-12" data-nav-row="1">
        <h2 className="text-2xl font-black uppercase tracking-tight mb-5 flex items-center gap-3">
          <Calendar size={22} className="text-[#A855F7]" />
          Proximos Jogos
        </h2>

        {jogos.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-white/55">
            Nenhum jogo futuro disponivel no momento.
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {jogos.map((jogo, index) => (
              <ProximoJogoCard
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

ProximosJogos.displayName = 'ProximosJogos';

export default ProximosJogos;
