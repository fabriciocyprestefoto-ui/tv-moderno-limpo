/**
 * services/adminService.ts
 *
 * Serviço centralizado para operações administrativas.
 * Conecta Dashboard, IPTV, Subscribers, Resellers e Security ao Supabase.
 */

import { supabase } from './supabaseService';
import { logger } from '../utils/logger';

/* ---------- Retry helper ---------- */

const MAX_RETRIES = 2;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      logger.error(`[AdminService] ${label} falhou após ${MAX_RETRIES + 1} tentativas:`, err);
      throw err;
    }
  }
  throw new Error('unreachable');
}

/* ---------- Interfaces ---------- */

export interface DashboardStats {
  totalSubscribers: number;
  activeSubscribers: number;
  totalMovies: number;
  totalSeries: number;
  totalChannels: number;
  totalRevenue: number;
}

export interface LiveAudienceTrendPoint {
  label: string;
  users: number;
}

export interface LiveAudienceStats {
  onlineUsers: number;
  activeDevices: number;
  trend: LiveAudienceTrendPoint[];
  lastHeartbeat: string | null;
  windowMinutes: number;
}

export interface TopWatchedItem {
  mediaId: string;
  mediaType: 'movie' | 'series';
  title: string;
  poster: string;
  backdrop: string;
  uniqueViewers: number;
  totalSessions: number;
  completedViews: number;
  completionRate: number;
  lastWatched: string | null;
}

export interface TopWatchedSummary {
  movies: TopWatchedItem[];
  series: TopWatchedItem[];
  lookbackDays: number;
}

export interface SubscriberRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  subscription?: {
    plan_name: string;
    status: string;
    current_period_end: string;
  };
  profiles?: { name: string; avatar_url?: string }[];
  devices_count?: number;
}

export interface M3USource {
  id: string;
  name: string;
  url: string;
  auto_update: boolean;
  update_interval: number;
  last_updated: string | null;
  status: string;
  created_at: string;
  channels_count?: number;
}

export interface Reseller {
  id: string;
  admin_id: string;
  commission_rate: number;
  balance: number;
  pix_key: string;
  notes: string;
  created_at: string;
  admin?: { name: string; email: string };
  clients_count?: number;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_resource: string;
  target_id: string;
  details: any;
  ip_address: string;
  created_at: string;
  admin?: { name: string; email: string };
}

export interface IPBlacklist {
  id: string;
  ip_address: string;
  reason: string;
  blocked_by: string;
  expires_at: string | null;
  created_at: string;
}

export interface SecuritySettings {
  id?: string;
  geo_block_enabled: boolean;
  ddos_protection: boolean;
  admin_2fa_required: boolean;
  max_login_attempts: number;
  session_timeout_hours: number;
}

export interface AdminConfig {
  id?: string;
  instance_name: string;
  maintenance_mode: boolean;
  cdn_caching: boolean;
  smtp_server: string;
  sender_email: string;
  system_alerts: boolean;
}

/* ---------- DASHBOARD ---------- */

export async function getDashboardStats(): Promise<DashboardStats> {
  return withRetry(async () => {
    const [moviesRes, seriesRes, channelsRes, subsRes, revenueRes] = await Promise.allSettled([
      supabase.from('movies').select('id', { count: 'exact', head: true }),
      supabase.from('series').select('id', { count: 'exact', head: true }),
      supabase.from('channels').select('id', { count: 'exact', head: true }),
      supabase.from('user_subscriptions').select('id, status', { count: 'exact' }),
      supabase.from('crm_transactions').select('amount').eq('status', 'paid'),
    ]);

    const moviesCount = moviesRes.status === 'fulfilled' ? moviesRes.value.count || 0 : 0;
    const seriesCount = seriesRes.status === 'fulfilled' ? seriesRes.value.count || 0 : 0;
    const channelsCount = channelsRes.status === 'fulfilled' ? channelsRes.value.count || 0 : 0;

    let totalSubs = 0;
    let activeSubs = 0;
    if (subsRes.status === 'fulfilled') {
      totalSubs = subsRes.value.count || 0;
      activeSubs = (subsRes.value.data || []).filter((s: any) => s.status === 'active').length;
    }

    let revenue = 0;
    if (revenueRes.status === 'fulfilled' && revenueRes.value.data) {
      revenue = revenueRes.value.data.reduce(
        (sum: number, t: any) => sum + (parseFloat(t.amount) || 0),
        0
      );
    }

    return {
      totalSubscribers: totalSubs,
      activeSubscribers: activeSubs,
      totalMovies: moviesCount,
      totalSeries: seriesCount,
      totalChannels: channelsCount,
      totalRevenue: revenue,
    };
  }, 'getDashboardStats');
}

