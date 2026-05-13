/**
 * Session Control - Controle de sessões simultâneas
 * Limita a 3 dispositivos ativos por conta
 */

import { supabase } from './supabaseService';
import { getDeviceFingerprint } from '../utils/deviceFingerprint';
import { logger } from '../utils/logger';

const MAX_CONCURRENT_SESSIONS = 3;

export interface ActiveSession {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_info: string;
  ip_address: string | null;
  last_activity: string;
  created_at: string;
}

/**
 * Registra uma nova sessão ativa
 */
export async function registerSession(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const deviceFingerprint = getDeviceFingerprint();
    const deviceInfo = navigator.userAgent;

    // Verificar quantas sessões ativas o usuário tem
    const { data: existingSessions, error: fetchError } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('last_activity', { ascending: false });

    if (fetchError) {
      logger.error('Erro ao buscar sessões:', fetchError);
      return { success: false, error: 'Erro ao verificar sessões' };
    }

    // Verificar se já existe sessão neste dispositivo
    const existingDevice = existingSessions?.find(
      (s) => s.device_fingerprint === deviceFingerprint
    );

    if (existingDevice) {
      // Atualizar sessão existente
      const { error: updateError } = await supabase
        .from('active_sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', existingDevice.id);

      if (updateError) {
        logger.error('Erro ao atualizar sessão:', updateError);
      }

      return { success: true };
    }

    // Verificar limite de sessões
    if (existingSessions && existingSessions.length >= MAX_CONCURRENT_SESSIONS) {
      return {
        success: false,
        error: `Limite de ${MAX_CONCURRENT_SESSIONS} dispositivos simultâneos atingido. Desconecte um dispositivo para continuar.`,
      };
    }

    // Criar nova sessão
    const { error: insertError } = await supabase.from('active_sessions').insert({
      user_id: userId,
      device_fingerprint: deviceFingerprint,
      device_info: deviceInfo,
      ip_address: null, // Será preenchido pelo servidor
      last_activity: new Date().toISOString(),
    });

    if (insertError) {
      logger.error('Erro ao criar sessão:', insertError);
      return { success: false, error: 'Erro ao registrar sessão' };
    }

    return { success: true };
  } catch (error) {
    logger.error('Erro no controle de sessão:', error);
    return { success: false, error: 'Erro inesperado' };
  }
}

/**
 * Atualiza atividade da sessão atual
 */
export async function updateSessionActivity(userId: string): Promise<void> {
  try {
    const deviceFingerprint = getDeviceFingerprint();

    await supabase
      .from('active_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('device_fingerprint', deviceFingerprint);
  } catch (error) {
    logger.error('Erro ao atualizar atividade:', error);
  }
}

/**
 * Remove sessão ao fazer logout
 */
export async function removeSession(userId: string): Promise<void> {
  try {
    const deviceFingerprint = getDeviceFingerprint();

    await supabase
      .from('active_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('device_fingerprint', deviceFingerprint);
  } catch (error) {
    logger.error('Erro ao remover sessão:', error);
  }
}

/**
 * Lista todas as sessões ativas do usuário
 */
export async function getActiveSessions(userId: string): Promise<ActiveSession[]> {
  try {
    const { data, error } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('last_activity', { ascending: false });

    if (error) {
      logger.error('Erro ao buscar sessões:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Erro ao listar sessões:', error);
    return [];
  }
}

/**
 * Remove uma sessão específica (kick device)
 */
export async function kickSession(sessionId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('active_sessions').delete().eq('id', sessionId);

    if (error) {
      logger.error('Erro ao remover sessão:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Erro ao kick sessão:', error);
    return false;
  }
}

/**
 * Limpa sessões inativas (mais de 24h sem atividade) — apenas do usuário especificado
 */
export async function cleanupInactiveSessions(userId: string): Promise<void> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('active_sessions')
      .delete()
      .eq('user_id', userId)
      .lt('last_activity', oneDayAgo);
  } catch (error) {
    logger.error('Erro ao limpar sessões inativas:', error);
  }
}
