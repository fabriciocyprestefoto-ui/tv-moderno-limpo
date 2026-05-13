import React, { memo } from 'react';
import { ARTILHARIA_SERIE_A, ArtilheiroRow } from '@/features/futebol/services/globoSerieAData';

const medalColors: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-slate-300',
  3: 'text-amber-600',
};

const ArtilheiroCard: React.FC<{ art: ArtilheiroRow; idx: number }> = ({ art, idx: _idx }) => {
  const rankColor = medalColors[art.rank] ?? 'text-white/40';
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] transition-all">
      {/* rank */}
      <span className={`text-lg font-black w-6 text-center shrink-0 ${rankColor}`}>{art.rank}</span>

      {/* foto jogador */}
      <div className="size-10 rounded-xl overflow-hidden shrink-0 bg-white/10">
        <img
          src={art.foto}
          alt={art.nome}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{art.nome}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <img
            src={art.clubeLogo}
            alt={art.clube}
            className="size-4 object-contain"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="text-[10px] text-white/50 font-semibold uppercase tracking-wide truncate">
            {art.clube} · {art.posicao}
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {ARTILHARIA_SERIE_A.map((art, idx) => (
        <ArtilheiroCard key={`${art.nome}-${idx}`} art={art} idx={idx} />
      ))}
    </div>
  );
};

export const FutebolArtilharia = memo(FutebolArtilhariaComponent);
