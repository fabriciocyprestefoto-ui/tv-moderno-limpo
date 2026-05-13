import { useState, useEffect, useRef } from 'react';
import { TRIAL_EXPIRED_KEY } from '@/utils/trialSessionStorage';

interface TrialSession {
  isActive: boolean;
  code: string | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

export { clearTrialSession, hasActiveTrialSession } from '@/utils/trialSessionStorage';

/**
 * Hook para gerenciar sessão trial de usuários que fizeram login com código de acesso
 */
export function useTrialSession(): TrialSession {
  const [session, setSession] = useState<TrialSession>({
    isActive: false,
    code: null,
    expiresAt: null,
    isExpired: false,
  });
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkTrialSession = () => {
      try {
        // Verificar se já expirou anteriormente (persiste entre polls)
        const alreadyExpired = localStorage.getItem(TRIAL_EXPIRED_KEY) === 'true';
        if (alreadyExpired) {
          setSession({ isActive: false, code: null, expiresAt: null, isExpired: true });
          return;
        }

        const code = localStorage.getItem('redx_trial_code');
        const expiresAtStr = localStorage.getItem('redx_trial_expires');

        if (!code || !expiresAtStr) {
          setSession({
            isActive: false,
            code: null,
            expiresAt: null,
            isExpired: false,
          });
          return;
        }

        const expiresAt = new Date(expiresAtStr);
        // Validar que o parse foi bem-sucedido
        if (isNaN(expiresAt.getTime())) {
          localStorage.removeItem('redx_trial_code');
          localStorage.removeItem('redx_trial_expires');
          setSession({ isActive: false, code: null, expiresAt: null, isExpired: false });
          return;
        }

        const now = new Date();
        const isExpired = expiresAt < now;

        if (isExpired) {
          // Persistir o estado de expiração ANTES de limpar os dados
          localStorage.setItem(TRIAL_EXPIRED_KEY, 'true');
          localStorage.removeItem('redx_trial_code');
          localStorage.removeItem('redx_trial_expires');

          setSession({
            isActive: false,
            code: null,
            expiresAt: null,
            isExpired: true,
          });
          return;
        }

        setSession({
          isActive: true,
          code,
          expiresAt,
          isExpired: false,
        });

        // Agendar expiração exata em vez de depender só do poll de 60s
        if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
        const msUntilExpiry = expiresAt.getTime() - Date.now();
        expiryTimerRef.current = setTimeout(() => {
          checkTrialSession();
        }, msUntilExpiry + 100); // +100ms de margem
      } catch (error) {
        console.error('Erro ao verificar sessão trial:', error);
        setSession({
          isActive: false,
          code: null,
          expiresAt: null,
          isExpired: false,
        });
      }
    };

    // Verificar imediatamente
    checkTrialSession();

    // Fallback: setTimeout recursivo a cada 60s (mais leve que setInterval)
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFallback = () => {
      fallbackTimer = setTimeout(() => {
        checkTrialSession();
        scheduleFallback();
      }, 60000);
    };
    scheduleFallback();

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, []);

  return session;
}
