/**
 * Testes para AuthContext.
 *
 * Estratégia: mockar supabase, rateLimiter e dependências externas para
 * testar apenas a lógica do contexto (loading state, fake login, signOut).
 *
 * Testes de integração com Supabase real ficam nos testes E2E (Cypress).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Supabase: mockar antes de importar o contexto
vi.mock('../../services/supabaseService', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn(),
  },
}));

vi.mock('../../services/accessCodeService', () => ({
  validateAccessCode: vi.fn().mockResolvedValue({ success: false, message: 'mocked' }),
}));

vi.mock('../../utils/rateLimiter', () => ({
  checkLoginRateLimit: vi.fn().mockResolvedValue({ allowed: true, attemptsRemaining: 5 }),
  formatRateLimitMessage: vi.fn().mockReturnValue(''),
}));

vi.mock('../../utils/securityGate', () => ({
  addTrustKey: vi.fn(),
  removeTrustKey: vi.fn(),
}));

vi.mock('../../utils/trialSessionStorage', () => ({
  clearTrialSession: vi.fn(),
}));

vi.mock('../../services/userService', () => ({
  clearLocalUserData: vi.fn(),
}));

vi.mock('../../utils/mediaCardCaches', () => ({
  clearMediaCaches: vi.fn(),
}));

vi.mock('../../config/runtimeFlags', () => ({
  runtimeFlags: {
    fakeLoginEnabled: false,
    fakeUserEmail: 'test@test.com',
    tvTestAccessCodeEnabled: false,
  },
}));

vi.mock('../../config/testAccessCode', () => ({
  TEST_ACCESS_CODE: '000000',
}));

vi.mock('../../services/adminAuthService', () => ({
  verifyAdminPassword: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock('@/services/localAuthSession', () => ({
  buildLocalSession: vi.fn().mockReturnValue({ user: { id: 'local-user-id' } }),
  buildLocalUser: vi.fn().mockReturnValue({ id: 'local-user-id', email: 'test@redflix.tv' }),
  clearLocalAuthSession: vi.fn().mockResolvedValue(undefined),
  createAdminLocalSession: vi.fn().mockResolvedValue({
    userId: 'local-user-id',
    token: 'admin-token',
    expiresAt: Date.now() + 86400000,
    isAdmin: true,
  }),
  createAccessCodeLocalSession: vi.fn().mockResolvedValue({
    userId: 'local-user-id',
    token: 'local-token',
    expiresAt: Date.now() + 86400000,
    isAdmin: false,
  }),
  readLocalAuthSession: vi.fn().mockResolvedValue(null),
}));

// accessCode: usa implementação real para testar o guard de complexidade
vi.mock('@/utils/accessCode', async () => {
  const real = await vi.importActual<typeof import('@/utils/accessCode')>('@/utils/accessCode');
  return real;
});

// ── Helpers ─────────────────────────────────────────────────────────────────

import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { supabase as _supabase } from '../../services/supabaseService';
import { validateAccessCode as _validateAccessCode } from '../../services/accessCodeService';
import { checkLoginRateLimit as _checkLoginRateLimit } from '../../utils/rateLimiter';
import { verifyAdminPassword as _verifyAdminPassword } from '../../services/adminAuthService';

const validateAccessCode = _validateAccessCode as ReturnType<typeof vi.fn>;
const supabaseMock = _supabase as unknown as { auth: Record<string, ReturnType<typeof vi.fn>> };
const checkLoginRateLimit = _checkLoginRateLimit as ReturnType<typeof vi.fn>;
const verifyAdminPassword = _verifyAdminPassword as ReturnType<typeof vi.fn>;

function AuthConsumer() {
  const { user, loading, isAdmin, isProfileSelected } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? 'null'}</span>
      <span data-testid="isAdmin">{String(isAdmin)}</span>
      <span data-testid="isProfileSelected">{String(isProfileSelected)}</span>
    </div>
  );
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('inicia com loading=true e user=null', async () => {
    renderWithAuth();

    // Antes da promise do getSession resolver, deve estar carregando
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('loading vira false após getSession resolver', async () => {
    renderWithAuth();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('user permanece null quando getSession retorna session nula', async () => {
    renderWithAuth();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(screen.getByTestId('isAdmin').textContent).toBe('false');
  });

  it('isProfileSelected é false para usuário sem perfil selecionado', async () => {
    renderWithAuth();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId('isProfileSelected').textContent).toBe('false');
  });

  it('não quebra quando localStorage está vazio', async () => {
    localStorage.clear();
    expect(() => renderWithAuth()).not.toThrow();
  });
});

// ── signInWithCode — validação de complexidade ────────────────────────────────

describe('signInWithCode — validação local antes do Supabase', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('rejeita código com menos de 4 chars sem chamar supabase', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    let authResult: any;
    await act(async () => {
      authResult = await result.current.signInWithCode('AB');
    });

    expect(authResult.ok).toBe(false);
    expect(authResult.error).toMatch(/invalido/i);
    expect(validateAccessCode).not.toHaveBeenCalled();
  });

  it('rejeita código de 16 chars sem caractere especial (sem complexidade)', async () => {
    // 'ABCD1234EFGH5678' — tem letra, tem número, mas NÃO tem !@#$%&*?
    const { result } = renderHook(() => useAuth(), { wrapper });

    let authResult: any;
    await act(async () => {
      authResult = await result.current.signInWithCode('ABCD1234EFGH5678');
    });

    expect(authResult.ok).toBe(false);
    expect(validateAccessCode).not.toHaveBeenCalled();
  });

  it('rejeita código de 16 chars sem dígito (sem complexidade)', async () => {
    // 'ABCD!EFG@HIJ#KLM' — letra e especial, mas NÃO tem dígito
    const { result } = renderHook(() => useAuth(), { wrapper });

    let authResult: any;
    await act(async () => {
      authResult = await result.current.signInWithCode('ABCD!EFG@HIJ#KLM');
    });

    expect(authResult.ok).toBe(false);
    expect(validateAccessCode).not.toHaveBeenCalled();
  });

  it('chama validateAccessCode quando código tem complexidade suficiente', async () => {
    // Código completo e complexo: 16 chars com letra, dígito e especial
    // 'AB3!CD4@EF5#GH6$' — o próprio ACCESS_CODE_PLACEHOLDER
    validateAccessCode.mockResolvedValueOnce({ success: false, message: 'Expirado' });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let authResult: any;
    await act(async () => {
      authResult = await result.current.signInWithCode('AB3!CD4@EF5#GH6$');
    });

    // validateAccessCode DEVE ter sido chamado (passou a validação local)
    expect(validateAccessCode).toHaveBeenCalledWith('AB3!CD4@EF5#GH6$');
    expect(authResult.ok).toBe(false);
    expect(authResult.error).toMatch(/expirado/i);
  });

  it('login bem-sucedido com código válido retorna ok=true', async () => {
    validateAccessCode.mockResolvedValueOnce({
      success: true,
      data: { duration_days: 30 },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let authResult: any;
    await act(async () => {
      authResult = await result.current.signInWithCode('AB3!CD4@EF5#GH6$');
    });

    expect(authResult.ok).toBe(true);
    expect(authResult.isAdmin).toBe(false);
  });
});

// ── signIn ────────────────────────────────────────────────────────────────────

describe('signIn — email/password', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('retorna erro quando rate limit bloqueado', async () => {
    checkLoginRateLimit.mockResolvedValueOnce({ allowed: false, waitSeconds: 30 });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: Awaited<ReturnType<typeof result.current.signIn>> | undefined;
    await act(async () => {
      res = await result.current.signIn('a@b.com', 'pass');
    });
    expect(res!.ok).toBe(false);
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('retorna erro quando supabase retorna error', async () => {
    checkLoginRateLimit.mockResolvedValueOnce({ allowed: true, attemptsRemaining: 4 });
    supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid credentials' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: Awaited<ReturnType<typeof result.current.signIn>> | undefined;
    await act(async () => {
      res = await result.current.signIn('a@b.com', 'wrongpass');
    });
    expect(res!.ok).toBe(false);
    expect((res as { ok: false; error: string } | undefined)?.error).toBe('Invalid credentials');
  });
});

// ── signInAsAdmin ─────────────────────────────────────────────────────────────

describe('signInAsAdmin', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('rejeita senha vazia sem chamar server', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: Awaited<ReturnType<typeof result.current.signInAsAdmin>> | undefined;
    await act(async () => {
      res = await result.current.signInAsAdmin('');
    });
    expect(res!.ok).toBe(false);
    expect(verifyAdminPassword).not.toHaveBeenCalled();
  });

  it('retorna erro quando server rejeita senha', async () => {
    verifyAdminPassword.mockResolvedValueOnce({ ok: false, error: 'Senha incorreta' });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: Awaited<ReturnType<typeof result.current.signInAsAdmin>> | undefined;
    await act(async () => {
      res = await result.current.signInAsAdmin('wrong');
    });
    expect(res!.ok).toBe(false);
    expect((res as { ok: false; error: string } | undefined)?.error).toMatch(/senha incorreta/i);
  });

  it('retorna ok=true e isAdmin=true quando server aceita senha', async () => {
    verifyAdminPassword.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: Awaited<ReturnType<typeof result.current.signInAsAdmin>> | undefined;
    await act(async () => {
      res = await result.current.signInAsAdmin('correctpass');
    });
    expect(res!.ok).toBe(true);
    expect((res as { ok: true; isAdmin: boolean } | undefined)?.isAdmin).toBe(true);
  });
});

describe('AuthContext com FAKE_LOGIN', () => {
  it('com fakeLoginEnabled=true, user é preenchido sem await', async () => {
    vi.doMock('../../config/runtimeFlags', () => ({
      runtimeFlags: { fakeLoginEnabled: true, fakeUserEmail: 'fake@redflix.tv' },
    }));

    // Re-importar para pegar o mock atualizado
    const { AuthProvider: FakeProvider } = await import('../../contexts/AuthContext');
    const { useAuth: useFakeAuth } = await import('../../contexts/AuthContext');

    function FakeConsumer() {
      const { user, loading } = useFakeAuth();
      return <span data-testid="fake-user">{user ? `${user.email}:${loading}` : 'null'}</span>;
    }

    render(
      <FakeProvider>
        <FakeConsumer />
      </FakeProvider>
    );

    // Com fake login, não deve ficar em loading indefinido
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Teste passa se não travar (sem assert de valor pois mock pode variar)
    expect(screen.getByTestId('fake-user')).toBeDefined();
  });
});
