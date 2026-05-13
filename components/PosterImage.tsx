import React from 'react';
import { getProxyUrl } from '@/utils/imageProxy';

/**
 * PosterImage — Componente padrão de imagem conforme PRD (Step 2002).
 * Simples, rápido e sem efeitos de blur/canvas.
 */

interface PosterImageProps {
  src: string;
  alt?: string;
  width?: number;
  className?: string;
}

const PosterImage: React.FC<PosterImageProps> = ({
  src,
  alt = '',
  width = 500,
  className = '',
}) => {
  const imageType = width <= 300 ? 'poster' : width <= 780 ? 'backdrop' : 'poster';
  const proxyUrl = getProxyUrl(src, { imageType });

  return (
    <img
      src={proxyUrl}
      alt={alt}
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
