import React from 'react';
import { getProxyUrl, getResponsiveImageSrcSet } from '@/utils/imageProxy';

/**
 * PosterImage — Componente padrão de imagem conforme PRD (Step 2002).
 * Simples, rápido e sem efeitos de blur/canvas.
 */

interface PosterImageProps {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  sizes?: string;
  imageType?: 'poster' | 'backdrop';
  className?: string;
}

const PosterImage: React.FC<PosterImageProps> = ({
  src,
  alt = '',
  width = 500,
  height,
  sizes,
  imageType = 'poster',
  className = '',
}) => {
  const proxyUrl = getProxyUrl(src, { imageType });
  const srcSet = getResponsiveImageSrcSet(proxyUrl, imageType);

  return (
    <img
      src={proxyUrl}
      srcSet={srcSet}
      sizes={srcSet ? sizes ?? `${width}px` : undefined}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={className}
      crossOrigin="anonymous"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.opacity = '0';
      }}
    />
  );
};

export default React.memo(PosterImage);
