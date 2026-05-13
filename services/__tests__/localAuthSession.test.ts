import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/accessCode', () => ({
  normalizeAccessCode: vi.fn((code: string) => code.toUpperCase().trim()),
}));

// Mock platformStorage before importing localAuthSession
vi.mock('../platformStorage', () => {
  const store = new Map<string, string>();
  return {
    storageGet: vi.fn(async (key: string) => store.get(key) ?? null),
    storageSet: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    storageRemove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

import {
  createAdminLocalSession,
  createAccessCodeLocalSession,
  readLocalAuthSession,
  clearLocalAuthSession,
  buildLocalUser,
  buildLocalSession,
} from '../localAuthSession';
import * as platformStorage from '../platformStorage';

const store = (platformStorage as unknown as { __store: Map<string, string> }).__store;

describe('localAuthSession', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  describe('createAdminLocalSession', () => {
    it('cria sessão admin e persiste no storage', async () => {
      const session = await createAdminLocalSession();
      expect(session.mode).toBe('admin');
      expect(session.isAdmin).toBe(true);
      expect(session.accessCode).toBeNull();
      expect(platformStorage.storageSet).toHaveBeenCalledOnce();
    });

    it('sessão expira em ~12 horas', async () => {
      const before = Date.now();
      const session = await createAdminLocalSession();
      const expiresAt = new Date(session.expiresAt).getTime();
      const diff = expiresAt - before;
      // entre 11h59m e 12h01m
      expect(diff).toBeGreaterThan(11 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(13 * 60 * 60 * 1000);
    });
  });

  describe('createAccessCodeLocalSession', () => {
    it('cria sessão de código com duração correta', async () => {
      const session = await createAccessCodeLocalSession({ code: 'ABC-123', durationDays: 7 });
      expect(session.mode).toBe('access_code');
      expect(session.isAdmin).toBe(false);
      const diff = new Date(session.expiresAt).getTime() - Date.now();
      // entre 6d23h e 7d01h
      expect(diff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    });

    it('usa mínimo de 1 dia quando durationDays=0', async () => {
      const session = await createAccessCodeLocalSession({ code: 'X', durationDays: 0 });
      const diff = new Date(session.expiresAt).getTime() - Date.now();
      expect(diff).toBeGreaterThan(0);
    });
  });

  describe('readLocalAuthSession', () => {
    it('retorna null quando storage vazio', async () => {
      const result = await readLocalAuthSession();
      expect(result).toBeNull();
    });

    it('retorna a sessão persistida quando válida', async () => {
      await createAdminLocalSession();
      const result = await readLocalAuthSession();
      expect(result).not.toBeNull();
      expect(result?.mode).toBe('admin');
    });

    it('retorna null e limpa storage para sessão expirada', async () => {
      const expired = {
        mode: 'admin',
        userId: 'local-admin-redx',
        email: 'admin@redx.tv',
        displayName: 'Admin',
        isAdmin: true,
        issuedAt: new Date(Date.now() - 2000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        accessCode: null,
      };
      store.set('redx-local-auth-session-v1', JSON.stringify(expired));
      const result = await readLocalAuthSession();
      expect(result).toBeNull();
      expect(platformStorage.storageRemove).toHaveBeenCalled();
    });

    it('retorna null e limpa storage para JSON inválido', async () => {
      store.set('redx-local-auth-session-v1', 'not-json{{{');
      const result = await readLocalAuthSession();
      expect(result).toBeNull();
    });
  });

  describe('clearLocalAuthSession', () => {
    it('remove a sessão do storage', async () => {
      await createAdminLocalSession();
      await clearLocalAuthSession();
      const result = await readLocalAuthSession();
      expect(result).toBeNull();
    });
  });

  describe('buildLocalUser', () => {
    it('constrói User compatível com Supabase para admin', async () => {
      const session = await createAdminLocalSession();
      const user = buildLocalUser(session);
      expect(user.id).toBe('local-admin-redx');
      expect(user.app_metadata.role).toBe('admin');
      expect(user.user_metadata.role).toBe('admin');
    });

    it('constrói User para access_code com metadata correto', async () => {
      const session = await createAccessCodeLocalSession({ code: 'TEST-CODE', durationDays: 1 });
      const user = buildLocalUser(session);
      expect(user.app_metadata.role).toBeUndefined();
      expect(user.app_metadata.auth_mode).toBe('access_code');
      expect(user.user_metadata.role).toBe('viewer');
    });
  });

  describe('buildLocalSession', () => {
    it('expires_in é positivo para sessão ainda válida', async () => {
      const data = await createAdminLocalSession();
      const sess = buildLocalSession(data);
      expect(sess.expires_in).toBeGreaterThan(0);
      expect(sess.access_token).toContain('local-');
    });
  });
});
