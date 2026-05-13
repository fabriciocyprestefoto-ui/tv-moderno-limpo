import { supabase } from './supabaseService';
import { logger } from '../utils/logger';
import { toWebP } from '../utils/imageProxy';
import { isTrusted } from '../utils/securityGate';
import { stripDiacriticsSafe } from '../utils/safeUnicodeNormalize';
import { pickFirstRealStreamUrlFromRow } from '../utils/streamUrlGuards';

/**
 * StreamService v3 — Sequência de Episódios + WebP Priority + Heartbeat Resiliente
 * ═══════════════════════════════════════════════════════════════════════════════════
 * SEGURANÇA: Todas as funções que retornam stream_url verificam estado de confiança
 * Se o app não estiver em estado confiável, retorna null (não consegue obter URLs)
 *
 * Estratégia: tmdb_id (Number → String fallback) → título exato → parcial → tabela alternativa
 * Cache em memória para evitar queries repetidas.
 *
 * v3:
 * - getNextEpisode(): busca próximo episódio com título, stream_url e progresso salvo
 * - resolveImageUrl(): prioriza WebP do Storage sobre TMDB
 * - resilientSaveProgress(): heartbeat 30s com retry e localStorage fallback
 */

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
export interface NextEpisodeResult {
  title: string;
  season: number;
  episode: number;
  stream_url: string;
  savedProgress: number; // segundos já assistidos (0 se novo)
}

// ═══════════════════════════════════════════════════════
// CACHES — LRU com limite de 200 entradas (evita vazamento de memória)
// ═══════════════════════════════════════════════════════
const MAX_CACHE_SIZE = 200;

function lruSet<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.size >= MAX_CACHE_SIZE && !map.has(key)) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key);
  if (value !== undefined) {
    map.delete(key);
    map.set(key, value);
  }
  return value;
}

const streamCache = new Map<string, string | null>();
const nextEpisodeCache = new Map<string, NextEpisodeResult | null>();
const imageUrlCache = new Map<string, string>();

// Chave do localStorage para heartbeat resiliente
const PROGRESS_LS_KEY = 'redx_progress_backup';

function normalizeTitle(title: string): string {
  const raw = String(title ?? '').trim();
  if (!raw || raw.length < 2) return ''; // empty title → never query
  return stripDiacriticsSafe(raw.toLowerCase())
    .replace(/[^a-z0-9\s&]/g, '') // preserva & que é comum em títulos ("Liga & Copa")
    .replace(/\s+/g, ' ')
    .trim();
}

// Escapar caracteres especiais do PostgREST/ilike (%, _, \)
// Também sanitiza caracteres que podem causar erro 400 no PostgREST
function escapeIlike(title: string): string {
  if (!title || !title.trim()) return '';
  return title.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').trim();
}

// Validar se o título é seguro para query (evitar 400)
function isSafeForQuery(title: string): boolean {
  return !!title && title.trim().length >= 2;
}

function readFirstPlayableUrl(
  rows: unknown[] | null | undefined
): string | null {
  if (!rows || rows.length === 0) return null;
  const picked = pickFirstRealStreamUrlFromRow(rows[0] as Record<string, unknown>);
  return picked || null;
}

