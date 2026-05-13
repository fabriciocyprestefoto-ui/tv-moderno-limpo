/**
 * Admin Auth Service — Validação server-side da senha admin
 * Chama Supabase Edge Function verify-admin-password (senha nunca exposta no client)
 *
 * Desenvolvimento: `VITE_ADMIN_PASSWORD_FALLBACK` no `.env` permite login quando a função
 * ainda não foi publicada ou falha (rede/CORS). Em build de produção o Vite bloqueia essa
 * variável se estiver definida — ver vite.config.ts.
 */
import { supabase } from './supabaseService';

/** Só em `vite dev`: senha de emergência documentada em `.env.example`. Produção: sempre undefined. */
const fallbackAdminPassword: string | undefined =
  import.meta.env.DEV && String(import.meta.env.VITE_ADMIN_PASSWORD_FALLBACK ?? '').trim()
    ? String(import.meta.env.VITE_ADMIN_PASSWORD_FALLBACK).trim()
    : undefined;

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

function verifyFallbackPassword(password: string): boolean {
  return Boolean(fallbackAdminPassword) && password === fallbackAdminPassword;
}

export async function verifyAdminPassword(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) {
    return { ok: false, error: 'Digite a senha admin' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('verify-admin-password', {
      body: { password: normalizedPassword },
    });

    if (error) {
      // Qualquer erro de rede/função → tenta fallback local antes de rejeitar
      if (verifyFallbackPassword(normalizedPassword)) {
        return { ok: true };
      }
      let msg = error.message || 'Falha ao verificar senha';
      if (
        import.meta.env.DEV &&
        !fallbackAdminPassword &&
        isMissingOrUnavailableFunctionError(msg)
      ) {
        msg +=
          ' Publique a Edge Function verify-admin-password no Supabase ou defina VITE_ADMIN_PASSWORD_FALLBACK no .env (só dev).';
      }
      return { ok: false, error: msg };
    }

    const ok = data?.ok === true;

    // Função retornou ok:false por qualquer motivo (sem configuração, senha errada no servidor, etc.)
    // Tenta o fallback local antes de rejeitar definitivamente.
    if (!ok && verifyFallbackPassword(normalizedPassword)) {
      return { ok: true };
    }

    return {
      ok,
      error: ok ? undefined : data?.error || 'Senha incorreta',
    };
  } catch (e) {
    if (verifyFallbackPassword(normalizedPassword)) {
      return { ok: true };
    }
    const base = 'Falha ao verificar senha';
    if (import.meta.env.DEV && !fallbackAdminPassword) {
      return {
        ok: false,
        error: `${base}. Publique verify-admin-password no Supabase ou defina VITE_ADMIN_PASSWORD_FALLBACK no .env.`,
      };
    }
    return { ok: false, error: base };
  }
}
