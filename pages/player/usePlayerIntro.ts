/**
 * pages/player/usePlayerIntro.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Gerencia o ciclo de vida da vinheta de introdução do Player (Kids ou padrão).
 *
 * Responsabilidades:
 *   1. Timeout de segurança (INTRO_SAFETY_MS): fecha a intro se o vídeo travar.
 *   2. Auto-play da intro com delay de 300ms (WebView precisa do micro-delay).
 *   3. Escolha de uma única fonte de intro por troca real de playback.
 *
 * Extraído de Player.tsx para separar responsabilidades.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { PLAYER_INTRO_TIMEOUT_MS } from '../../config/playerDefaults';
import { isLegacyHtml5OnlyTV } from '../../utils/tvBoxDetector';
import { playWhenVideoReady, prepareVideoForAutoplay } from '../../utils/videoAutoplay';

const INTRO_SAFETY_MS = PLAYER_INTRO_TIMEOUT_MS;

interface UsePlayerIntroOptions {
  showIntro: boolean;
  introVideoSrc: string | null | undefined;
  introVideoRef: RefObject<HTMLVideoElement | null>;
  introTimeoutRef: RefObject<number | null>;
  defaultIntroConsumedRef: RefObject<boolean>;
  /** Valor de `media.stream_url` — mudança dispara reset da intro */
  streamUrl: string | null | undefined;
  /** Valor de `media.introVideoUrl` — mudança dispara reset da intro */
  introVideoUrl: string | null | undefined;
  /** Vinheta global já exibida em VinhetaGate antes de montar o Player. */
  skipIntro?: boolean;
  setShowIntro: (value: boolean) => void;
}

/**
 * Hook que encapsula os três useEffect relacionados à vinheta de introdução:
 *
 * 1. **Safety timeout**: se a intro não terminar sozinha (video `ended`),
 *    `INTRO_SAFETY_MS` garante que o player principal sobe de qualquer forma.
 *
 * 2. **Auto-play delay**: inicia a reprodução da intro com 300ms de delay —
 *    necessário em Android WebView para o elemento `<video>` estar pronto.
 *
 * 3. **Intro por playback**: só abre a vinheta quando a combinação
 *    `stream_url + introVideoSrc` muda. Isso evita trocar para uma vinheta
 *    antiga/intermediária durante a abertura do Player.
 */
export function usePlayerIntro({
  showIntro,
  introVideoSrc,
  introVideoRef,
  introTimeoutRef,
  defaultIntroConsumedRef,
  streamUrl,
  introVideoUrl,
  skipIntro = false,
  setShowIntro,
}: UsePlayerIntroOptions): void {
  const lastIntroPlaybackKeyRef = useRef<string | null>(null);
  const introFallbackCloseTimerRef = useRef<number | null>(null);

  // ── 1. Safety timeout ────────────────────────────────────────────────────
  useEffect(() => {
    const ref = introTimeoutRef as MutableRefObject<number | null>;
    if (showIntro && introVideoSrc) {
      ref.current = window.setTimeout(() => setShowIntro(false), INTRO_SAFETY_MS);
    }
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, [showIntro, introVideoSrc, introTimeoutRef, setShowIntro]);

  // ── 2. Auto-play com micro-delay ─────────────────────────────────────────
  useEffect(() => {
    if (!showIntro || !introVideoSrc) return;
    let cancelled = false;
    let cleanupReadyPlay: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      if (cancelled || !introVideoRef.current) return;
      const video = introVideoRef.current;
      // Vinheta sempre muted — Firestick (WebView legado) e Android TV moderno
      // não permitem autoplay com som; vinheta nunca toca som independente do device.
      prepareVideoForAutoplay(video, true);
      cleanupReadyPlay = playWhenVideoReady(video, {
        mutedFirst: true,
        mutedFallback: true,
      });
      // Fallback de erro real: só fecha cedo se MediaError ocorreu (codec ausente,
      // ficheiro corrompido). `video.paused` sozinho não distingue "carregando lento"
      // de "falhou" no Firestick — usar erro explícito evita fechar a vinheta
      // antes dela carregar em hardware lento. Timeout máximo é INTRO_SAFETY_MS.
      const errorCheckTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (video.error || video.networkState === 3 /* NETWORK_NO_SOURCE */) {
          setShowIntro(false);
        }
      }, 2500);
      introFallbackCloseTimerRef.current = errorCheckTimer;
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cleanupReadyPlay?.();
      if (introFallbackCloseTimerRef.current) {
        window.clearTimeout(introFallbackCloseTimerRef.current);
        introFallbackCloseTimerRef.current = null;
      }
    };
  }, [showIntro, introVideoSrc, introVideoRef, setShowIntro]);

  // ── 3. Decide intro por playback ─────────────────────────────────────────
  useEffect(() => {
    const source = (introVideoSrc && String(introVideoSrc).trim()) || '';
    const explicit = (introVideoUrl && String(introVideoUrl).trim()) || '';
    const introMode = explicit ? 'explicit' : 'default';
    const playbackKey = `${streamUrl || ''}::${introMode}::${source}`;

    if (!source) {
      lastIntroPlaybackKeyRef.current = playbackKey;
      setShowIntro(false);
      return;
    }

    if (lastIntroPlaybackKeyRef.current === playbackKey) return;
    lastIntroPlaybackKeyRef.current = playbackKey;

    if (skipIntro) {
      setShowIntro(false);
      return;
    }

    if (explicit) {
      // Intro dedicada (Kids, etc.) — exibe sempre que trocar
      setShowIntro(true);
      return;
    }
    if (isLegacyHtml5OnlyTV()) {
      setShowIntro(false);
      return;
    }
    const consumed = (defaultIntroConsumedRef as MutableRefObject<boolean>).current;
    if (!consumed) {
      // Primeira abertura do player: exibe a vinheta global e marca como consumida
      (defaultIntroConsumedRef as MutableRefObject<boolean>).current = true;
      setShowIntro(true);
    }
    // Se já consumida (troca de episódio), não repete a vinheta global
  }, [streamUrl, introVideoUrl, introVideoSrc, skipIntro, defaultIntroConsumedRef, setShowIntro]);
}
