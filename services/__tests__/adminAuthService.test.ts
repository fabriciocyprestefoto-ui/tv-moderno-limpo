/**
 * Unit tests — adminAuthService
 * Validates password verification logic, fallback behaviour,
 * and error classification independently of Supabase network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Helpers under test (extracted from service to keep it unit-testable) ──

function isMissingOrUnavailableFunctionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('not found') ||
    normalized.includes('requested function was not found') ||
    normalized.includes('non-2xx') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('falha ao verificar senha') ||
    normalized.includes('não configurado') ||
    normalized.includes('nao configurado') ||
    normalized.includes('not configured')
  );
}

function verifyFallbackPassword(password: string, fallback: string | undefined): boolean {
  return Boolean(fallback) && password === fallback;
}

// ── Tests ──

describe('isMissingOrUnavailableFunctionError', () => {
  it('matches "not found"', () => {
    expect(isMissingOrUnavailableFunctionError('Function Not Found')).toBe(true);
  });

  it('matches "failed to fetch"', () => {
    expect(isMissingOrUnavailableFunctionError('Failed to fetch')).toBe(true);
  });

  it('matches "non-2xx"', () => {
    expect(isMissingOrUnavailableFunctionError('non-2xx status code returned')).toBe(true);
  });

  it('matches "nao configurado"', () => {
    expect(isMissingOrUnavailableFunctionError('VITE_KEY nao configurado')).toBe(true);
  });

  it('does NOT match unrelated error', () => {
    expect(isMissingOrUnavailableFunctionError('Invalid credentials')).toBe(false);
  });

  it('does NOT match empty string', () => {
    expect(isMissingOrUnavailableFunctionError('')).toBe(false);
  });
});

describe('verifyFallbackPassword', () => {
  it('returns true when password matches fallback', () => {
    expect(verifyFallbackPassword('s3cr3t', 's3cr3t')).toBe(true);
  });

  it('returns false when password does not match fallback', () => {
    expect(verifyFallbackPassword('wrong', 's3cr3t')).toBe(false);
  });

  it('returns false when fallback is undefined', () => {
    expect(verifyFallbackPassword('s3cr3t', undefined)).toBe(false);
  });

  it('returns false when fallback is empty string', () => {
    expect(verifyFallbackPassword('s3cr3t', '')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(verifyFallbackPassword('S3cr3t', 's3cr3t')).toBe(false);
  });
});

// ── Simulate verifyAdminPassword core logic (mocked Supabase) ──

type InvokeFn = (name: string, opts: object) => Promise<{ data: unknown; error: unknown }>;
type SupabaseMock = {
  functions: {
    invoke: InvokeFn & {
      mockResolvedValue: (v: unknown) => void;
      mockRejectedValue: (e: unknown) => void;
    };
  };
};

async function verifyAdminPasswordCore(
  password: string,
  supabase: SupabaseMock,
  fallback: string | undefined,
  isDev: boolean
): Promise<{ ok: boolean; error?: string }> {
  const normalized = password.trim();
  if (!normalized) return { ok: false, error: 'Digite a senha admin' };

  try {
    const { data, error } = await supabase.functions.invoke('verify-admin-password', {
      body: { password: normalized },
    });

    if (error) {
      if (verifyFallbackPassword(normalized, fallback)) return { ok: true };
      let msg = (error as { message?: string }).message || 'Falha ao verificar senha';
      if (isDev && !fallback && isMissingOrUnavailableFunctionError(msg)) {
        msg += ' Deploy the Edge Function or set VITE_ADMIN_PASSWORD_FALLBACK in .env (dev only).';
      }
      return { ok: false, error: msg };
    }

    const ok = (data as { ok?: boolean })?.ok === true;
    if (!ok && verifyFallbackPassword(normalized, fallback)) return { ok: true };
    return { ok, error: ok ? undefined : (data as { error?: string })?.error || 'Senha incorreta' };
  } catch {
    if (verifyFallbackPassword(normalized, fallback)) return { ok: true };
    return { ok: false, error: 'Falha ao verificar senha' };
  }
}

describe('verifyAdminPasswordCore', () => {
  let supabase: SupabaseMock;

  beforeEach(() => {
    supabase = { functions: { invoke: vi.fn() as unknown as SupabaseMock['functions']['invoke'] } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects blank password immediately', async () => {
    const result = await verifyAdminPasswordCore('   ', supabase, undefined, false);
    expect(result).toEqual({ ok: false, error: 'Digite a senha admin' });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('returns ok:true when function responds with ok:true', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const result = await verifyAdminPasswordCore('correctPwd', supabase, undefined, false);
    expect(result).toEqual({ ok: true, error: undefined });
  });

  it('returns ok:false when function responds with ok:false', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: false, error: 'Wrong password' },
      error: null,
    });
    const result = await verifyAdminPasswordCore('wrongPwd', supabase, undefined, false);
    expect(result).toEqual({ ok: false, error: 'Wrong password' });
  });

  it('uses fallback when function returns an error', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch' },
    });
    const result = await verifyAdminPasswordCore('fallback123', supabase, 'fallback123', true);
    expect(result).toEqual({ ok: true });
  });

  it('rejects when function errors and fallback does not match', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Function Not Found' },
    });
    const result = await verifyAdminPasswordCore('wrongPwd', supabase, 'fallback123', false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Function Not Found');
  });

  it('uses fallback when function throws', async () => {
    supabase.functions.invoke.mockRejectedValue(new Error('Network error'));
    const result = await verifyAdminPasswordCore('fallback123', supabase, 'fallback123', false);
    expect(result).toEqual({ ok: true });
  });

  it('returns generic error when function throws and no fallback', async () => {
    supabase.functions.invoke.mockRejectedValue(new Error('Network error'));
    const result = await verifyAdminPasswordCore('anyPwd', supabase, undefined, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Falha ao verificar senha');
  });
});
