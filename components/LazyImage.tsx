import React, { useState, useRef, useEffect } from 'react';
import { extractOriginalUrl, getResponsiveImageSrcSet } from '../utils/imageProxy';
import { isTVBox } from '../utils/tvBoxDetector';

/** Base64 seguro para SVG com caracteres Unicode (evita btoa quebrar com acentos) */
function safeBtoa(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

const PLACEHOLDER_SVG =
  'data:image/svg+xml;base64,' +
  safeBtoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
      '<rect fill="#1c1c28" width="400" height="400"/>' +
      '<rect fill="#2a2a3e" x="150" y="140" width="100" height="120" rx="10"/>' +
      '</svg>'
  );

const ERROR_SVG =
  'data:image/svg+xml;base64,' +
  safeBtoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">' +
      '<rect fill="#1a1a2e" width="400" height="600"/>' +
      '<text fill="#6b7280" font-family="Arial" font-size="12" text-anchor="middle" x="200" y="310">Imagem Indisponível</text>' +
      '</svg>'
  );

/** Valida URL antes de tentar carregar — evita img quebrado */
function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const s = url.trim();
  if (s.length < 10) return false;
  if (s.includes('undefined') || s.includes('null')) return false;
  // Aceita: https, data, e URLs relativas do proxy em dev (/img-proxy/)
  return /^(https?:\/\/|data:|\/)/i.test(s);
}

export interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string;
  fallbackSrc?: string;
  showSkeleton?: boolean;
  objectFit?: 'cover' | 'contain' | 'fill';
  eager?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
  width?: number;
  height?: number;
  sizes?: string;
  imageType?: 'poster' | 'backdrop';
  style?: React.CSSProperties;
  onLoad?: () => void;
}

