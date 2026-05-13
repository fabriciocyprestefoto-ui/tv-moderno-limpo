/**
 * platformEnrichment.ts — Identifica e atualiza plataforma de filmes/séries via TMDB API.
 * Para itens no catálogo sem campo 'platform', busca no TMDB (watch/providers) e atualiza o Supabase.
 * Usa supabaseAdmin (service_role) quando VITE_SUPABASE_SERVICE_ROLE_KEY está no .env — acesso total.
 */

import { Media } from '../types';
import { getWatchProviderName } from './tmdb';
import { supabase, supabaseAdmin } from './supabaseService';
import { logger } from '../utils/logger';

const BATCH_SIZE = 6;
const DELAY_MS = 300;

export interface EnrichResult {
  updated: number;
  failed: number;
  skipped: number;
  noProvider: number;
}

/**
 * Enriquece itens sem plataforma definida, buscando no TMDB e atualizando o Supabase.
 * Executa em lotes para evitar rate-limit da API.
 */
export async function enrichPlatformFromTmdb(
  items: Media[],
  onProgress?: (done: number, total: number, result: EnrichResult) => void
): Promise<EnrichResult> {
  const toEnrich = items.filter(
    (m) => m.tmdb_id && Number(m.tmdb_id) > 0 && (!m.platform || String(m.platform).trim() === '')
  );

  const result: EnrichResult = { updated: 0, failed: 0, skipped: 0, noProvider: 0 };

  if (toEnrich.length === 0) {
    logger.log('[platformEnrichment] Nenhum item sem plataforma para enriquecer');
    return result;
  }

  logger.log(`[platformEnrichment] Enriquecendo ${toEnrich.length} itens sem plataforma...`);

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const provider = await getWatchProviderName(
          Number(item.tmdb_id),
          item.type === 'series' ? 'series' : 'movie'
        );
        return { item, provider };
      })
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        result.failed++;
        continue;
      }
      const { item, provider } = r.value;
      if (!provider) {
        result.noProvider++;
        continue;
      }

      try {
        const client = supabaseAdmin ?? supabase;
        const table = item.type === 'movie' ? 'movies' : 'series';
        const { error } = await client.from(table).update({ platform: provider }).eq('id', item.id);
        if (error) throw error;
        result.updated++;
      } catch (err) {
        result.failed++;
        logger.warn(`[platformEnrichment] Falha ao atualizar ${item.title}:`, err);
      }
    }

    onProgress?.(Math.min(i + BATCH_SIZE, toEnrich.length), toEnrich.length, result);

    if (i + BATCH_SIZE < toEnrich.length) {
      await new Promise((ok) => setTimeout(ok, DELAY_MS));
    }
  }

  logger.log(
    `[platformEnrichment] Concluído: ${result.updated} atualizados, ${result.noProvider} sem dados TMDB, ${result.failed} erros`
  );
  return result;
}

/**
 * Executa enriquecimento em background (não bloqueia).
 * Útil para chamar após carregar o catálogo.
 */
export function enrichPlatformFromTmdbBackground(
  movies: Media[],
  series: Media[],
  onComplete?: (result: EnrichResult) => void
): void {
  const all = [...movies, ...series];
  const toEnrich = all.filter(
    (m) => m.tmdb_id && Number(m.tmdb_id) > 0 && (!m.platform || String(m.platform).trim() === '')
  );

  if (toEnrich.length === 0) {
    onComplete?.({ updated: 0, failed: 0, skipped: 0, noProvider: 0 });
    return;
  }

  enrichPlatformFromTmdb(toEnrich, (_a, _b, _result) => {
    // Progresso opcional
  }).then(onComplete);
}
