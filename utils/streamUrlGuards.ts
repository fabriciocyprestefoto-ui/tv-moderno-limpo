/**
 * Rejeita URLs de stream óbvias de placeholder / documentação que às vezes
 * ficam na base (ex.: https://example.com/...) e quebram playback sem fallback útil.
 */

const FAKE_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'invalid',
  'domain.invalid',
]);

export function isPlaceholderOrFakeStreamUrl(url: string | null | undefined): boolean {
  const raw = String(url || '').trim();
  if (!raw) return true;
  const low = raw.toLowerCase();
  if (!low.startsWith('http')) return true;

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const u = new URL(raw, base);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (FAKE_HOSTS.has(host)) return true;
    if (host.endsWith('.example.com') || host.endsWith('.example.org')) return true;
  } catch {
    return true;
  }

  if (low.includes('example.com/') || low.includes('example.org/')) return true;

  return false;
}

/**
 * Heurística conservadora para HLS.
 * Não trate URL assinada como HLS só por ter token/expires/signature: muitos
 * provedores usam esses parâmetros em MP4/progressivo, e classificar errado
 * manda o stream para HLS.js/ExoPlayer como playlist.
 */
export function isLikelyHlsStreamUrl(url: string | null | undefined): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;

  const low = raw.toLowerCase();
  if (low.includes('.m3u8') || low.includes('m3u8')) return true;

  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith('/playlist') || path.endsWith('/manifest')) return true;
    const format = (
      parsed.searchParams.get('format') ||
      parsed.searchParams.get('type') ||
      ''
    ).toLowerCase();
    if (format === 'hls' || format === 'm3u8') return true;
    return false;
  } catch {
    return false;
  }
}

function normalizeCandidateUrl(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const hashIndex = raw.indexOf('#');
  return hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
}

function replacePathInUrl(rawUrl: string, replacer: (pathname: string) => string): string {
  const raw = normalizeCandidateUrl(rawUrl);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const replacedPath = replacer(parsed.pathname);
    if (!replacedPath || replacedPath === parsed.pathname) return '';
    parsed.pathname = replacedPath;
    return parsed.toString();
  } catch {
    const qIndex = raw.indexOf('?');
    const base = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    const query = qIndex >= 0 ? raw.slice(qIndex) : '';
    const replacedBase = replacer(base);
    if (!replacedBase || replacedBase === base) return '';
    return `${replacedBase}${query}`;
  }
}

function replaceQueryParamInUrl(rawUrl: string, key: 'format' | 'type', value: string): string {
  const raw = normalizeCandidateUrl(rawUrl);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const current = (parsed.searchParams.get(key) || '').toLowerCase();
    if (!current || current === value.toLowerCase()) return '';
    parsed.searchParams.set(key, value);
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Gera candidatos de URL para fallback progressivo de playback.
 * Ordem: URL original -> variantes conservadoras (.m3u8/.mp4 e format/type).
 */
export function buildPlaybackUrlCandidates(url: string | null | undefined): string[] {
  const raw = normalizeCandidateUrl(String(url || ''));
  if (!raw) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    const value = normalizeCandidateUrl(candidate);
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  add(raw);

  const low = raw.toLowerCase();
  if (low.includes('.m3u8')) {
    add(replacePathInUrl(raw, (pathname) => pathname.replace(/master\.m3u8$/i, 'video.mp4')));
    add(replacePathInUrl(raw, (pathname) => pathname.replace(/\.m3u8$/i, '.mp4')));
  }

  if (low.includes('.mp4')) {
    add(replacePathInUrl(raw, (pathname) => pathname.replace(/video\.mp4$/i, 'master.m3u8')));
    add(replacePathInUrl(raw, (pathname) => pathname.replace(/\.mp4$/i, '.m3u8')));
  }

  add(replaceQueryParamInUrl(raw, 'format', 'hls'));
  add(replaceQueryParamInUrl(raw, 'format', 'mp4'));
  add(replaceQueryParamInUrl(raw, 'type', 'hls'));
  add(replaceQueryParamInUrl(raw, 'type', 'mp4'));

  return out;
}

/** Colunas comuns em `movies` / `series` / `episodes` / `channels` com URL de reprodução. */
const URL_FIELD_KEYS = [
  'stream_url',
  'streamUrl',
  'video_url',
  'videoUrl',
  'source_url',
  'sourceUrl',
  'play_url',
  'playUrl',
  'm3u8_url',
  'file_url',
  'url',
  'link',
] as const;

function isSignedAuthStreamUrl(url: string): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.includes('/auth/')) {
      return true;
    }

    return (
      parsed.searchParams.has('token') ||
      parsed.searchParams.has('expires') ||
      parsed.searchParams.has('signature')
    );
  } catch {
    return /\/auth\//i.test(raw);
  }
}

/**
 * Primeira URL HTTP utilizável numa linha vinda do Supabase (ignora placeholder, ex.: example.com).
 * Ordem: stream_url → video_url → … — assim, se `stream_url` for lixo mas `video_url` for real, usa a real.
 */
export function pickFirstRealStreamUrlFromRow(
  row: Record<string, unknown> | null | undefined
): string {
  if (!row || typeof row !== 'object') return '';
  let authFallback = '';
  for (const key of URL_FIELD_KEYS) {
    const value = (row as Record<string, unknown>)[key];
    if (typeof value !== 'string') continue;
    const cleaned = value.trim();
    if (!cleaned || cleaned.length <= 5) continue;
    if (cleaned.includes('undefined') || cleaned.includes('null')) continue;
    if (isPlaceholderOrFakeStreamUrl(cleaned)) continue;
    if (isSignedAuthStreamUrl(cleaned)) {
      if (!authFallback) authFallback = cleaned;
      continue;
    }
    return cleaned;
  }
  return authFallback;
}
