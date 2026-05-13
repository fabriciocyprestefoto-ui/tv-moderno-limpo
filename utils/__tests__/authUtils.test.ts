import { describe, it, expect } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { hasAdminClaim } from '../authUtils';

function makeSession(overrides: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-id',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'user@test.com',
      created_at: '',
      updated_at: '',
      app_metadata: overrides.app_metadata ?? {},
      user_metadata: overrides.user_metadata ?? {},
      identities: [],
      factors: [],
    },
  } as unknown as Session;
}

describe('hasAdminClaim', () => {
  it('retorna true quando app_metadata.role = admin', () => {
    expect(hasAdminClaim(makeSession({ app_metadata: { role: 'admin' } }))).toBe(true);
  });

  it('retorna true quando app_metadata.role = superadmin', () => {
    expect(hasAdminClaim(makeSession({ app_metadata: { role: 'superadmin' } }))).toBe(true);
  });

  it('retorna false para session nula', () => {
    expect(hasAdminClaim(null)).toBe(false);
  });

  it('retorna false quando app_metadata nao tem role', () => {
    expect(hasAdminClaim(makeSession({}))).toBe(false);
  });

  // ── Invariante de segurança ────────────────────────────────────────────────
  // user_metadata é user-writable — qualquer usuário pode setar via
  // supabase.auth.updateUser({ data: { role: 'admin' } }).
  // NUNCA deve conceder acesso admin.

  it('SEGURANCA: ignora user_metadata.role = admin', () => {
    expect(
      hasAdminClaim(makeSession({ user_metadata: { role: 'admin' } }))
    ).toBe(false);
  });

  it('SEGURANCA: ignora user_metadata.role = superadmin', () => {
    expect(
      hasAdminClaim(makeSession({ user_metadata: { role: 'superadmin' } }))
    ).toBe(false);
  });

  it('SEGURANCA: app_metadata vazia + user_metadata admin = negado', () => {
    expect(
      hasAdminClaim(
        makeSession({ app_metadata: {}, user_metadata: { role: 'admin' } })
      )
    ).toBe(false);
  });
});
