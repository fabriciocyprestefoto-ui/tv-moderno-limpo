import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  canAttemptChunkRecovery,
  isLikelyChunkError,
  markChunkRecoveryAttempt,
  resetChunkRecoveryFlag,
} from '@/utils/chunkRecovery';

describe('chunkRecovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('detecta erros típicos de chunk dinâmico', () => {
    expect(isLikelyChunkError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isLikelyChunkError(new Error('Loading CSS chunk 7 failed'))).toBe(true);
    expect(isLikelyChunkError(new Error('erro de rede genérico'))).toBe(false);
  });

  it('bloqueia nova tentativa dentro da janela de TTL', () => {
    expect(canAttemptChunkRecovery()).toBe(true);
    markChunkRecoveryAttempt();
    expect(canAttemptChunkRecovery()).toBe(false);
  });

  it('libera tentativa após reset manual da flag', () => {
    markChunkRecoveryAttempt();
    expect(canAttemptChunkRecovery()).toBe(false);
    resetChunkRecoveryFlag();
    expect(canAttemptChunkRecovery()).toBe(true);
  });
});
