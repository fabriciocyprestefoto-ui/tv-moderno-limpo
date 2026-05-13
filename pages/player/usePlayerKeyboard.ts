import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type Hls from 'hls.js';
import {
  getNextResumeAction,
  getPlayerSettingsOptionsCount,
  type ResumeAction,
} from '../../utils/playerTvControls';

const SEEK_STEP = 30;
const CAST_GRID_COLS = 8;
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface PlayerKeyboardConfig {
  // State
  showControls: boolean;
  showSettings: 'none' | 'quality';
  showCast: boolean;
  showResumeOverlay: boolean;
  showIntro: boolean;
  showEpisodes: boolean;
  showSpeedPanel: boolean;
  streamError: boolean;
  focusArea: PlayerFocusArea;
  focusedResumeAction: ResumeAction;
  focusedControlIdx: number;
  focusedCastIdx: number;
  focusedSpeedIdx: number;
  focusedSettingsIdx: number;
  volume: number;
  isMuted: boolean;
  cast: unknown[];
  seasons: unknown[];
  episodes: Array<{ episode_number: number }>;
  focusedSeasonIdx: number;
  focusedEpisodeIdx: number;
  selectedSeasonNum: number;
  playbackRate: number;
  hasEpisodeContext: boolean;
  canBrowseEpisodes: boolean;
  nextEpisode: { title: string; season: number; episode: number } | null | undefined;
  qualities: unknown[];
  // Refs
  videoRef: React.RefObject<HTMLVideoElement | null>;
  resumeCountdownRef: React.MutableRefObject<number | null>;
  hlsRef: React.MutableRefObject<Hls | null>;
  // Setters
  setShowIntro: (v: boolean) => void;
  setShowResumeOverlay: (v: boolean) => void;
  setFocusArea: Dispatch<SetStateAction<PlayerFocusArea>>;
  setFocusedResumeAction: (fn: (prev: ResumeAction) => ResumeAction) => void;
  setShowEpisodes: (v: boolean) => void;
  setFocusedSeasonIdx: (fn: (prev: number) => number) => void;
  setFocusedEpisodeIdx: (fn: (prev: number) => number) => void;
  setShowCast: (v: boolean) => void;
  setFocusedCastIdx: (fn: (prev: number) => number) => void;
  setFocusedControlIdx: (fn: (prev: number) => number) => void;
  setShowSettings: (v: 'none' | 'quality') => void;
  setFocusedSettingsIdx: (fn: (prev: number) => number) => void;
  setShowSpeedPanel: (fn: ((prev: boolean) => boolean) | boolean) => void;
  setFocusedSpeedIdx: (fn: (prev: number) => number) => void;
  setVolume: (v: number) => void;
  setIsMuted: (v: boolean) => void;
  setCurrentQuality: (v: number) => void;
  setCurrentQualityLabel: (v: string) => void;
  // Actions
  togglePlay: () => void;
  seek: (secs: number) => void;
  revealControls: () => void;
  onClose: () => void;
  retryStream: () => void;
  applySpeed: (rate: number) => void;
  continueFromSavedProgress: () => void;
  restartFromBeginning: () => void;
  onSelectEpisode?: (season: number, episode: number) => void;
  onPlayNext?: () => void;
}

type PlayerFocusArea =
  | 'controls'
  | 'settings'
  | 'cast'
  | 'episodes-seasons'
  | 'episodes-list'
  | 'resume'
  | 'speed';

function normalizeKey(e: KeyboardEvent): string {
  let key = e.key || '';
  if (key === 'Up') return 'ArrowUp';
  if (key === 'Down') return 'ArrowDown';
  if (key === 'Left') return 'ArrowLeft';
  if (key === 'Right') return 'ArrowRight';
  if (
    key === 'OK' ||
    key === 'Select' ||
    key === 'OS_OK' ||
    key === 'Return' ||
    key === 'NumpadEnter'
  )
    return 'Enter';
  if (key === 'Back' || key === 'GoBack' || key === 'BrowserBack') return 'Backspace';
  if (key === 'DPAD_UP') return 'ArrowUp';
  if (key === 'DPAD_DOWN') return 'ArrowDown';
  if (key === 'DPAD_LEFT') return 'ArrowLeft';
  if (key === 'DPAD_RIGHT') return 'ArrowRight';
  if (!key) {
    const code = e.keyCode || e.which || 0;
    switch (code) {
      case 19:
        return 'ArrowUp';
      case 20:
        return 'ArrowDown';
      case 21:
        return 'ArrowLeft';
      case 22:
        return 'ArrowRight';
      case 23:
      case 66:
        return 'Enter';
      case 4:
      case 27:
      case 67:
        return 'Backspace';
    }
  }
  return key;
}

