import React, { memo } from 'react';
import { Goal, Shield, UserRound } from 'lucide-react';
import type { JogadorTime } from '@/features/futebol/types';

interface ElencoPorPosicao {
  goleiros: JogadorTime[];
  defensores: JogadorTime[];
  meioCampo: JogadorTime[];
  atacantes: JogadorTime[];
}

interface ElencoTimeProps {
  elencoPorPosicao: ElencoPorPosicao;
  artilheiro: JogadorTime | null;
  loading: boolean;
  error: string | null;
}

interface PlayerCardProps {
  jogador: JogadorTime;
  index: number;
}

const PlayerCard: React.FC<PlayerCardProps> = memo(({ jogador, index }) => {
  const image = jogador.strCutout || jogador.strThumb;

  return (
    <article
      tabIndex={0}
      data-nav-item
      data-nav-col={index}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 hover:bg-white/[0.07] focus:bg-white/[0.1] outline-none focus:ring-2 focus:ring-white/40 transition-colors"
    >
      <div className="w-full aspect-square rounded-xl bg-white/5 overflow-hidden flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt={jogador.strPlayer || 'Jogador'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <UserRound className="text-white/35" size={34} />
        )}
      </div>

      <div className="mt-3">
        <p className="text-sm font-bold truncate">{jogador.strPlayer || 'Sem nome'}</p>
        <p className="text-[11px] text-white/60 truncate">
          {jogador.strNationality || 'Nacionalidade nao informada'}
        </p>
        <p className="text-[11px] text-white/45">#{jogador.strNumber || '--'}</p>
      </div>
    </article>
  );
});

PlayerCard.displayName = 'PlayerCard';

const PositionBlock: React.FC<{
  title: string;
  players: JogadorTime[];
  emptyMessage: string;
  rowIndex: number;
}> = memo(({ title, players, emptyMessage, rowIndex }) => {
  return (
    <section data-nav-row={rowIndex}>
      <h3 className="text-lg font-black uppercase tracking-tight mb-3">{title}</h3>
      {players.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-white/60">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {players.map((jogador, index) => (
            <PlayerCard
              key={jogador.idPlayer || `${jogador.strPlayer}-${index}`}
              jogador={jogador}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
});

PositionBlock.displayName = 'PositionBlock';

const ElencoTime: React.FC<ElencoTimeProps> = memo(
  ({ elencoPorPosicao, artilheiro, loading, error }) => {
    return (
      <section className="max-w-6xl mx-auto px-6 md:px-12 mt-10 pb-16">
        <div className="flex items-center gap-2 mb-5">
          <Shield size={20} className="text-white/70" />
          <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">Elenco</h2>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center text-white/65">
            Carregando elenco...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-8 text-center text-red-200">
            {error}
          </div>
        ) : (
          <div className="space-y-8">
            <section
              data-nav-row="4"
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
            >
              <h3 className="text-sm uppercase tracking-[0.18em] text-white/60 mb-2 flex items-center gap-2">
                <Goal size={14} className="text-amber-300" />
                Artilheiro do Time
              </h3>
              {artilheiro ? (
                <p className="text-lg font-bold">
                  {artilheiro.strPlayer || 'Jogador'}{' '}
                  <span className="text-white/70">({artilheiro.intGoals || '0'} gols)</span>
                </p>
              ) : (
                <p className="text-white/65">Dados de artilharia não disponíveis</p>
              )}
            </section>

            <PositionBlock
              title="Goleiros"
              players={elencoPorPosicao.goleiros}
              emptyMessage="Sem goleiros cadastrados."
              rowIndex={5}
            />
            <PositionBlock
              title="Defensores"
              players={elencoPorPosicao.defensores}
              emptyMessage="Sem defensores cadastrados."
              rowIndex={6}
            />
            <PositionBlock
              title="Meio-campo"
              players={elencoPorPosicao.meioCampo}
              emptyMessage="Sem jogadores de meio-campo cadastrados."
              rowIndex={7}
            />
            <PositionBlock
              title="Atacantes"
              players={elencoPorPosicao.atacantes}
              emptyMessage="Sem atacantes cadastrados."
              rowIndex={8}
            />
          </div>
        )}
      </section>
    );
  }
);

ElencoTime.displayName = 'ElencoTime';

export default ElencoTime;
