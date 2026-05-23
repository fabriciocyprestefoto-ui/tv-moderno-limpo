import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { Media } from '../types';
import { logger } from '../utils/logger';
import { optimizeImageFields } from '../utils/imageProxy';
import { addTrustKey } from '../utils/securityGate';
import { pickFirstRealStreamUrlFromRow } from '@/utils/streamUrlGuards';

/**
 * services/supabaseService.ts
 *
 * Correções:
 * - Validação explícita de variáveis de ambiente
 * - Leitura centralizada via config/env.ts
 * - Singleton globalThis para HMR
 * - Browser usa somente anon key; service_role fica restrita a scripts/backend
 * - Mensagens de erro claras
 * - SEGURANÇA: Requer estado confiável para criar cliente
 */

const supabaseUrl = env.supabaseUrl;
const supabaseAnonKey = env.supabaseAnonKey;
const SUPABASE_CLIENT_VERSION = 'redx-supabase-v2-lockfix';

// Evita travas de Navigator LockManager (lock:redx-auth) em alguns WebViews/TV Box.
const nonBlockingAuthLock = async <T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>
): Promise<T> => fn();

function patchSupabaseAuthLock(client: SupabaseClient): void {
  const authAny = (client as any)?.auth;
  if (!authAny || typeof authAny !== 'object') return;
  authAny.lock = nonBlockingAuthLock;
  authAny.lockAcquireTimeout = 0;
}
/* ---------- Singleton (HMR-safe) ---------- */
declare global {
  var __supabase_client__: SupabaseClient | undefined;

  var __supabase_client_version__: string | undefined;

  var __supabase_admin_client__: SupabaseClient | undefined;
}

const getSupabaseClient = (): SupabaseClient => {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__supabase_client__) {
    const existing = (globalThis as any).__supabase_client__ as SupabaseClient;

    patchSupabaseAuthLock(existing);

    if ((globalThis as any).__supabase_client_version__ === SUPABASE_CLIENT_VERSION) {
      return existing;
    }
  }

  // Adicionar chave de confiança ao criar cliente
  // Isso indica que o código original de criação foi executado
  addTrustKey('runtime');

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true, // Manter sessão no localStorage (TV Box APK não perde login)
      autoRefreshToken: true, // Renovar token automaticamente antes de expirar
      detectSessionInUrl: false, // Desabilitar para Capacitor/APK (não há URL callback)
      storageKey: 'redx-auth', // Chave consistente no localStorage
      lock: nonBlockingAuthLock,
    },
  });

  patchSupabaseAuthLock(client);

  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__supabase_client__ = client;

    (globalThis as any).__supabase_client_version__ = SUPABASE_CLIENT_VERSION;
  }

  return client;
};

/** Segurança: service_role nunca é exposta no bundle cliente. */
export const supabaseAdmin: SupabaseClient | null = null;

/* ---------- Simple Cache System ---------- */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const MAX_MEMORY_CACHE = 200;
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos

export const clearSupabaseCache = () => {
  memoryCache.clear();
};

export const fetchWithCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> => {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }

  // LRU eviction: remove oldest entry when cache is full
  if (memoryCache.size >= MAX_MEMORY_CACHE) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }

  const data = await fetcher();
  memoryCache.set(key, { data, timestamp: Date.now(), ttl });
  return data;
};

export const supabase = getSupabaseClient();

const HOME_BANNERS_SESSION_KEY = 'redx-home-banners-v1';
let homeBannersCache: HomeBanner[] | null = null;
let homeBannersInFlight: Promise<HomeBanner[]> | null = null;

function isWebpBannerUrl(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.includes('.webp')) return true;
  try {
    const parsed = new URL(raw);
    return (
      parsed.pathname.toLowerCase().includes('.webp') ||
      (parsed.searchParams.get('format') || '').toLowerCase() === 'webp'
    );
  } catch {
    return false;
  }
}

function readHomeBannersFromSession(): HomeBanner[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HOME_BANNERS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeBanner[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeHomeBannersToSession(rows: HomeBanner[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HOME_BANNERS_SESSION_KEY, JSON.stringify(rows));
  } catch {
    // best effort
  }
}

/** Redireciona após sessão inválida: Hash (Electron) vs Browser (SPA na raiz). */
function redirectAfterSessionExpired(): void {
  if (typeof window === 'undefined') return;
  const electron = /Electron/i.test(navigator.userAgent || '');
  const hasHashRoute = Boolean(window.location.hash && window.location.hash.length > 1);
  if (electron || hasHashRoute) {
    window.location.hash = '#/login';
    return;
  }
  window.location.assign(`${window.location.origin}/`);
}

/**
 * Garante sessão Supabase válida (refresh se possível).
 * Chame antes de operações que exijam JWT (ex.: APIs protegidas por RLS com auth.uid()).
 * Não redireciona utilizadores em sessão só local (access code / admin local).
 */
export async function ensureValidSession(): Promise<boolean> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (!error && session?.user) return true;

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session?.user) return true;

    if (import.meta.env.DEV) {
      logger.warn('[Supabase] Sessão expirada ou refresh falhou; redirecionando');
    }
    redirectAfterSessionExpired();
    return false;
  } catch {
    return false;
  }
}

