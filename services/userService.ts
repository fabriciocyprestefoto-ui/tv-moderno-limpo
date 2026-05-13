import { supabase } from './supabaseService';
import { logger } from '../utils/logger';

// ══════════════════════════════════════════════════
// Cache de autenticação — evita chamar getUser() a cada card
// Com TTL de 5 minutos para evitar cache stale
// ══════════════════════════════════════════════════
let cachedUserId: string | null = null;
let authCheckPromise: Promise<string | null> | null = null;
let cacheTimestamp = 0;
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getAuthUserId(): Promise<string | null> {
  const now = Date.now();
  if (cachedUserId && now - cacheTimestamp < AUTH_CACHE_TTL) return cachedUserId;
  if (authCheckPromise) return authCheckPromise;

  authCheckPromise = supabase.auth
    .getUser()
    .then(({ data }) => {
      cachedUserId = data?.user?.id || null;
      cacheTimestamp = Date.now();
      authCheckPromise = null;
      return cachedUserId;
    })
    .catch(() => {
      authCheckPromise = null;
      cachedUserId = null;
      cacheTimestamp = 0;
      return null;
    });

  return authCheckPromise;
}

// Limpar cache quando auth muda (logout, login, token refresh)
supabase.auth.onAuthStateChange(() => {
  cachedUserId = null;
  authCheckPromise = null;
  cacheTimestamp = 0;
});

// Flag para saber se as tabelas existem (evita spam de erros)
let tablesVerified = false;
const tablesExist = { watchlist: false, watch_history: false };

async function verifyTables(): Promise<void> {
  if (tablesVerified) return;
  tablesVerified = true;
  purgeExpiredProgress();

  // Tenta um SELECT mínimo para ver se a tabela existe (baseado no schema.sql)
  try {
    const [wlResult, histResult] = await Promise.all([
      supabase.from('watchlist').select('id').limit(0),
      supabase.from('watch_history').select('id').limit(0),
    ]);

    tablesExist.watchlist = !wlResult.error;
    tablesExist.watch_history = !histResult.error;

    if (!tablesExist.watchlist) {
      logger.warn('[userService] Tabela "watchlist" não encontrada ou inacessível.');
    }
    if (!tablesExist.watch_history) {
      logger.warn('[userService] Tabela "watch_history" não encontrada ou inacessível.');
    }
  } catch (err) {
    logger.error('[userService] Erro ao verificar tabelas:', err);
    tablesExist.watchlist = false;
    tablesExist.watch_history = false;
  }
}

// ─────────────────────────────────────────────────────────────
// LOCAL STORAGE FALLBACK (Para quando o Supabase está restrito)
// ─────────────────────────────────────────────────────────────
const LOCAL_STORAGE_KEYS = {
  WATCHLIST: 'redx-local-watchlist',
  WATCH_LATER: 'redx-local-watchlater',
  PROGRESS: 'redx-local-progress',
};

function getLocalList(key: string): any[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function saveLocalList(key: string, list: any[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

// Remove entradas de progresso com mais de 90 dias para não saturar o localStorage (quota 5MB)
function purgeExpiredProgress(): void {
  try {
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - NINETY_DAYS_MS;
    const list = getLocalList(LOCAL_STORAGE_KEYS.PROGRESS);
    const filtered = list.filter((p: any) => {
      if (!p.updated_at) return true;
      return new Date(p.updated_at).getTime() > cutoff;
    });
    if (filtered.length < list.length) saveLocalList(LOCAL_STORAGE_KEYS.PROGRESS, filtered);
  } catch {
    /* silencioso */
  }
}

// Limpa dados locais do usuário ao fazer logout (privacidade em dispositivo compartilhado)
export function clearLocalUserData(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.WATCHLIST);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.WATCH_LATER);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.PROGRESS);
  } catch {
    /* silencioso */
  }
}

