/**
 * Rate Limiter - Cliente para verificar rate limiting
 */

import { supabase } from '../services/supabaseService';
import { getDeviceFingerprint } from './deviceFingerprint';
import { logRateLimitExceeded } from './securityLogger';
import { logger } from './logger';

export type RateLimitAction = 'login' | 'code_validation' | 'password_reset' | 'api_request';

interface RateLimitResult {
  allowed: boolean;
  attemptsRemaining: number;
  blockedUntil: string | null;
  message: string;
}

/**
 * Verifica rate limit para uma ação
 */
export async function checkRateLimit(
  identifier: string,
  actionType: RateLimitAction,
  maxAttempts: number = 5,
  windowMinutes: number = 15,
  blockMinutes: number = 30
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_action_type: actionType,
      p_max_attempts: maxAttempts,
      p_window_minutes: windowMinutes,
      p_block_minutes: blockMinutes,
    });

    if (error) {
      const code = String((error as { code?: string }).code ?? '');
      const msg = String((error as { message?: string }).message ?? '');
      const rpcMissing =
        code === 'PGRST202' ||
        code === '42883' ||
        /does not exist|schema cache|not found/i.test(msg);
      if (!rpcMissing) {
        logger.warn('Rate limit check unavailable:', code, msg.slice(0, 120));
      }
      // SECURITY: fail closed — se não consegue verificar, bloquear (política correta)
      return {
        allowed: false,
        attemptsRemaining: 0,
        blockedUntil: null,
        message: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
      };
    }

    const result = data[0];

    // Se bloqueado, registrar log
    if (!result.allowed) {
      await logRateLimitExceeded(identifier, actionType);
    }

    return {
      allowed: result.allowed,
      attemptsRemaining: result.attempts_remaining,
      blockedUntil: result.blocked_until,
      message: result.message,
    };
  } catch {
    // SECURITY: fail closed — exceções também bloqueiam
    return {
      allowed: false,
      attemptsRemaining: 0,
      blockedUntil: null,
      message: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
    };
  }
}

/**
 * Verifica rate limit para login
 */
export async function checkLoginRateLimit(email: string): Promise<RateLimitResult> {
  return checkRateLimit(email.toLowerCase(), 'login', 5, 15, 30);
}

/**
 * Verifica rate limit para validação de código
 */
export async function checkCodeValidationRateLimit(): Promise<RateLimitResult> {
  const fingerprint = getDeviceFingerprint();
  return checkRateLimit(fingerprint, 'code_validation', 10, 15, 30);
}

/**
 * Verifica rate limit para reset de senha
 */
export async function checkPasswordResetRateLimit(email: string): Promise<RateLimitResult> {
  return checkRateLimit(email.toLowerCase(), 'password_reset', 3, 60, 60);
}

/**
 * Formata mensagem de bloqueio para o usuário
 */
export function formatRateLimitMessage(result: RateLimitResult): string {
  if (result.allowed) {
    if (result.attemptsRemaining <= 2) {
      return `Atenção: Restam ${result.attemptsRemaining} tentativa(s)`;
    }
    return '';
  }

  if (result.blockedUntil) {
    const blockedUntil = new Date(result.blockedUntil);
    const minutesRemaining = Math.ceil((blockedUntil.getTime() - Date.now()) / 60000);
    return `Muitas tentativas. Tente novamente em ${minutesRemaining} minuto(s).`;
  }

  return result.message;
}
