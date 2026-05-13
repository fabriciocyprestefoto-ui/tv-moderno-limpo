import React from 'react';
import { useImageLoader } from '../../hooks/useImageLoader';

function safeBtoa(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

const FALLBACK_SVG =
  'data:image/svg+xml;base64,' +
  safeBtoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">' +
      '<rect fill="#1a1a2e" width="400" height="600"/>' +
      '<text fill="#6b7280" font-family="Arial" font-size="12" text-anchor="middle" x="200" y="310">Imagem Indisponível</text>' +
      '</svg>'
  );

export interface PosterCardProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
}

/**
 * PosterCard — carrega imagem via preload (imagePreloadQueue: menos concorrentes em TV Box).
 * Só exibe img após load completo. Skeleton durante loading. Fallback em erro.
 * Não recebe foco (D-Pad).
 */
const PosterCard: React.FC<PosterCardProps> = React.memo(
  ({
    src,
    alt,
    className = '',
    aspectRatio = '2/3',
    objectFit = 'cover',
    loading = 'lazy',
    onLoad,
  }) => {
    const status = useImageLoader(src);

    return (
      <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio }}>
        {/* Skeleton shimmer — loading (Netflix style, GPU-safe) */}
        {status === 'loading' && (
          <div className="absolute inset-0 bg-[#16161e] z-[0] overflow-hidden">
            <div className="absolute inset-0 skeleton" style={{ borderRadius: 0 }} />
          </div>
        )}

        {/* Fallback — erro */}
        {status === 'error' && (
          <img
            src={FALLBACK_SVG}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover z-[0]"
            style={{ objectFit }}
          />
        )}

        {/* Imagem — só após load (cache do preload), fade-in suave */}
        {status === 'loaded' && (
          <img
            src={src}
            alt={alt}
            loading={loading}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={onLoad}
            className="absolute inset-0 w-full h-full object-cover z-[1] animate-fade-in"
            style={{ objectFit }}
            draggable={false}
          />
        )}
      </div>
    );
  }
);

PosterCard.displayName = 'PosterCard';
export default PosterCard;
