/**
 * Watch Progress - Histórico de reprodução
 * Salva progresso de vídeos/séries para continuar de onde parou
 */

import { supabase } from './supabaseService';
import { logger } from '../utils/logger';

// ERR-02: Queue for failed updates to retry later
const failedUpdateQueue: Array<{
  userId: string;
  mediaId: string;
  mediaType: 'movie' | 'series';
  currentTime: number;
  duration: number;
  seasonNumber?: number;
  episodeNumber?: number;
}> = [];
const MAX_QUEUE_SIZE = 100;

// Process failed queue periodically (auto-stop when queue is empty)
let queueProcessorTimer: ReturnType<typeof setTimeout> | null = null;
function startQueueProcessor() {
  if (queueProcessorTimer) return; // Already scheduled
  const processQueue = async () => {
    queueProcessorTimer = null;
    if (failedUpdateQueue.length === 0) return; // Stop — no more items
    const items = failedUpdateQueue.splice(0, 5);
    for (const item of items) {
      try {
        await saveWatchProgress(
          item.userId,
          item.mediaId,
          item.mediaType,
          item.currentTime,
          item.duration,
          item.seasonNumber,
          item.episodeNumber
        );
      } catch {
        // silently discard after retry
      }
    }
    // Schedule next run only if there are remaining items
    if (failedUpdateQueue.length > 0) {
      queueProcessorTimer = setTimeout(processQueue, 30000);
    }
  };
  queueProcessorTimer = setTimeout(processQueue, 30000);
}

export interface WatchProgress {
  id: string;
  user_id: string;
  media_id: string;
  media_type: 'movie' | 'series';
  season_number?: number;
  episode_number?: number;
  current_time: number;
  duration: number;
  progress_percent: number;
  completed: boolean;
  last_watched: string;
  created_at: string;
}

/**
 * Salva ou atualiza progresso de reprodução
 */
export async function saveWatchProgress(
  userId: string,
  mediaId: string,
  mediaType: 'movie' | 'series',
  currentTime: number,
  duration: number,
  seasonNumber?: number,
  episodeNumber?: number
): Promise<boolean> {
  try {
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const completed = progressPercent >= 90; // Considera completo se assistiu 90%+

    const progressData = {
      user_id: userId,
      media_id: mediaId,
      media_type: mediaType,
      season_number: seasonNumber || null,
      episode_number: episodeNumber || null,
      current_time: Math.floor(currentTime),
      duration: Math.floor(duration),
      progress_percent: Math.floor(progressPercent),
      completed,
      last_watched: new Date().toISOString(),
    };

    // Verificar se já existe progresso
    const { data: existing } = await supabase
      .from('watch_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('media_id', mediaId)
      .eq('media_type', mediaType)
      .eq('season_number', seasonNumber || null)
      .eq('episode_number', episodeNumber || null)
      .single();

    if (existing) {
      // Atualizar existente
      const { error } = await supabase
        .from('watch_progress')
        .update(progressData)
        .eq('id', existing.id);

      if (error) {
        logger.error('Erro ao atualizar progresso:', error);
        // ERR-02: retry once before queuing
        try {
          const { error: retryError } = await supabase
            .from('watch_progress')
            .update(progressData)
            .eq('id', existing.id);
          if (!retryError) return true;
        } catch {
          /* fall through to queue */
        }
        if (failedUpdateQueue.length >= MAX_QUEUE_SIZE) failedUpdateQueue.shift();
        failedUpdateQueue.push({
          userId,
          mediaId,
          mediaType,
          currentTime,
          duration,
          seasonNumber,
          episodeNumber,
        });
        startQueueProcessor();
        return false;
      }
    } else {
      // Criar novo
      const { error } = await supabase.from('watch_progress').insert(progressData);

      if (error) {
        logger.error('Erro ao salvar progresso:', error);
        // ERR-02: retry once before queuing
        try {
          const { error: retryError } = await supabase.from('watch_progress').insert(progressData);
          if (!retryError) return true;
        } catch {
          /* fall through to queue */
        }
        if (failedUpdateQueue.length >= MAX_QUEUE_SIZE) failedUpdateQueue.shift();
        failedUpdateQueue.push({
          userId,
          mediaId,
          mediaType,
          currentTime,
          duration,
          seasonNumber,
          episodeNumber,
        });
        startQueueProcessor();
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('Erro ao salvar watch progress:', error);
    // ERR-02: queue failed update for later retry
    if (failedUpdateQueue.length >= MAX_QUEUE_SIZE) failedUpdateQueue.shift();
    failedUpdateQueue.push({
      userId,
      mediaId,
      mediaType,
      currentTime,
      duration,
      seasonNumber,
      episodeNumber,
    });
    startQueueProcessor();
    return false;
  }
}

/**
 * Busca progresso de um vídeo/episódio específico
 */
export async function getWatchProgress(
  userId: string,
  mediaId: string,
  mediaType: 'movie' | 'series',
  seasonNumber?: number,
  episodeNumber?: number
): Promise<WatchProgress | null> {
  try {
    let query = supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('media_id', mediaId)
      .eq('media_type', mediaType);

    if (seasonNumber !== undefined) {
      query = query.eq('season_number', seasonNumber);
    }
    if (episodeNumber !== undefined) {
      query = query.eq('episode_number', episodeNumber);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Nenhum registro encontrado
        return null;
      }
      logger.error('Erro ao buscar progresso:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Erro ao buscar watch progress:', error);
    return null;
  }
}

/**
 * Busca último episódio assistido de uma série
 */
export async function getLastWatchedEpisode(
  userId: string,
  mediaId: string
): Promise<WatchProgress | null> {
  try {
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('media_id', mediaId)
      .eq('media_type', 'series')
      .order('last_watched', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Erro ao buscar último episódio:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Erro ao buscar último episódio:', error);
    return null;
  }
}

/**
 * Lista todo o histórico de reprodução do usuário
 */
export async function getWatchHistory(
  userId: string,
  limit: number = 20
): Promise<WatchProgress[]> {
  try {
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', userId)
      .order('last_watched', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Erro ao buscar histórico:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Erro ao buscar histórico:', error);
    return [];
  }
}

/**
 * Marca episódio/filme como completo
 */
export async function markAsCompleted(
  userId: string,
  mediaId: string,
  mediaType: 'movie' | 'series',
  seasonNumber?: number,
  episodeNumber?: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('watch_progress')
      .update({ completed: true, progress_percent: 100 })
      .eq('user_id', userId)
      .eq('media_id', mediaId)
      .eq('media_type', mediaType)
      .eq('season_number', seasonNumber || null)
      .eq('episode_number', episodeNumber || null);

    if (error) {
      logger.error('Erro ao marcar como completo:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Erro ao marcar como completo:', error);
    return false;
  }
}

/**
 * Remove progresso (reset)
 */
export async function removeWatchProgress(
  userId: string,
  mediaId: string,
  mediaType: 'movie' | 'series',
  seasonNumber?: number,
  episodeNumber?: number
): Promise<boolean> {
  try {
    let query = supabase
      .from('watch_progress')
      .delete()
      .eq('user_id', userId)
      .eq('media_id', mediaId)
      .eq('media_type', mediaType);

    if (seasonNumber !== undefined) {
      query = query.eq('season_number', seasonNumber);
    }
    if (episodeNumber !== undefined) {
      query = query.eq('episode_number', episodeNumber);
    }

    const { error } = await query;

    if (error) {
      logger.error('Erro ao remover progresso:', error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Erro ao remover progresso:', error);
    return false;
  }
}
