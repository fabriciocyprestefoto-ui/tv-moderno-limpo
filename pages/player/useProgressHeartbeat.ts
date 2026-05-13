/**
 * pages/player/useProgressHeartbeat.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persiste o progresso do vídeo em intervalos regulares (a cada HEARTBEAT_MS).
 * Extraído de Player.tsx para separar responsabilidades e facilitar testes.
 *
 * Dependências externas:
 *   - videoRef   : ref para o <video> principal (lido como ref, não causa re-render)
 *   - heartbeatRef: ref do intervalId gerenciado pelo componente pai
 *   - userService.saveProgress: chamada async sem bloqueio
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { userService } from '../../services/userService';
import type { Media } from '../../types';

const HEARTBEAT_MS = 10_000;

interface UseProgressHeartbeatOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  heartbeatRef: RefObject<number | null>;
  media: Media;
  tmdbId: number | string | null | undefined;
  showIntro: boolean;
  streamError: boolean;
}

/**
 * Registra um `setInterval` que salva o progresso de reprodução a cada
 * HEARTBEAT_MS (10 s). O intervalo é reiniciado sempre que `media`,
 * `tmdbId`, `showIntro` ou `streamError` mudarem.
 *
 * O intervalo NÃO salva quando:
 *   - o vídeo está pausado
 *   - a vinheta de intro ainda está sendo exibida
 *   - há erro de stream
 *   - não há tmdbId (conteúdo sem ID TMDB — ex. canal ao vivo)
 */
export function useProgressHeartbeat({
  videoRef,
  heartbeatRef,
  media,
  tmdbId,
  showIntro,
  streamError,
}: UseProgressHeartbeatOptions): void {
  useEffect(() => {
    const ref = heartbeatRef as React.MutableRefObject<number | null>;
    if (ref.current) {
      clearInterval(ref.current);
      ref.current = null;
    }

    ref.current = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || !tmdbId || showIntro || streamError) return;

      const percent = video.currentTime / (video.duration || 1);
      const isWatched = percent > 0.95;

      void userService.saveProgress(
        tmdbId,
        media.type,
        isWatched ? 0 : video.currentTime,
        video.duration,
        media.season_number,
        media.episode_number
      );
    }, HEARTBEAT_MS);

    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [media, tmdbId, showIntro, streamError, videoRef, heartbeatRef]);
}
