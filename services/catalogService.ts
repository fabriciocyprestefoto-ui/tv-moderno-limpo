import { supabase } from './supabaseService';
import { logger } from '../utils/logger';

export interface CatalogSettings {
  id: number;
  min_year: number;
  max_year: number;
  selected_genres: string[];
  content_type: 'movies' | 'series' | 'mixed';
  updated_at?: string;
}

// Cache em memória — evita round-trip ao Supabase a cada acesso (settings mudam raramente)
const SETTINGS_CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const SETTINGS_QUERY_TIMEOUT_MS = 4000;
const SETTINGS_SELECT = 'id,min_year,max_year,selected_genres,content_type,updated_at';
let settingsCache: { data: CatalogSettings; ts: number } | null = null;

function createScopedAbortSignal(signal?: AbortSignal, timeoutMs = SETTINGS_QUERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  } else if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    },
  };
}

export const getCatalogSettings = async (signal?: AbortSignal): Promise<CatalogSettings | null> => {
  if (settingsCache && Date.now() - settingsCache.ts < SETTINGS_CACHE_TTL) {
    return settingsCache.data;
  }

  const scoped = createScopedAbortSignal(signal);

  try {
    const { data, error } = await supabase
      .from('catalog_settings')
      .select(SETTINGS_SELECT)
      .eq('id', 1)
      .limit(1)
      .abortSignal(scoped.signal as any)
      .maybeSingle();

    if (error) {
      logger.warn('Error fetching catalog settings, using defaults:', error);
      return null;
    }

    if (data) settingsCache = { data, ts: Date.now() };
    return data;
  } catch (error) {
    logger.warn('Catalog settings request timed out, using defaults:', error);
    return null;
  } finally {
    scoped.cleanup();
  }
};

export const updateCatalogSettings = async (settings: Partial<CatalogSettings>) => {
  const { data, error } = await supabase
    .from('catalog_settings')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .maybeSingle();

  if (error) {
    logger.error('Error updating catalog settings:', error);
    throw error;
  }
  settingsCache = null; // invalida cache após update
  return data;
};
