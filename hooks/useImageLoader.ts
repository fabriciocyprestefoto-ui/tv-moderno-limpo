import { useState, useEffect } from 'react';
import { preloadImage, abortPreload } from '../utils/imagePreloadQueue';

function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const s = url.trim();
  if (s.length < 10) return false;
  if (s.includes('undefined') || s.includes('null')) return false;
  return /^(https?:\/\/|data:)/i.test(s);
}

export type ImageLoadStatus = 'loading' | 'loaded' | 'error';

/**
 * Hook que precarrega imagem via fila (concorrência: imagePreloadQueue.MAX_CONCURRENT).
 * Retorna status: loading | loaded | error.
 * Aborta ao desmontar.
 */
export function useImageLoader(url: string | null | undefined): ImageLoadStatus {
  const [status, setStatus] = useState<ImageLoadStatus>(() => {
    if (!isValidImageUrl(url)) return 'error';
    return 'loading';
  });

  useEffect(() => {
    if (!isValidImageUrl(url)) {
      setStatus('error');
      return;
    }

    const safeUrl = url as string;
    setStatus('loading');
    let cancelled = false;

    preloadImage(safeUrl).then((success) => {
      if (cancelled) return;
      setStatus(success ? 'loaded' : 'error');
    });

    return () => {
      cancelled = true;
      abortPreload(safeUrl);
    };
  }, [url]);

  return status;
}
