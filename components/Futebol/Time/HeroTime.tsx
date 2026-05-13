import React, { memo } from 'react';
import { ChevronLeft, MapPin, Shield, Trophy } from 'lucide-react';
import type { TimeDetalhes } from '@/features/futebol/types';
import { getTeamHero } from '@/services/localImages';

interface HeroTimeProps {
  detalhesTime: TimeDetalhes | null;
  teamId: string;
  onBack: () => void;
}

const HeroTime: React.FC<HeroTimeProps> = memo(({ detalhesTime, teamId, onBack }) => {
  const colorA = detalhesTime?.strColour1 || '#A855F7';
  const colorB = detalhesTime?.strColour2 || '#111827';
  const teamName = detalhesTime?.strTeam || `Time ${teamId}`;
  const description = detalhesTime?.strDescriptionPT || detalhesTime?.strDescriptionEN || '';
  const website =
    detalhesTime?.strWebsite && !/^https?:\/\//i.test(detalhesTime.strWebsite)
      ? `https://${detalhesTime.strWebsite}`
      : detalhesTime?.strWebsite || '';
  const socials = [detalhesTime?.strInstagram, detalhesTime?.strTwitter, detalhesTime?.strFacebook]
    .filter(Boolean)
    .map((value) => {
      if (!value) return null;
      return /^https?:\/\//i.test(value) ? value : `https://${value}`;
    })
    .filter((value): value is string => Boolean(value));
  const leagueLabel = (detalhesTime?.strLeague || 'Serie A').replace(
    /brazilian\s*serie\s*a/i,
    'Brasileirão Serie A'
  );

  const localHero = getTeamHero(teamName);
  return (
    <section className="w-full relative overflow-hidden" data-nav-row="0">
      <div className="absolute inset-0">
        {localHero || detalhesTime?.strTeamBanner ? (
          <img
            src={localHero || (detalhesTime?.strTeamBanner as string)}
            alt={teamName}
            className="w-full h-full object-cover opacity-35"
            loading="lazy"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(125deg, ${colorA} 0%, ${colorB} 65%, #0b0f14 100%)`,
            opacity: 0.82,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d14] via-[#0a0d14]/40 to-transparent" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pt-24 md:pt-28 pb-10 md:pb-14">
        <button
          tabIndex={0}
          data-nav-item
          data-nav-col={0}
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/25 bg-black/30 backdrop-blur-sm text-sm font-bold uppercase tracking-wide outline-none focus:ring-2 focus:ring-white/50"
        >
          <ChevronLeft size={16} />
          Voltar
        </button>

        <div className="flex flex-col md:flex-row md:items-end gap-6">
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-3xl bg-black/25 border border-white/20 p-3 flex items-center justify-center">
            {detalhesTime?.strTeamBadge ? (
              <img
                src={detalhesTime.strTeamBadge}
                alt={teamName}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <Shield size={52} />
            )}
          </div>

          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 border border-white/20 text-[11px] uppercase tracking-[0.18em] font-bold text-white/85">
              <Trophy size={13} className="text-amber-300" />
              Perfil do Clube
            </div>
            <h1 className="mt-3 text-4xl md:text-5xl font-black uppercase tracking-tight">
              {teamName}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/85">
              <span className="flex items-center gap-2">
                <MapPin size={15} />
                {detalhesTime?.strStadium || 'Estadio nao informado'}
              </span>
              <span>Fundacao: {detalhesTime?.intFormedYear || 'Nao informada'}</span>
              <span>Cidade: {detalhesTime?.strStadiumLocation || 'Nao informada'}</span>
              <span>Liga: {leagueLabel}</span>
              {detalhesTime?.intStadiumCapacity ? (
                <span>Capacidade: {detalhesTime.intStadiumCapacity}</span>
              ) : null}
            </div>

            {description ? (
              <p className="mt-4 text-sm text-white/80 max-w-4xl line-clamp-3">{description}</p>
            ) : null}

            {website || socials.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                {website ? (
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-full border border-white/25 bg-black/25 hover:bg-black/35 transition-colors"
                  >
                    Site Oficial
                  </a>
                ) : null}
                {socials.map((item) => (
                  <a
                    key={item}
                    href={item}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-full border border-white/20 bg-black/20 hover:bg-black/30 transition-colors"
                  >
                    {item.replace(/^https?:\/\//i, '').replace(/^www\./i, '')}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
});

HeroTime.displayName = 'HeroTime';

export default HeroTime;