function formatTrendLabel(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function getLiveAudienceStats(
  onlineWindowMinutes = 5,
  bucketMinutes = 5,
  bucketCount = 6
): Promise<LiveAudienceStats> {
  return withRetry(async () => {
    const now = Date.now();
    const trendWindowStart = new Date(now - bucketMinutes * bucketCount * 60_000).toISOString();
    const onlineThreshold = now - onlineWindowMinutes * 60_000;

    const { data, error } = await supabase
      .from('active_sessions')
      .select('user_id, last_activity')
      .gte('last_activity', trendWindowStart)
      .order('last_activity', { ascending: false });

    if (error) {
      logger.error('Erro ao buscar audiência online:', error);
      return {
        onlineUsers: 0,
        activeDevices: 0,
        trend: Array.from({ length: bucketCount }, (_, index) => ({
          label: formatTrendLabel(
            new Date(now - (bucketCount - index - 1) * bucketMinutes * 60_000)
          ),
          users: 0,
        })),
        lastHeartbeat: null,
        windowMinutes: onlineWindowMinutes,
      };
    }

    const rows = (data || []).filter(
      (row: any) => row.last_activity && !Number.isNaN(new Date(row.last_activity).getTime())
    );
    const onlineRows = rows.filter(
      (row: any) => new Date(row.last_activity).getTime() >= onlineThreshold
    );

    const trend = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = now - (bucketCount - index) * bucketMinutes * 60_000;
      const bucketEnd = bucketStart + bucketMinutes * 60_000;
      const users = new Set<string>();

      rows.forEach((row: any) => {
        const timestamp = new Date(row.last_activity).getTime();
        if (timestamp >= bucketStart && timestamp < bucketEnd && row.user_id) {
          users.add(String(row.user_id));
        }
      });

      return {
        label: formatTrendLabel(new Date(bucketEnd)),
        users: users.size,
      };
    });

    return {
      onlineUsers: new Set(onlineRows.map((row: any) => String(row.user_id || '')).filter(Boolean))
        .size,
      activeDevices: onlineRows.length,
      trend,
      lastHeartbeat: rows[0]?.last_activity || null,
      windowMinutes: onlineWindowMinutes,
    };
  }, 'getLiveAudienceStats');
}

async function fetchRecentWatchProgressRows(lookbackDays: number): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 1000;
  const hardLimit = 5000;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  let from = 0;

  while (rows.length < hardLimit) {
    const upperBound = Math.min(from + pageSize - 1, hardLimit - 1);
    const { data, error } = await supabase
      .from('watch_progress')
      .select('media_id, media_type, user_id, completed, progress_percent, last_watched')
      .gte('last_watched', since.toISOString())
      .order('last_watched', { ascending: false })
      .range(from, upperBound);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);
    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  if (rows.length > 0) {
    return rows;
  }

  from = 0;
  while (rows.length < hardLimit) {
    const upperBound = Math.min(from + pageSize - 1, hardLimit - 1);
    const { data, error } = await supabase
      .from('watch_progress')
      .select('media_id, media_type, user_id, completed, progress_percent, last_watched')
      .order('last_watched', { ascending: false })
      .range(from, upperBound);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);
    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function fetchMediaMetadata(
  table: 'movies' | 'series',
  mediaIds: string[]
): Promise<Record<string, { title?: string; poster?: string; backdrop?: string }>> {
  if (mediaIds.length === 0) return {};

  const { data, error } = await supabase
    .from(table)
    .select('id, title, poster, backdrop')
    .in('id', mediaIds);

  if (error) {
    logger.error(`Erro ao buscar metadados de ${table}:`, error);
    return {};
  }

  return Object.fromEntries(
    (data || []).map((item: any) => [
      String(item.id),
      {
        title: item.title,
        poster: item.poster,
        backdrop: item.backdrop,
      },
    ])
  );
}

