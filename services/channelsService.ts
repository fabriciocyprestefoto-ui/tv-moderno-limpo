import { Channel } from '../types';
import { getAllChannels, getChannelsPage } from './supabaseService';
import { logger } from '../utils/logger';
import { pickFirstRealStreamUrlFromRow } from '../utils/streamUrlGuards';
import { removeOldDeadSources, sanitizeFontezChannels } from '../utils/sourceSanitizer';

const STORAGE_KEY = 'redx-channels-cache-v9';
const IDB_NAME = 'redx-channels-db-v5';
const IDB_STORE = 'channels';
const STORAGE_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas (aumentado para reduzir fetches)
const BG_REFRESH_MIN_INTERVAL_MS = 60 * 1000; // Evita spam de refresh em segundo plano
const PROGRESSIVE_PAGE_SIZE = 250;

let cachedChannels: Channel[] = [];
let idbAvailable: boolean | null = null;
let inFlightLoad: Promise<Channel[]> | null = null;
let inFlightBackgroundRefresh: Promise<void> | null = null;
let lastBackgroundRefreshAt = 0;

function normalizeChannel(c: any): Channel | null {
  const name = c.name || c.nome || '';
  const logo = c.logo || c.logo_url || c.thumbnail || '';
  const category = c.category || c.genero || c.grupo || 'Geral';
  const streamUrl = pickFirstRealStreamUrlFromRow(c as Record<string, unknown>);

  if (!logo && name) {
    logger.warn(`[normalizeChannel] Canal "${name}" sem logo`);
  }

  if (!name && !streamUrl) {
    logger.warn(
      '[normalizeChannel] Canal sem nome e sem URL:',
      JSON.stringify(c).substring(0, 200)
    );
  }

  return removeOldDeadSources({
    id: c.id,
    name,
    logo,
    category,
    stream_url: streamUrl,
    number: c.number || c.numero,
    is_premium: c.is_premium,
  });
}

/** Canais removidos da UI (pedido do produto). */
function isHiddenAbertosChannel(c: Channel): boolean {
  const n = (c.name || '').trim();
  return /^\+NOVELAS\b/i.test(n) || /^\+TVZYN\b/i.test(n);
}

function applyOpenChannelExclusions(channels: Channel[]): Channel[] {
  const next = channels.filter((c) => !isHiddenAbertosChannel(c));
  return next.length === channels.length ? channels : next;
}

function sortChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
}

function normalizeAndSortChannels(rows: any[]): Channel[] {
  const normalized = (rows || [])
    .map((c: any) => normalizeChannel(c))
    .filter((c: Channel | null): c is Channel => Boolean(c))
    .filter((c: Channel) => String(c.id) !== '112')
    .filter((c: Channel) => !isHiddenAbertosChannel(c));
  return sortChannels(sanitizeFontezChannels(normalized, 'channelsService'));
}

function channelsAreEquivalent(a: Channel[], b: Channel[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.logo !== right.logo ||
      left.category !== right.category ||
      left.stream_url !== right.stream_url
    ) {
      return false;
    }
  }
  return true;
}

async function fetchRemoteChannels(): Promise<Channel[]> {
  const data = await getAllChannels();

  if (!data || data.length === 0) {
    logger.error('[ChannelsService] Nenhum canal retornado do Supabase!');
    return [];
  }

  return normalizeAndSortChannels(data);
}

async function fetchRemoteChannelsProgressive(
  onPartial?: (channels: Channel[]) => void
): Promise<Channel[]> {
  const firstPage = await getChannelsPage(1, PROGRESSIVE_PAGE_SIZE);
  if (!firstPage.channels.length) {
    logger.error('[ChannelsService] Nenhum canal retornado na primeira pagina do Supabase!');
    return [];
  }

  const firstBatch = normalizeAndSortChannels(firstPage.channels);
  if (firstBatch.length) {
    logger.log(`[ChannelsService] Primeira pagina liberada com ${firstBatch.length} canais`);
    onPartial?.(firstBatch);
  }

  if (!firstPage.hasMore) {
    return firstBatch;
  }

  const allRows = [...firstPage.channels];
  let page = 2;
  let hasMore = true;

  while (hasMore) {
    const nextPage = await getChannelsPage(page, PROGRESSIVE_PAGE_SIZE);
    if (nextPage.channels.length) {
      allRows.push(...nextPage.channels);
    }
    hasMore = nextPage.hasMore;
    page += 1;
  }

  const fullBatch = normalizeAndSortChannels(allRows);
  logger.log(`[ChannelsService] Carga completa finalizada com ${fullBatch.length} canais`);

  if (!channelsAreEquivalent(fullBatch, firstBatch)) {
    onPartial?.(fullBatch);
  }

  return fullBatch;
}

function maybeRefreshInBackground(onFresh?: (channels: Channel[]) => void): void {
  if (inFlightBackgroundRefresh) return;
  const now = Date.now();
  if (now - lastBackgroundRefreshAt < BG_REFRESH_MIN_INTERVAL_MS) return;

  lastBackgroundRefreshAt = now;
  inFlightBackgroundRefresh = fetchRemoteChannels()
    .then((fresh) => {
      if (!fresh.length) return;
      if (channelsAreEquivalent(fresh, cachedChannels)) return;
      cachedChannels = fresh;
      saveToCache(fresh);
      onFresh?.(fresh);
    })
    .catch((err) => logger.warn('[Channels] Refresh em background falhou:', err))
    .finally(() => {
      inFlightBackgroundRefresh = null;
    });
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Channel[] | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get('data');
      req.onsuccess = () => {
        // MEM-02 fix: fechar conexão IDB após uso
        db.close();
        const result = req.result as { channels: Channel[]; ts: number } | undefined;
        if (!result?.channels?.length || !result?.ts) {
          resolve(null);
          return;
        }
        if (Date.now() - result.ts > STORAGE_TTL_MS) {
          resolve(null);
          return;
        }
        resolve(result.channels);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

async function saveToIDB(channels: Channel[]): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ channels, ts: Date.now() }, 'data');
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch {
    // IndexedDB indisponivel
  }
}

