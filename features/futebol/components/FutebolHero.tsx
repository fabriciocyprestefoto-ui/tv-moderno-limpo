import React, { memo, useState, useEffect } from 'react';
import '@/features/futebol/futebolVisionOS.css';
import { playSelectSound } from '@/utils/soundEffects';
import { isTVBox } from '@/utils/tvBoxDetector';

const BANNER_URLS = [
  '/futebol.webp',
  'https://wsrv.nl/?url=' + encodeURIComponent('https://m.media-amazon.com/images/S/le-target-images-prod/amzn1.dv.gti.2ee71db1-c1cf-4056-ac00-1e9282374c66/1/HERO-16X9/pt-BR/1920x1080._UR1920,1080_SX1920_FMwebp_.png') + '&q=80&w=1920&output=webp',
  'https://wsrv.nl/?url=' + encodeURIComponent('https://m.media-amazon.com/images/S/sonata-images-prod/LATCANZ_Brasileirao2026_evergreen/edb5d6d1-4a91-452b-a7c5-24a1b692a977._UR1936,1089_SX3840_FMwebp_.jpeg') + '&q=80&w=1920&output=webp',
  'https://wsrv.nl/?url=' + encodeURIComponent('https://m.media-amazon.com/images/S/sonata-images-prod/LATCANZ_Premiereevergreen_Brasileirao2026/7f32b5b4-c388-41a2-bdf4-f275baf92146._SX3840_FMwebp_.jpeg') + '&q=80&w=1920&output=webp'
];

const PLACEHOLDER_BADGE = '/logored.webp';

export interface FutebolTeamFilter {
  key: string;
  teamId: string;
  name: string;
  badge: string;
}

interface FutebolHeroProps {
  teamFilters: FutebolTeamFilter[];
  loadingTeams: boolean;
  onSelectTeam: (teamName: string | null, explicitId?: string | null) => void;
}

function shouldPauseLogos(): boolean {
  if (typeof document === 'undefined') return false;
  return isTVBox() || typeof window.Capacitor !== 'undefined';
}

const FutebolHeroComponent: React.FC<FutebolHeroProps> = ({
  teamFilters,
  loadingTeams,
  onSelectTeam,
}) => {
  const [currentBanner, setCurrentBanner] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failedBadges, setFailedBadges] = useState<Set<string>>(new Set());
  const animPaused = paused || shouldPauseLogos();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % BANNER_URLS.length);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const tripledTeams = [...teamFilters, ...teamFilters, ...teamFilters];

  return (
    <div className="flex flex-col w-full relative min-h-screen">
      {/* Banner — Mesma estrutura da Home/Séries com efeito Slide */}
      <div className="flex-1 min-h-0 overflow-hidden relative" data-nav-row={0}>
        <div className="absolute inset-0 bg-black">
          {/* Track de banners para efeito Slide */}
          <div
            className="flex h-full w-full transition-transform duration-1000 ease-in-out"
            style={{ transform: `translateX(-${currentBanner * 100}%)` }}
          >
            {BANNER_URLS.map((url) => (
              <div
                key={url}
                className="w-full h-full shrink-0 bg-cover bg-center no-repeat"
                style={{ backgroundImage: `url('${url}')` }}
              />
            ))}
          </div>
          {/* Overlay gradiente suave no fundo para transição fluida */}
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#020611] via-[#020611]/60 to-transparent z-10" />
        </div>
      </div>

      {/* Logos dos times — Estilo Card de Vidro da Home */}
      <div
        className="relative z-30 w-full flex items-center justify-center -mt-[120px]"
        data-nav-row="1"
      >
        <div className="relative z-20 overflow-hidden flex flex-col w-full py-5">
          <div className="relative flex items-center justify-center w-full z-10">
            <div className="relative w-full mx-auto flex items-center justify-center">
              <div className="relative w-full overflow-hidden">
                {/* Gradientes de fade nas bordas */}
                <div className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none bg-gradient-to-r from-[#020611] to-transparent" />
                <div className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none bg-gradient-to-l from-[#020611] to-transparent" />

                <div
                  className={`fut-team-track flex gap-4 py-5 px-8 ${animPaused ? 'fut-team-paused' : ''}`}
                >
                  {tripledTeams.map((team, index) => (
                    <div
                      key={`${team.key}-${index}`}
                      onClick={() => {
                        playSelectSound();
                        onSelectTeam(team.name, team.teamId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          playSelectSound();
                          onSelectTeam(team.name, team.teamId);
                        }
                      }}
                      onFocus={() => setPaused(true)}
                      onBlur={() => setPaused(false)}
                      tabIndex={0}
                      role="button"
                      data-nav-item
                      data-nav-col={index}
                      title={team.name}
                      aria-label={`Abrir página de ${team.name}`}
                      className="fut-hero-team-chip shrink-0 w-[90px] h-[53px] rounded-2xl flex items-center justify-center p-2.5 cursor-pointer
                        focus:outline-none focus:ring-2 focus:ring-purple-400/60 focus:bg-white/10"
                    >
                      {failedBadges.has(team.key) ? (
                        <span className="text-[9px] font-bold text-white/70 text-center leading-tight px-1 truncate w-full">
                          {team.name}
                        </span>
                      ) : (
                        <img
                          src={team.badge || PLACEHOLDER_BADGE}
                          alt={team.name}
                          loading="lazy"
                          className="w-full h-full object-contain filter drop-shadow-lg"
                          onError={() =>
                            setFailedBadges((prev) => {
                              const next = new Set(prev);
                              next.add(team.key);
                              return next;
                            })
                          }
                        />
                      )}
                    </div>
                  ))}

                  {!teamFilters.length && loadingTeams ? (
                    <div className="h-[53px] px-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md text-[11px] font-bold text-white/60 flex items-center justify-center shrink-0">
                      Carregando times...
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fut-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-100% / 3)); }
        }
        .fut-team-track {
          animation: fut-scroll 45s linear infinite;
        }
        .fut-team-track:hover,
        .fut-team-track:focus-within,
        .fut-team-paused {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export const FutebolHero = memo(FutebolHeroComponent);