function buildTopWatchedItems(
  rows: any[],
  mediaType: 'movie' | 'series',
  metadata: Record<string, { title?: string; poster?: string; backdrop?: string }>,
  limit: number
): TopWatchedItem[] {
  const bucket = new Map<
    string,
    {
      mediaId: string;
      users: Set<string>;
      totalSessions: number;
      completedViews: number;
      lastWatched: string | null;
    }
  >();

  rows
    .filter((row: any) => row.media_type === mediaType && row.media_id)
    .forEach((row: any) => {
      const mediaId = String(row.media_id);
      const current = bucket.get(mediaId) || {
        mediaId,
        users: new Set<string>(),
        totalSessions: 0,
        completedViews: 0,
        lastWatched: null,
      };

      current.totalSessions += 1;
      if (row.user_id) {
        current.users.add(String(row.user_id));
      }
      if (row.completed) {
        current.completedViews += 1;
      }
      if (!current.lastWatched || String(row.last_watched || '') > current.lastWatched) {
        current.lastWatched = row.last_watched || null;
      }

      bucket.set(mediaId, current);
    });

  return Array.from(bucket.values())
    .sort((a, b) => {
      if (b.users.size !== a.users.size) return b.users.size - a.users.size;
      if (b.totalSessions !== a.totalSessions) return b.totalSessions - a.totalSessions;
      return String(b.lastWatched || '').localeCompare(String(a.lastWatched || ''));
    })
    .slice(0, limit)
    .map((item) => {
      const media = metadata[item.mediaId] || {};
      return {
        mediaId: item.mediaId,
        mediaType,
        title: media.title || `Conteúdo ${item.mediaId.slice(0, 6)}`,
        poster: media.poster || '',
        backdrop: media.backdrop || '',
        uniqueViewers: item.users.size,
        totalSessions: item.totalSessions,
        completedViews: item.completedViews,
        completionRate:
          item.totalSessions > 0 ? Math.round((item.completedViews / item.totalSessions) * 100) : 0,
        lastWatched: item.lastWatched,
      };
    });
}

export async function getTopWatchedContent(
  limit = 5,
  lookbackDays = 30
): Promise<TopWatchedSummary> {
  return withRetry(async () => {
    const progressRows = await fetchRecentWatchProgressRows(lookbackDays);
    const movieIds = Array.from(
      new Set(
        progressRows
          .filter((row: any) => row.media_type === 'movie' && row.media_id)
          .map((row: any) => String(row.media_id))
      )
    );
    const seriesIds = Array.from(
      new Set(
        progressRows
          .filter((row: any) => row.media_type === 'series' && row.media_id)
          .map((row: any) => String(row.media_id))
      )
    );

    const [moviesMeta, seriesMeta] = await Promise.all([
      fetchMediaMetadata('movies', movieIds),
      fetchMediaMetadata('series', seriesIds),
    ]);

    return {
      movies: buildTopWatchedItems(progressRows, 'movie', moviesMeta, limit),
      series: buildTopWatchedItems(progressRows, 'series', seriesMeta, limit),
      lookbackDays,
    };
  }, 'getTopWatchedContent');
}

