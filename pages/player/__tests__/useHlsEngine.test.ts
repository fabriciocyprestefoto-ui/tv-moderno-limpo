/**
 * Testa useHlsEngine em isolamento — sem HLS.js real (jsdom não suporta MSE).
 * Valida: estado inicial, setters, retryStream, reportStreamFailure/Healthy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// HLS.js: mock completo — jsdom não tem MSE/WebWorker
vi.mock('hls.js', () => {
  const Hls = vi.fn().mockImplementation(() => ({
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    startLoad: vi.fn(),
    recoverMediaError: vi.fn(),
    audioTrack: 0,
    audioTracks: [],
    subtitleTrack: -1,
    levels: [],
    currentLevel: -1,
    nextLevel: -1,
  }));
  (Hls as unknown as Record<string, unknown>).isSupported = vi.fn(() => false); // force native path
  (Hls as unknown as Record<string, unknown>).Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    LEVEL_SWITCHED: 'hlsLevelSwitched',
    SUBTITLE_TRACKS_UPDATED: 'hlsSubtitleTracksUpdated',
    ERROR: 'hlsError',
  };
  (Hls as unknown as Record<string, unknown>).ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
  };
  return { default: Hls };
});

vi.mock('../../../utils/playbackHealth', () => ({
  markPlaybackUrlsFailed: vi.fn(),
  markPlaybackUrlsHealthy: vi.fn(),
}));

vi.mock('../../../utils/tvBoxDetector', () => ({
  isTVBox: vi.fn(() => false),
  isLowPower: vi.fn(() => false),
  isLegacyHtml5OnlyTV: vi.fn(() => false),
  isModernAndroidTVWebView: vi.fn(() => false),
}));

vi.mock('../../../utils/logger', () => ({
  logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../utils/hlsSentry', () => ({
  hlsErrorToDetails: vi.fn(() => ({})),
}));

import { useHlsEngine } from '../useHlsEngine';
import { markPlaybackUrlsFailed, markPlaybackUrlsHealthy } from '../../../utils/playbackHealth';

function makeVideoRef() {
  const video = {
    canPlayType: vi.fn(() => ''),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    src: '',
    currentSrc: '',
    load: vi.fn(),
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    autoplay: false,
    playsInline: false,
    controls: false,
    muted: false,
    readyState: 0,
  } as unknown as HTMLVideoElement;
  return { current: video } as React.RefObject<HTMLVideoElement | null>;
}

describe('useHlsEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('estado inicial correto', () => {
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: undefined, showIntroRef })
    );

    expect(result.current.isBuffering).toBe(true);
    expect(result.current.streamError).toBe(false);
    expect(result.current.streamRetrying).toBe(false);
    expect(result.current.stallCount).toBe(0);
    expect(result.current.qualities).toEqual([]);
    expect(result.current.currentQuality).toBe(-1);
    expect(result.current.currentQualityLabel).toBe('AUTO');
  });

  it('setupPlayer com sourceUrl=undefined seta streamError=true', async () => {
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: undefined, showIntroRef })
    );

    await act(async () => {
      await result.current.setupPlayer();
    });

    expect(result.current.streamError).toBe(true);
    expect(result.current.isBuffering).toBe(false);
  });

  it('setupPlayer com mp4 usa video.src diretamente', async () => {
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: 'https://example.com/video.mp4', showIntroRef })
    );

    await act(async () => {
      await result.current.setupPlayer();
    });

    expect((videoRef.current as HTMLVideoElement).src).toBe('https://example.com/video.mp4');
    expect(result.current.streamError).toBe(false);
  });

  it('reportStreamFailure chama markPlaybackUrlsFailed e aciona onStreamFailed', async () => {
    const onStreamFailed = vi.fn();
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({
        videoRef,
        sourceUrl: 'https://example.com/s.m3u8',
        showIntroRef,
        onStreamFailed,
      })
    );

    act(() => {
      result.current.reportStreamFailure('https://example.com/s.m3u8', { reason: 'test' });
    });

    expect(markPlaybackUrlsFailed).toHaveBeenCalledWith('https://example.com/s.m3u8', 'test');
    expect(onStreamFailed).toHaveBeenCalledWith('https://example.com/s.m3u8');
  });

  it('reportStreamFailure ignora URL vazia', () => {
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: undefined, showIntroRef })
    );

    act(() => {
      result.current.reportStreamFailure('');
    });

    expect(markPlaybackUrlsFailed).not.toHaveBeenCalled();
  });

  it('reportStreamFailure não duplica para mesma URL', () => {
    const onStreamFailed = vi.fn();
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: 'https://x.com/s.m3u8', showIntroRef, onStreamFailed })
    );

    act(() => {
      result.current.reportStreamFailure('https://x.com/s.m3u8');
      result.current.reportStreamFailure('https://x.com/s.m3u8'); // duplicate
    });

    expect(onStreamFailed).toHaveBeenCalledTimes(1);
  });

  it('reportStreamHealthy limpa URL marcada como falha', () => {
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: 'https://x.com/s.m3u8', showIntroRef })
    );

    act(() => {
      result.current.reportStreamFailure('https://x.com/s.m3u8');
      result.current.reportStreamHealthy('https://x.com/s.m3u8');
    });

    expect(markPlaybackUrlsHealthy).toHaveBeenCalledWith('https://x.com/s.m3u8');
  });

  it('retryStream reseta estado e chama setupPlayer novamente', async () => {
    vi.useFakeTimers();
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: 'https://example.com/video.mp4', showIntroRef })
    );

    act(() => {
      result.current.setStreamError(true);
    });
    expect(result.current.streamError).toBe(true);

    act(() => {
      result.current.retryStream();
    });
    expect(result.current.streamRetrying).toBe(true);
    expect(result.current.streamError).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.streamRetrying).toBe(false);

    vi.useRealTimers();
  });

  it('setCurrentQuality lê qualidade salva do localStorage', () => {
    localStorage.setItem('redx-player-quality', '2');
    const videoRef = makeVideoRef();
    const showIntroRef = { current: false } as React.RefObject<boolean>;

    const { result } = renderHook(() =>
      useHlsEngine({ videoRef, sourceUrl: undefined, showIntroRef })
    );

    expect(result.current.currentQuality).toBe(2);
  });
});