/* ---------- Interfaces (mantidas) ---------- */
// (Colei suas interfaces sem alteração para brevidade)
export interface Movie {
  id: string;
  tmdb_id?: number;
  title: string;
  description?: string;
  poster?: string;
  backdrop?: string;
  logo_url?: string;
  year?: number;
  rating?: number;
  genre?: string[];
  stream_url?: string;
  video_url?: string;
  source_url?: string;
  trailer_url?: string;
  use_trailer?: boolean;
  platform?: string;
  status?: 'published' | 'draft';
  created_at?: string;
}
export interface Series {
  id: string;
  tmdb_id?: number;
  title: string;
  description?: string;
  poster?: string;
  backdrop?: string;
  logo_url?: string;
  year?: number;
  rating?: number;
  genre?: string[];
  stream_url?: string;
  video_url?: string;
  source_url?: string;
  trailer_url?: string;
  use_trailer?: boolean;
  platform?: string;
  status?: 'published' | 'draft';
  seasons_count?: number;
  seasons?: number;
  type?: 'series';
  created_at?: string;
}
export interface ChannelDB {
  id: string;
  name: string;
  logo?: string;
  category?: string;
  stream_url: string;
  number?: number;
  is_premium?: boolean;
}
export interface SeasonDB {
  id: string;
  series_id: string;
  season_number: number;
  title?: string;
  description?: string;
  poster?: string;
}
export interface EpisodeDB {
  id: string;
  season_id: string;
  episode_number: number;
  title: string;
  description?: string;
  duration?: string;
  stream_url?: string;
  thumbnail?: string;
}
export interface UserSettings {
  id: string;
  user_id: string;
  email: string;
  name: string;
  phone?: string;
  two_factor_enabled: boolean;
}
export interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  active: boolean;
  quality?: string;
  screens?: string;
  device_limit?: number;
  color?: string;
}
export interface Subscription {
  id: string;
  plan_id: string;
  status: string;
  current_period_end: string;
  plan?: Plan;
}
export interface PaymentMethod {
  id: string;
  card_brand: string;
  last_four: string;
  expiry_month: string;
  expiry_year: string;
  card_holder: string;
  is_default: boolean;
}
export interface Device {
  id: string;
  user_id?: string;
  name: string;
  type: string;
  icon: string;
  last_active: string;
  is_current_session: boolean;
}
export interface UserProfileDB {
  id: string;
  user_id?: string;
  name: string;
  avatar_url?: string;
  avatar_color?: string;
  is_kids: boolean;
  is_main?: boolean;
  parental_rating?: string;
  parental_pin?: string;
  parental_enabled?: boolean;
  auto_play_next?: boolean;
  maturity_level?: number;
}
export interface PaymentSettingsDB {
  id: string;
  pix_key: string;
  pix_name: string;
  bank_name?: string;
  bank_agency?: string;
  bank_account?: string;
  crypto_wallet?: string;
  instructions?: string;
}
export interface MediaImageUpdate {
  id?: string;
  media_id: string;
  media_type: 'movie' | 'series';
  image_type: 'poster' | 'backdrop' | 'logo';
  file_name: string;
  storage_url?: string;
  status: 'atualizado' | 'nao_encontrado' | 'upload_erro' | 'update_erro';
  created_at?: string;
}
export interface AppConfigDB {
  id: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
}
export interface HomeBanner {
  id: string;
  tmdb_id: number;
  banner_url: string;
  ativo: boolean;
  ordem: number;
  created_at?: string;
}

/* ---------- Funções (mantidas, com pequenos ajustes de segurança/tratamento) ---------- */

// Helper: buscar TODOS os registros (Supabase limita a 1000 por request)
async function fetchAllRows<T>(
  table: string,
  orderCol = 'created_at',
  signal?: AbortSignal
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderCol, { ascending: false })
      .range(from, from + PAGE - 1)
      .abortSignal(signal as any); // Tipagem explicita se necessario
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function getAllMovies(): Promise<Movie[]> {
  const rows = await fetchAllRows<Movie>('movies');
  return rows
    .map((row: any) => normalizeCatalogMovieRow(row))
    .filter((movie) => hasCatalogVideoUrl(movie));
}

async function fetchByTmdbIds<T>(table: 'movies' | 'series', tmdbIds: number[]): Promise<T[]> {
  const uniqueIds = Array.from(
    new Set(tmdbIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  );

  if (uniqueIds.length === 0) return [];

  const CHUNK_SIZE = 150;
  const rows: T[] = [];

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase.from(table).select('*').in('tmdb_id', chunk);

    if (error) throw error;
    if (data?.length) rows.push(...(data as T[]));
  }

  return rows;
}

export async function getMoviesByTmdbIds(tmdbIds: number[]): Promise<Movie[]> {
  return fetchByTmdbIds<Movie>('movies', tmdbIds);
}

export async function getMoviesByGenre(genre: string): Promise<Movie[]> {
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .contains('genre', [genre])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || [])
    .map((row: any) => normalizeCatalogMovieRow(row))
    .filter((movie) => hasCatalogVideoUrl(movie));
}

export async function getMovieGenres(): Promise<string[]> {
  const { data, error } = await supabase.from('movies').select('genre');
  if (error) throw error;
  const genres = new Set<string>();
  data?.forEach((movie: any) => movie.genre?.forEach((g: string) => genres.add(g)));
  return Array.from(genres).sort();
}

export async function getAllSeries(): Promise<Series[]> {
  const rows = await fetchAllRows<Series>('series');
  return rows
    .map((row: any) => normalizeCatalogSeriesRow(row))
    .filter((series) => hasCatalogVideoUrl(series));
}

export async function getSeriesByTmdbIds(tmdbIds: number[]): Promise<Series[]> {
  return fetchByTmdbIds<Series>('series', tmdbIds);
}