export async function getRecentTransactions(limit = 10): Promise<any[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('crm_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  }, 'getRecentTransactions');
}

export async function getMonthlyRevenue(): Promise<
  { month: string; receita: number; novos: number }[]
> {
  return withRetry(async () => {
    // Buscar transações dos últimos 6 meses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: transactions } = await supabase
      .from('crm_transactions')
      .select('amount, created_at')
      .eq('status', 'paid')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true });

    const { data: subs } = await supabase
      .from('user_subscriptions')
      .select('created_at')
      .gte('created_at', sixMonthsAgo.toISOString());

    const months = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];
    const result: Record<string, { receita: number; novos: number }> = {};

    // Inicializar meses
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${months[d.getMonth()]}`;
      result[key] = { receita: 0, novos: 0 };
    }

    (transactions || []).forEach((t: any) => {
      const d = new Date(t.created_at);
      const key = months[d.getMonth()];
      if (result[key]) result[key].receita += parseFloat(t.amount) || 0;
    });

    (subs || []).forEach((s: any) => {
      const d = new Date(s.created_at);
      const key = months[d.getMonth()];
      if (result[key]) result[key].novos += 1;
    });

    return Object.entries(result).map(([month, data]) => ({ month, ...data }));
  }, 'getMonthlyRevenue');
}

/* ---------- SUBSCRIBERS ---------- */

export async function getSubscribers(
  page = 1,
  pageSize = 20,
  search = '',
  statusFilter = '',
  planFilter = ''
): Promise<{ data: SubscriberRow[]; total: number }> {
  let query = supabase
    .from('user_subscriptions')
    .select(
      `
      id,
      user_id,
      status,
      current_period_end,
      created_at,
      plan:plans(name, price)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'Todos') {
    query = query.eq('status', statusFilter.toLowerCase());
  }

  if (planFilter && planFilter !== 'Todos') {
    query = query.eq('plan_id', planFilter);
  }

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) return { data: [], total: 0 };

  // Buscar emails/nomes da tabela profiles para todos os user_ids
  const userIds = (data || []).map((s: any) => s.user_id).filter(Boolean);
  const profileMap: Record<string, { name?: string; email?: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, name')
      .in('user_id', userIds);
    (profiles || []).forEach((p: any) => {
      profileMap[p.user_id] = { name: p.name };
    });
  }

  const rows: SubscriberRow[] = (data || []).map((sub: any) => ({
    id: sub.id,
    email: profileMap[sub.user_id]?.name || sub.user_id?.slice(0, 8) || 'N/A',
    created_at: sub.created_at,
    subscription: {
      plan_name: sub.plan?.name || 'Sem Plano',
      status: sub.status,
      current_period_end: sub.current_period_end,
    },
  }));

  // Filtro de busca no lado cliente (por email/nome)
  const filtered = search
    ? rows.filter((r) => r.email.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return { data: filtered, total: count || 0 };
}

export async function createSubscriber(params: {
  name: string;
  email: string;
  plan_id: string;
  duration_days: number;
}): Promise<{ success: boolean; error: string | null }> {
  try {
    // Criar entry na user_subscriptions com um UUID gerado
    const newUserId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + params.duration_days);

    const { error: subError } = await supabase.from('user_subscriptions').insert({
      user_id: newUserId,
      plan_id: params.plan_id,
      status: 'active',
      current_period_end: expiresAt.toISOString(),
    });

    if (subError) {
      logger.error('Erro ao criar assinatura:', subError);
      return { success: false, error: subError.message };
    }

    // Criar perfil com o nome/email do usuario
    await supabase.from('user_profiles').insert({
      user_id: newUserId,
      name: params.name || params.email,
      is_kids: false,
      is_main: true,
    });

    return { success: true, error: null };
  } catch (err: any) {
    logger.error('Erro ao criar assinante:', err);
    return { success: false, error: err.message || 'Erro inesperado' };
  }
}

export async function updateSubscription(
  subId: string,
  updates: {
    status?: string;
    plan_id?: string;
    expires_at?: string;
  }
): Promise<boolean> {
  const payload: any = { updated_at: new Date().toISOString() };
  if (updates.status) payload.status = updates.status;
  if (updates.plan_id) payload.plan_id = updates.plan_id;
  if (updates.expires_at) payload.current_period_end = updates.expires_at;

  const { error } = await supabase.from('user_subscriptions').update(payload).eq('id', subId);
  return !error;
}

export async function updateSubscriptionStatus(subId: string, status: string): Promise<boolean> {
  return updateSubscription(subId, { status });
}

export async function deleteSubscription(subId: string): Promise<boolean> {
  const { error } = await supabase.from('user_subscriptions').delete().eq('id', subId);
  return !error;
}

/* ---------- IPTV / M3U Sources ---------- */