async function getMovieStreamUrl(title: string, tmdbId?: number): Promise<string | null> {
  try {
    if (!title.trim() && (!tmdbId || Number(tmdbId) <= 0)) {
      return null;
    }

    if (tmdbId && Number(tmdbId) > 0) {
      const { data, error } = await supabase
        .from('movies')
        .select('*')
        .eq('tmdb_id', Number(tmdbId))

        .order('created_at', { ascending: false })
        .range(0, 0);

      if (error) logger.error('[StreamService] Erro query movie tmdb_id:', error);

      const exactNumeric = readFirstPlayableUrl(data);
      if (exactNumeric) return exactNumeric;

      const { data: dataStr, error: errStr } = await supabase
        .from('movies')
        .select('*')
        .eq('tmdb_id', String(tmdbId))

        .order('created_at', { ascending: false })
        .range(0, 0);

      if (errStr) logger.error('[StreamService] Erro query movie tmdb_id str:', errStr);

      const exactString = readFirstPlayableUrl(dataStr);
      if (exactString) return exactString;
    }

    if (!title.trim()) return null;

    const safeTitle = escapeIlike(title);
    if (!isSafeForQuery(safeTitle)) {
      logger.warn(`[StreamService] Título inválido para query movie: "${title}"`);
      return null;
    }

    const { data: exactMatch, error: errExact } = await supabase
      .from('movies')
      .select('title, stream_url, video_url, source_url, url, link')
      .ilike('title', safeTitle)

      .order('created_at', { ascending: false })
      .range(0, 0);

    if (errExact) logger.error('[StreamService] Erro query movie exact:', errExact);

    const exactTitleMatch = readFirstPlayableUrl(exactMatch);
    if (exactTitleMatch) return exactTitleMatch;

    const { data: partialMatches, error: errPartial } = await supabase
      .from('movies')
      .select('title, stream_url, video_url, source_url, url, link')
      .ilike('title', `%${safeTitle}%`)

      .order('created_at', { ascending: false })
      .range(0, 4);

    if (errPartial) logger.error('[StreamService] Erro query movie partial:', errPartial);

    if (partialMatches && partialMatches.length > 0) {
      const normalizedSearch = normalizeTitle(title);
      const best = partialMatches.slice().sort((a, b) => {
        const diffA = Math.abs(normalizeTitle(a.title).length - normalizedSearch.length);
        const diffB = Math.abs(normalizeTitle(b.title).length - normalizedSearch.length);
        return diffA - diffB;
      })[0];

      const bestUrl = readFirstPlayableUrl(best ? [best] : null);
      if (bestUrl) return bestUrl;
    }

    return null;
  } catch (err) {
    logger.error(`[StreamService] EXCEPTION movie stream "${title}":`, err);
    return null;
  }
}

async function findSeriesId(title: string, tmdbId?: number): Promise<string | null> {
  if (tmdbId && Number(tmdbId) > 0) {
    const { data, error } = await supabase
      .from('series')
      .select('id')
      .eq('tmdb_id', Number(tmdbId))
      .order('created_at', { ascending: false })
      .range(0, 0);

    if (error) logger.error('[StreamService] Erro query series tmdb_id:', error);
    if (data && data.length > 0 && data[0].id) return data[0].id;

    const { data: dataStr, error: errStr } = await supabase
      .from('series')
      .select('id')
      .eq('tmdb_id', String(tmdbId))
      .order('created_at', { ascending: false })
      .range(0, 0);

    if (errStr) logger.error('[StreamService] Erro query series tmdb_id str:', errStr);
    if (dataStr && dataStr.length > 0 && dataStr[0].id) return dataStr[0].id;
  }

  if (!title.trim()) return null;

  const safeTitle = escapeIlike(title);
  if (!isSafeForQuery(safeTitle)) return null;

  const { data: exactMatch, error: errExact } = await supabase
    .from('series')
    .select('id, title')
    .ilike('title', safeTitle)
    .order('created_at', { ascending: false })
    .range(0, 0);

  if (errExact) logger.error('[StreamService] Erro query series exact:', errExact);
  if (exactMatch && exactMatch.length > 0 && exactMatch[0].id) return exactMatch[0].id;

  const { data: partialMatches, error: errPartial } = await supabase
    .from('series')
    .select('id, title')
    .ilike('title', `%${safeTitle}%`)
    .order('created_at', { ascending: false })
    .range(0, 4);

  if (errPartial) logger.error('[StreamService] Erro query series partial:', errPartial);

  if (partialMatches && partialMatches.length > 0) {
    const normalizedSearch = normalizeTitle(title);
    const best = partialMatches.slice().sort((a, b) => {
      const diffA = Math.abs(normalizeTitle(a.title).length - normalizedSearch.length);
      const diffB = Math.abs(normalizeTitle(b.title).length - normalizedSearch.length);
      return diffA - diffB;
    })[0];

    return best?.id || null;
  }

  return null;
}

