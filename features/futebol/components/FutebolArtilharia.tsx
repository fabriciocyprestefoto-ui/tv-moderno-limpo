import React, { memo, useEffect, useState } from 'react';
import { FootballTopScorer, getCompetitionTopScorers, getTeams } from '@/services/sportsApi';

const medalColors: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-slate-300',
  3: 'text-amber-600',
};

type ArtilheiroView = FootballTopScorer & {
  clubeLogo?: string | null;
};

const ArtilheiroCard: React.FC<{ art: ArtilheiroView; idx: number }> = ({ art, idx: _idx }) => {
  const rankColor = medalColors[art.posicao] ?? 'text-white/40';
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] transition-all">
      {/* rank */}
      <span className={`text-lg font-black w-6 text-center shrink-0 ${rankColor}`}>{art.posicao}</span>

      {/* foto jogador */}
      <div className="size-10 rounded-xl overflow-hidden shrink-0 bg-white/10">
        <img
          src={art.foto}
          alt={art.jogador}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{art.jogador}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {art.clubeLogo ? (
            <img
              src={art.clubeLogo}
              alt={art.time}
              className="size-4 object-contain"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <span className="text-[10px] text-white/50 font-semibold uppercase tracking-wide truncate">
            {art.time}
          </span>
        </div>
      </div>

      {/* gols */}
      <div className="flex flex-col items-center shrink-0">
        <span className="text-2xl font-black text-[#a855f7] leading-none">{art.gols}</span>
        <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">gols</span>
      </div>
    </div>
  );
};

const FutebolArtilhariaComponent: React.FC = () => {
  const [artilharia, setArtilharia] = useState<ArtilheiroView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getCompetitionTopScorers('brasileirao-serie-a'), getTeams()])
      .then(([scorers, teams]) => {
        if (!alive) return;
        const logoByName = new Map(
          teams.map((team) => [team.name.toLowerCase(), team.logo || null] as const)
        );
        setArtilharia(
          scorers.map((scorer) => ({
            ...scorer,
            clubeLogo: logoByName.get(scorer.time.toLowerCase()) || null,
          }))
        );
      })
      .catch(() => {
        if (alive) setArtilharia([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div
            key={idx}
            className="h-[66px] rounded-2xl bg-white/[0.04] border border-white/[0.07] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!artilharia.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-white/70">
        Artilharia indisponível no momento.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {artilharia.map((art, idx) => (
        <ArtilheiroCard key={`${art.jogador}-${idx}`} art={art} idx={idx} />
      ))}
    </div>
  );
};

export const FutebolArtilharia = memo(FutebolArtilhariaComponent);