export function usePlayerKeyboard(config: PlayerKeyboardConfig): void {
  const cfgRef = useRef(config);
  cfgRef.current = config;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cfg = cfgRef.current;
      const key = normalizeKey(e);

      if (
        !cfg.showControls &&
        cfg.showSettings === 'none' &&
        !cfg.showCast &&
        !cfg.showResumeOverlay
      ) {
        if (key === 'f' || key === 'F') {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else document.documentElement.requestFullscreen().catch(() => {});
          return;
        }
        if (key === ' ') {
          e.preventDefault();
          cfg.togglePlay();
          return;
        }
      }

      if (cfg.streamError) {
        if (key === 'Enter' || key === 'OK') {
          e.preventDefault();
          cfg.retryStream();
        }
        if (key === 'Escape' || key === 'Backspace') {
          e.preventDefault();
          cfg.onClose();
        }
        return;
      }

      if (key === 'Escape' || key === 'Backspace' || key === 'Back') {
        e.preventDefault();
        cfg.revealControls();
        if (cfg.showIntro) {
          cfg.setShowIntro(false);
          return;
        }
        if (cfg.showResumeOverlay) {
          if (cfg.resumeCountdownRef.current) clearTimeout(cfg.resumeCountdownRef.current);
          cfg.videoRef.current?.play().catch(() => {});
          cfg.setShowResumeOverlay(false);
          cfg.setFocusArea('controls');
          return;
        }
        if (cfg.showEpisodes) {
          cfg.setShowEpisodes(false);
          cfg.setFocusArea('controls');
          return;
        }
        if (cfg.showSettings !== 'none') {
          cfg.setShowSettings('none');
          cfg.setFocusArea('controls');
          return;
        }
        if (cfg.showCast) {
          cfg.setShowCast(false);
          cfg.setFocusArea('controls');
          cfg.videoRef.current?.play();
          return;
        }
        if (cfg.showSpeedPanel) {
          cfg.setShowSpeedPanel(false);
          cfg.setFocusArea('controls');
          return;
        }
        cfg.onClose();
        return;
      }

      if (cfg.showIntro) {
        if (key === 'Enter' || key === 'OK') {
          e.preventDefault();
          cfg.setShowIntro(false);
        }
        return;
      }

      if (cfg.showResumeOverlay) {
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          e.preventDefault();
          cfg.setFocusedResumeAction((current) => getNextResumeAction(current, key));
          return;
        }
        if (key === 'Enter' || key === 'OK') {
          e.preventDefault();
          if (cfg.focusedResumeAction === 'continue') cfg.continueFromSavedProgress();
          else cfg.restartFromBeginning();
        }
        return;
      }

      if (cfg.showEpisodes) {
        // preventDefault em todas as teclas — capture phase deve consumir o evento
        // para impedir que o botão focado abaixo (Episódios nav, ep buttons) receba
        // o keydown e dispare onClick duplicado, que reabriria/fecharia o painel.
        if (key === 'ArrowRight' && cfg.focusArea === 'episodes-seasons') {
          e.preventDefault();
          cfg.setFocusArea('episodes-list');
          cfg.setFocusedEpisodeIdx(() => 0);
        }
        if (key === 'ArrowLeft' && cfg.focusArea === 'episodes-list') {
          e.preventDefault();
          cfg.setFocusArea('episodes-seasons');
        }
        if (key === 'ArrowUp') {
          e.preventDefault();
          if (cfg.focusArea === 'episodes-seasons')
            cfg.setFocusedSeasonIdx((p) => Math.max(0, p - 1));
          else cfg.setFocusedEpisodeIdx((p) => Math.max(0, p - 1));
        }
        if (key === 'ArrowDown') {
          e.preventDefault();
          if (cfg.focusArea === 'episodes-seasons')
            cfg.setFocusedSeasonIdx((p) =>
              cfg.seasons.length > 0 ? Math.min(cfg.seasons.length - 1, p + 1) : 0
            );
          else
            cfg.setFocusedEpisodeIdx((p) =>
              cfg.episodes.length > 0 ? Math.min(cfg.episodes.length - 1, p + 1) : 0
            );
        }
        if (key === 'Enter' || key === 'OK') {
          e.preventDefault();
          e.stopPropagation();
          if (cfg.focusArea === 'episodes-seasons') {
            cfg.setFocusArea('episodes-list');
            cfg.setFocusedEpisodeIdx(() => 0);
          } else if (cfg.focusArea === 'episodes-list') {
            const ep = cfg.episodes[cfg.focusedEpisodeIdx];
            if (ep && cfg.onSelectEpisode) {
              cfg.onSelectEpisode(cfg.selectedSeasonNum, ep.episode_number);
              cfg.setShowEpisodes(false);
              cfg.setFocusArea('controls');
              setTimeout(() => {
                if (!document.fullscreenElement)
                  document.documentElement.requestFullscreen().catch(() => {});
                cfg.videoRef.current?.play().catch(() => {});
              }, 300);
            }
          }
        }
        return;
      }

      if (!cfg.showControls && cfg.showSettings === 'none' && !cfg.showCast) {
        if (key === 'Enter' || key === 'OK') {
          e.preventDefault();
          cfg.togglePlay();
          return;
        }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
          e.preventDefault();
          cfg.revealControls();
          if (key === 'ArrowLeft') cfg.seek(-SEEK_STEP);
          if (key === 'ArrowRight') cfg.seek(SEEK_STEP);
          return;
        }
      }

      cfg.revealControls();

      const ids = ['back', 'play', 'rewind', 'forward'];
      if (cfg.canBrowseEpisodes) ids.push('episodes');
      ids.push('cast', 'quality', 'speed', 'volume');
      if (cfg.nextEpisode && cfg.hasEpisodeContext) ids.push('next');

      if (cfg.focusArea === 'controls') {
        if (key === 'ArrowRight')
          cfg.setFocusedControlIdx((prev) => Math.min(ids.length - 1, prev + 1));
        if (key === 'ArrowLeft') cfg.setFocusedControlIdx((prev) => Math.max(0, prev - 1));
        if (key === 'ArrowDown' || key === 'ArrowUp') {
          const action = ids[cfg.focusedControlIdx];
          if (action === 'volume') {
            e.preventDefault();
            const step = key === 'ArrowUp' ? 0.1 : -0.1;
            const newVol = Math.min(1, Math.max(0, cfg.volume + step));
            cfg.setVolume(newVol);
            cfg.setIsMuted(newVol === 0);
            if (cfg.videoRef.current) {
              cfg.videoRef.current.volume = newVol;
              cfg.videoRef.current.muted = newVol === 0;
            }
          }
        }
        if (key === 'Enter') {
          e.preventDefault();
          const action = ids[cfg.focusedControlIdx];
          if (action === 'back') cfg.onClose();
          if (action === 'play') cfg.togglePlay();
          if (action === 'rewind') cfg.seek(-SEEK_STEP);
          if (action === 'forward') cfg.seek(SEEK_STEP);
          if (action === 'episodes') {
            cfg.setShowEpisodes(true);
            cfg.setFocusArea('episodes-seasons');
            cfg.videoRef.current?.pause();
          }
          if (action === 'cast') {
            if (cfg.showCast) {
              cfg.setShowCast(false);
              cfg.setFocusArea('controls');
              cfg.videoRef.current?.play();
            } else {
              cfg.setShowCast(true);
              cfg.setFocusArea('cast');
              cfg.setFocusedCastIdx(() => 0);
              cfg.videoRef.current?.pause();
            }
          }
          if (action === 'quality') {
            cfg.setShowSettings('quality');
            cfg.setFocusArea('settings');
            cfg.setFocusedSettingsIdx(() => 0);
            return;
          }
          if (action === 'speed') {
            const currentSpeedIdx = SPEED_OPTIONS.indexOf(cfg.playbackRate);
            cfg.setFocusedSpeedIdx(() => (currentSpeedIdx >= 0 ? currentSpeedIdx : 2));
            cfg.setShowSpeedPanel(true);
            cfg.setFocusArea('speed');
          }
          if (action === 'volume') {
            const newMuted = !cfg.isMuted;
            cfg.setIsMuted(newMuted);
            if (cfg.videoRef.current) {
              cfg.videoRef.current.muted = newMuted;
              if (!newMuted && cfg.volume === 0) {
                cfg.setVolume(0.5);
                cfg.videoRef.current.volume = 0.5;
              }
            }
          }
          if (action === 'next' && cfg.onPlayNext) cfg.onPlayNext();
        }
      } else if (cfg.focusArea === 'cast') {
        const n = cfg.cast.length;
        const clampCast = (i: number) => Math.max(-1, Math.min(n - 1, i));
        if (key === 'ArrowUp') {
          e.preventDefault();
          cfg.setFocusedCastIdx((prev) => {
            if (prev === -1) return -1;
            if (prev < CAST_GRID_COLS) return -1;
            return clampCast(prev - CAST_GRID_COLS);
          });
        }
        if (key === 'ArrowDown') {
          e.preventDefault();
          if (cfg.focusedCastIdx === -1) {
            cfg.setFocusedCastIdx(() => (n > 0 ? 0 : -1));
          } else {
            const next = cfg.focusedCastIdx + CAST_GRID_COLS;
            if (next < n) cfg.setFocusedCastIdx(() => next);
            else cfg.setFocusArea('controls');
          }
        }
        if (key === 'ArrowRight') {
          e.preventDefault();
          cfg.setFocusedCastIdx((prev) => {
            if (prev === -1) return n > 0 ? 0 : -1;
            return clampCast(prev + 1);
          });
        }
        if (key === 'ArrowLeft') {
          e.preventDefault();
          cfg.setFocusedCastIdx((prev) => {
            if (prev === -1) return -1;
            if (prev === 0) return -1;
            return clampCast(prev - 1);
          });
        }
        if ((key === 'Enter' || key === 'OK') && cfg.focusedCastIdx === -1) {
          e.preventDefault();
          cfg.setShowCast(false);
          cfg.setFocusArea('controls');
          cfg.videoRef.current?.play();
        }
      } else if (cfg.focusArea === 'settings') {
        const optionsCount = getPlayerSettingsOptionsCount(cfg.showSettings, {
          qualities: cfg.qualities.length,
        });
        if (key === 'ArrowUp') cfg.setFocusedSettingsIdx((prev) => Math.max(0, prev - 1));
        if (key === 'ArrowDown')
          cfg.setFocusedSettingsIdx((prev) => Math.min(optionsCount - 1, prev + 1));
        if (key === 'Enter') {
          e.preventDefault();
          if (cfg.showSettings === 'quality' && cfg.hlsRef.current) {
            const level = cfg.focusedSettingsIdx === 0 ? -1 : cfg.focusedSettingsIdx - 1;
            cfg.hlsRef.current.currentLevel = level;
            cfg.hlsRef.current.nextLevel = level;
            cfg.setCurrentQuality(level);
            localStorage.setItem('redx-player-quality', String(level));
            const levels = cfg.hlsRef.current.levels || [];
            if (level === -1) {
              cfg.setCurrentQualityLabel('AUTO');
            } else {
              const h = levels[level]?.height;
              cfg.setCurrentQualityLabel(
                h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : '360p'
              );
            }
          }
          cfg.setShowSettings('none');
          cfg.setFocusArea('controls');
        }
      } else if (cfg.focusArea === 'speed') {
        e.preventDefault();
        if (key === 'ArrowUp') cfg.setFocusedSpeedIdx((prev) => Math.max(0, prev - 1));
        if (key === 'ArrowDown')
          cfg.setFocusedSpeedIdx((prev) => Math.min(SPEED_OPTIONS.length - 1, prev + 1));
        if (key === 'Enter' || key === 'OK') {
          cfg.applySpeed(SPEED_OPTIONS[cfg.focusedSpeedIdx]);
          cfg.setFocusArea('controls');
        }
        if (key === 'Escape' || key === 'GoBack' || key === 'Backspace') {
          cfg.setShowSpeedPanel(false);
          cfg.setFocusArea('controls');
        }
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);
}