async function getFirstEpisodeStreamUrlForSeriesId(seriesId: string): Promise<string | null> {
  const { data: seasonsData, error: seasonsError } = await supabase
    .from('seasons')
    .select('id, season_number')
    .eq('series_id', seriesId)
    .order('season_number', { ascending: true });

  if (seasonsError) logger.error('[StreamService] Erro listando seasons da série:', seasonsError);
  if (!seasonsData || seasonsData.length === 0) return null;

  for (const season of seasonsData) {
    const { data: episodeData, error: episodeError } = await supabase
      .from('episodes')
      .select('*')
      .eq('season_id', season.id)

      .order('episode_number', { ascending: true })
      .range(0, 0);

    if (episodeError) {
      logger.error('[StreamService] Erro buscando episódio fallback:', episodeError);
      continue;
    }

    const seasonUrl = readFirstPlayableUrl(episodeData);
    if (seasonUrl) return seasonUrl;
  }

  return null;
}

async function getSeriesDirectStreamUrl(seriesId: string): Promise<string | null> {
  const { data, error } = await supabase.from('series').select('*').eq('id', seriesId).range(0, 0);

  if (error) {
    logger.error('[StreamService] Erro buscando stream direta da série:', error);
    return null;
  }

  return readFirstPlayableUrl(data);
}

async function getSeriesFallbackStreamUrl(title: string, tmdbId?: number): Promise<string | null> {
  try {
    const seriesId = await findSeriesId(title, tmdbId);
    if (!seriesId) return null;

    const directUrl = await getSeriesDirectStreamUrl(seriesId);
    if (directUrl) return directUrl;

    return await getFirstEpisodeStreamUrlForSeriesId(seriesId);
  } catch (err) {
    logger.error(`[StreamService] EXCEPTION series fallback "${title}":`, err);
    return null;
  }
}

/**
 * Busca URL do Filme/Série (Blindado contra duplicatas e erros 406)
 * Requer estado de confiança ativo para retornar URLs válidas.
 */
export async function getStreamUrl(
  title: string,
  type: 'movie' | 'series' = 'movie',
  tmdbId?: number
): Promise<string | null> {
  if (!isTrusted()) {
    logger.warn('[StreamService] Estado não confiável — bloqueando stream URL');
    return null;
  }

  const cacheKey = `${type}_${tmdbId || ''}_${normalizeTitle(title)}`;
  const cached = lruGet(streamCache, cacheKey);
  if (cached !== undefined) return cached;

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resolvedUrl =
        type === 'movie'
          ? await getMovieStreamUrl(title, tmdbId)
          : await getSeriesFallbackStreamUrl(title, tmdbId);

      if (resolvedUrl) {
        lruSet(streamCache, cacheKey, resolvedUrl);
        return resolvedUrl;
      }

      // Conteúdo confirmado como não encontrado — cachear null para evitar queries desnecessárias
      break;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      // Erro de rede/exceção: NÃO cachear null — permite retry na próxima tentativa do usuário
      logger.error(`[StreamService] EXCEPTION ao buscar stream_url para "${title}":`, err);
      return null;
    }
  }

  logger.warn(`[StreamService] Nada encontrado para: "${title}" (ID: ${tmdbId})`);
  // Cachear null apenas quando confirmado que o conteúdo não existe no DB
  lruSet(streamCache, cacheKey, null);
  return null;
}
/**
 * Busca URL do Episódio — via join series → seasons → episodes
 * Tenta tmdb_id numérico e string como fallback.
 * Requer estado de confiança ativo.
 */
