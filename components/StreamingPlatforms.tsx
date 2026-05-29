import React, { useState, useRef, useCallback } from 'react';
import { playSelectSound } from '@/utils/soundEffects';
import { publicAssetUrl } from '@/utils/publicAssetUrl';

export interface Platform {
  name: string;
  id: number | null;
  logo: string;
  banner?: string;
  brandColor: string;
  gradient: string;
}

const PLATFORM_BANNER_VERSION = '20260521';

const platformBanner = (file: string) =>
  publicAssetUrl(`redx_all_banners_webp/${file}`, PLATFORM_BANNER_VERSION);

export const platforms: Platform[] = [
  {
    name: 'Netflix',
    id: 8,
    logo: '/logos/netflix.svg',
    banner: platformBanner('netflix.webp'),
    brandColor: '#E50914',
    gradient: 'linear-gradient(135deg, #E50914 0%, #B81D24 100%)',
  },
  {
    name: 'Prime Video',
    id: 119,
    logo: '/logos/primevideo.png',
    banner: platformBanner('prime-video.webp'),
    brandColor: '#00A8E1',
    gradient: 'linear-gradient(135deg, #00A8E1 0%, #0077B6 100%)',
  },
  {
    name: 'Disney+',
    id: 337,
    logo: '/logos/Logo_do_aplicativo_disney_unknown_001.svg',
    banner: platformBanner('disney-plus.webp'),
    brandColor: '#0063E5',
    gradient: 'linear-gradient(135deg, #0063E5 0%, #001D5B 100%)',
  },
  {
    name: 'Max',
    id: 1899,
    logo: '/logos/Logo_do_aplicativo_Max_unknown_005.svg',
    banner: platformBanner('hbo-max.webp'),
    brandColor: '#002BE7',
    gradient: 'linear-gradient(135deg, #002BE7 0%, #001D5B 100%)',
  },
  {
    name: 'Globoplay',
    id: 307,
    logo: '/logos/Logo_da_globoplay_banner_020.svg',
    banner: platformBanner('globoplay.webp'),
    brandColor: '#FF6B00',
    gradient: 'linear-gradient(135deg, #FF6B00 0%, #CC5500 100%)',
  },
  {
    name: 'Apple TV+',
    id: 350,
    logo: '/logos/appletv.svg',
    banner: platformBanner('apple-tv-plus.webp'),
    brandColor: '#555555',
    gradient: 'linear-gradient(135deg, #555555 0%, #333333 100%)',
  },
  {
    name: 'Paramount+',
    id: 531,
    logo: '/logos/Logotipo_da_empresa_logo_044.png',
    banner: platformBanner('paramount-plus.webp'),
    brandColor: '#0064FF',
    gradient: 'linear-gradient(135deg, #0064FF 0%, #003A99 100%)',
  },
  {
    name: 'Crunchyroll',
    id: 283,
    logo: '/logos/Logo_crunchyroll_logo_031.png',
    banner: platformBanner('crunchyroll.webp'),
    brandColor: '#F47521',
    gradient: 'linear-gradient(135deg, #F47521 0%, #D65F1A 100%)',
  },
  {
    name: 'Claro TV',
    id: 167,
    logo: '/logos/Logo_Claro_tv+_banner_012.svg',
    banner: platformBanner('claro-tv-plus.webp'),
    brandColor: '#E60000',
    gradient: 'linear-gradient(135deg, #E60000 0%, #B30000 100%)',
  },
  {
    name: 'Warner Bros',
    id: null,
    logo: '/logos/Logo_Warner_Channel_logo_164.png',
    banner: platformBanner('wbtv.webp'),
    brandColor: '#0047AB',
    gradient: 'linear-gradient(135deg, #0047AB 0%, #003380 100%)',
  },
  {
    name: 'Universal+',
    id: 2526,
    logo: '/logos/universal+_horizontal_005.png',
    banner: platformBanner('universal-plus.webp'),
    brandColor: '#1A1A2E',
    gradient: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)',
  },
];

