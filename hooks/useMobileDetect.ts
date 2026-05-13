import { useState, useEffect } from 'react';
import { isTvMode } from '@/utils/isTvMode';

/**
 * Detects if the current device is a mobile phone.
 * Rules: touch device + screen width < 768px + NOT a TV Box.
 * TV Boxes are never treated as mobile even if they have small screens.
 */
export function useMobileDetect(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (isTvMode()) return false;
    const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    return touch && window.innerWidth < 768;
  });

  useEffect(() => {
    if (isTvMode()) return;

    const check = () => {
      const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
      setIsMobile(touch && window.innerWidth < 768);
    };

    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}