export async function getEpisodeStreamUrl(
  seriesTitle: string,
  seasonNumber: number,
  episodeNumber: number,
  tmdbId?: number | string
): Promise<string | null> {
  if (!isTrusted()) {
    logger.warn('[StreamService] Estado não confiável — bloqueando episode stream URL');
    return null;
  }

  const cacheKey = `${normalizeTitle(seriesTitle)}_s${seasonNumber}e${episodeNumber}`;
  const cached = lruGet(streamCache, cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Tentar via tmdb_id (join direto se possível)
    if (tmdbId) {
      const { data, error } = await supabase
        .from('episodes')
        .select(
          'stream_url, video_url, source_url, url, link, seasons!inner(season_number, series!inner(tmdb_id))'
        )
        .eq('seasons.series.tmdb_id', String(tmdbId))
        .eq('seasons.season_number', Number(seasonNumber))
        .eq('episode_number', Number(episodeNumber))

        .range(0, 0);

      if (error) logger.error(`[StreamService] Erro episodio ID ${tmdbId}:`, error);

      if (data && data.length > 0 && readFirstPlayableUrl(data)) {
        lruSet(streamCache, cacheKey, readFirstPlayableUrl(data));
        return readFirstPlayableUrl(data);
      }
    }

    // Fallback: buscar serie por título → season → episode
    const safeTitle = escapeIlike(seriesTitle);
    if (!isSafeForQuery(safeTitle)) {
      lruSet(streamCache, cacheKey, null);
      return null;
    }

    const { data: seriesData, error: errSeries } = await supabase
      .from('series')
      .select('id')
      .ilike('title', safeTitle)
      .range(0, 0);

    if (errSeries)
      logger.error(`[StreamService] Erro busca serie titulo "${seriesTitle}":`, errSeries);

    let seriesId = seriesData?.[0]?.id;
    if (!seriesId) {
      const { data: partialSeries, error: errPartialSeries } = await supabase
        .from('series')
        .select('id, title')
        .ilike('title', `%${safeTitle}%`)
        .range(0, 4);

      if (errPartialSeries)
        logger.error(
          `[StreamService] Erro busca serie parcial "${seriesTitle}":`,
          errPartialSeries
        );

      if (partialSeries && partialSeries.length > 0) {
        const normalizedSearch = normalizeTitle(seriesTitle);
        seriesId = partialSeries.slice().sort((a, b) => {
          const diffA = Math.abs(normalizeTitle(a.title).length - normalizedSearch.length);
          const diffB = Math.abs(normalizeTitle(b.title).length - normalizedSearch.length);
          return diffA - diffB;
        })[0]?.id;
      }
    }

    if (!seriesId) {
      lruSet(streamCache, cacheKey, null);
      return null;
    }

    const { data: seasonData, error: errSeason } = await supabase
      .from('seasons')
      .select('id')
      .eq('series_id', seriesId)
      .eq('season_number', seasonNumber)
      .range(0, 0);

    if (errSeason) logger.error(`[StreamService] Erro busca season ${seasonNumber}:`, errSeason);

    if (!seasonData || seasonData.length === 0) {
      lruSet(streamCache, cacheKey, null);
      return null;
    }
    const seasonId = seasonData[0].id;

    const { data: episodeData, error: errEp } = await supabase
      .from('episodes')
      .select('*')
      .eq('season_id', seasonId)
      .eq('episode_number', episodeNumber)

      .range(0, 0);

    if (errEp) logger.error(`[StreamService] Erro busca episodio ${episodeNumber}:`, errEp);

    const url = readFirstPlayableUrl(episodeData);
    lruSet(streamCache, cacheKey, url);
    return url;
  } catch (err) {
    logger.error(
      `[StreamService] Erro episódio ${seriesTitle} S${seasonNumber}E${episodeNumber}:`,
      err
    );
    return null;
  }
}

/**
 * Limpa o cache (útil para forçar refresh)
 */
export function clearStreamCache(): void {
  streamCache.clear();
  nextEpisodeCache.clear();
  imageUrlCache.clear();
}

// ═══════════════════════════════════════════════════════
// NEXT EPISODE — Busca próximo episódio com stream_url + progresso
// ═══════════════════════════════════════════════════════

