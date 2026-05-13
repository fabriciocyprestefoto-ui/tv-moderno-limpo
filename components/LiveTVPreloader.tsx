import React, { useEffect, useRef } from 'react';
import { channelsService } from '@/services/channelsService';
import { logger } from '@/utils/logger';

/**
 * LiveTVPreloader — Pré-carrega lista de canais em background.
 */
const LiveTVPreloader: React.FC = () => {
  const loadedRef = useRef(false);

  useEffect(() => {
    // PERF-06: Only preload when navigating to /canais, not eagerly on app boot
    if (loadedRef.current) return;

    const checkAndLoad = () => {
      // Só carrega quando o usuário navegar para /canais
      if (window.location.pathname !== '/canais') return;
      if (loadedRef.current) return;
      loadedRef.current = true;
      let mounted = true;
      channelsService
        .loadChannels()
        .then((channels) => {
          if (!mounted) return;
          if (channels?.length) {
            window.__REDX_LIVE_READY = true;
            if (window.__MARK_LIVE_READY) window.__MARK_LIVE_READY();
          }
        })
        .catch((err) => logger.warn('[LiveTVPreloader] Falha ao carregar canais:', err));
    };

    // Check current path
    checkAndLoad();

    // Listen for navigation events to detect when user goes to /canais
    const handlePopState = () => checkAndLoad();
    window.addEventListener('popstate', handlePopState);

    // S3: observe pushState/replaceState com guard para evitar chain de closures
    const win = window as any;
    let patchedByUs = false;
    let originalPushState: typeof history.pushState | null = null;
    let originalReplaceState: typeof history.replaceState | null = null;
    if (!win.__historyPatchedByPreloader) {
      win.__historyPatchedByPreloader = true;
      patchedByUs = true;
      originalPushState = history.pushState;
      originalReplaceState = history.replaceState;
      history.pushState = function (...args) {
        originalPushState!.apply(this, args);
        checkAndLoad();
      };
      history.replaceState = function (...args) {
        originalReplaceState!.apply(this, args);
        checkAndLoad();
      };
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (patchedByUs && originalPushState && originalReplaceState) {
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        win.__historyPatchedByPreloader = false;
      }
    };
  }, []);

  return null;
};

export default LiveTVPreloader;
