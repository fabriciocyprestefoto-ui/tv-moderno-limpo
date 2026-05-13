import React, { useState, useMemo } from 'react';
import { getProxyUrl } from '@/utils/imageProxy';

/**
 * NetflixImage — Componente de imagem otimizado para TV Box.
 * Focado em estabilidade e performance via getProxyUrl (WebP/wsrv para TMDB).
 */

interface NetflixImageProps {
  src: string;
  alt: string;
  imageType?: 'poster' | 'backdrop' | 'logo' | 'preview';
  className?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
}

const NetflixImage: React.FC<NetflixImageProps> = ({
  src,
  alt,
  imageType = 'poster',
  className = '',
  aspectRatio,
  objectFit = 'cover',
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // URL Otimizada via Proxy conforme PRD
  const imageUrl = useMemo(() => getProxyUrl(src, { format: 'avif', imageType }), [src, imageType]);

  if (!src || hasError) {
    return (
      <div
        className={`bg-zinc-900 flex items-center justify-center text-[10px] text-zinc-600 ${className}`}
        style={{ aspectRatio }}
      >
        {!src ? '' : 'Erro'}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-black/20 ${className}`}
      style={{ aspectRatio, contentVisibility: 'auto' }}
    >
      <img
        src={imageUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`w-full h-full transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        style={{ objectFit }}
        crossOrigin="anonymous"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
};

export default React.memo(NetflixImage);