/**
 * Busca o próximo episódio de uma série dado season/episode atuais.
 * Retorna título, stream_url e progresso salvo para transição sem loading.
 * Estratégia: próximo episode_number na mesma season → primeiro episode da próxima season.
 * Requer estado de confiança ativo.
 */
const NEXT_EPISODE_TIMEOUT_MS = 8000; // 8s — evita travar transição de episódio em rede lenta

export async function getNextEpisode(
  seriesTmdbId: number | string,
  currentSeason: number,
  currentEpisode: number,
  userId?: string
): Promise<NextEpisodeResult | null> {
  // Verificação estrutural de confiança
  if (!isTrusted()) {
    logger.warn('[StreamService] Estado não confiável - bloqueando próximo episódio');
    return null;
  }

  const cacheKey = `next_${seriesTmdbId}_s${currentSeason}e${currentEpisode}`;
  const cached = lruGet(nextEpisodeCache, cacheKey);
  if (cached !== undefined) return cached;

  // Timeout global: se a sequência de queries Supabase travar, retorna null e não bloqueia o player
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => {
      logger.warn(`[StreamService] getNextEpisode timeout (${NEXT_EPISODE_TIMEOUT_MS}ms)`);
      resolve(null);
    }, NEXT_EPISODE_TIMEOUT_MS)
  );
  return Promise.race([
    _getNextEpisodeInner(seriesTmdbId, currentSeason, currentEpisode, userId, cacheKey),
    timeoutPromise,
  ]);
}

