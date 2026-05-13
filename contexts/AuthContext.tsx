import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { supabase } from '../services/supabaseService';
import { logger } from '../utils/logger';
import { hasAdminClaim } from '../utils/authUtils';
import { checkLoginRateLimit, formatRateLimitMessage } from '../utils/rateLimiter';
import { addTrustKey, removeTrustKey } from '../utils/securityGate';
import { validateAccessCode } from '../services/accessCodeService';
import { setSignal } from '../utils/appSignals';
import { clearTrialSession } from '@/utils/trialSessionStorage';
import { clearLocalUserData } from '../services/userService';
import { clearMediaCaches } from '@/utils/mediaCardCaches';
import { runtimeFlags } from '../config/runtimeFlags';
import { TEST_ACCESS_CODE } from '../config/testAccessCode';
import { verifyAdminPassword as verifyServerAdminPassword } from '../services/adminAuthService';
import type { User, Session } from '@supabase/supabase-js';
import {
  buildLocalSession,
  buildLocalUser,
  clearLocalAuthSession,
  createAdminLocalSession,
  createAccessCodeLocalSession,
  readLocalAuthSession,
  type LocalAuthSessionData,
} from '@/services/localAuthSession';
import { hasAccessCodeComplexity, isAccessCodeComplete } from '@/utils/accessCode';

export type AuthResult = { ok: true; isAdmin: boolean } | { ok: false; error: string };

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isProfileSelected: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInAsAdmin: (password: string) => Promise<AuthResult>;
  signInWithCode: (code: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  markProfileSelected: () => void;
  resetProfileSelection: () => void;
}

const PROFILE_SELECTED_STORAGE_KEY = 'redx-profile-selected';

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const _adminCache = new Map<string, { value: boolean; expiresAt: number }>();

function getAdminCache(uid: string): boolean | undefined {
  const entry = _adminCache.get(uid);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _adminCache.delete(uid);
    return undefined;
  }
  return entry.value;
}

function setAdminCache(uid: string, value: boolean): void {
  _adminCache.set(uid, { value, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS });
}

const getProfileSelectionStorageKey = (userId: string): string =>
  `${PROFILE_SELECTED_STORAGE_KEY}:${userId}`;

const readProfileSelection = (userId: string | null | undefined): boolean => {
  if (!userId) return false;
  try {
    return localStorage.getItem(getProfileSelectionStorageKey(userId)) === '1';
  } catch {
    return false;
  }
};

const persistProfileSelection = (userId: string | null | undefined, selected: boolean): void => {
  if (!userId) return;
  try {
    const key = getProfileSelectionStorageKey(userId);
    if (selected) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* noop */
  }
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAdmin: false,
  isProfileSelected: false,
  loading: true,
  signIn: async () => ({ ok: false, error: '' }),
  signInAsAdmin: async () => ({ ok: false, error: '' }),
  signInWithCode: async () => ({ ok: false, error: '' }),
  signUp: async () => ({ ok: false, error: '' }),
  signOut: async () => {},
  markProfileSelected: () => {},
  resetProfileSelection: () => {},
});

export const useAuth = () => useContext(AuthContext);

const FAKE_LOGIN_ENABLED = runtimeFlags.fakeLoginEnabled;
const FAKE_USER_EMAIL = runtimeFlags.fakeUserEmail;

// Sinaliza o AppBootScreen para pular a espera de dados reais
if (FAKE_LOGIN_ENABLED && typeof window !== 'undefined') {
  setSignal('homeReady', true);
  window.__REDX_LIVE_READY = true;
  window.__REDX_VINHETA_READY = true;
}