export async function getM3USources(): Promise<M3USource[]> {
  const { data, error } = await supabase
    .from('crm_m3u_sources')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function createM3USource(source: Partial<M3USource>): Promise<M3USource | null> {
  const { data, error } = await supabase
    .from('crm_m3u_sources')
    .insert(source)
    .select()
    .maybeSingle();
  if (error) {
    logger.error('Erro ao criar fonte M3U:', error);
    return null;
  }
  return data;
}

export async function updateM3USource(id: string, updates: Partial<M3USource>): Promise<boolean> {
  const { error } = await supabase.from('crm_m3u_sources').update(updates).eq('id', id);
  return !error;
}

export async function deleteM3USource(id: string): Promise<boolean> {
  const { error } = await supabase.from('crm_m3u_sources').delete().eq('id', id);
  return !error;
}

export async function getChannelsAdmin(): Promise<any[]> {
  // Try English column name first (schema standard), fallback to Portuguese
  let { data, error } = await supabase
    .from('channels')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    // Fallback: try Portuguese column name
    const res = await supabase.from('channels').select('*').order('nome', { ascending: true });
    data = res.data;
    error = res.error;
  }
  if (error) return [];
  // Normalize: ensure both naming conventions are available
  return (data || []).map((c: any) => ({
    ...c,
    nome: c.nome || c.name || '',
    name: c.name || c.nome || '',
    logo: c.logo || c.logo_url || '',
    genero: c.genero || c.category || '',
    category: c.category || c.genero || '',
    url: c.url || c.stream_url || '',
    stream_url: c.stream_url || c.url || '',
  }));
}

export async function createChannel(channel: any): Promise<any> {
  // Normalize to English column names (DB schema standard)
  const normalized: any = {
    name: channel.name || channel.nome || '',
    logo: channel.logo || '',
    category: channel.category || channel.genero || '',
    stream_url: channel.stream_url || channel.url || '',
  };
  if (channel.number != null) normalized.number = channel.number;
  if (channel.is_premium != null) normalized.is_premium = channel.is_premium;

  let { data, error } = await supabase.from('channels').insert(normalized).select().maybeSingle();
  if (error) {
    // Fallback: try Portuguese column names
    const ptNormalized: any = {
      nome: channel.nome || channel.name || '',
      logo: channel.logo || '',
      genero: channel.genero || channel.category || '',
      url: channel.url || channel.stream_url || '',
    };
    const res = await supabase.from('channels').insert(ptNormalized).select().maybeSingle();
    data = res.data;
    error = res.error;
  }
  if (error) {
    logger.error('Erro ao criar canal:', error);
    return null;
  }
  return data;
}

export async function updateChannel(id: string, updates: any): Promise<boolean> {
  // Normalize to English column names (DB schema standard)
  const normalized: any = {};
  if (updates.name || updates.nome) normalized.name = updates.name || updates.nome;
  if (updates.logo !== undefined) normalized.logo = updates.logo;
  if (updates.category || updates.genero) normalized.category = updates.category || updates.genero;
  if (updates.stream_url || updates.url) normalized.stream_url = updates.stream_url || updates.url;
  if (updates.number != null) normalized.number = updates.number;
  if (updates.is_premium != null) normalized.is_premium = updates.is_premium;

  let { error } = await supabase.from('channels').update(normalized).eq('id', id);
  if (error) {
    // Fallback: try Portuguese column names
    const ptNormalized: any = {};
    if (updates.nome || updates.name) ptNormalized.nome = updates.nome || updates.name;
    if (updates.logo !== undefined) ptNormalized.logo = updates.logo;
    if (updates.genero || updates.category)
      ptNormalized.genero = updates.genero || updates.category;
    if (updates.url || updates.stream_url) ptNormalized.url = updates.url || updates.stream_url;
    const res = await supabase.from('channels').update(ptNormalized).eq('id', id);
    error = res.error;
  }
  return !error;
}

export async function deleteChannel(id: string): Promise<boolean> {
  const { error } = await supabase.from('channels').delete().eq('id', id);
  return !error;
}

/* ---------- RESELLERS ---------- */