async function _getNextEpisodeInner(
  seriesTmdbId: number | string,
  currentSeason: number,
  currentEpisode: number,
  userId: string | undefined,
  cacheKey: string
): Promise<NextEpisodeResult | null> {
  try {
    // 1. Buscar a série pelo tmdb_id — tenta numérico primeiro, depois string
    // (tmdb_id pode estar salvo como número ou string no DB dependendo da origem)
    let seriesId: string | null = null;

    const numericId = Number(seriesTmdbId);
    if (numericId > 0) {
      const { data: byNum } = await supabase
        .from('series')
        .select('id')
        .eq('tmdb_id', numericId)
        .limit(1);
      if (byNum?.length) seriesId = byNum[0].id;
    }

    if (!seriesId) {
      const { data: byStr } = await supabase
        .from('series')
        .select('id')
        .eq('tmdb_id', String(seriesTmdbId))
        .limit(1);
      if (byStr?.length) seriesId = byStr[0].id;
    }

    if (!seriesId) {
      lruSet(nextEpisodeCache, cacheKey, null);
      return null;
    }

    // 2. Buscar todas as seasons desta série
    const { data: seasons } = await supabase
      .from('seasons')
      .select('id, season_number')
      .eq('series_id', seriesId)
      .order('season_number', { ascending: true });

    if (!seasons?.length) {
      lruSet(nextEpisodeCache, cacheKey, null);
      return null;
    }

    // 3. Buscar season atual
    const currentSeasonRow = seasons.find((s) => s.season_number === currentSeason);
    if (!currentSeasonRow) {
      lruSet(nextEpisodeCache, cacheKey, null);
      return null;
    }

    // 4. Tentar próximo episódio na mesma season
    const { data: nextEpInSeason } = await supabase
      .from('episodes')
      .select('id, title, episode_number, stream_url, video_url, source_url, url, link')
      .eq('season_id', currentSeasonRow.id)
      .eq('episode_number', currentEpisode + 1)

      .limit(1);

    let nextEp = nextEpInSeason?.[0] || null;
    let nextSeason = currentSeason;
    let nextEpNum = currentEpisode + 1;

    // 5. Se não achou, tentar primeiro episódio da próxima season
    if (!nextEp) {
      const nextSeasonRow = seasons.find((s) => s.season_number > currentSeason);
      if (nextSeasonRow) {
        const { data: firstEpNextSeason } = await supabase
          .from('episodes')
          .select('id, title, episode_number, stream_url, video_url, source_url, url, link')
          .eq('season_id', nextSeasonRow.id)
          .order('episode_number', { ascending: true })

          .limit(1);

        if (firstEpNextSeason?.length) {
          nextEp = firstEpNextSeason[0];
          nextSeason = nextSeasonRow.season_number;
          nextEpNum = nextEp.episode_number;
        }
      }
    }

    if (!nextEp || !(readFirstPlayableUrl([nextEp]) || '')) {
      lruSet(nextEpisodeCache, cacheKey, null);
      return null;
    }

    // 6. Buscar progresso salvo para esse episódio (transição sem tela de loading)
    let savedProgress = 0;
    if (userId) {
      const { data: progressData } = await supabase
        .from('watch_progress')
        .select('progress_seconds')
        .eq('user_id', userId)
        .eq('tmdb_id', String(seriesTmdbId))
        .eq('season_number', nextSeason)
        .eq('episode_number', nextEpNum)
        .maybeSingle();

      savedProgress = progressData?.progress_seconds || 0;
    }

    const result: NextEpisodeResult = {
      title: nextEp.title || `Episódio ${nextEpNum}`,
      season: nextSeason,
      episode: nextEpNum,
      stream_url: readFirstPlayableUrl([nextEp]) || '',
      savedProgress,
    };

    lruSet(nextEpisodeCache, cacheKey, result);
    return result;
  } catch (err) {
    logger.error(`[StreamService] Erro getNextEpisode S${currentSeason}E${currentEpisode}:`, err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// IMAGE URL — Prioriza WebP do Storage sobre TMDB
// ═══════════════════════════════════════════════════════

/**
 * Resolve URL de imagem priorizando WebP local do Supabase Storage.
 * Se a imagem já foi convertida e salva no storage, retorna ela.
 * Caso contrário, retorna a URL TMDB original.
 */
export function resolveImageUrl(
  originalUrl: string | undefined,
  tmdbId?: number | string,
  imageType: 'poster' | 'backdrop' = 'poster'
): string {
  if (!originalUrl) return '';

  // Se já é URL do Supabase Storage (WebP otimizado), usar direto
  if (originalUrl.includes('supabase.co/storage')) {
    return originalUrl;
  }

  // Check cache
  const cacheKey = `img_${tmdbId || ''}_${imageType}`;
  const cached = lruGet(imageUrlCache, cacheKey);
  if (cached !== undefined) return cached;

  // Se é URL TMDB, verificar se existe versão WebP local (via pattern de naming)
  if (originalUrl.includes('image.tmdb.org') && tmdbId) {
    // A convenção de upload é: bucket/tmdb-{id}-{type}.webp
    const bucket = imageType === 'poster' ? 'posters' : 'backdrops';
    const possibleWebpName = `tmdb-${tmdbId}-${bucket}.webp`;

    // Construir URL pública do storage (sync, sem fetch)
    const { data } = supabase.storage.from(bucket).getPublicUrl(possibleWebpName);
    if (data?.publicUrl) {
      // Guardar no cache — a verificação real de existência será lazy
      // (se a imagem não existir, o browser faz fallback natural para a src TMDB via onerror)
      lruSet(imageUrlCache, cacheKey, data.publicUrl);
      return data.publicUrl;
    }
  }

  // Fallback: converter para WebP via proxy (em vez de retornar URL TMDB crua)
  const optimized = toWebP(originalUrl, imageType);
  lruSet(imageUrlCache, cacheKey, optimized);
  return optimized;
}

// ═══════════════════════════════════════════════════════
// HEARTBEAT RESILIENTE — Salva progresso com retry + localStorage
// ═══════════════════════════════════════════════════════

interface ProgressBackup {
  tmdb_id: string;
  media_type: string;
  seconds: number;
  total_duration?: number;
  season?: number;
  episode?: number;
  timestamp: number;
}

/**
 * Salva progresso de forma resiliente:
 * 1. Tenta salvar no Supabase via watch_progress
 * 2. Em caso de falha (rede, queda), salva no localStorage
 * 3. Na próxima execução, tenta sincronizar o backup local
 */
export async function resilientSaveProgress(
  userId: string,
  tmdbId: number | string,
  mediaType: string,
  seconds: number,
  totalDuration?: number,
  season?: number,
  episode?: number
): Promise<boolean> {
  const payload: Record<string, any> = {
    user_id: userId,
    tmdb_id: String(tmdbId),
    media_type: mediaType === 'series' ? 'tv' : mediaType,
    progress_seconds: Math.floor(seconds),
    updated_at: new Date().toISOString(),
  };
  if (totalDuration) payload.total_duration = Math.floor(totalDuration);
  if (season !== undefined) payload.season_number = season;
  if (episode !== undefined) payload.episode_number = episode;

  try {
    const { error } = await supabase
      .from('watch_progress')
      .upsert(payload, { onConflict: 'user_id, tmdb_id, season_number, episode_number' });

    if (error) throw error;

    // Sucesso: tentar sincronizar backups antigos do localStorage
    flushLocalProgressBackup(userId);
    return true;
  } catch {
    // Falha de rede/Supabase: salvar no localStorage como backup
    saveProgressToLocalStorage({
      tmdb_id: String(tmdbId),
      media_type: mediaType,
      seconds: Math.floor(seconds),
      total_duration: totalDuration ? Math.floor(totalDuration) : undefined,
      season,
      episode,
      timestamp: Date.now(),
    });
    return false;
  }
}

/** Salva backup de progresso no localStorage (TV Box resilience) */
function saveProgressToLocalStorage(entry: ProgressBackup): void {
  try {
    const raw = localStorage.getItem(PROGRESS_LS_KEY);
    const backups: ProgressBackup[] = raw ? JSON.parse(raw) : [];
    // Substituir entrada existente para o mesmo conteúdo
    const key = `${entry.tmdb_id}_s${entry.season || 0}e${entry.episode || 0}`;
    const idx = backups.findIndex(
      (b) => `${b.tmdb_id}_s${b.season || 0}e${b.episode || 0}` === key
    );
    if (idx >= 0) {
      backups[idx] = entry;
    } else {
      backups.push(entry);
    }
    // Limitar a 50 entradas
    const trimmed = backups.slice(-50);
    localStorage.setItem(PROGRESS_LS_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage indisponível — silencioso
  }
}

/** Tenta sincronizar backups do localStorage com o Supabase */
async function flushLocalProgressBackup(userId: string): Promise<void> {
  try {
    const raw = localStorage.getItem(PROGRESS_LS_KEY);
    if (!raw) return;
    const backups: ProgressBackup[] = JSON.parse(raw);
    if (backups.length === 0) return;

    // Filtrar entradas com menos de 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = backups.filter((b) => b.timestamp > cutoff);

    const payloads = recent.map((b) => ({
      user_id: userId,
      tmdb_id: b.tmdb_id,
      media_type: b.media_type === 'series' ? 'tv' : b.media_type,
      progress_seconds: b.seconds,
      total_duration: b.total_duration || null,
      season_number: b.season ?? null,
      episode_number: b.episode ?? null,
      updated_at: new Date(b.timestamp).toISOString(),
    }));

    if (payloads.length > 0) {
      await supabase
        .from('watch_progress')
        .upsert(payloads, { onConflict: 'user_id, tmdb_id, season_number, episode_number' });
    }

    // Limpar backups sincronizados
    localStorage.removeItem(PROGRESS_LS_KEY);
  } catch {
    // Falha silenciosa
  }
}

// Export como objeto para uso tmdbSync-style
export const streamService = {
  getMovieUrl: (tmdbId: number | string) => getStreamUrl('', 'movie', Number(tmdbId) || undefined),
  getEpisodeUrl: getEpisodeStreamUrl,
  getStreamUrl,
  getNextEpisode,
  resolveImageUrl,
  resilientSaveProgress,
  clearCache: clearStreamCache,
};
