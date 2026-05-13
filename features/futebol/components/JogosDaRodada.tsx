import React, { memo, useCallback, useMemo, useRef } from 'react';
import { playSelectSound } from '@/utils/soundEffects';

/* ─── Tipos ─── */
interface Broadcaster {
  name: string;
  channelId: string;
  logo: string;
  exclusive?: boolean;
}

interface JogoRodada {
  id: number;
  homeTeam: string;
  awayTeam: string;
  datetime: string;
  broadcasters: Broadcaster[];
}

interface JogosDaRodadaProps {
  getBadge: (teamName: string | null) => string;
  onSelectChannel: (channelId: string) => void;
  onSelectTeam?: (teamName: string | null) => void;
  proximosJogos?: Array<{
    strHomeTeam?: string | null;
    strAwayTeam?: string | null;
    dateEvent?: string;
    strTime?: string;
    strTVStation?: string | null;
    canal?: string | null;
  }>;
}

/* ─── Dados da 8ª rodada — Brasileirão Série A 2026 ─── */
const RODADA = 8;
const jogos: JogoRodada[] = [
  {
    id: 1,
    homeTeam: 'RB Bragantino',
    awayTeam: 'Botafogo',
    datetime: '2026-03-21T16:00:00',
    broadcasters: [
      { name: 'SporTV', channelId: 'sportv', logo: '/logos/sportv.png' },
      { name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' },
    ],
  },
  {
    id: 2,
    homeTeam: 'Fluminense',
    awayTeam: 'Atlético-MG',
    datetime: '2026-03-21T18:30:00',
    broadcasters: [
      {
        name: 'Prime Video',
        channelId: 'primevideo',
        logo: '/logos/primevideo.png',
        exclusive: true,
      },
    ],
  },
  {
    id: 3,
    homeTeam: 'São Paulo',
    awayTeam: 'Palmeiras',
    datetime: '2026-03-21T21:00:00',
    broadcasters: [
      { name: 'SporTV', channelId: 'sportv', logo: '/logos/sportv.png' },
      { name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' },
    ],
  },
  {
    id: 4,
    homeTeam: 'Vasco',
    awayTeam: 'Grêmio',
    datetime: '2026-03-22T16:00:00',
    broadcasters: [
      { name: 'Globo', channelId: 'globo', logo: '/logos/globo.png' },
      { name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' },
    ],
  },
  {
    id: 5,
    homeTeam: 'Cruzeiro',
    awayTeam: 'Santos',
    datetime: '2026-03-22T16:00:00',
    broadcasters: [
      { name: 'Globo', channelId: 'globo', logo: '/logos/globo.png' },
      { name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' },
    ],
  },
  {
    id: 6,
    homeTeam: 'Athletico-PR',
    awayTeam: 'Coritiba',
    datetime: '2026-03-22T16:00:00',
    broadcasters: [
      { name: 'Globo', channelId: 'globo', logo: '/logos/globo.png' },
      { name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' },
    ],
  },
  {
    id: 7,
    homeTeam: 'Remo',
    awayTeam: 'Bahia',
    datetime: '2026-03-22T16:00:00',
    broadcasters: [
      { name: 'GE TV', channelId: 'getv', logo: '/logos/getv.png' },
      { name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' },
    ],
  },
  {
    id: 8,
    homeTeam: 'Internacional',
    awayTeam: 'Chapecoense',
    datetime: '2026-03-22T18:30:00',
    broadcasters: [{ name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' }],
  },
  {
    id: 9,
    homeTeam: 'Vitória',
    awayTeam: 'Mirassol',
    datetime: '2026-03-22T18:30:00',
    broadcasters: [{ name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' }],
  },
  {
    id: 10,
    homeTeam: 'Corinthians',
    awayTeam: 'Flamengo',
    datetime: '2026-03-22T20:30:00',
    broadcasters: [
      { name: 'Record', channelId: 'record', logo: '/logos/record.png' },
      { name: 'CazeTV', channelId: 'cazetv', logo: '/logos/cazetv.png' },
      { name: 'Premiere', channelId: 'premiere', logo: '/logos/premiere.png' },
    ],
  },
];

function formatDatetime(iso: string): { weekday: string; date: string; time: string } {
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

const JogosDaRodadaComponent: React.FC<JogosDaRodadaProps> = ({
  getBadge,
  onSelectChannel,
  onSelectTeam,
  proximosJogos,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const resolvedJogos: JogoRodada[] = useMemo(() => {
    if (proximosJogos && proximosJogos.length > 0) {
      return proximosJogos.slice(0, 10).map((ev, idx) => {
        const canal = (ev.canal || ev.strTVStation || '').trim();
        const canais = canal
          ? canal
              .split(/[/,]/)
              .map((c) => c.trim())
              .filter(Boolean)
          : [];
        return {
          id: idx + 1,
          homeTeam: ev.strHomeTeam || 'Time A',
          awayTeam: ev.strAwayTeam || 'Time B',
          datetime:
            ev.dateEvent && ev.strTime
              ? `${ev.dateEvent}T${ev.strTime.slice(0, 5)}:00`
              : new Date().toISOString(),
          broadcasters: canais.map((c) => ({
            name: c,
            channelId: c
              .toLowerCase()
              .replace(/\s+/g, '')
              .replace(/[^a-z0-9]/g, ''),
            logo: `/logos/${c
              .toLowerCase()
              .replace(/\s+/g, '')
              .replace(/[^a-z0-9]/g, '')}.png`,
          })),
        };
      });
    }
    return jogos; // fallback para dados estáticos
  }, [proximosJogos]);

  const handleBroadcasterClick = useCallback(
    (channelId: string) => {
      playSelectSound();
      onSelectChannel(channelId);
    },
    [onSelectChannel]
  );

  const handleTeamClick = useCallback(
    (teamName: string) => {
      playSelectSound();
      onSelectTeam?.(teamName);
    },
    [onSelectTeam]
  );

  // D-pad horizontal scroll
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const focused = document.activeElement as HTMLElement;
      if (focused && scrollRef.current?.contains(focused)) {
        // Scroll card into view when navigated via D-pad
        setTimeout(() => {
          (document.activeElement as HTMLElement)?.scrollIntoView?.({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        }, 50);
      }
    }
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic">
          Jogos da Rodada
        </h2>
        <span className="px-3 py-1 rounded-full bg-[#6A0DAD]/30 border border-[#a855f7]/40 text-[#c084fc] text-xs font-bold tracking-wider">
          {RODADA}ª RODADA
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
        onKeyDown={handleKeyDown}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {resolvedJogos.map((jogo, idx) => {
          const { weekday, date, time } = formatDatetime(jogo.datetime);
          const hasExclusive = jogo.broadcasters.some((b) => b.exclusive);

          return (
            <article
              key={jogo.id}
              className="rodada-card flex-shrink-0 w-[320px] snap-start rounded-2xl p-5 flex flex-col gap-3"
            >
              {/* Header: data/hora + badge exclusivo */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/60 font-bold">
                  <span>
                    {weekday} {date}
                  </span>
                  <span className="text-[#a855f7]">{time}</span>
                </div>
                {hasExclusive && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] font-black uppercase tracking-wider">
                    Exclusivo
                  </span>
                )}
              </div>

              {/* Times */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTeamClick(jogo.homeTeam)}
                  className="flex flex-col items-center gap-2 w-[38%] outline-none rounded-xl p-1 focus:ring-2 focus:ring-[#6A0DAD] focus:bg-white/10 focus:scale-105 transition-all"
                  data-nav-item
                  data-nav-row="rodada"
                  data-nav-col={idx * 3}
                  tabIndex={0}
                >
                  <div className="size-12 rounded-xl bg-white/5 border border-white/10 p-1.5">
                    <img
                      src={getBadge(jogo.homeTeam)}
                      alt={jogo.homeTeam}
                      className="w-full h-full object-contain fut-team-shield"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/logored.webp';
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-center text-white/90 leading-tight">
                    {jogo.homeTeam}
                  </span>
                </button>

                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xs font-black text-white/25 italic">VS</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleTeamClick(jogo.awayTeam)}
                  className="flex flex-col items-center gap-2 w-[38%] outline-none rounded-xl p-1 focus:ring-2 focus:ring-[#6A0DAD] focus:bg-white/10 focus:scale-105 transition-all"
                  data-nav-item
                  data-nav-row="rodada"
                  data-nav-col={idx * 3 + 1}
                  tabIndex={0}
                >
                  <div className="size-12 rounded-xl bg-white/5 border border-white/10 p-1.5">
                    <img
                      src={getBadge(jogo.awayTeam)}
                      alt={jogo.awayTeam}
                      className="w-full h-full object-contain fut-team-shield"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/logored.webp';
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-center text-white/90 leading-tight">
                    {jogo.awayTeam}
                  </span>
                </button>
              </div>

              {/* Emissoras */}
              <div className="pt-2 border-t border-white/10">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-[0.16em]">
                  Onde assistir
                </span>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {jogo.broadcasters.map((b) => (
                    <button
                      key={b.channelId}
                      type="button"
                      onClick={() => handleBroadcasterClick(b.channelId)}
                      className="broadcaster-chip flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 outline-none focus:ring-2 focus:ring-[#6A0DAD] focus:border-[#a855f7] focus:bg-white/15 hover:bg-white/12 transition-all"
                      data-nav-item
                      data-nav-row="rodada"
                      data-nav-col={idx * 3 + 2}
                      tabIndex={0}
                      title={`Assistir no ${b.name}`}
                    >
                      <img
                        src={b.logo}
                        alt={b.name}
                        className="w-5 h-5 object-contain rounded"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <span className="text-[10px] font-semibold text-white/80">{b.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <style>{`
        .rodada-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .rodada-card:hover, .rodada-card:focus-within {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(106, 13, 173, 0.5);
          transform: translateY(-3px) scale(1.01);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(106, 13, 173, 0.3), 0 0 30px rgba(106, 13, 173, 0.1);
        }
        .broadcaster-chip:focus {
          box-shadow: 0 0 0 2px rgba(106, 13, 173, 0.6), 0 0 16px rgba(106, 13, 173, 0.25);
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export const JogosDaRodada = memo(JogosDaRodadaComponent);