const fakeUser: User = {
  id: 'fake-user-testsprite',
  aud: 'authenticated',
  role: 'authenticated',
  email: FAKE_USER_EMAIL,
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
} as unknown as User;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(FAKE_LOGIN_ENABLED ? fakeUser : null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProfileSelected, setIsProfileSelected] = useState(FAKE_LOGIN_ENABLED);
  const [loading, setLoading] = useState(!FAKE_LOGIN_ENABLED);
  const lastUserIdRef = useRef<string | null>(FAKE_LOGIN_ENABLED ? fakeUser.id : null);


  const resolveIsAdmin = async (currentSession: Session | null): Promise<boolean> => {
    const currentUser = currentSession?.user;
    if (!currentUser) return false;
    if (hasAdminClaim(currentSession)) return true;

    const uid = currentUser.id;
    const cached = getAdminCache(uid);
    if (cached !== undefined) return cached;

    try {
      const { data, error } = await supabase
        .from('crm_admins')
        .select('id')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle();

      if (error) {
        setAdminCache(uid, false);
        return false;
      }
      const result = Boolean(data?.id);
      setAdminCache(uid, result);
      return result;
    } catch {
      setAdminCache(uid, false);
      return false;
    }
  };

  const applyLocalSession = useCallback((localAuth: LocalAuthSessionData) => {
    const localSession = buildLocalSession(localAuth);
    const localUser = buildLocalUser(localAuth);
    const localUserId = localUser.id ?? null;

    setSession(localSession);
    setUser(localUser);
    setIsAdmin(localAuth.isAdmin);
    setIsProfileSelected(readProfileSelection(localUserId));
    lastUserIdRef.current = localUserId;
    addTrustKey('auth');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (FAKE_LOGIN_ENABLED) return;
    let cancelled = false;
    let _sub: { unsubscribe: () => void } | null = null;

    void (async () => {
      const localAuth = await readLocalAuthSession();
      if (localAuth && !cancelled) {
        applyLocalSession(localAuth);
        return;
      }

      supabase.auth
        .getSession()
        .then(async ({ data: { session } }) => {
          if (cancelled) return;
          // Login por código / 000000 só existe em React + localStorage — Supabase devolve null e
          // apagava o utilizador se este .then atrasado correr depois do applyLocalSession.
          const localOnly = await readLocalAuthSession();
          if (!session?.user && localOnly) {
            applyLocalSession(localOnly);
            return;
          }
          const currentUserId = session?.user?.id ?? null;
          setSession(session);
          setUser(session?.user ?? null);
          setIsProfileSelected(readProfileSelection(currentUserId));
          lastUserIdRef.current = currentUserId;
          const claimAdmin = hasAdminClaim(session);
          setIsAdmin(claimAdmin);
          if (session) addTrustKey('auth');
          setLoading(false);
          if (!claimAdmin && session?.user) {
            resolveIsAdmin(session).then((admin) => {
              if (!cancelled) setIsAdmin(admin);
            });
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          logger.error('[Auth] getSession falhou:', err);
          setLoading(false);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          if (event === 'TOKEN_REFRESHED') logger.log('[Auth] Token refreshed');
          if (event === 'SIGNED_OUT' || (!newSession && event === 'INITIAL_SESSION'))
            logger.warn('[Auth] Sessão perdida ou sem utilizador inicial');
        }

        if (newSession?.user) {
          const currentUserId = newSession.user.id ?? null;
          if (!currentUserId && lastUserIdRef.current)
            persistProfileSelection(lastUserIdRef.current, false);
          setSession(newSession);
          setUser(newSession.user);
          setIsProfileSelected(readProfileSelection(currentUserId));
          lastUserIdRef.current = currentUserId;
          addTrustKey('auth');
          setLoading(false);
          void resolveIsAdmin(newSession).then((admin) => {
            if (!cancelled) setIsAdmin(admin);
          });
          return;
        }

        const localOnly = await readLocalAuthSession();
        if (localOnly && !cancelled) {
          applyLocalSession(localOnly);
          return;
        }

        if (lastUserIdRef.current) persistProfileSelection(lastUserIdRef.current, false);
        setSession(null);
        setUser(null);
        setIsProfileSelected(false);
        lastUserIdRef.current = null;
        removeTrustKey('auth');
        setLoading(false);
        void resolveIsAdmin(null).then((admin) => {
          if (!cancelled) setIsAdmin(admin);
        });
      });
      _sub = subscription;
    })();

    return () => {
      cancelled = true;
      _sub?.unsubscribe();
    };
  }, [applyLocalSession]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      const rateLimit = await checkLoginRateLimit(email);
      if (!rateLimit.allowed) {
        logger.warn('Login bloqueado por rate limiting:', email);
        return { ok: false, error: formatRateLimitMessage(rateLimit) };
      }

      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        logger.error('Login error:', error.message);
        setLoading(false);
        return { ok: false, error: error.message };
      }

      if (data.session) {
        const currentUserId = data.session.user?.id ?? null;
        persistProfileSelection(currentUserId, false);
        setSession(data.session);
        setUser(data.session.user);
        setIsProfileSelected(false);
        lastUserIdRef.current = currentUserId;
        const admin = await resolveIsAdmin(data.session);
        setIsAdmin(admin);
        addTrustKey('auth');
        setLoading(false);
        return { ok: true, isAdmin: admin };
      }

      setLoading(false);
      return { ok: false, error: 'Sessao nao criada' };
    } catch (err) {
      logger.error('[Auth] signIn erro inesperado:', err);
      setLoading(false);
      return { ok: false, error: 'Erro inesperado' };
    }
  }, []);

  const signInAsAdmin = useCallback(
    async (password: string): Promise<AuthResult> => {
      const normalizedPassword = password.trim();
      if (!normalizedPassword) {
        return { ok: false, error: 'Digite a senha admin' };
      }

      setLoading(true);
      try {
        const result = await verifyServerAdminPassword(normalizedPassword);
        if (!result.ok) {
          setLoading(false);
          return { ok: false, error: result.error || 'Senha incorreta' };
        }

        const localAuth = await createAdminLocalSession();
        persistProfileSelection(localAuth.userId, false);
        applyLocalSession(localAuth);
        setIsProfileSelected(false);
        setLoading(false);
        return { ok: true, isAdmin: true };
      } catch (err) {
        logger.error('[Auth] signInAsAdmin erro inesperado:', err);
        setLoading(false);
        return { ok: false, error: 'Erro ao validar senha admin' };
      }
    },
    [applyLocalSession]
  );

  const signInWithCode = useCallback(
    async (code: string): Promise<AuthResult> => {
      if (!code || code.trim().length < 4) {
        return { ok: false, error: 'Codigo invalido' };
      }

      // Bypass teste: código "000000" continua disponível em dev/APKs marcados como teste.
      if (runtimeFlags.tvTestAccessCodeEnabled && code.trim() === TEST_ACCESS_CODE) {
        const localAuth = await createAccessCodeLocalSession({
          code: `DEV-TEST-${TEST_ACCESS_CODE}`,
          durationDays: 30,
        });
        applyLocalSession(localAuth);
        persistProfileSelection(localAuth.userId, false);
        setIsAdmin(false);
        setIsProfileSelected(false);
        setLoading(false);
        return { ok: true, isAdmin: false };
      }

      const trimmed = code.trim().toUpperCase();
      if (!isAccessCodeComplete(trimmed) || !hasAccessCodeComplexity(trimmed)) {
        return { ok: false, error: 'Codigo invalido' };
      }

      setLoading(true);
      try {
        const result = await validateAccessCode(trimmed);
        if (!result.success) {
          setLoading(false);
          return { ok: false, error: result.message || 'Codigo invalido ou expirado' };
        }

        const localAuth = await createAccessCodeLocalSession({
          code: trimmed,
          durationDays: result.data?.duration_days ?? 1,
        });
        applyLocalSession(localAuth);
        persistProfileSelection(localAuth.userId, false);
        setIsAdmin(false);
        setIsProfileSelected(false);
        setLoading(false);
        return { ok: true, isAdmin: false };
      } catch (err) {
        logger.error('[Auth] signInWithCode erro inesperado:', err);
        setLoading(false);
        return { ok: false, error: 'Erro ao validar codigo' };
      }
    },
    [applyLocalSession]
  );

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return { ok: false, error: error.message };
      return { ok: true, isAdmin: false };
    } catch (err) {
      logger.error('[Auth] signUp erro inesperado:', err);
      setLoading(false);
      return { ok: false, error: 'Erro inesperado no cadastro' };
    }
  }, []);

  const signOut = useCallback(async () => {
    const currentUserId = session?.user?.id ?? user?.id ?? lastUserIdRef.current;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      logger.error('Erro ao fazer logout:', err);
    } finally {
      _adminCache.clear();
      await clearLocalAuthSession();
      removeTrustKey('auth');
      clearTrialSession();
      clearLocalUserData();
      clearMediaCaches();
      try {
        localStorage.removeItem('redx-catalog-cache');
      } catch {
        /* noop */
      }
      persistProfileSelection(currentUserId, false);
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      setIsProfileSelected(false);
      lastUserIdRef.current = null;
    }
  }, [session, user]);

  const markProfileSelected = useCallback(() => {
    const currentUserId = session?.user?.id ?? user?.id ?? lastUserIdRef.current;
    if (!currentUserId) return;
    persistProfileSelection(currentUserId, true);
    setIsProfileSelected(true);
  }, [session, user]);

  const resetProfileSelection = useCallback(() => {
    const currentUserId = session?.user?.id ?? user?.id ?? lastUserIdRef.current;
    persistProfileSelection(currentUserId, false);
    setIsProfileSelected(false);
  }, [session, user]);

  const contextValue = useMemo(
    () => ({
      user,
      session,
      isAdmin,
      isProfileSelected,
      loading,
      signIn,
      signInAsAdmin,
      signInWithCode,
      signUp,
      signOut,
      markProfileSelected,
      resetProfileSelection,
    }),
    [
      user,
      session,
      isAdmin,
      isProfileSelected,
      loading,
      signIn,
      signInAsAdmin,
      signInWithCode,
      signUp,
      signOut,
      markProfileSelected,
      resetProfileSelection,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export default AuthContext;
