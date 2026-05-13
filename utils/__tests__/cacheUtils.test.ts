/**
 * Testes para utils/cacheUtils.ts
 * Roda com: npm test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cacheSet, cacheGet, cacheInvalidate } from '../cacheUtils';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('cacheUtils', () => {
  beforeEach(() => localStorageMock.clear());
  afterEach(() => vi.restoreAllMocks());

  describe('cacheSet + cacheGet', () => {
    it('armazena e recupera dados corretamente', () => {
      cacheSet('key1', { name: 'Luca' }, 60_000);
      const result = cacheGet<{ name: string }>('key1');
      expect(result).toEqual({ name: 'Luca' });
    });

    it('retorna null para chave inexistente', () => {
      expect(cacheGet('nao-existe')).toBeNull();
    });

    it('retorna null quando TTL expirado', () => {
      // TTL de 1ms — expira imediatamente
      cacheSet('expired', 'valor', 1);
      // Avançar o tempo manualmente manipulando o timestamp armazenado
      const raw = localStorageMock.getItem('expired')!;
      const entry = JSON.parse(raw);
      entry.ts = Date.now() - 10_000; // 10s atrás
      localStorageMock.setItem('expired', JSON.stringify(entry));
      expect(cacheGet('expired')).toBeNull();
    });

    it('remove a entrada expirada do localStorage', () => {
      cacheSet('stale', 'valor', 1);
      const raw = localStorageMock.getItem('stale')!;
      const entry = JSON.parse(raw);
      entry.ts = Date.now() - 10_000;
      localStorageMock.setItem('stale', JSON.stringify(entry));
      cacheGet('stale');
      expect(localStorageMock.getItem('stale')).toBeNull();
    });

    it('não lança exceção quando localStorage lança erro ao escrever', () => {
      vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => cacheSet('key', 'data')).not.toThrow();
    });
  });

  describe('cacheInvalidate', () => {
    it('remove a entrada do cache', () => {
      cacheSet('to-remove', 42);
      cacheInvalidate('to-remove');
      expect(cacheGet('to-remove')).toBeNull();
    });

    it('não lança exceção para chave inexistente', () => {
      expect(() => cacheInvalidate('ghost-key')).not.toThrow();
    });
  });

  describe('tipos genéricos', () => {
    it('preserva array de números', () => {
      cacheSet<number[]>('arr', [1, 2, 3]);
      expect(cacheGet<number[]>('arr')).toEqual([1, 2, 3]);
    });

    it('preserva objeto aninhado', () => {
      const obj = { a: { b: { c: 'deep' } } };
      cacheSet('nested', obj);
      expect(cacheGet<typeof obj>('nested')).toEqual(obj);
    });
  });
});
