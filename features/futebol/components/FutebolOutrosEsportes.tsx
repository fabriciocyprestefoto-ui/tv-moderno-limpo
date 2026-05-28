import React, { memo, useEffect, useState } from 'react';
import {
  FightEvent,
  NBAGame,
  getFightEventsUpcoming,
  getNbaGamesToday,
  formatMatchDate,
} from '@/services/sportsApi';

/** Logo de canal/emissora com fallback elegante de iniciais. */
const BroadcastChip: React.FC<{ name: string }> = ({ name }) => {
  const initials = name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className="px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wide text-purple-100/90"
      style={{ background: 'rgba(167,139,250,0.14)', border: '1px solid rgba(167,139,250,0.22)' }}
      title={name}
    >
      {initials || 'TV'}
    </span>
  );
};

const TeamLogo: React.FC<{ src?: string | null; alt: string }> = ({ src, alt }) => (
  <div className="size-10 rounded-xl overflow-hidden shrink-0 bg-white/[0.06] flex items-center justify-center">
    {src ? (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-contain p-1"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    ) : (
      <span className="text-[10px] font-black text-white/60">{alt.slice(0, 3).toUpperCase()}</span>
    )}
  </div>
);

const GlassCard: React.FC<{ children: React.ReactNode; navRow: string; navCol: number }> = ({
  children,
  navRow,
  navCol,
}) => (
  <div
    className="shrink-0 w-[280px] rounded-2xl p-4 outline-none focus:ring-2 focus:ring-purple-400/50"
    style={{
      background:
        'linear-gradient(135deg, rgba(88,28,135,0.30) 0%, rgba(109,40,217,0.18) 50%, rgba(67,20,105,0.28) 100%)',
      border: '1px solid rgba(167,139,250,0.22)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'inset 0 1px 0 rgba(167,139,250,0.15)',
    }}
    tabIndex={0}
    data-nav-item
    data-nav-row={navRow}
    data-nav-col={navCol}
  >
    {children}
  </div>
);

const NbaCard: React.FC<{ game: NBAGame; idx: number }> = ({ game, idx }) => (
  <GlassCard navRow="8" navCol={idx}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-purple-200/70 font-bold">NBA</span>
      <span className="text-[11px] font-bold text-white/80">
        {formatMatchDate(game.date)} {game.time ? `• ${game.time}` : ''}
      </span>
    </div>
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col items-center gap-1.5 w-[40%]">
        <TeamLogo src={game.awayTeam?.logo} alt={game.awayTeam?.name || 'Visitante'} />
        <span className="text-[11px] font-bold text-white/85 text-center truncate w-full">
          {game.awayTeam?.name}
        </span>
      </div>
      <span className="text-white/40 font-black text-xs">@</span>
      <div className="flex flex-col items-center gap-1.5 w-[40%]">
        <TeamLogo src={game.homeTeam?.logo} alt={game.homeTeam?.name || 'Mandante'} />
        <span className="text-[11px] font-bold text-white/85 text-center truncate w-full">
          {game.homeTeam?.name}
        </span>
      </div>
    </div>
    {game.broadcast && game.broadcast.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/10">
        {game.broadcast.slice(0, 3).map((b) => (
          <BroadcastChip key={b} name={b} />
        ))}
      </div>
    )}
  </GlassCard>
);

const FightCard: React.FC<{ event: FightEvent; idx: number }> = ({ event, idx }) => {
  const main = event.mainEvent;
  return (
    <GlassCard navRow="9" navCol={idx}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-purple-200/70 font-bold">UFC</span>
        <span className="text-[11px] font-bold text-white/80">{formatMatchDate(event.date)}</span>
      </div>
      <p className="text-[13px] font-black text-white truncate">{event.name}</p>
      {main ? (
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {main.fighter1.flag && (
              <img src={main.fighter1.flag} alt="" loading="lazy" className="size-4 object-contain" />
            )}
            <span className="text-[11px] font-bold text-white/85 truncate">{main.fighter1.name}</span>
          </div>
          <span className="text-purple-300 font-black text-[10px] shrink-0">VS</span>
          <div className="flex items-center gap-1.5 min-w-0 justify-end">
            <span className="text-[11px] font-bold text-white/85 truncate">{main.fighter2.name}</span>
            {main.fighter2.flag && (
              <img src={main.fighter2.flag} alt="" loading="lazy" className="size-4 object-contain" />
            )}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-white/45 mt-2 truncate">{event.city || event.venue || 'Card a confirmar'}</p>
      )}
      {event.broadcast && event.broadcast.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/10">
          {event.broadcast.slice(0, 3).map((b) => (
            <BroadcastChip key={b} name={b} />
          ))}
        </div>
      )}
    </GlassCard>
  );
};

const Skeletons: React.FC = () => (
  <div className="flex gap-4 overflow-hidden">
    {Array.from({ length: 4 }).map((_, i) => (
      <div
        key={i}
        className="shrink-0 w-[280px] h-[150px] rounded-2xl bg-white/[0.04] border border-white/[0.07] animate-pulse"
      />
    ))}
  </div>
);

const FutebolOutrosEsportesComponent: React.FC = () => {
  const [nba, setNba] = useState<NBAGame[]>([]);
  const [fights, setFights] = useState<FightEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getNbaGamesToday(), getFightEventsUpcoming()])
      .then(([nbaData, fightData]) => {
        if (!alive) return;
        setNba(nbaData);
        setFights(fightData);
      })
      .catch(() => {
        if (alive) {
          setNba([]);
          setFights([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // sem dados e sem loading → não polui a tela
  if (!loading && nba.length === 0 && fights.length === 0) return null;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">🏀 NBA</h2>
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-bold">Jogos de hoje</span>
        </div>
        {loading ? (
          <Skeletons />
        ) : nba.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
            {nba.map((game, idx) => (
              <NbaCard key={game.id} game={game} idx={idx} />
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm font-semibold">Nenhum jogo de NBA hoje.</p>
        )}
      </div>

      <div>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">🥊 UFC / Lutas</h2>
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-bold">Próximos eventos</span>
        </div>
        {loading ? (
          <Skeletons />
        ) : fights.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
            {fights.map((event, idx) => (
              <FightCard key={event.id} event={event} idx={idx} />
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm font-semibold">Nenhum evento de luta agendado.</p>
        )}
      </div>
    </div>
  );
};

export const FutebolOutrosEsportes = memo(FutebolOutrosEsportesComponent);
