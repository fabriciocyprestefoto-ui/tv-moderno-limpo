/**
 * useLiteMode.ts
 * Hook React que acompanha o estado do lite mode.
 * Reage ao CustomEvent 'redx-lite-mode-change' disparado por applyLiteMode().
 * Valor inicial lido sincronamente (sem flash de conteúdo pesado no primeiro frame).
 */

import { useState, useEffect } from 'react';
import { isLiteMode } from '../utils/liteMode';

export function useLiteMode(): boolean {
  const [lite, setLite] = useState<boolean>(isLiteMode);

  useEffect(() => {
    const handler = (e: Event) => {
      setLite((e as CustomEvent<{ lite: boolean }>).detail.lite);
    };
    window.addEventListener('redx-lite-mode-change', handler);
    // Sincroniza caso o modo tenha mudado entre o render e o efeito
    setLite(isLiteMode());
    return () => window.removeEventListener('redx-lite-mode-change', handler);
  }, []);

  return lite;
}