export async function getResellers(): Promise<Reseller[]> {
  const { data, error } = await supabase
    .from('crm_resellers')
    .select(`*, admin:crm_admins(name, email)`)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function createReseller(reseller: Partial<Reseller>): Promise<Reseller | null> {
  const { data, error } = await supabase
    .from('crm_resellers')
    .insert(reseller)
    .select()
    .maybeSingle();
  if (error) {
    logger.error('Erro ao criar revendedor:', error);
    return null;
  }
  return data;
}

export async function updateReseller(id: string, updates: Partial<Reseller>): Promise<boolean> {
  const { error } = await supabase.from('crm_resellers').update(updates).eq('id', id);
  return !error;
}

export async function deleteReseller(id: string): Promise<boolean> {
  const { error } = await supabase.from('crm_resellers').delete().eq('id', id);
  return !error;
}

export async function getResellersStats(): Promise<{
  total: number;
  totalBalance: number;
  totalCommissions: number;
}> {
  const { data, error } = await supabase.from('crm_resellers').select('balance, commission_rate');
  if (error || !data) return { total: 0, totalBalance: 0, totalCommissions: 0 };
  return {
    total: data.length,
    totalBalance: data.reduce((sum, r: any) => sum + (parseFloat(r.balance) || 0), 0),
    totalCommissions:
      data.reduce((sum, r: any) => sum + (parseFloat(r.commission_rate) || 0), 0) /
      Math.max(data.length, 1),
  };
}

/* ---------- SECURITY ---------- */

export async function getAuditLogs(limit = 50): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('crm_audit_logs')
    .select(`*, admin:crm_admins(name, email)`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

export async function insertAuditLog(log: Partial<AuditLog>): Promise<boolean> {
  const { error } = await supabase.from('crm_audit_logs').insert(log);
  return !error;
}

export async function getIPBlacklist(): Promise<IPBlacklist[]> {
  const { data, error } = await supabase
    .from('crm_ip_blacklist')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function addIPToBlacklist(entry: Partial<IPBlacklist>): Promise<IPBlacklist | null> {
  const { data, error } = await supabase
    .from('crm_ip_blacklist')
    .insert(entry)
    .select()
    .maybeSingle();
  if (error) {
    logger.error('Erro ao bloquear IP:', error);
    return null;
  }
  return data;
}

export async function removeIPFromBlacklist(id: string): Promise<boolean> {
  const { error } = await supabase.from('crm_ip_blacklist').delete().eq('id', id);
  return !error;
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('*')
    .eq('key', 'security')
    .maybeSingle();
  if (error || !data) {
    return {
      geo_block_enabled: false,
      ddos_protection: false,
      admin_2fa_required: false,
      max_login_attempts: 5,
      session_timeout_hours: 24,
    };
  }
  return data.value as SecuritySettings;
}

export async function updateSecuritySettings(settings: SecuritySettings): Promise<boolean> {
  const { error } = await supabase
    .from('admin_settings')
    .upsert({ key: 'security', value: settings }, { onConflict: 'key' });
  return !error;
}

/* ---------- ADMIN SETTINGS ---------- */

export async function getAdminConfig(): Promise<AdminConfig> {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('*')
    .eq('key', 'config')
    .maybeSingle();
  if (error || !data) {
    return {
      instance_name: 'RED X Master Node 01',
      maintenance_mode: false,
      cdn_caching: true,
      smtp_server: 'smtp.sendgrid.net',
      sender_email: 'no-reply@redx.com',
      system_alerts: true,
    };
  }
  return data.value as AdminConfig;
}

export async function updateAdminConfig(config: AdminConfig): Promise<boolean> {
  const { error } = await supabase
    .from('admin_settings')
    .upsert({ key: 'config', value: config }, { onConflict: 'key' });
  return !error;
}

export async function getSystemHealth(): Promise<{
  database: boolean;
  storage: boolean;
  latency: number;
}> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('movies').select('id').limit(1);
    const latency = Date.now() - start;
    return { database: !error, storage: true, latency };
  } catch {
    return { database: false, storage: false, latency: Date.now() - start };
  }
}