interface StreamingPlatformsProps {
  onSelectPlatform?: (platformName: string) => void;
}

const StreamingPlatforms: React.FC<StreamingPlatformsProps> = ({ onSelectPlatform }) => {
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleLogoError = useCallback((platformName: string) => {
    setFailedLogos((prev) => new Set(prev).add(platformName));
  }, []);

  const handlePlatformClick = useCallback(
    (name: string) => {
      playSelectSound();
      onSelectPlatform?.(name);
    },
    [onSelectPlatform]
  );

  // Scroll the focused item into the center of the visible area
  const handleItemFocus = useCallback((el: HTMLDivElement | null) => {
    if (!el || !scrollRef.current) return;
    const container = scrollRef.current;
    const itemLeft = el.offsetLeft;
    const itemWidth = el.offsetWidth;
    const containerWidth = container.offsetWidth;
    const targetScroll = itemLeft - containerWidth / 2 + itemWidth / 2;
    container.scrollTo({ left: targetScroll, behavior: 'smooth' });
  }, []);

  // ArrowLeft/ArrowRight navigation between platform items
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        playSelectSound();
        onSelectPlatform?.(platforms[index].name);
        return;
      }

      // Deixar setas verticais passarem para o motor global do app
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return;

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      const items = scrollRef.current?.querySelectorAll<HTMLElement>('[data-platform-item]');
      if (!items) return;

      // Se estiver no primeiro item e pressionar Esquerda, NAO prevenir default — deixa o motor espacial global levar pro Sidebar
      if (e.key === 'ArrowLeft' && index === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const len = items.length;
      const next =
        e.key === 'ArrowRight' ? items[(index + 1) % len] : items[(index - 1 + len) % len];
      next?.focus({ preventScroll: true });
    },
    [onSelectPlatform]
  );

  return (
    <div className="relative z-20 flex flex-col w-full py-3 -mt-[0.3cm]">
      <div className="relative w-full">
        {/* Gradientes de fade nas bordas */}
        <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-black/60 to-transparent" />
        <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-black/60 to-transparent" />

        {/* Container de scroll — overflow-x:auto com scrollbar oculta */}
        <div ref={scrollRef} className="w-full overflow-x-auto platform-scroll-container">
          <div className="platform-track flex gap-2.5 py-3 px-5" data-nav-row={2}>
            {platforms.map((platform, index) => {
              return (
                <div
                  key={`${platform.name}-${index}`}
                  onClick={() => handlePlatformClick(platform.name)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Filtrar catálogo por ${platform.name}`}
                  data-nav-item=""
                  data-platform-item={index}
                  data-nav-col={index}
                  className="platform-logo-glass pointer-events-auto"
                  onFocus={(e) => {
                    handleItemFocus(e.currentTarget as HTMLDivElement);
                  }}
                  onBlur={() => {}}
                >
                  {failedLogos.has(platform.name) ? (
                    <span className="text-[9px] font-bold text-white/70 text-center leading-tight px-1 truncate w-full text-center">
                      {platform.name}
                    </span>
                  ) : (
                    <img
                      src={platform.logo}
                      alt=""
                      aria-hidden
                      loading={index < 4 ? 'eager' : 'lazy'}
                      width={128}
                      height={56}
                      className="platform-logo-img w-full h-full object-contain transition-opacity duration-300"
                      style={{
                        filter: 'brightness(0) invert(1)',
                        WebkitFilter: 'brightness(0) invert(1)',
                        opacity: 0.9,
                      }}
                      onError={() => handleLogoError(platform.name)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .platform-track {
          transform: translateX(0);
        }
        /* Scrollbar oculta em todos os navegadores */
        .platform-scroll-container {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .platform-scroll-container::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default React.memo(StreamingPlatforms);

