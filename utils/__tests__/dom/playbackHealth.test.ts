/**
 * utils/__tests__/dom/playbackHealth.test.ts
 *
 * Testa o sistema de rastreamento de saúde de URLs de reprodução:
 * - Normalização de URL (query params removidos)
 * - TTL: falha=12h, sucesso=24h
 * - Pruning ao atingir MAX_ENTRIES
 * - set/get round-trip
 *
 * Executado no ambiente jsdom (localStorage disponível).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Reset do módulo entre testes (limpa memoryCache de módulo) ────────────────
// Cada describe reimporta o módulo para garantir isolamento do memoryCache.

async function freshModule() {
  vi.resetModules();
  return import('../../playbackHealth');
}

describe('markPlaybackUrlsHealthy / getPlaybackHealth — round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna entrada após marcar como saudável', async () => {
    const { markPlaybackUrlsHealthy, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsHealthy('https://cdn.example.com/stream.m3u8');
    const entry = getPlaybackHealth('https://cdn.example.com/stream.m3u8');

    expect(entry).not.toBeNull();
    expect(entry?.status).toBe('healthy');
  });

  it('retorna entrada após marcar como falha', async () => {
    const { markPlaybackUrlsFailed, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsFailed('https://cdn.example.com/broken.m3u8', 'ERR_NETWORK');
    const entry = getPlaybackHealth('https://cdn.example.com/broken.m3u8');

    expect(entry?.status).toBe('failed');
    expect(entry?.reason).toBe('ERR_NETWORK');
  });

  it('isPlaybackUrlKnownBroken retorna true para URL com falha', async () => {
    const { markPlaybackUrlsFailed, isPlaybackUrlKnownBroken } = await freshModule();

    markPlaybackUrlsFailed('https://cdn.example.com/broken.m3u8');

    expect(isPlaybackUrlKnownBroken('https://cdn.example.com/broken.m3u8')).toBe(true);
  });

  it('isPlaybackUrlKnownBroken retorna false para URL desconhecida', async () => {
    const { isPlaybackUrlKnownBroken } = await freshModule();

    expect(isPlaybackUrlKnownBroken('https://cdn.example.com/unknown.m3u8')).toBe(false);
  });
});

describe('normalização de URL — query params e hash removidos', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('URLs com tokens diferentes mapeiam para a mesma entrada', async () => {
    const { markPlaybackUrlsHealthy, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsHealthy('https://cdn.example.com/stream.m3u8?token=abc123');
    const entry = getPlaybackHealth('https://cdn.example.com/stream.m3u8?token=xyz789');

    expect(entry).not.toBeNull();
    expect(entry?.status).toBe('healthy');
  });

  it('hash é removido: URLs com fragment diferente são a mesma entrada', async () => {
    const { markPlaybackUrlsFailed, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsFailed('https://cdn.example.com/stream.m3u8#t=30');
    const entry = getPlaybackHealth('https://cdn.example.com/stream.m3u8#t=60');

    expect(entry?.status).toBe('failed');
  });

  it('aceita array de URLs: todas apontam para a mesma entrada', async () => {
    const { markPlaybackUrlsHealthy, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsHealthy([
      'https://cdn.example.com/stream.m3u8?token=a',
      'https://cdn.example.com/stream.m3u8?token=b',
    ]);

    const entryA = getPlaybackHealth('https://cdn.example.com/stream.m3u8?token=a');
    const entryB = getPlaybackHealth('https://cdn.example.com/stream.m3u8');

    expect(entryA?.status).toBe('healthy');
    expect(entryB?.status).toBe('healthy');
  });
});

describe('TTL — entradas expiram corretamente', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const HOUR_MS = 60 * 60 * 1000;

  it('entrada de falha expira após 12h', async () => {
    vi.useFakeTimers();
    const { markPlaybackUrlsFailed, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsFailed('https://cdn.example.com/old-fail.m3u8');
    vi.advanceTimersByTime(12 * HOUR_MS + 1);

    const entry = getPlaybackHealth('https://cdn.example.com/old-fail.m3u8');
    expect(entry).toBeNull();
  });

  it('entrada saudável expira após 24h', async () => {
    vi.useFakeTimers();
    const { markPlaybackUrlsHealthy, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsHealthy('https://cdn.example.com/old-healthy.m3u8');
    vi.advanceTimersByTime(24 * HOUR_MS + 1);

    const entry = getPlaybackHealth('https://cdn.example.com/old-healthy.m3u8');
    expect(entry).toBeNull();
  });

  it('entrada de falha ainda existe antes de 12h', async () => {
    vi.useFakeTimers();
    const { markPlaybackUrlsFailed, getPlaybackHealth } = await freshModule();

    markPlaybackUrlsFailed('https://cdn.example.com/recent-fail.m3u8');
    vi.advanceTimersByTime(11 * HOUR_MS);

    const entry = getPlaybackHealth('https://cdn.example.com/recent-fail.m3u8');
    expect(entry?.status).toBe('failed');
  });
});

describe('pruning — MAX_ENTRIES limitado', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('não acumula mais de MAX_ENTRIES entradas', async () => {
    const { markPlaybackUrlsHealthy } = await freshModule();

    for (let i = 0; i < 420; i++) {
      markPlaybackUrlsHealthy(`https://cdn.example.com/stream-${i}.m3u8`);
    }

    const stored = localStorage.getItem('redx-playback-health-v1');
    const parsed = stored ? JSON.parse(stored) : {};
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(400);
  });
});

describe('URL vazia ou inválida', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getPlaybackHealth com string vazia retorna null', async () => {
    const { getPlaybackHealth } = await freshModule();
    expect(getPlaybackHealth('')).toBeNull();
  });

  it('markPlaybackUrlsHealthy com array vazio não lança', async () => {
    const { markPlaybackUrlsHealthy } = await freshModule();
    expect(() => markPlaybackUrlsHealthy([])).not.toThrow();
  });
});
