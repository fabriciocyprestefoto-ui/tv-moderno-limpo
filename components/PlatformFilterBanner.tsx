import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { platforms } from './StreamingPlatforms';
import { Media } from '../types';
import { toWebP } from '../utils/imageProxy';
import { getProviderTmdbIds } from '../services/tmdb';

interface PlatformFilterBannerProps {
  platformName: string;
  onClearFilter: () => void;
  onSelectPlatform: (name: string) => void;
  showClearButton?: boolean;
  allMedia?: Media[];
  embedded?: boolean;
}

/** Constrói URL do backdrop de um item de mídia */
function getBackdrop(media: Media): string {
  const path = (media as any).backdrop_path;
  if (path && typeof path === 'string' && path.startsWith('/')) {
    return toWebP(`https://image.tmdb.org/t/p/w1280${path}`, 'backdrop');
  }
  const url = media.backdrop || (media as any).banner_url || '';
  if (url && url.startsWith('http')) return url;
  return '';
}

const PlatformFilterBanner: React.FC<PlatformFilterBannerProps> = ({
  platformName,
  onClearFilter,
  onSelectPlatform: _onSelectPlatform,
  showClearButton = true,
  allMedia = [],
  embedded = false,
}) => {
  const platform = platforms.find((p) => p.name === platformName);

  // Aliases para fallback de match por campo 'platform' no banco
  const platformAliases: Record<string, string[]> = {
    Netflix: ['netflix'],
    'Prime Video': ['amazon prime video', 'prime video', 'amazon video'],
    'Disney+': ['disney plus', 'disney+'],
    Max: ['hbo max', 'max'],
    Globoplay: ['globoplay'],
    'Apple TV+': ['apple tv', 'apple tv+'],
    'Paramount+': ['paramount plus', 'paramount+'],

    'Pluto TV': ['pluto tv'],
    Crunchyroll: ['crunchyroll'],
    'Claro Video': ['claro video', 'claro tv'],
    'Warner Bros': ['warner'],
  };

  // Busca IDs TMDB da plataforma via TMDB Discover (região BR)
  const [providerIds, setProviderIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (!platform?.id) {
      setProviderIds(null);
      return;
    }
    let cancelled = false;
    getProviderTmdbIds(platform.id)
      .then((ids) => {
        if (!cancelled) setProviderIds(ids);
      })
      .catch(() => {
        if (!cancelled) setProviderIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [platform?.id]);

  // Encontra o backdrop do conteúdo mais novo da plataforma
  const backdropUrl = useMemo(() => {
    const nameKey = String(platformName ?? '').trim();
    const aliases = platformAliases[nameKey] || [nameKey.toLowerCase()];

    const matches = allMedia.filter((m) => {
      // Prioridade 1: match por TMDB Discover
      if (providerIds !== null && m.tmdb_id && providerIds.has(Number(m.tmdb_id))) return true;
      // Prioridade 2: campo 'platform' no banco
      if (m.platform) {
        const p = m.platform.toLowerCase();
        if (aliases.some((a) => p.includes(a))) return true;
      }
      return false;
    });

    // Ordena pelo mais recente
    matches.sort((a, b) => {
      const dateA = (a as any).release_date || (a as any).first_air_date || String(a.year ?? '0');
      const dateB = (b as any).release_date || (b as any).first_air_date || String(b.year ?? '0');
      return dateB.localeCompare(dateA);
    });

    const best = matches.find((m) => getBackdrop(m));
    return best ? getBackdrop(best) : '';
  }, [allMedia, platformName, providerIds]);

  const isLight = platformName === 'Pluto TV';

  return (
    /* Mesmas dimensões exatas do HeroBanner na Home */
    <div
      className={`mt-0 relative z-0 w-full flex flex-col ${embedded ? 'h-full' : 'h-screen min-h-screen'}`}
      style={{
        marginLeft: embedded ? undefined : 'calc(-1 * var(--sidebar-w))',
        width: embedded ? '100%' : 'calc(100% + var(--sidebar-w))',
      }}
      data-nav-row="1"
    >
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {/* Cor base da plataforma */}
        <div
          className="absolute inset-0 w-full h-full"
          style={{ background: platform?.brandColor ?? '#1a1a2e' }}
        />

        {/* Backdrop do filme/série — textura sobre a cor */}
        {backdropUrl && (
          <div className="absolute inset-0 w-full h-full">
            <img
              src={backdropUrl}
              alt={platformName}
              className="w-full h-full object-cover"
              style={{ opacity: 0.5, mixBlendMode: 'luminosity' }}
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        {/* Gradiente de escurecimento suave — preserva a cor */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${platform?.brandColor ?? '#1a1a2e'}99 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.65) 100%)`,
          }}
        />

        {/* Gradiente inferior */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
          style={{
            height: '40%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}
        />

        {/* Glass card — centralizado na tela */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 z-30 flex items-center justify-center"
        >
          <div className="flex flex-col items-center gap-5">
            {/* Logo da plataforma — centralizada */}
            <div className="platform-filter-logo-glass rounded-[1.6rem] px-10 py-7 flex items-center justify-center">
              {platform?.logo ? (
                <img
                  src={platform.logo}
                  alt={platformName}
                  className="platform-logo-img w-auto object-contain"
                  style={{
                    maxHeight: 56,
                    maxWidth: 220,
                    filter: isLight ? 'brightness(0)' : 'brightness(0) invert(1)',
                    WebkitFilter: isLight ? 'brightness(0)' : 'brightness(0) invert(1)',
                  }}
                />
              ) : (
                <span className="text-2xl font-black text-white">{platformName}</span>
              )}
            </div>
            {showClearButton && (
              <button
                type="button"
                onClick={onClearFilter}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClearFilter();
                  }
                }}
                tabIndex={0}
                data-nav-item
                data-nav-col={0}
                aria-label={`Limpar filtro da plataforma ${platformName}`}
                className="rounded-full border border-white/20 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/90 transition-all duration-200 hover:bg-white/12 focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-transparent"
                style={{
                  background: 'rgba(10, 10, 18, 0.28)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                }}
              >
                Voltar ao catálogo
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PlatformFilterBanner;