export async function getSeriesByGenre(genre: string): Promise<Series[]> {
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .contains('genre', [genre])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || [])
    .map((row: any) => normalizeCatalogSeriesRow(row))
    .filter((series) => hasCatalogVideoUrl(series));
}

export async function getSeriesGenres(): Promise<string[]> {
  const { data, error } = await supabase.from('series').select('genre');
  if (error) throw error;
  const genres = new Set<string>();
  data?.forEach((s: any) => s.genre?.forEach((g: string) => genres.add(g)));
  return Array.from(genres).sort();
}

// Ordenar por PK evita sondagens extras e sorts caros em tabelas grandes.
let _channelsOrderCol: string | null | undefined = 'id';

export interface ChannelsPageResult {
  channels: ChannelDB[];
  hasMore: boolean;
  page: number;
  limit: number;
}

async function resolveChannelsOrderCol(): Promise<string | null> {
  if (_channelsOrderCol !== undefined) {
    return _channelsOrderCol;
  }

  _channelsOrderCol = 'id';
  return _channelsOrderCol;
}

function logChannelShape(channel: any): void {
  logger.log('[Channels] Colunas disponiveis:', Object.keys(channel));
  logger.log('[Channels] Exemplo de canal:', {
    id: channel.id,
    name: channel.name || channel.nome,
    logo: channel.logo || channel.logo_url,
    category: channel.category || channel.genero,
  });
}

function isAuthLockTimeoutError(error: any): boolean {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return message.includes('lock:redx-auth') || message.includes('navigator lockmanager lock');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getChannelsPage(
  page = 1,
  limit = 1000,
  signal?: AbortSignal
): Promise<ChannelsPageResult> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const from = (safePage - 1) * safeLimit;
  const orderCol = await resolveChannelsOrderCol();

  const runPagedQuery = async () => {
    let query = supabase.from('channels').select('*');
    if (orderCol) query = query.order(orderCol, { ascending: true });
    return query.range(from, from + safeLimit - 1).abortSignal(signal as any);
  };

  let { data, error } = await runPagedQuery();

  if (error && isAuthLockTimeoutError(error)) {
    await sleep(120);
    const retried = await runPagedQuery();
    data = retried.data;
    error = retried.error;
  }

  if (error) {
    logger.error('[Channels] Erro ao buscar canais:', error.message, error.code, error.details);
    logger.error('[Channels] Hint:', error.hint || 'N/A');

    if (from === 0) {
      logger.log('[Channels] Tentando fallback sem range...');
      let fallback = await supabase.from('channels').select('*');

      if (fallback.error && isAuthLockTimeoutError(fallback.error)) {
        await sleep(120);
        fallback = await supabase.from('channels').select('*');
      }

      if (fallback.error) {
        logger.error('[Channels] Erro fatal (fallback):', fallback.error.message);
        logger.error('[Channels] Codigo:', fallback.error.code);
        logger.error('[Channels] Detalhes:', fallback.error.details);
        throw fallback.error;
      }

      logger.log('[Channels] Fallback sem range: ' + (fallback.data?.length ?? 0) + ' canais');
      if (fallback.data?.length) {
        logChannelShape(fallback.data[0]);
      }

      return {
        channels: (fallback.data || []) as ChannelDB[],
        hasMore: (fallback.data?.length || 0) >= safeLimit,
        page: safePage,
        limit: safeLimit,
      };
    }

    throw error;
  }

  if (from === 0 && data?.length) {
    logChannelShape(data[0]);
  }

  return {
    channels: (data || []) as ChannelDB[],
    hasMore: (data?.length || 0) === safeLimit,
    page: safePage,
    limit: safeLimit,
  };
}

// SELECT * para compatibilidade com colunas em portugues (nome, genero, url) e ingles (name, category, stream_url)
// normalizeChannel() no channelsService.ts cuida do mapeamento

export async function getAllChannels(): Promise<ChannelDB[]> {
  const PAGE = 1000;
  const all: ChannelDB[] = [];
  let page = 1;

  while (true) {
    const result = await getChannelsPage(page, PAGE);
    if (!result.channels.length) break;
    all.push(...result.channels);
    if (!result.hasMore) break;
    page += 1;
  }

  const normalized = all
    .map((row: any) => {
      const stream_url = resolveCatalogVideoUrl(row);
      return {
        ...row,
        stream_url,
      } as ChannelDB;
    })
    .filter((channel) => hasCatalogVideoUrl(channel));

  logger.log(
    `[Channels] ${normalized.length}/${all.length} canais com URL real carregados do Supabase`
  );
  return normalized;
}
export async function getChannelsByCategory(category: string): Promise<ChannelDB[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('category', category)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || [])
    .map((row: any) => {
      const stream_url = resolveCatalogVideoUrl(row);
      return {
        ...row,
        stream_url,
      } as ChannelDB;
    })
    .filter((channel) => hasCatalogVideoUrl(channel));
}

