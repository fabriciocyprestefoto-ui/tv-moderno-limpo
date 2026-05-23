import { useEffect, useState } from 'react';

/**
 * Retorna `true` se as animações devem ser reduzidas/desativadas.
 *
 * Combina dois sinais:
 *  1. Media query `(prefers-reduced-motion: reduce)` — preferência do SO/usuário
 *  2. Classe `low-power` no `<html>` — detectada pelo tvBoxDetector para TV Boxes fracos
 *
 * Reage a mudanças em tempo real na media query (ex.: usuário altera nas configs do SO).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mq.matches || document.documentElement.classList.contains('low-power');
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const update = () => {
      setReduced(mq.matches || document.documentElement.classList.contains('low-power'));
    };

    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    } else if (mq.addListener) {
      // Fallback para WebViews antigas (Firestick / TCL antigo)
      mq.addListener(update);
      return () => mq.removeListener(update);
    }
    return () => {};
  }, []);

  return reduced;
}