function checkIDBAvailable(): boolean {
  if (idbAvailable !== null) return idbAvailable;
  try {
    idbAvailable = typeof indexedDB !== 'undefined';
  } catch {
    idbAvailable = false;
  }
  return idbAvailable;
}

function loadFromLocalStorage(): Channel[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { channels: Channel[]; ts: number; signature?: string };
    if (!parsed.channels?.length || !parsed.ts) return null;
    if (Date.now() - parsed.ts > STORAGE_TTL_MS) return null;
    return parsed.channels;
  } catch {
    return null;
  }
}

function saveToLocalStorage(channels: Channel[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ channels, ts: Date.now() }));
  } catch {
    if (checkIDBAvailable()) saveToIDB(channels);
  }
}

function saveToCache(channels: Channel[]): void {
  saveToLocalStorage(channels);
  if (checkIDBAvailable()) saveToIDB(channels);
}

export function getCachedChannelsSync(): Channel[] {
  if (cachedChannels.length > 0) {
    const cleaned = applyOpenChannelExclusions(
      sanitizeFontezChannels(cachedChannels, 'channelsService:memory')
    );
    if (cleaned !== cachedChannels) cachedChannels = cleaned;
    return cachedChannels;
  }
  const fromStorage = loadFromLocalStorage();
  if (fromStorage?.length) {
    const cleaned = applyOpenChannelExclusions(
      sanitizeFontezChannels(fromStorage, 'channelsService:localStorage')
    );
    cachedChannels = cleaned;
    return cachedChannels;
  }
  return [];
}

async function loadFromAnyCache(): Promise<Channel[] | null> {
  if (cachedChannels.length > 0) {
    return sanitizeFontezChannels(cachedChannels, 'channelsService:memory');
  }
  const fromLS = loadFromLocalStorage();
  if (fromLS?.length) return sanitizeFontezChannels(fromLS, 'channelsService:localStorage');
  if (checkIDBAvailable()) {
    const fromIDB = await loadFromIDB();
    if (fromIDB?.length) return sanitizeFontezChannels(fromIDB, 'channelsService:indexedDB');
  }
  return null;
}

export const channelsService = {
  loadChannels: async (
    onFresh?: (channels: Channel[], isComplete: boolean) => void
  ): Promise<Channel[]> => {
    if (cachedChannels.length > 0) {
      const cleaned = applyOpenChannelExclusions(
        sanitizeFontezChannels(cachedChannels, 'channelsService:memory')
      );
      if (cleaned !== cachedChannels) {
        cachedChannels = cleaned;
        saveToCache(cleaned);
      }
      onFresh?.(cachedChannels, true);
      maybeRefreshInBackground((fresh) => onFresh?.(fresh, true));
      return cachedChannels;
    }

    const fromCache = await loadFromAnyCache();
    if (fromCache?.length) {
      const cleaned = applyOpenChannelExclusions(
        sanitizeFontezChannels(fromCache, 'channelsService:cache')
      );
      cachedChannels = cleaned;
      if (cleaned !== fromCache) saveToCache(cleaned);
      onFresh?.(cachedChannels, true);
      maybeRefreshInBackground((fresh) => onFresh?.(fresh, true));
      return cachedChannels;
    }

    if (inFlightLoad) {
      const pending = await inFlightLoad;
      onFresh?.(pending, true);
      return pending;
    }

    try {
      inFlightLoad = fetchRemoteChannelsProgressive((partial) => {
        if (!partial.length) return;
        cachedChannels = partial;
        onFresh?.(partial, false);
      });

      const allChannels = await inFlightLoad;
      if (allChannels.length === 0) {
        logger.error('[ChannelsService] CRITICO: carga progressiva retornou array vazio!');
        // Não sobrescreve cachedChannels com [] nem notifica UI — preserva dados stale.
        // Retorna cachedChannels (pode ter dados de partial ou cache anterior).
        return cachedChannels;
      } else {
        cachedChannels = allChannels;
        saveToCache(allChannels);
        onFresh?.(allChannels, true);
      }
      return allChannels;
    } catch {
      onFresh?.(cachedChannels, true);
      return cachedChannels;
    } finally {
      inFlightLoad = null;
    }
  },

  getCategories: async (): Promise<string[]> => {
    const channels = await channelsService.loadChannels();
    return Array.from(new Set(channels.map((c) => c.category))).sort();
  },

  getChannelsByCategory: async (category: string): Promise<Channel[]> => {
    const channels = await channelsService.loadChannels();
    return channels.filter((c) => c.category === category);
  },

  searchChannels: async (query: string): Promise<Channel[]> => {
    const channels = await channelsService.loadChannels();
    const lowerQuery = query.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(lowerQuery));
  },

  forceRefresh: async (
    onFresh?: (channels: Channel[], isComplete: boolean) => void
  ): Promise<Channel[]> => {
    try {
      logger.log('[ChannelsService] Forcando refresh de canais...');
      const allChannels = await fetchRemoteChannels();
      if (allChannels.length > 0) {
        cachedChannels = allChannels;
        saveToCache(allChannels);
        onFresh?.(allChannels, true);
      }
      return allChannels;
    } catch (error) {
      logger.error('[ChannelsService] Erro no forceRefresh:', error);
      return cachedChannels;
    }
  },
};