const LazyImage: React.FC<LazyImageProps> = React.memo(
  ({
    src,
    alt,
    className = '',
    aspectRatio,
    fallbackSrc,
    showSkeleton = true,
    objectFit = 'cover',
    eager = false,
    fetchPriority,
    width,
    height,
    sizes,
    imageType = 'poster',
    style,
    onLoad: onLoadProp,
  }) => {
    const isValid = isValidImageUrl(src);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(!isValid);
    const [shouldLoad, setShouldLoad] = useState(eager || !isValid);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const triedOriginalRef = useRef(false);
    const triedTimeoutFallbackRef = useRef(false);
    const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCountRef = useRef(0);
    // 1 retry: src já é WebP/wsrv; única queda útil é p/ TMDB JPEG original. Falha mais rápida.
    const MAX_RETRIES = 1;

    // Timeout adaptativo: TV Box 2.5s, desktop 1.5s. Antes 5s/2s prendia o skeleton longo demais.
    const LOAD_TIMEOUT_MS = isTVBox() ? 2500 : 1500;

    // Reset states when src changes; URL inválida = erro imediato
    useEffect(() => {
      const valid = isValidImageUrl(src);
      setIsLoaded(false);
      setHasError(!valid);
      setShouldLoad(eager || !valid);
      triedOriginalRef.current = false;
      triedTimeoutFallbackRef.current = false;
      retryCountRef.current = 0;
    }, [src, eager]);

    useEffect(() => {
      if (!isValid || eager || shouldLoad) return;
      const host = containerRef.current;
      if (!host) {
        setShouldLoad(true);
        return;
      }
      if (typeof IntersectionObserver !== 'function') {
        setShouldLoad(true);
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        },
        // TV Box: rede lenta → pré-carregar mais cedo (400px). Desktop: 200px suficiente.
        { rootMargin: isTVBox() ? '400px 0px' : '200px 0px' }
      );
      observer.observe(host);
      // Rede de seguranca: em alguns WebView de TV o IntersectionObserver nao dispara de forma
      // confiavel para cards dentro de carrosseis virtualizados -> o poster ficava preso no
      // skeleton (so o logo aparecia). Forca o load apos um curto periodo. As linhas ja sao
      // virtualizadas, entao isto afeta apenas os cards montados/visiveis.
      const fallbackTimer = isTVBox()
        ? window.setTimeout(() => setShouldLoad(true), 800)
        : null;
      return () => {
        observer.disconnect();
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
      };
    }, [eager, isValid, shouldLoad]);

    // Timeout: se a imagem demora, primeiro tenta a URL original (proxy lento) e dá
    // uma SEGUNDA janela antes de desistir. Evita marcar "Indisponível" cedo demais
    // em rede de TV Box lenta (causava o efeito de piscar/quebrar falso).
    useEffect(() => {
      if (!shouldLoad || isLoaded || hasError) return;
      let secondTimer: ReturnType<typeof setTimeout> | null = null;
      const giveUp = () => {
        setHasError(true);
        if (imgRef.current && fallbackSrc) imgRef.current.src = fallbackSrc;
      };
      loadTimeoutRef.current = setTimeout(() => {
        loadTimeoutRef.current = null;
        // 1ª janela: proxy lento → trocar para a URL TMDB original e esperar de novo.
        if (!triedTimeoutFallbackRef.current && imgRef.current) {
          const original = extractOriginalUrl(src);
          if (original && original !== src) {
            triedTimeoutFallbackRef.current = true;
            imgRef.current.src = original;
            secondTimer = setTimeout(giveUp, LOAD_TIMEOUT_MS);
            return;
          }
        }
        // Sem fallback possível ou já tentado → desistir.
        giveUp();
      }, LOAD_TIMEOUT_MS);
      return () => {
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        if (secondTimer) clearTimeout(secondTimer);
      };
    }, [src, shouldLoad, isLoaded, hasError, fallbackSrc]);

    const handleLoad = () => {
      // Cancela timeout de fallback imediatamente — imagem carregou com sucesso
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      setIsLoaded(true);
      onLoadProp?.();
    };

    const handleError = () => {
      const retries = retryCountRef.current;

      // Retry layer 1: proxy WebP falhou — tentar URL TMDB original
      if (
        retries < MAX_RETRIES &&
        (src.includes('wsrv.nl') || src.includes('images.weserv.nl') || src.includes('/img-proxy/'))
      ) {
        retryCountRef.current = retries + 1;
        const originalUrl = extractOriginalUrl(src);
        if (originalUrl && originalUrl !== src && imgRef.current) {
          imgRef.current.src = originalUrl;
          return;
        }
      }

      // Retry layer 2: TMDB direta falhou — tentar wsrv.nl WebP como fallback (compressão melhora velocidade)
      if (retries < MAX_RETRIES && src.includes('image.tmdb.org') && imgRef.current) {
        retryCountRef.current = retries + 1;
        const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=500&output=webp&q=80`;
        imgRef.current.src = wsrvUrl;
        return;
      }

      // Todas as tentativas falharam — marcar erro e usar fallback
      setHasError(true);
      if (imgRef.current && fallbackSrc) {
        imgRef.current.src = fallbackSrc;
      }
    };

    // URL inválida: nunca renderizar img — só fallback (evita ícone quebrado)
    const finalSrc = hasError ? fallbackSrc || ERROR_SVG : src;
    const srcSet = getResponsiveImageSrcSet(src, imageType);
    const responsiveSizes = sizes ?? (imageType === 'backdrop' ? '50vw' : '185px');

    // Durante loading: PLACEHOLDER_SVG. Em erro: fallbackSrc ou ERROR_SVG.
    const fallbackUrl = hasError ? fallbackSrc || ERROR_SVG : PLACEHOLDER_SVG;
    const showFallback = !isLoaded || hasError;

    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden ${className}`}
        style={{
          aspectRatio: aspectRatio || undefined,
          ...style,
        }}
      >
        {/* Fallback — sempre visível até imagem carregar ou em erro */}
        {showFallback && (
          <img
            src={fallbackUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover z-[0]"
            style={{ objectFit }}
          />
        )}
        {/* Skeleton shimmer durante load */}
        {showFallback && showSkeleton && !hasError && (
          <div className="absolute inset-0 z-[1] pointer-events-none lazy-shimmer" />
        )}

        {/* Img só quando URL válida e ainda tentando — em erro, só fallback (evita ícone quebrado) */}
        {isValid && !hasError && shouldLoad && (
          <img
            ref={imgRef}
            src={finalSrc}
            srcSet={srcSet}
            sizes={srcSet ? responsiveSizes : undefined}
            alt={alt}
            width={width}
            height={height}
            loading={eager ? 'eager' : 'lazy'}
            // React 18: atributo DOM é `fetchpriority` (minúsculo); evita warning no console.
            {...({
              fetchpriority: fetchPriority ?? (eager ? 'high' : 'low'),
            } as React.ImgHTMLAttributes<HTMLImageElement>)}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={handleLoad}
            onError={handleError}
            className={`absolute inset-0 w-full h-full transition-opacity duration-200 ease-out z-[2] ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ objectFit }}
            draggable={false}
          />
        )}
      </div>
    );
  }
);

LazyImage.displayName = 'LazyImage';
export default LazyImage;
export { PLACEHOLDER_SVG, ERROR_SVG };