export async function getMovieById(id: string): Promise<Movie | null> {
  const { data, error } = await supabase.from('movies').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMovieByTmdbId(tmdbId: number): Promise<Movie | null> {
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .eq('tmdb_id', tmdbId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function getSeriesById(id: string): Promise<Series | null> {
  const { data, error } = await supabase.from('series').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSeriesByTmdbId(tmdbId: number): Promise<Series | null> {
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .eq('tmdb_id', tmdbId)
    .maybeSingle();
  if (error) return null;
  return data;
}

/** Séries do banner (banner_order IS NOT NULL) — ordenadas por banner_order, imagens em WebP */
export async function getBannerSeries(): Promise<Series[]> {
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .not('banner_order', 'is', null)
    .order('banner_order', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function getHomeBanners(forceRefresh = false): Promise<HomeBanner[]> {
  if (!forceRefresh) {
    if (homeBannersCache) return homeBannersCache;
    const fromSession = readHomeBannersFromSession();
    if (fromSession && fromSession.length > 0) {
      homeBannersCache = fromSession;
      return fromSession;
    }
    if (homeBannersInFlight) return homeBannersInFlight;
  }

  homeBannersInFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('home_banners')
        .select('id, tmdb_id, banner_url, ativo, ordem, created_at')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

      if (error || !Array.isArray(data)) return [];

      const rows = data
        .map((row) => ({
          id: String(row.id || ''),
          tmdb_id: Number(row.tmdb_id),
          banner_url: String(row.banner_url || '').trim(),
          ativo: Boolean(row.ativo),
          ordem: Number(row.ordem ?? 0),
          created_at: row.created_at || undefined,
        }))
        .filter(
          (row) =>
            Number.isFinite(row.tmdb_id) && row.tmdb_id > 0 && isWebpBannerUrl(row.banner_url)
        );

      homeBannersCache = rows;
      writeHomeBannersToSession(rows);
      return rows;
    } catch {
      return [];
    } finally {
      homeBannersInFlight = null;
    }
  })();

  return homeBannersInFlight;
}

export async function getSeasons(seriesId: string): Promise<SeasonDB[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('series_id', seriesId)
    .order('season_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getEpisodes(seasonId: string): Promise<EpisodeDB[]> {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('season_id', seasonId)
    .order('episode_number', { ascending: true });
  if (error) throw error;
  // Normaliza para garantir que `stream_url` exista mesmo se o banco usar outras colunas
  // (ex: `source_url`, `url`, `link`). `Details.tsx` depende de `ep.stream_url`.
  return (data || []).map((row: any) => {
    const stream_url = resolveCatalogVideoUrl(row);
    return {
      ...row,
      stream_url,
      video_url: row?.video_url || undefined,
      source_url: row?.source_url || undefined,
    } as EpisodeDB;
  });
}

export async function updateEpisode(
  episodeId: string,
  updates: Partial<
    Pick<EpisodeDB, 'title' | 'description' | 'duration' | 'stream_url' | 'thumbnail'>
  >
): Promise<EpisodeDB> {
  const payload: Record<string, any> = { ...updates };
  if ('stream_url' in payload && payload.stream_url === undefined) {
    payload.stream_url = null;
  }
  const { data, error } = await supabase
    .from('episodes')
    .update(payload)
    .eq('id', episodeId)
    .select('*')
    .single();
  if (error) throw error;
  return {
    ...(data as EpisodeDB),
    stream_url: resolveCatalogVideoUrl(data),
  };
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*, plan:plans(*)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase.from('payment_methods').select('*').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function getUserDevices(userId: string): Promise<Device[]> {
  const { data, error } = await supabase.from('devices').select('*').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function addDevice(device: Partial<Device>): Promise<Device | null> {
  const { data, error } = await supabase.from('devices').insert(device).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function removeDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.from('devices').delete().eq('id', deviceId);
  if (error) throw error;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getUserProfiles(userId: string): Promise<UserProfileDB[]> {
  // Supabase user_id é UUID — valor inválido causa erro 22P02 (bad request)
  if (!userId || !UUID_RE.test(userId)) return [];
  const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function addUserProfile(
  profile: Partial<UserProfileDB>
): Promise<UserProfileDB | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .insert(profile)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Colunas válidas no banco (evita erro de coluna inexistente)
const MOVIE_COLS = new Set([
  'title',
  'description',
  'poster',
  'backdrop',
  'logo_url',
  'stream_url',
  'year',
  'genre',
  'rating',
  'duration',
  'tmdb_id',
  'stars',
  'trailer_key',
  'trailer_url',
  'use_trailer',
  'platform',
  'status',
  'original_title',
]);
const SERIES_COLS = new Set([
  'title',
  'description',
  'poster',
  'backdrop',
  'logo_url',
  'stream_url',
  'year',
  'genre',
  'rating',
  'seasons',
  'tmdb_id',
  'stars',
  'trailer_key',
  'trailer_url',
  'use_trailer',
  'platform',
  'status',
  'original_title',
]);

function stripUnknownCols(data: object, validCols: Set<string>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (validCols.has(key) && val !== undefined && val !== '') clean[key] = val;
  }
  // Converter poster/backdrop TMDB para WebP automaticamente em todo insert/update
  return optimizeImageFields(clean);
}

export async function insertMovie(movie: Partial<Movie>): Promise<Movie | null> {
  const sanitized = stripUnknownCols(movie, MOVIE_COLS);
  const { data, error } = await supabase.from('movies').insert(sanitized).select().maybeSingle();
  if (error) {
    logger.error('Erro ao inserir filme:', error);
    return null;
  }
  return data;
}

export async function insertSeries(series: Partial<Series>): Promise<Series | null> {
  const sanitized = stripUnknownCols(series, SERIES_COLS);
  const { data, error } = await supabase.from('series').insert(sanitized).select().maybeSingle();
  if (error) {
    logger.error('Erro ao inserir série:', error);
    return null;
  }
  return data;
}

export async function updateMovie(id: string, updates: Partial<Movie>): Promise<Movie | null> {
  const sanitized = stripUnknownCols(updates, MOVIE_COLS);
  const { data, error } = await supabase
    .from('movies')
    .update(sanitized)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) {
    logger.error('Erro ao atualizar filme:', error);
    return null;
  }
  return data;
}

export async function updateSeries(id: string, updates: Partial<Series>): Promise<Series | null> {
  const sanitized = stripUnknownCols(updates, SERIES_COLS);
  const { data, error } = await supabase
    .from('series')
    .update(sanitized)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) {
    logger.error('Erro ao atualizar série:', error);
    return null;
  }
  return data;
}

export async function deleteMovie(id: string): Promise<boolean> {
  const { error } = await supabase.from('movies').delete().eq('id', id);
  if (error) {
    logger.error('Erro ao deletar filme:', error);
    return false;
  }
  return true;
}

export async function deleteSeries(id: string): Promise<boolean> {
  const { error } = await supabase.from('series').delete().eq('id', id);
  if (error) {
    logger.error('Erro ao deletar série:', error);
    return false;
  }
  return true;
}

export async function getAppConfig(): Promise<AppConfigDB | null> {
  const { data, error } = await supabase.from('app_config').select('*').single();
  if (error || !data) {
    return {
      id: 'default',
      logo_url: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg',
      primary_color: '#A855F7',
      secondary_color: '#ffffff',
      background_color: '#0a0a0a',
    };
  }
  return data;
}

export async function updateAppConfig(config: Partial<AppConfigDB>): Promise<AppConfigDB | null> {
  const { data, error } = await supabase.from('app_config').upsert(config).select().single();
  if (error) {
    logger.error('Erro ao atualizar configurações:', error);
    return null;
  }
  return data;
}

export async function uploadImage(
  file: File,
  bucket: 'posters' | 'backdrops' | 'logos' = 'posters'
): Promise<string | null> {
  if (typeof window === 'undefined' && !(file instanceof (globalThis as any).File)) {
    throw new Error(
      'uploadImage deve ser chamado do cliente com um objeto File (browser). Para uploads server-side use uma API route/Edge Function com SERVICE_ROLE.'
    );
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file);
  if (uploadError) {
    logger.error(`Erro ao fazer upload para ${bucket}:`, uploadError);
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function getAllPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price', { ascending: true });
  if (error) {
    return [
      {
        id: '1',
        name: 'Básico',
        price: 29.9,
        description: 'Para começar',
        features: ['HD', '1 Tela', 'Anúncios'],
        active: true,
      },
      {
        id: '2',
        name: 'Padrão',
        price: 49.9,
        description: 'Melhor custo-benefício',
        features: ['Full HD', '2 Telas', 'Sem Anúncios'],
        active: true,
      },
      {
        id: '3',
        name: 'Premium',
        price: 69.9,
        description: 'Experiência máxima',
        features: ['4K HDR', '4 Telas', 'Áudio Espacial'],
        active: true,
      },
    ];
  }
  return data;
}

export async function updatePlan(plan: Partial<Plan>): Promise<Plan | null> {
  const { data, error } = await supabase.from('plans').upsert(plan).select().single();
  if (error) {
    logger.error('Erro ao salvar plano:', error);
    return null;
  }
  return data;
}

export async function deletePlan(id: string): Promise<boolean> {
  const { error } = await supabase.from('plans').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function getPaymentSettings(): Promise<PaymentSettingsDB | null> {
  const { data, error } = await supabase.from('payment_settings').select('*').single();
  if (error || !data) {
    return {
      id: 'default',
      pix_key: '',
      pix_name: '',
      instructions: 'Envie o comprovante para o suporte.',
    } as PaymentSettingsDB;
  }
  return data;
}

export async function updatePaymentSettings(
  settings: Partial<PaymentSettingsDB>
): Promise<PaymentSettingsDB | null> {
  const { data: existing, error: e } = await supabase
    .from('payment_settings')
    .select('id')
    .single();
  if (e && e.code !== 'PGRST116') {
    // exemplo de código caso tabela não exista
    logger.error('Erro ao verificar payment_settings:', e);
  }

  let result: { data: PaymentSettingsDB | null; error: { message: string } | null };
  if (existing && existing.id) {
    result = await supabase
      .from('payment_settings')
      .update(settings)
      .eq('id', existing.id)
      .select()
      .single();
  } else {
    result = await supabase.from('payment_settings').insert(settings).select().single();
  }

  if (result.error) {
    logger.error('Erro ao salvar dados bancários:', result.error);
    return null;
  }
  return result.data;
}

export async function insertImageUpdate(
  payload: Omit<MediaImageUpdate, 'id' | 'created_at'>
): Promise<boolean> {
  try {
    const { error } = await supabase.from('media_image_updates').insert(payload);
    if (error) {
      logger.warn('Auditoria não registrada (media_image_updates ausente ou RLS):', error);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn('Falha ao registrar auditoria de imagem:', e);
    return false;
  }
}

/**
 * Busca apenas filmes e séries que têm banner_url preenchido no banco de dados.
 * Isso garante que o banner mostrará apenas o conteúdo que subimos.
 */
export async function getBannersFromCatalog(): Promise<Media[]> {
  try {
    // Promise.allSettled: se uma tabela falhar (ex: RLS 403), a outra ainda carrega
    const [moviesResult, seriesResult] = await Promise.allSettled([
      supabase
        .from('movies')
        .select(
          'title, description, poster, backdrop, banner_url, logo_url, year, genre, rating, tmdb_id, trailer_key, trailer_url'
        )
        .not('banner_url', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('series')
        .select(
          'title, description, poster, backdrop, banner_url, logo_url, year, genre, rating, tmdb_id, trailer_key, trailer_url'
        )
        .not('banner_url', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    const movies = moviesResult.status === 'fulfilled' ? moviesResult.value.data : null;
    const series = seriesResult.status === 'fulfilled' ? seriesResult.value.data : null;
    if (moviesResult.status === 'rejected')
      logger.warn('getBannersFromCatalog: falha ao buscar filmes:', moviesResult.reason);
    if (seriesResult.status === 'rejected')
      logger.warn('getBannersFromCatalog: falha ao buscar séries:', seriesResult.reason);

    // Filtrar apenas itens cujo banner_url é WebP (evita JPEG/PNG do TMDB no banner principal)
    const m = (movies || [])
      .filter((x) => isWebpBannerUrl((x as any).banner_url))
      .map((x) => ({ ...x, type: 'movie' as const }));
    const s = (series || [])
      .filter((x) => isWebpBannerUrl((x as any).banner_url))
      .map((x) => ({ ...x, type: 'series' as const }));

    return [...m, ...s] as Media[];
  } catch (error) {
    logger.error('Erro ao buscar banners curados:', error);
    return [];
  }
}

/* ---------- Default export (compatibilidade) ---------- */
export default {
  getAllMovies,
  getMoviesByTmdbIds,
  getMoviesByGenre,
  getMovieGenres,
  getAllSeries,
  getSeriesByTmdbIds,
  getSeriesByGenre,
  getSeriesGenres,
  getAllChannels,
  getChannelsByCategory,
  getMovieById,
  getSeriesById,
  getSeriesByTmdbId,
  getBannerSeries,
  getSeasons,
  getEpisodes,
  updateEpisode,
  getUserSettings,
  getUserSubscription,
  getAllPlans,
  getPaymentMethods,
  getUserDevices,
  addDevice,
  removeDevice,
  getUserProfiles,
  addUserProfile,
  insertMovie,
  insertSeries,
  updateMovie,
  updateSeries,
  deleteMovie,
  deleteSeries,
  getAppConfig,
  updateAppConfig,
  uploadImage,
  updatePlan,
  deletePlan,
  getPaymentSettings,
  updatePaymentSettings,
  insertImageUpdate,

  // Batch Operations
  bulkInsertMovies: async (movies: Partial<Movie>[]) => {
    const sanitized = movies.map((m) => stripUnknownCols(m as any, MOVIE_COLS));
    const { data, error } = await supabase
      .from('movies')
      .upsert(sanitized, { onConflict: 'tmdb_id', ignoreDuplicates: true })
      .select();
    if (error) logger.error('Bulk Insert Movies Error:', error);
    return { data, error };
  },

  bulkInsertSeries: async (series: Partial<Series>[]) => {
    const sanitized = series.map((s) => stripUnknownCols(s as any, SERIES_COLS));
    const { data, error } = await supabase
      .from('series')
      .upsert(sanitized, { onConflict: 'tmdb_id', ignoreDuplicates: true })
      .select();
    if (error) logger.error('Bulk Insert Series Error:', error);
    return { data, error };
  },

  batchDeleteContent: async (
    type: 'movie' | 'series' | 'all',
    year?: number,
    yearRange?: { min: number; max: number }
  ) => {
    const tables = type === 'all' ? ['movies', 'series'] : [type === 'movie' ? 'movies' : 'series'];
    let _totalDeleted = 0;
    void _totalDeleted;

    for (const table of tables) {
      let query = supabase.from(table).delete();

      if (year) {
        query = query.eq('year', year);
      } else if (yearRange) {
        query = query.gte('year', yearRange.min).lte('year', yearRange.max);
      } else {
        // Deletar tudo: usar filtro que matcha todos os registros
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { error } = await query;
      if (error) {
        logger.error(`Erro ao deletar de ${table}:`, error);
      }
    }
    return true;
  },
};

// ========== PAGINAÇÃO E FILTROS ==========

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number | null;
  totalPages: number | null;
}

export interface CatalogFilters {
  minYear?: number;
  maxYear?: number;
  genres?: string[];
  contentType?: 'movies' | 'series' | 'mixed';
}

function resolveCatalogVideoUrl(row: any): string {
  return pickFirstRealStreamUrlFromRow(row as Record<string, unknown>);
}

function isHttpPlayableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function hasCatalogVideoUrl(row: any): boolean {
  const url = resolveCatalogVideoUrl(row);
  return url.length > 0 && isHttpPlayableUrl(url);
}

function normalizeCatalogMovieRow(row: any): Movie {
  const stream_url = resolveCatalogVideoUrl(row);
  return {
    ...row,
    stream_url,
    video_url: row?.video_url || undefined,
  } as Movie;
}

function normalizeCatalogSeriesRow(row: any): Series {
  const stream_url = resolveCatalogVideoUrl(row);
  const rawSeasons = Number(row?.seasons ?? row?.seasons_count);
  const normalizedSeasons = Number.isFinite(rawSeasons) ? rawSeasons : undefined;
  return {
    ...row,
    type: 'series',
    stream_url,
    video_url: row?.video_url || undefined,
    seasons_count: normalizedSeasons,
    seasons: normalizedSeasons && normalizedSeasons > 0 ? normalizedSeasons : undefined,
  } as Series;
}

function hasCatalogSeriesPlayback(row: any): boolean {
  return hasCatalogVideoUrl(row);
}

export async function getMoviesPaginated(
  page = 1,
  limit = 50,
  filters?: CatalogFilters,
  signal?: AbortSignal
): Promise<PaginatedResponse<Movie>> {
  let query = supabase
    .from('movies')
    .select('*')
    .abortSignal(signal as any);

  // Aplicar filtros
  if (filters?.minYear) {
    query = query.or(`year.gte.${filters.minYear},year.is.null`);
  }
  if (filters?.maxYear) {
    query = query.lte('year', filters.maxYear);
  }
  if (filters?.genres && filters.genres.length > 0) {
    query = query.overlaps('genre', filters.genres);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.order('id', { ascending: false }).range(from, to);

  const { data, error } = await query;

  if (error) throw error;

  const rawRows = data || [];
  const normalized = rawRows
    .map((row: any) => normalizeCatalogMovieRow(row))
    .filter((movie) => hasCatalogVideoUrl(movie));

  const hasMore = rawRows.length === limit;

  return {
    data: normalized,
    page,
    limit,
    hasMore,
    total: hasMore ? null : from + rawRows.length,
    totalPages: hasMore ? null : page,
  };
}

export async function getSeriesPaginated(
  page = 1,
  limit = 50,
  filters?: CatalogFilters,
  signal?: AbortSignal
): Promise<PaginatedResponse<Series>> {
  let query = supabase
    .from('series')
    .select('*')
    .not('tmdb_id', 'is', null)
    .not('poster', 'is', null)
    .abortSignal(signal as any);

  // Aplicar filtros
  if (filters?.minYear) {
    query = query.or(`year.gte.${filters.minYear},year.is.null`);
  }
  if (filters?.maxYear) {
    query = query.lte('year', filters.maxYear);
  }
  if (filters?.genres && filters.genres.length > 0) {
    query = query.overlaps('genre', filters.genres);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.order('id', { ascending: false }).range(from, to);

  const { data, error } = await query;

  if (error) throw error;

  const rawRows = data || [];
  const normalized = rawRows
    .map((row: any) => normalizeCatalogSeriesRow(row))
    .filter((series) => hasCatalogSeriesPlayback(series));
  const hasMore = rawRows.length === limit;

  return {
    data: normalized,
    page,
    limit,
    hasMore,
    total: hasMore ? null : from + rawRows.length,
    totalPages: hasMore ? null : page,
  };
}

/** Retorna IDs de séries que têm pelo menos um episódio com stream/video_url (conteúdo reproduzível). */
export async function getSeriesIdsWithPlayableEpisodes(): Promise<Set<string>> {
  const PAGE = 1000;
  const ids = new Set<string>();
  let from = 0;
  let includeExtendedCols = true;

  while (true) {
    const selectCols = includeExtendedCols
      ? 'seasons!inner(series_id), stream_url, video_url, source_url, url, link'
      : 'seasons!inner(series_id), stream_url';

    const { data, error } = await supabase
      .from('episodes')
      .select(selectCols)
      .range(from, from + PAGE - 1);

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const missingExtendedCol =
        includeExtendedCols &&
        (msg.includes('video_url') ||
          msg.includes('source_url') ||
          msg.includes('url') ||
          msg.includes('link'));

      if (missingExtendedCol) {
        includeExtendedCols = false;
        continue;
      }

      logger.warn('[Supabase] getSeriesIdsWithPlayableEpisodes:', error.message);
      return ids;
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!hasCatalogVideoUrl(row)) continue;
      const seriesId = (row as any)?.seasons?.series_id;
      if (seriesId) ids.add(String(seriesId));
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return ids;
}

/**
 * Corte de ano do catálogo do usuário (regra de produto):
 *   - Filmes: a partir de 2020.
 *   - Séries: a partir de 2015.
 * Aplicado em todas as listagens (Home/Filmes/Séries/Gêneros) que consomem
 * getCatalogWithFilters. O admin usa caminhos próprios e não é afetado.
 */
export const CATALOG_MIN_YEAR_MOVIES = 2020;
export const CATALOG_MIN_YEAR_SERIES = 2015;

/** Carrega catálogo com suporte a carregamento progressivo (initialLimit para primeira tela rápida) */
export async function getCatalogWithFilters(
  filters?: CatalogFilters,
  initialLimit?: number,
  options?: { fetchAll?: boolean },
  signal?: AbortSignal
): Promise<{ movies: Movie[]; series: Series[] }> {
  // Corte estrito por tipo. Math.max preserva filtros de ano mais restritos vindos da UI/admin
  // (ex.: usuário filtra 2023) sem nunca descer abaixo do piso de produto (2020 filmes / 2015 séries).
  const requestedMinYear = filters?.minYear ?? 0;
  const moviesFilters: CatalogFilters = {
    ...filters,
    minYear: Math.max(requestedMinYear, CATALOG_MIN_YEAR_MOVIES),
  };
  const seriesFilters: CatalogFilters = {
    ...filters,
    minYear: Math.max(requestedMinYear, CATALOG_MIN_YEAR_SERIES),
  };

  const limit = initialLimit ?? 200;
  const fetchAll = options?.fetchAll ?? !initialLimit;

  // Promise.allSettled: catálogo parcial se uma tabela retornar erro (ex: RLS, timeout)
  const [moviesPage1Result, seriesPage1Result] = await Promise.allSettled([
    getMoviesPaginated(1, limit, moviesFilters, signal),
    getSeriesPaginated(1, limit, seriesFilters, signal),
  ]);

  if (moviesPage1Result.status === 'rejected' && seriesPage1Result.status === 'rejected') {
    throw new Error('Supabase não respondeu ao catálogo de filmes e séries.');
  }

  const moviesPage1 =
    moviesPage1Result.status === 'fulfilled'
      ? moviesPage1Result.value
      : { data: [] as any[], page: 1, limit, hasMore: false, total: null, totalPages: null };
  const seriesPage1 =
    seriesPage1Result.status === 'fulfilled'
      ? seriesPage1Result.value
      : { data: [] as any[], page: 1, limit, hasMore: false, total: null, totalPages: null };

  if (moviesPage1Result.status === 'rejected')
    logger.warn('getCatalog: falha página 1 filmes:', moviesPage1Result.reason);
  if (seriesPage1Result.status === 'rejected')
    logger.warn('getCatalog: falha página 1 séries:', seriesPage1Result.reason);

  let allMovies = moviesPage1.data;
  let allSeries = seriesPage1.data;

  const fetchAllPages = async <T>(
    signal: AbortSignal | undefined,
    fetcher: (page: number) => Promise<PaginatedResponse<T>>,
    firstPage: PaginatedResponse<T>
  ): Promise<T[]> => {
    let allItems = [...firstPage.data];
    let currentPage = firstPage.page;
    let hasMore = firstPage.hasMore;

    while (hasMore) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const nextPage = currentPage + 1;
      const result = await fetcher(nextPage);
      allItems = [...allItems, ...result.data];
      hasMore = result.hasMore;
      currentPage = result.page;
      if (hasMore) await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return allItems;
  };

  if (fetchAll) {
    const [moreMoviesResult, moreSeriesResult] = await Promise.allSettled([
      fetchAllPages(
        signal,
        (p) => getMoviesPaginated(p, 200, moviesFilters, signal),
        moviesPage1
      ),
      fetchAllPages(
        signal,
        (p) => getSeriesPaginated(p, 200, seriesFilters, signal),
        seriesPage1
      ),
    ]);
    if (moreMoviesResult.status === 'fulfilled') allMovies = moreMoviesResult.value;
    else logger.warn('getCatalog: falha ao paginar filmes:', moreMoviesResult.reason);
    if (moreSeriesResult.status === 'fulfilled') allSeries = moreSeriesResult.value;
    else logger.warn('getCatalog: falha ao paginar séries:', moreSeriesResult.reason);
  }

  allMovies = allMovies
    .map((row: any) => normalizeCatalogMovieRow(row))
    .filter((movie) => hasCatalogVideoUrl(movie));

  allSeries = allSeries
    .map((row: any) => normalizeCatalogSeriesRow(row))
    .filter((series) => hasCatalogSeriesPlayback(series));

  logger.log(
    `📦 Catálogo carregado: ${allMovies.length} filmes (desde ${moviesFilters.minYear}), ${allSeries.length} séries (desde ${seriesFilters.minYear})`
  );

  return {
    movies: allMovies,
    series: allSeries,
  };
}

// ═══════════════════════════════════════════════════════
// PLANO LOCAL — Validação local para TV Box APK (sem gateway de pagamento)
// ═══════════════════════════════════════════════════════
const PLAN_STORAGE_KEY = 'redx-selected-plan';

/** Salva plano selecionado no localStorage como 'active' */
export function selectPlanLocally(plan: Plan): void {
  const stored = {
    ...plan,
    status: 'active',
    selectedAt: new Date().toISOString(),
    // Expiração generosa: 1 ano
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(stored));
}

/** Recupera plano salvo do localStorage */
export function getLocalPlan():
  | (Plan & { status: string; selectedAt: string; expiresAt: string })
  | null {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Verificar se não expirou
    if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
      localStorage.removeItem(PLAN_STORAGE_KEY);
      return null;
    }
    return { ...parsed, status: 'active' }; // Sempre retorna active
  } catch {
    return null;
  }
}

/** Verifica se o usuário tem um plano ativo (local) */
export function hasActivePlan(): boolean {
  return getLocalPlan() !== null;
}

/** Remove plano salvo */
export function clearLocalPlan(): void {
  localStorage.removeItem(PLAN_STORAGE_KEY);
}

// ═══ Player Metrics (Telemetria) ═══

/**
 * Insere batch de métricas do player no Supabase.
 * Tabela: player_metrics (deve ser criada pelo admin).
 * Falha silenciosamente se tabela não existir — telemetria não é crítica.
 *
 * SQL para criar tabela:
 * CREATE TABLE player_metrics (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   metric_type text NOT NULL,
 *   value numeric NOT NULL,
 *   channel_name text,
 *   detail text,
 *   engine text,
 *   device_info text,
 *   created_at timestamptz DEFAULT now()
 * );
 * CREATE INDEX idx_pm_type ON player_metrics(metric_type);
 * CREATE INDEX idx_pm_created ON player_metrics(created_at);
 */
export async function insertPlayerMetrics(
  events: Array<{
    metric_type: string;
    value: number;
    channel_name: string;
    detail?: string;
    engine: string;
    device_info: string;
    timestamp: number;
  }>
): Promise<void> {
  if (!events.length) return;
  try {
    const rows = events.map((e) => ({
      metric_type: e.metric_type,
      value: e.value,
      channel_name: e.channel_name,
      detail: e.detail || null,
      engine: e.engine,
      device_info: e.device_info,
    }));
    await supabase.from('player_metrics').insert(rows);
  } catch {
    // Silencioso — tabela pode não existir ainda
  }
}

// ═══ Access Codes — extraído para accessCodeService.ts ═══
export type { AccessCode } from './accessCodeService';
export {
  generateAccessCode,
  validateAccessCode,
  getAllAccessCodes,
  deactivateAccessCode,
  deleteAccessCode,
} from './accessCodeService';

export async function saveUserSettings(settings: any): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, ...settings }, { onConflict: 'user_id' });
  return !error;
}

export async function updateSubscription(planId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from('user_subscriptions')
    .upsert({ user_id: user.id, plan_id: planId }, { onConflict: 'user_id' });
  return !error;
}
