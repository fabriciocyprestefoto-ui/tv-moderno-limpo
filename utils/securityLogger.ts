/**
 * Security Logger - Sistema de logs de segurança
 * Registra eventos suspeitos e tentativas de acesso não autorizado
 */

import { logger } from './logger';

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'code_validation_failed'
  | 'token_expired'
  | 'token_invalid'
  | 'device_blocked'
  | 'suspicious_activity'
  | 'multiple_devices'
  | 'rate_limit_exceeded'
  | 'unauthorized_access';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

interface SecurityLogData {
  userId?: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  details?: Record<string, any>;
}

/**
 * Registra evento de segurança
 */
export async function logSecurityEvent(data: SecurityLogData): Promise<boolean> {
  // DESABILITADO: Evita disparos constantes à rede no cliente (TV Box)
  if (import.meta.env.DEV) {
    logger.log(`🔒 Security Log [${data.severity.toUpperCase()}]:`, {
      event: data.eventType,
      user: data.userId,
      details: data.details,
    });
  }
  return true;
}

/**
 * Registra login bem-sucedido
 */
export function logLoginSuccess(userId: string, method: 'email' | 'code' = 'email') {
  return logSecurityEvent({
    userId,
    eventType: 'login_success',
    severity: 'low',
    details: { method },
  });
}

/**
 * Registra falha de login
 */
export function logLoginFailed(email?: string, reason?: string) {
  return logSecurityEvent({
    userId: email,
    eventType: 'login_failed',
    severity: 'medium',
    details: { reason },
  });
}

/**
 * Registra falha na validação de código
 */
export function logCodeValidationFailed(code: string, reason: string) {
  return logSecurityEvent({
    eventType: 'code_validation_failed',
    severity: 'medium',
    details: { code, reason },
  });
}

/**
 * Registra token expirado
 */
export function logTokenExpired(userId: string, tokenType: string) {
  return logSecurityEvent({
    userId,
    eventType: 'token_expired',
    severity: 'low',
    details: { tokenType },
  });
}

/**
 * Registra token inválido
 */
export function logTokenInvalid(userId: string, tokenType: string, reason: string) {
  return logSecurityEvent({
    userId,
    eventType: 'token_invalid',
    severity: 'high',
    details: { tokenType, reason },
  });
}

/**
 * Registra dispositivo bloqueado
 */
export function logDeviceBlocked(userId: string, deviceFingerprint: string, reason: string) {
  return logSecurityEvent({
    userId,
    eventType: 'device_blocked',
    severity: 'high',
    details: { deviceFingerprint, reason },
  });
}

/**
 * Registra atividade suspeita
 */
export function logSuspiciousActivity(
  userId: string,
  activity: string,
  details?: Record<string, any>
) {
  return logSecurityEvent({
    userId,
    eventType: 'suspicious_activity',
    severity: 'high',
    details: { activity, ...details },
  });
}

/**
 * Registra múltiplos dispositivos
 */
export function logMultipleDevices(userId: string, deviceCount: number) {
  return logSecurityEvent({
    userId,
    eventType: 'multiple_devices',
    severity: 'medium',
    details: { deviceCount },
  });
}

/**
 * Registra excesso de rate limit
 */
export function logRateLimitExceeded(identifier: string, endpoint: string) {
  return logSecurityEvent({
    eventType: 'rate_limit_exceeded',
    severity: 'medium',
    details: { identifier, endpoint },
  });
}

/**
 * Registra acesso não autorizado
 */
export function logUnauthorizedAccess(userId: string, resource: string) {
  return logSecurityEvent({
    userId,
    eventType: 'unauthorized_access',
    severity: 'critical',
    details: { resource },
  });
}