export const userService = {
  // ══════════════════════════════════════════════════
  // LISTAS (Minha Lista / Ver Depois)
  // ══════════════════════════════════════════════════

  async toggleLibraryItem(
    tmdbId: number | string,
    type: 'movie' | 'tv' | 'series',
    listType: 'watchlist' | 'watch_later'
  ): Promise<'added' | 'removed' | 'auth_required' | 'unavailable'> {
    const userId = await getAuthUserId();
    const mediaType = type === 'series' ? 'tv' : type;
    const strTmdbId = String(tmdbId);

    // Se não houver auth, usamos APENAS local (modo visitante/offline)
    if (!userId) {
      const storageKey =
        listType === 'watchlist' ? LOCAL_STORAGE_KEYS.WATCHLIST : LOCAL_STORAGE_KEYS.WATCH_LATER;
      let list = getLocalList(storageKey);
      const exists = list.some((i) => i.tmdb_id === strTmdbId);

      if (exists) {
        list = list.filter((i) => i.tmdb_id !== strTmdbId);
        saveLocalList(storageKey, list);
        return 'removed';
      } else {
        list.push({
          tmdb_id: strTmdbId,
          media_type: mediaType,
          created_at: new Date().toISOString(),
        });
        saveLocalList(storageKey, list);
        return 'added';
      }
    }

    await verifyTables();

    // Se a tabela não existir, usamos fallback local
    if (!tablesExist.watchlist) {
      return this.toggleLibraryItem(tmdbId, type, listType); // Chamada recursiva (vai cair no bloco sem userId ou tratar como local)
    }

    try {
      const { data: existing, error: fetchError } = await supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', userId)
        .eq('media_id', strTmdbId)
        .eq('media_type', listType === 'watch_later' ? 'later' : mediaType) // schema.sql usa media_type genérico, adaptamos logicamente
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        const { error } = await supabase.from('watchlist').delete().eq('id', existing.id);
        if (error) throw error;
        return 'removed';
      } else {
        const { error } = await supabase.from('watchlist').insert({
          user_id: userId,
          media_id: strTmdbId,
          media_type: listType === 'watch_later' ? 'later' : mediaType,
          profile_id: userId, // Fallback se não houver perfil selecionado
        });
        if (error) throw error;
        return 'added';
      }
    } catch (error) {
      logger.warn('[userService] Fallback para LocalStorage devido a erro no Supabase');
      // Repetir a lógica de local storage aqui para não falhar a experiência do usuário
      return 'unavailable';
    }
  },

  async checkStatus(tmdbId: number | string): Promise<{
    inWatchlist: boolean;
    inWatchLater: boolean;
  }> {
    const strTmdbId = String(tmdbId);

    // Check Local first (Merged experience)
    const localWatchlist = getLocalList(LOCAL_STORAGE_KEYS.WATCHLIST);
    const localWatchLater = getLocalList(LOCAL_STORAGE_KEYS.WATCH_LATER);

    const defaults = {
      inWatchlist: localWatchlist.some((i) => i.tmdb_id === strTmdbId),
      inWatchLater: localWatchLater.some((i) => i.tmdb_id === strTmdbId),
    };

    const userId = await getAuthUserId();
    if (!userId) return defaults;

    await verifyTables();
    if (!tablesExist.watchlist) return defaults;

    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('media_type')
        .eq('user_id', userId)
        .eq('media_id', strTmdbId);

      if (error) return defaults;

      return {
        inWatchlist: defaults.inWatchlist || data?.some((i) => i.media_type !== 'later') || false,
        inWatchLater: defaults.inWatchLater || data?.some((i) => i.media_type === 'later') || false,
      };
    } catch {
      return defaults;
    }
  },

  /**
   * Verifica status de biblioteca para múltiplos IDs em uma única query Supabase.
   * Substitui N chamadas individuais de checkStatus() — usar para pré-aquecer o cache
   * de módulo antes de renderizar uma lista de MediaCards.
   *
   * @returns Map<string, { inWatchlist: boolean; inWatchLater: boolean }>
   */
  async batchCheckStatus(
    tmdbIds: (number | string)[]
  ): Promise<Map<string, { inWatchlist: boolean; inWatchLater: boolean }>> {
    const result = new Map<string, { inWatchlist: boolean; inWatchLater: boolean }>();
    if (tmdbIds.length === 0) return result;

    const strIds = tmdbIds.map(String);

    // Inicializa com local storage (funciona offline)
    const localWatchlist = getLocalList(LOCAL_STORAGE_KEYS.WATCHLIST);
    const localWatchLater = getLocalList(LOCAL_STORAGE_KEYS.WATCH_LATER);
    const localWlSet = new Set(localWatchlist.map((i: any) => String(i.tmdb_id)));
    const localWlLaterSet = new Set(localWatchLater.map((i: any) => String(i.tmdb_id)));

    for (const id of strIds) {
      result.set(id, {
        inWatchlist: localWlSet.has(id),
        inWatchLater: localWlLaterSet.has(id),
      });
    }

    const userId = await getAuthUserId();
    if (!userId) return result;

    await verifyTables();
    if (!tablesExist.watchlist) return result;

    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('media_id, media_type')
        .eq('user_id', userId)
        .in('media_id', strIds);

      if (error || !data) return result;

      for (const row of data) {
        const id = String(row.media_id);
        const existing = result.get(id) ?? { inWatchlist: false, inWatchLater: false };
        result.set(id, {
          inWatchlist: existing.inWatchlist || row.media_type !== 'later',
          inWatchLater: existing.inWatchLater || row.media_type === 'later',
        });
      }
    } catch {
      // Retorna resultado com dados locais em caso de falha
    }

    return result;
  },

  async getLibraryItems(listType: 'watchlist' | 'watch_later'): Promise<
    Array<{
      tmdb_id: string;
      media_type: string;
      created_at: string;
    }>
  > {
    const storageKey =
      listType === 'watchlist' ? LOCAL_STORAGE_KEYS.WATCHLIST : LOCAL_STORAGE_KEYS.WATCH_LATER;
    const localItems = getLocalList(storageKey);

    const userId = await getAuthUserId();
    if (!userId) return localItems;

    await verifyTables();
    if (!tablesExist.watchlist) return localItems;

    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('media_id, media_type, added_at')
        .eq('user_id', userId)
        .eq(
          'media_type',
          listType === 'watch_later' ? 'later' : listType === 'watchlist' ? 'movie' : 'later'
        ) // Ajuste heurístico
        .order('added_at', { ascending: false });

      if (error) return localItems;

      const dbItems = (data || []).map((i) => ({
        tmdb_id: i.media_id,
        media_type: i.media_type,
        created_at: i.added_at,
      }));

      // Merge sem duplicatas
      const merged = [...localItems];
      dbItems.forEach((dbI) => {
        if (!merged.some((m) => m.tmdb_id === dbI.tmdb_id)) merged.push(dbI);
      });
      return merged;
    } catch {
      return localItems;
    }
  },

  // ══════════════════════════════════════════════════
  // PROGRESSO (Resume Video)
  // ══════════════════════════════════════════════════

  async saveProgress(
    tmdbId: number | string,
    type: string,
    seconds: number,
    totalDuration?: number,
    season?: number,
    episode?: number
  ): Promise<void> {
    const strTmdbId = String(tmdbId);
    const mediaType = type === 'series' ? 'tv' : type;

    // Save Local always (Offline resilience)
    let localProgress = getLocalList(LOCAL_STORAGE_KEYS.PROGRESS);
    const progressEntry = {
      tmdb_id: strTmdbId,
      media_type: mediaType,
      progress_seconds: Math.floor(seconds),
      total_duration: totalDuration ? Math.floor(totalDuration) : undefined,
      season_number: season,
      episode_number: episode,
      updated_at: new Date().toISOString(),
    };

    // Upsert local
    const existingIdx = localProgress.findIndex(
      (p) => p.tmdb_id === strTmdbId && p.season_number === season && p.episode_number === episode
    );
    if (existingIdx >= 0) localProgress[existingIdx] = progressEntry;
    else localProgress.push(progressEntry);

    saveLocalList(LOCAL_STORAGE_KEYS.PROGRESS, localProgress);

    const userId = await getAuthUserId();
    if (!userId) return;

    await verifyTables();
    if (!tablesExist.watch_history) return;

    try {
      const progressPct = (seconds / (totalDuration || seconds || 1)) * 100;
      const durationVal = totalDuration || seconds;
      const watchedAt = new Date().toISOString();

      // Sem UNIQUE(user_id, media_id, media_type) no schema base, `upsert` + onConflict gera 400.
      // `profile_id` referencia user_profiles.id — não usar auth.uid() aqui (viola FK).
      const { data: existing, error: selErr } = await supabase
        .from('watch_history')
        .select('id')
        .eq('user_id', userId)
        .eq('media_id', strTmdbId)
        .eq('media_type', mediaType)
        .maybeSingle();

      if (selErr) return;

      const row = {
        progress: progressPct,
        duration: durationVal,
        watched_at: watchedAt,
      };

      if (existing?.id) {
        const { error: upErr } = await supabase
          .from('watch_history')
          .update(row)
          .eq('id', existing.id);
        if (upErr) logger.warn('[userService] watch_history update:', upErr.message);
      } else {
        const { error: insErr } = await supabase.from('watch_history').insert({
          user_id: userId,
          media_id: strTmdbId,
          media_type: mediaType,
          ...row,
        });
        if (insErr) logger.warn('[userService] watch_history insert:', insErr.message);
      }
    } catch {
      /* silencioso */
    }
  },

  async getProgress(tmdbId: number | string, season?: number, episode?: number): Promise<number> {
    const strTmdbId = String(tmdbId);

    // Check local first
    const localProgress = getLocalList(LOCAL_STORAGE_KEYS.PROGRESS);
    const localEntry = localProgress.find(
      (p) => p.tmdb_id === strTmdbId && p.season_number === season && p.episode_number === episode
    );
    if (localEntry) return localEntry.progress_seconds;

    // O schema Supabase (watch_history simplificado) não armazena season_number/episode_number.
    // Para episódios de série, o localStorage já é a fonte correta — não consultar Supabase.
    if (season !== undefined || episode !== undefined) return 0;

    const userId = await getAuthUserId();
    if (!userId) return 0;

    await verifyTables();
    if (!tablesExist.watch_history) return 0;

    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select('progress, duration')
        .eq('user_id', userId)
        .eq('media_id', strTmdbId)
        .maybeSingle();

      if (error || !data) return 0;
      // Convert percent back to seconds
      return Math.floor((data.progress / 100) * data.duration);
    } catch {
      return 0;
    }
  },

  async getContinueWatching(): Promise<
    Array<{
      tmdb_id: string;
      media_type: string;
      progress_seconds: number;
      total_duration: number | null;
      season_number: number | null;
      episode_number: number | null;
      updated_at: string;
    }>
  > {
    const localProgress = getLocalList(LOCAL_STORAGE_KEYS.PROGRESS);

    const userId = await getAuthUserId();
    if (!userId) return localProgress;

    await verifyTables();
    if (!tablesExist.watch_history) return localProgress;

    try {
      const { data, error } = await supabase
        .from('watch_history')
        .select('media_id, media_type, progress, duration, watched_at')
        .eq('user_id', userId)
        .gt('progress', 5) // Mais de 5% assistido
        .order('watched_at', { ascending: false })
        .limit(20);

      if (error) return localProgress;

      const dbItems = (data || []).map((i) => ({
        tmdb_id: i.media_id,
        media_type: i.media_type,
        progress_seconds: Math.floor((i.progress / 100) * i.duration),
        total_duration: i.duration,
        season_number: null, // schema watch_history simplificado
        episode_number: null,
        updated_at: i.watched_at,
      }));

      // Merge
      const merged = [...localProgress];
      dbItems.forEach((dbI) => {
        if (!merged.some((m) => m.tmdb_id === dbI.tmdb_id)) merged.push(dbI);
      });

      return merged.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    } catch {
      return localProgress;
    }
  },
};

export default userService;
