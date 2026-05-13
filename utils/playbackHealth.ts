export type PlaybackHealthStatus = 'healthy' | 'failed';

export interface PlaybackHealthEntry {
  status: PlaybackHealthStatus;
  checkedAt: number;
  reason?: string;
}

// v2: preserva query string nas URLs (tokens/expires). Versão anterior (v1) removia
// a query, causando falsos positivos: URLs com tokens novos eram marcadas broken.
const STORAGE_KEY = 'redx-playback-health-v2';
const FAILURE_TTL_MS = 12 * 60 * 60 * 1000;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 400;

let memoryCache: Record<string, PlaybackHealthEntry> | null = null;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizePlaybackHealthUrl(rawUrl: string): string {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(value, base);
    // Preservar query string: tokens/expires/assinaturas fazem parte da identidade da URL.
    // Remover a query fazia URLs com tokens diferentes (mas mesmo caminho base)
    // serem tratadas como a mesma URL — uma falha marcava TODAS as futuras como broken.
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.replace(/#.*$/, ''); // Fallback: remove apenas hash
  }
}

function getTtlForStatus(status: PlaybackHealthStatus): number {
  return status === 'failed' ? FAILURE_TTL_MS : SUCCESS_TTL_MS;
}

function pruneEntries(
  entries: Record<string, PlaybackHealthEntry>
): Record<string, PlaybackHealthEntry> {
  const now = Date.now();
  const validEntries = Object.entries(entries)
    .filter(([, entry]) => now - entry.checkedAt < getTtlForStatus(entry.status))
    .sort(([, left], [, right]) => right.checkedAt - left.checkedAt)
    .slice(0, MAX_ENTRIES);

  return Object.fromEntries(validEntries);
}

function readEntries(): Record<string, PlaybackHealthEntry> {
  if (memoryCache) return memoryCache;

  if (!canUseStorage()) {
    memoryCache = {};
    return memoryCache;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, PlaybackHealthEntry>) : {};
    memoryCache = pruneEntries(parsed);
  } catch {
    memoryCache = {};
  }

  return memoryCache;
}

function writeEntries(entries: Record<string, PlaybackHealthEntry>): void {
  memoryCache = pruneEntries(entries);
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
  } catch {
    // Ignore storage quota and private mode failures.
  }
}

function normalizeUrlList(urls: string | string[]): string[] {
  const source = Array.isArray(urls) ? urls : [urls];
  return [...new Set(source.map(normalizePlaybackHealthUrl).filter(Boolean))];
}

function updateEntries(
  urls: string | string[],
  status: PlaybackHealthStatus,
  reason?: string
): void {
  const normalizedUrls = normalizeUrlList(urls);
  if (normalizedUrls.length === 0) return;

  const entries = { ...readEntries() };
  const checkedAt = Date.now();

  for (const url of normalizedUrls) {
    entries[url] = { status, checkedAt, reason };
  }

  writeEntries(entries);
}

export function getPlaybackHealth(url: string): PlaybackHealthEntry | null {
  const key = normalizePlaybackHealthUrl(url);
  if (!key) return null;

  const entries = readEntries();
  const entry = entries[key];
  if (!entry) return null;

  if (Date.now() - entry.checkedAt >= getTtlForStatus(entry.status)) {
    delete entries[key];
    writeEntries(entries);
    return null;
  }

  return entry;
}

export function isPlaybackUrlKnownBroken(url: string): boolean {
  const entry = getPlaybackHealth(url);
  return entry?.status === 'failed';
}

export function markPlaybackUrlsHealthy(urls: string | string[]): void {
  updateEntries(urls, 'healthy');
}

export function markPlaybackUrlsFailed(urls: string | string[], reason?: string): void {
  updateEntries(urls, 'failed', reason);
}
