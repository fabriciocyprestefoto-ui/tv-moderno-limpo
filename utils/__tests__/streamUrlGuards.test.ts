import { describe, expect, it } from 'vitest';

import { buildPlaybackUrlCandidates } from '../streamUrlGuards';

describe('buildPlaybackUrlCandidates', () => {
  it('mantem a URL original como primeira opcao', () => {
    const url = 'https://cdn.example.net/live/master.m3u8?token=abc';
    const candidates = buildPlaybackUrlCandidates(url);

    expect(candidates[0]).toBe(url);
  });

  it('gera fallback mp4 para m3u8', () => {
    const url = 'https://cdn.example.net/live/master.m3u8?token=abc';
    const candidates = buildPlaybackUrlCandidates(url);

    expect(candidates).toContain('https://cdn.example.net/live/video.mp4?token=abc');
    expect(candidates).toContain('https://cdn.example.net/live/master.mp4?token=abc');
  });

  it('gera fallback m3u8 para mp4', () => {
    const url = 'https://cdn.example.net/live/video.mp4?token=abc';
    const candidates = buildPlaybackUrlCandidates(url);

    expect(candidates).toContain('https://cdn.example.net/live/master.m3u8?token=abc');
    expect(candidates).toContain('https://cdn.example.net/live/video.m3u8?token=abc');
  });

  it('gera variantes por query format/type sem duplicar', () => {
    const url = 'https://cdn.example.net/live/playlist?format=hls&type=hls&token=abc';
    const candidates = buildPlaybackUrlCandidates(url);

    expect(candidates).toContain(
      'https://cdn.example.net/live/playlist?format=mp4&type=hls&token=abc'
    );
    expect(candidates).toContain(
      'https://cdn.example.net/live/playlist?format=hls&type=mp4&token=abc'
    );
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
