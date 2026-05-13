import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, DEFAULT_RETRY_CONFIG, isRetryableError } from '../streamRetryManager';

describe('streamRetryManager', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('withRetry', () => {
    it('retorna resultado na primeira tentativa', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { config: { maxAttempts: 3, baseDelayMs: 1 } });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('faz retry e sucede na segunda tentativa', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      const result = await withRetry(fn, { config: { maxAttempts: 3, baseDelayMs: 1 } });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('lança após esgotar todas as tentativas', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('network error persistent'));
      await expect(withRetry(fn, { config: { maxAttempts: 3, baseDelayMs: 1 } })).rejects.toThrow(
        'network error persistent'
      );
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('chama onRetry a cada tentativa falha', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn().mockRejectedValue(new Error('network fail'));
      await expect(
        withRetry(fn, { config: { maxAttempts: 3, baseDelayMs: 1 }, onRetry })
      ).rejects.toThrow();
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('chama onSuccess na primeira tentativa', async () => {
      const onSuccess = vi.fn();
      const fn = vi.fn().mockResolvedValue('ok');
      await withRetry(fn, { config: { maxAttempts: 3, baseDelayMs: 1 }, onSuccess });
      expect(onSuccess).toHaveBeenCalledWith('ok', 1);
    });

    it('chama onFail após última tentativa', async () => {
      const onFail = vi.fn();
      const fn = vi.fn().mockRejectedValue(new Error('network fail'));
      await expect(
        withRetry(fn, { config: { maxAttempts: 2, baseDelayMs: 1 }, onFail })
      ).rejects.toThrow();
      expect(onFail).toHaveBeenCalledTimes(1);
      expect(onFail).toHaveBeenCalledWith(expect.any(Error), 2);
    });
  });

  describe('isRetryableError', () => {
    it('retorna true para erros de rede', () => {
      expect(isRetryableError(new Error('network error'))).toBe(true);
      expect(isRetryableError(new Error('Failed to fetch'))).toBe(true);
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('retorna false para erros não-retryable', () => {
      expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('404 Not Found'))).toBe(false);
    });

    it('trata valores não-Erro como retryable', () => {
      expect(isRetryableError(null)).toBe(true);
      expect(isRetryableError(undefined)).toBe(true);
      expect(isRetryableError('string error')).toBe(true);
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('tem valores válidos', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
    });
  });
});
