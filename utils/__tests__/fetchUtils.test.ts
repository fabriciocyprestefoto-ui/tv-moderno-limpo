/**
 * Testes para utils/fetchUtils.ts
 * Roda com: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do logger antes de importar fetchUtils (evita imports de Sentry/supabase)
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { fetchWithTimeout, fetchWithRetry, fetchDedup } from '../fetchUtils';

// ─── fetchWithTimeout ────────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna Response quando fetch completa antes do timeout', async () => {
    const mockResp = new Response('{}', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResp));

    const res = await fetchWithTimeout('https://example.com', {}, 5_000);
    expect(res.status).toBe(200);
  });

  it('lança AbortError quando timeout é atingido', async () => {
    vi.useFakeTimers();
    // Mock que ESCUTA o AbortSignal — necessário porque new Promise(()=>{}) ignora o sinal
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      })
    );

    try {
      const promise = fetchWithTimeout('https://slow.com', {}, 100);
      vi.advanceTimersByTime(200);
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancela o timeout ao receber resposta', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const mockResp = new Response('{}', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResp));

    await fetchWithTimeout('https://fast.com', {}, 5_000);
    expect(clearSpy).toHaveBeenCalled();
  });
});

// ─── fetchWithRetry ──────────────────────────────────────────────────────────

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna resultado na primeira tentativa', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await fetchWithRetry(fn, { retries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('faz retry e sucede na segunda tentativa', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('network error')).mockResolvedValue('ok');
    const result = await fetchWithRetry(fn, { retries: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('lança após esgotar todas as tentativas', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistente'));
    await expect(fetchWithRetry(fn, { retries: 3, baseDelayMs: 1 })).rejects.toThrow('persistente');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('não faz retry em AbortError', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    const fn = vi.fn().mockRejectedValue(abortErr);
    let caughtErr: unknown;
    try {
      await fetchWithRetry(fn, { retries: 3, baseDelayMs: 1 });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBe(abortErr);
    expect(fn).toHaveBeenCalledTimes(1); // sem retry
  });
});

// ─── fetchDedup ──────────────────────────────────────────────────────────────

describe('fetchDedup', () => {
  it('executa a função apenas uma vez para a mesma chave concorrente', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    const [r1, r2, r3] = await Promise.all([
      fetchDedup('same-key', fn),
      fetchDedup('same-key', fn),
      fetchDedup('same-key', fn),
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r1).toBe('data');
    expect(r2).toBe('data');
    expect(r3).toBe('data');
  });

  it('permite nova execução após a promise anterior completar', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    await fetchDedup('key-seq', fn);
    await fetchDedup('key-seq', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('chaves diferentes executam funções independentes', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await Promise.all([fetchDedup('key-a', fn), fetchDedup('key-b', fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('propaga exceção para todos os aguardantes', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const [p1, p2] = [fetchDedup('err-key', fn), fetchDedup('err-key', fn)];
    await expect(p1).rejects.toThrow('fail');
    await expect(p2).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
