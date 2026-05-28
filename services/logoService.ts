import { Media } from '../types';
import { getLogo } from './tmdb';
import { getMediaLogo } from '../utils/mediaUtils';

// v3: invalida caches v2 que podiam guardar logo armazenada estrangeira (ja).
const STORAGE_KEY = 'redx-logo-cache-v3';
const MAX_CONCURRENT = 3;
const BATCH_DELAY_MS = 150;

const _cache = new Map<string, string | null>();
let _activeFetches = 0;
const _queue: Array<{ key: string; tmdbId: number; type: 'movie' | 'series' }> = [];
const _listeners = new Set<() => void>();
let _drainScheduled = false;
let _loaded = false;

function _loadFromStorage() {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    for (const [k, v] of Object.entries(parsed)) {
      if (!_cache.has(k)) _cache.set(k, v);
    }
  } catch {
    /* ignore corrupted cache */
  }
}

function _saveToStorage() {
  try {
    const obj: Record<string, string | null> = {};
    let count = 0;
    for (const [k, v] of _cache) {
      if (v && count < 2000) {
        obj[k] = v;
        count++;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota exceeded — silent */
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function _debouncedSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_saveToStorage, 3000);
}

function _notify() {
  for (const fn of _listeners) fn();
}

function _makeKey(media: Media): string {
  const id = media.tmdb_id && media.tmdb_id > 0 ? media.tmdb_id : 0;
  return `${id}_${media.type}`;
}

async function _fetchOne(key: string, tmdbId: number, type: 'movie' | 'series') {
  _activeFetches++;
  try {
    const url = await getLogo(tmdbId, type);
    const normalized = url ? getMediaLogo({ logo_url: url }) || url : null;
    _cache.set(key, normalized);
    if (normalized) _debouncedSave();
    _notify();
  } catch {
    _cache.set(key, null);
  } finally {
    _activeFetches--;
    _drainQueue();
  }
}

function _drainQueue() {
  while (_activeFetches < MAX_CONCURRENT && _queue.length > 0) {
    const item = _queue.shift()!;
    if (_cache.has(item.key) && _cache.get(item.key) !== undefined) continue;
    _fetchOne(item.key, item.tmdbId, item.type);
  }
}

function _scheduleDrain() {
  if (_drainScheduled) return;
  _drainScheduled = true;
  setTimeout(() => {
    _drainScheduled = false;
    _drainQueue();
  }, BATCH_DELAY_MS);
}

/**
 * Logo localizada (síncrona) já conhecida para o item.
 * - Item COM tmdb_id: retorna a logo localizada já buscada/cacheada, ou null
 *   (skeleton). NUNCA retorna a logo_url armazenada — ela pode estar em idioma
 *   errado (ex: ja) e causaria o flash japonês→inglês→português.
 * - Item SEM tmdb_id: usa a logo_url armazenada (única fonte possível).
 */
export function getLogoFromCache(media: Media): string | null {
  _loadFromStorage();
  if (!media.tmdb_id || media.tmdb_id <= 0) return getMediaLogo(media) || null;
  const key = _makeKey(media);
  const cached = _cache.get(key);
  if (cached) {
    const sanitized = getMediaLogo({ ...media, logo_url: cached }) || null;
    if (!sanitized) { _cache.delete(key); _debouncedSave(); return null; }
    return sanitized;
  }
  return null; // sem localizada conhecida → skeleton, não logo estrangeira
}

/** Alias semântico para uso nos componentes (seed inicial sem flicker). */
export const getLocalizedLogoSync = getLogoFromCache;

/** Persiste a logo localizada já escolhida por um componente (via getLogo). */
export function rememberLocalizedLogo(media: Media, url: string | null): void {
  if (!media.tmdb_id || media.tmdb_id <= 0) return;
  const key = _makeKey(media);
  _cache.set(key, url || null);
  if (url) _debouncedSave();
  _notify();
}

export function requestLogo(media: Media): void {
  _loadFromStorage();
  if (!media.tmdb_id || media.tmdb_id <= 0) return;
  const key = _makeKey(media);

  if (_cache.has(key)) return;

  // Sempre busca a logo localizada (pt→en→null→ja). Não confia na logo_url
  // armazenada, que pode estar em idioma errado.
  _cache.set(key, undefined as any);
  const type = media.type === 'series' ? 'series' : 'movie';
  _queue.push({ key, tmdbId: media.tmdb_id, type });
  _scheduleDrain();
}

export function requestLogosForBatch(items: Media[]): void {
  for (const item of items) requestLogo(item);
}

export function subscribeLogos(fn: () => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

/** React hook: subscribe to logo cache changes and return logo url */
export function useLogo(media: Media): string | null {
  /* intentionally not importing React here — see hooks/useLogoUrl.ts */
  return getLogoFromCache(media);
}
