import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { platforms } from './StreamingPlatforms';
import { platformBannerFallbackUrls } from '@/utils/publicAssetUrl';

interface PlatformFilterBannerProps {
  platformName: string;
  onClearFilter: () => void;
  onSelectPlatform: (name: string) => void;
  showClearButton?: boolean;
  allMedia?: unknown[];
  embedded?: boolean;
}

const PLATFORM_BANNER_VERSION = '20260521';

const PlatformFilterBanner: React.FC<PlatformFilterBannerProps> = ({
  platformName,
  onClearFilter: _onClearFilter,
  onSelectPlatform: _onSelectPlatform,
  showClearButton: _showClearButton = true,
  allMedia: _allMedia = [],
  embedded = false,
}) => {
  const platform = platforms.find((p) => p.name === platformName);

  const bannerCandidates = useMemo(() => {
    if (!platform?.banner) return [] as string[];
    const match = platform.banner.match(/redx_all_banners_webp\/([^?]+)/i);
    const file = match?.[1];
    if (file) {
      return platformBannerFallbackUrls(`redx_all_banners_webp/${file}`, PLATFORM_BANNER_VERSION);
    }
    return [platform.banner];
  }, [platform?.banner]);

  const [bannerIndex, setBannerIndex] = useState(0);

  useEffect(() => {
    setBannerIndex(0);
  }, [platformName, platform?.banner]);

  const backdropUrl = bannerCandidates[bannerIndex] ?? '';

  const handleBannerError = useCallback(() => {
    setBannerIndex((current) =>
      current + 1 < bannerCandidates.length ? current + 1 : current
    );
  }, [bannerCandidates.length]);

  return (
    /* Mesmas dimensoes exatas do HeroBanner na Home */
    <div
      className={`mt-0 relative z-0 w-full flex flex-col ${embedded ? 'h-full' : 'h-screen min-h-screen'}`}
      style={{
        marginLeft: embedded ? undefined : 'calc(-1 * var(--sidebar-w))',
        width: embedded ? '100%' : 'calc(100% + var(--sidebar-w))',
        minHeight: embedded ? '100vh' : undefined,
      }}
      data-nav-row="1"
    >
      <div className="flex-1 min-h-0 overflow-hidden relative" style={{ minHeight: embedded ? '50vh' : undefined }}>
        <div
          className="absolute inset-0 w-full h-full"
          style={{ background: platform?.brandColor ?? '#1a1a2e' }}
        />

        {backdropUrl && (
          <div className="absolute inset-0 w-full h-full">
            <img
              key={backdropUrl}
              src={backdropUrl}
              alt={platformName}
              loading="eager"
              decoding="async"
              className="w-full h-full object-cover"
              onError={handleBannerError}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformFilterBanner;
