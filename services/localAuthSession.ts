/**
 * localAuthSession — sessões client-only para admin (via senha server-side) e access_code.
 *
 * MODELO DE SEGURANÇA:
 * - Admin: senha validada no servidor (adminAuthService → Edge Function). Apenas APÓS
 *   validação server-side este módulo persiste a flag isAdmin=true localmente.
 *   Operações privilegiadas (admin CRUD) são protegidas por RLS no Supabase — o token
 *   local NÃO concede acesso direto ao banco; apenas controla UI.
 * - Access_code: código validado no Supabase (validateAccessCode) antes de criar sessão.
 * - Tokens locais ("local-admin-token", "local-access_code-token") não são JWTs e não
 *   são aceitos pelo Supabase Auth. Alguém que escreva diretamente no storage ganha
 *   acesso à UI admin mas NÃO a dados protegidos por RLS.
 */
import type { Session, User } from '@supabase/supabase-js';
import { normalizeAccessCode } from '@/utils/accessCode';
import { storageGet, storageSet, storageRemove } from './platformStorage';

export type LocalAuthMode = 'admin' | 'access_code';

export interface LocalAuthSessionData {
  mode: LocalAuthMode;
  userId: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  issuedAt: string;
  expiresAt: string;
  accessCode: string | null;
}

const LOCAL_AUTH_SESSION_KEY = 'redx-local-auth-session-v1';
const ADMIN_EMAIL = 'admin@redx.tv';

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

async function persistLocalAuthSession(data: LocalAuthSessionData): Promise<LocalAuthSessionData> {
  await storageSet(LOCAL_AUTH_SESSION_KEY, JSON.stringify(data));
  return data;
}

export async function createAdminLocalSession(): Promise<LocalAuthSessionData> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt);
  expiresAt.setHours(expiresAt.getHours() + 12);
  return persistLocalAuthSession({
    mode: 'admin',
    userId: 'local-admin-redx',
    email: ADMIN_EMAIL,
    displayName: 'Redx Admin',
    isAdmin: true,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    accessCode: null,
  });
}

export async function createAccessCodeLocalSession(params: {
  code: string;
  durationDays: number;
}): Promise<LocalAuthSessionData> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt);
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, params.durationDays));
  const normalizedCode = normalizeAccessCode(params.code);
  return persistLocalAuthSession({
    mode: 'access_code',
    userId: `local-access-${normalizedCode}`,
    email: 'viewer@redx.local',
    displayName: 'Acesso Redx',
    isAdmin: false,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    accessCode: normalizedCode,
  });
}

export async function readLocalAuthSession(): Promise<LocalAuthSessionData | null> {
  try {
    const raw = await storageGet(LOCAL_AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalAuthSessionData;
    if (!parsed?.expiresAt || isExpired(parsed.expiresAt)) {
      await clearLocalAuthSession();
      return null;
    }
    return parsed;
  } catch {
    await clearLocalAuthSession();
    return null;
  }
}

export async function clearLocalAuthSession(): Promise<void> {
  await storageRemove(LOCAL_AUTH_SESSION_KEY);
}

export function buildLocalUser(sessionData: LocalAuthSessionData): User {
  return {
    id: sessionData.userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: sessionData.email,
    email_confirmed_at: sessionData.issuedAt,
    created_at: sessionData.issuedAt,
    updated_at: sessionData.issuedAt,
    app_metadata: sessionData.isAdmin
      ? { role: 'admin', provider: 'local' }
      : { provider: 'local', auth_mode: 'access_code' },
    user_metadata: {
      role: sessionData.isAdmin ? 'admin' : 'viewer',
      display_name: sessionData.displayName,
      access_code: sessionData.accessCode,
    },
  } as unknown as User;
}

export function buildLocalSession(sessionData: LocalAuthSessionData): Session {
  const user = buildLocalUser(sessionData);
  return {
    access_token: `local-${sessionData.mode}-token`,
    refresh_token: `local-${sessionData.mode}-refresh`,
    token_type: 'bearer',
    expires_in: Math.max(
      60,
      Math.floor((new Date(sessionData.expiresAt).getTime() - Date.now()) / 1000)
    ),
    expires_at: Math.floor(new Date(sessionData.expiresAt).getTime() / 1000),
    user,
  } as unknown as Session;
}
