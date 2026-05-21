import { fetchWithCache, supabase, ensureValidSession } from '@/services/supabaseService';
import { logger } from '@/utils/logger';

export type AdultMenuSection = {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
};

export type AdultMenuItem = {
  id: string;
  section_id: string;
  slug: string;
  label: string;
  icon: string | null;
  target: string | null;
  sort_order: number;
  enabled: boolean;
};

export type AdultMenu = Array<{
  section: AdultMenuSection;
  items: AdultMenuItem[];
}>;

export type AdultStream = {
  id: string;
  title: string;
  logo_url: string | null;
  group_title: string | null;
  stream_url: string;
  source: string | null;
};

type ParsedExtInf = {
  title: string;
  logo_url: string | null;
  group_title: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdultoTxt(raw: string): AdultStream[] {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const items: AdultStream[] = [];
  let pendingMeta: ParsedExtInf | null = null;
  let pendingUrl: string | null = null;

  const isUrl = (line: string) => /^https?:\/\//i.test(line);

  const parseExtInf = (line: string): ParsedExtInf => {
    const tvgName = /tvg-name="([^"]+)"/i.exec(line)?.[1] ?? '';
    const tvgLogo = /tvg-logo="([^"]+)"/i.exec(line)?.[1] ?? null;
    const groupTitle = /group-title="([^"]+)"/i.exec(line)?.[1] ?? null;
    const commaIdx = line.indexOf(',');
    const afterComma = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
    const title = (afterComma || tvgName || 'Sem título').trim();
    return { title, logo_url: tvgLogo, group_title: groupTitle };
  };

  const push = (meta: ParsedExtInf, url: string) => {
    const id = `adulto-${items.length + 1}`;
    items.push({
      id,
      title: meta.title,
      logo_url: meta.logo_url,
      group_title: meta.group_title,
      stream_url: url,
      source: 'adulto.txt',
    });
  };

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const meta = parseExtInf(line);
      if (pendingUrl) {
        push(meta, pendingUrl);
        pendingUrl = null;
        pendingMeta = null;
      } else {
        pendingMeta = meta;
      }
      continue;
    }

    if (isUrl(line)) {
      if (pendingMeta) {
        push(pendingMeta, line);
        pendingMeta = null;
        pendingUrl = null;
      } else {
        pendingUrl = line;
      }
      continue;
    }
  }

  return items;
}

const ADULTO_M3U_PATH = '/adulto-data.m3u';

export async function fetchAdultStreamsFromM3U(options?: {
  groupTitle?: string | null;
  query?: string | null;
  limit?: number;
}): Promise<AdultStream[]> {
  const groupTitle = (options?.groupTitle || '').trim();
  const query = (options?.query || '').trim().toLowerCase();
  const limit = options?.limit ?? 400;

  const res = await fetch(ADULTO_M3U_PATH);
  if (!res.ok) {
    throw new Error(`Falha ao carregar ${ADULTO_M3U_PATH}: HTTP ${res.status}`);
  }

  const raw = await res.text();
  let streams = parseAdultoTxt(raw).map((s) => ({
    ...s,
    source: 'adulto-data.m3u',
  }));

  if (groupTitle) {
    streams = streams.filter((s) => (s.group_title || '').trim() === groupTitle);
  }
  if (query) {
    streams = streams.filter((s) => s.title.toLowerCase().includes(query));
  }
  if (limit > 0) {
    streams = streams.slice(0, limit);
  }

  return streams;
}

export function getAdultGroupsFromStreams(streams: AdultStream[]): string[] {
  const set = new Set<string>();
  for (const s of streams) {
    const g = (s.group_title || '').trim();
    if (g) set.add(g);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function fetchAdultMenu(): Promise<AdultMenu> {
  return fetchWithCache('adult-menu:v1', async () => {
    const ok = await ensureValidSession();
    if (!ok) return [];

    const { data: sections, error: sectionsError } = await supabase
      .from('adult_menu_sections')
      .select('id, slug, title, sort_order')
      .order('sort_order', { ascending: true });

    if (sectionsError) throw sectionsError;

    const { data: items, error: itemsError } = await supabase
      .from('adult_menu_items')
      .select('id, section_id, slug, label, icon, target, sort_order, enabled')
      .order('sort_order', { ascending: true });

    if (itemsError) throw itemsError;

    const bySection = new Map<string, AdultMenuItem[]>();
    for (const it of items || []) {
      if (!it.enabled) continue;
      const arr = bySection.get(it.section_id) || [];
      arr.push(it);
      bySection.set(it.section_id, arr);
    }

    return (sections || []).map((section) => ({
      section,
      items: (bySection.get(section.id) || []).sort((a, b) => a.sort_order - b.sort_order),
    }));
  });
}

export async function fetchAdultStreamsFromSupabase(options?: {
  groupTitle?: string | null;
  query?: string | null;
  limit?: number;
}): Promise<AdultStream[]> {
  const groupTitle = (options?.groupTitle || '').trim();
  const query = (options?.query || '').trim();
  const limit = options?.limit ?? 400;

  const cacheKey = `adult-streams:v3:${groupTitle}:${query}:${limit}`;

  return fetchWithCache(cacheKey, async () => {
    let q = supabase
      .from('adult_streams')
      .select('id, title, logo_url, group_title, stream_url, source')
      .order('id', { ascending: true })
      .limit(limit);

    if (groupTitle) q = q.eq('group_title', groupTitle);
    if (query) q = q.ilike('title', `%${query}%`);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  });
}

export async function hasAdultVerification(profileId: string): Promise<boolean> {
  const ok = await ensureValidSession();
  if (!ok) return false;

  const { data, error } = await supabase
    .from('adult_profile_verifications')
    .select('id')
    .eq('profile_id', profileId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn('[Adulto] Falha ao checar verificação:', error);
    return false;
  }
  return Boolean(data?.id);
}

export async function createAdultVerification(input: {
  profileId: string;
  userId: string;
  birthdate: string;
  termsVersion: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ok = await ensureValidSession();
  if (!ok) return { ok: false, error: 'Sessão inválida. Faça login novamente.' };

  try {
    const { error } = await supabase.from('adult_profile_verifications').insert({
      profile_id: input.profileId,
      user_id: input.userId,
      birthdate: input.birthdate,
      terms_version: input.termsVersion,
    });

    if (error) return { ok: false, error: error.message || 'Falha ao registrar verificação' };
    return { ok: true };
  } catch (err) {
    logger.warn('[Adulto] createAdultVerification error:', err);
    return { ok: false, error: 'Falha ao registrar verificação. Tente novamente.' };
  }
}

export function isSupabaseAuthUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return UUID_RE.test(userId);
}
