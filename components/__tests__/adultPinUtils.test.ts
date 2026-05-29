/**
 * components/__tests__/adultPinUtils.test.ts
 *
 * Testa as funções utilitárias exportadas de AdultPinModal.tsx:
 *   - isAdultChannel(category) — detecta categorias adultas por palavra-chave
 *   - isAdultUnlocked()        — lê flag de sessão
 *   - setAdultUnlocked()       — persiste flag de sessão
 *
 * Os mocks abaixo isolam as dependências pesadas (Supabase, React hooks)
 * para que apenas a lógica pura seja testada. A renderização do modal
 * é coberta nos testes E2E Cypress.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks de dependências pesadas ──────────────────────────────────────────
vi.mock('@/services/supabaseService', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
}));

vi.mock('@/utils/soundEffects', () => ({
  playSelectSound: vi.fn(),
  playNavigateSound: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
}));

vi.mock('lucide-react', () => ({
  Lock: () => null,
}));

// ── Import após mocks ──────────────────────────────────────────────────────
import {
  isAdultChannel,
  isAdultUnlocked,
  setAdultUnlocked,
  clearAdultUnlocked,
} from '../../pages/livetv/AdultPinModal';

describe('isAdultChannel', () => {
  it('detecta "adulto" (português, case-insensitive)', () => {
    expect(isAdultChannel('Adulto')).toBe(true);
    expect(isAdultChannel('ADULTOS')).toBe(true);
    expect(isAdultChannel('canal adulto')).toBe(true);
  });

  it('detecta "adult" (inglês)', () => {
    expect(isAdultChannel('Adult Content')).toBe(true);
    expect(isAdultChannel('Adults Only')).toBe(true);
  });

  it('detecta "+18"', () => {
    expect(isAdultChannel('+18')).toBe(true);
    expect(isAdultChannel('Canal +18')).toBe(true);
    expect(isAdultChannel('Filmes+18')).toBe(true);
  });

  it('detecta "xxx"', () => {
    expect(isAdultChannel('xxx')).toBe(true);
    expect(isAdultChannel('XXX Channel')).toBe(true);
  });

  it('não classifica categorias normais como adulto', () => {
    expect(isAdultChannel('Esportes')).toBe(false);
    expect(isAdultChannel('Filmes')).toBe(false);
    expect(isAdultChannel('Notícias')).toBe(false);
    expect(isAdultChannel('Entretenimento')).toBe(false);
    expect(isAdultChannel('Kids')).toBe(false);
  });

  it('retorna false para string vazia', () => {
    expect(isAdultChannel('')).toBe(false);
  });
});

describe('isAdultUnlocked / setAdultUnlocked', () => {
  beforeEach(() => {
    clearAdultUnlocked();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('retorna false quando adulto não está desbloqueado', () => {
    expect(isAdultUnlocked()).toBe(false);
  });

  it('retorna true após chamar setAdultUnlocked()', () => {
    setAdultUnlocked();
    expect(isAdultUnlocked()).toBe(true);
  });

  it('setAdultUnlocked é idempotente (chamadas múltiplas não causam erro)', () => {
    setAdultUnlocked();
    setAdultUnlocked();
    expect(isAdultUnlocked()).toBe(true);
  });

  it('cada teste começa com adulto bloqueado (beforeEach limpa sessionStorage)', () => {
    // Confirma que beforeEach limpou o estado do teste anterior
    expect(isAdultUnlocked()).toBe(false);
  });
});
