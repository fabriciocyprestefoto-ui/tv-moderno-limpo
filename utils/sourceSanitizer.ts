import { isActiveSourceUrl, isInactiveSourceUrl } from './sourceUrlPolicy';

const SOURCE_PURGE_MARKER = 'redx-dead-source-purge-v1';

// Aceita qualquer objeto (Channel, AdultStream, linhas cruas do Supabase) sem exigir
// index signature no tipo do chamador. O acesso por chave é feito via cast controlado
// para Record<string, unknown> dentro das funções (campos podem ou não existir).

const LOGO_FIELDS = ['logo', 'logo_url', 'logoUrl', 'tvg_logo', 'tvg-logo', 'thumbnail'] as const;
const STREAM_FIELDS = ['stream_url', 'streamUrl', 'url'] as const;
const loggedValidSourceContexts = new Set<string>();

/**
 * @deprecated nome legado. Fonte inativa (ex.: newoneblue) — ignorada, não banida.
 * Mantido como alias de {@link isInactiveSourceUrl} para compatibilidade de imports.
 */
export function isOldDeadSourceUrl(value: unknown): boolean {
  return isInactiveSourceUrl(value);
}

/**
 * @deprecated nome legado. Use {@link isActiveSourceUrl}. URL pertence a uma fonte
 * inicial ATIVA (hoje fontez.cc:80). A URL final por IP/CDN é permitida à parte.
 */
export function isFontezContentUrl(value: unknown): boolean {
  return isActiveSourceUrl(value);
}

export function removeOldDeadSources<T extends object>(channel: T): T | null {
  const next = { ...channel } as T;
  const nextRec = next as Record<string, unknown>;

  for (const key of LOGO_FIELDS) {
    const value = nextRec[key];
    if (typeof value === 'string' && isOldDeadSourceUrl(value)) {
      nextRec[key] = '';
    }
  }

  const streamValue = STREAM_FIELDS
    .map((key) => nextRec[key])
    .find((value) => typeof value === 'string' && value.trim());

  if (!streamValue || isOldDeadSourceUrl(streamValue)) {
    return null;
  }

  return next;
}

export function sanitizeFontezChannels<T extends object>(
  channels: T[],
  context = 'channels'
): T[] {
  let removedOldLogos = 0;
  let removedInvalidStreams = 0;

  const sanitized = channels.flatMap((channel) => {
    const channelRec = channel as Record<string, unknown>;
    const hadOldLogo = LOGO_FIELDS.some((key) => isOldDeadSourceUrl(channelRec[key]));
    const next = removeOldDeadSources(channel);

    if (!next) {
      removedInvalidStreams += 1;
      return [];
    }

    if (hadOldLogo) removedOldLogos += 1;
    return [next];
  });

  if (!loggedValidSourceContexts.has(context)) {
    loggedValidSourceContexts.add(context);
    console.info(`[Channels] fonte ativa: fontez.cc:80 (${context})`);
  }

  if (removedOldLogos > 0) {
    console.warn(`[Channels] logo de fonte inativa ignorada: ${removedOldLogos} (${context})`);
  }

  if (removedInvalidStreams > 0) {
    console.warn(`[Channels] stream de fonte inativa ignorado: ${removedInvalidStreams} (${context})`);
  }

  return sanitized;
}

function removeMatchingStorageEntries(storage: Storage, label: string): number {
  let removed = 0;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key));

  for (const key of keys) {
    try {
      const value = storage.getItem(key) || '';
      const lowerKey = key.toLowerCase();
      const isCatalogCache =
        lowerKey.includes('channel') ||
        lowerKey.includes('catalog') ||
        lowerKey.includes('livetv') ||
        lowerKey.includes('live-tv') ||
        lowerKey.includes('logo-cache');

      if (isOldDeadSourceUrl(value) || isCatalogCache) {
        storage.removeItem(key);
        removed += 1;
      }
    } catch {
      // ignore storage read/remove errors
    }
  }

  if (removed > 0) {
    console.info(`[Cache] catálogo antigo limpo (${label}: ${removed})`);
  }
  return removed;
}

function deleteIndexedDb(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(false);
      return;
    }

    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function purgeDeadSourceCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    removeMatchingStorageEntries(window.localStorage, 'localStorage');
  } catch {
    // ignore
  }

  try {
    removeMatchingStorageEntries(window.sessionStorage, 'sessionStorage');
  } catch {
    // ignore
  }

  const fullPurgeDone = (() => {
    try {
      return window.localStorage.getItem(SOURCE_PURGE_MARKER) === '1';
    } catch {
      return false;
    }
  })();

  if (!fullPurgeDone) {
    const idbNames = ['redx-channels-db-v4', 'redx-channels-db', 'redx-data-cache'];
    const idbResults = await Promise.all(idbNames.map((name) => deleteIndexedDb(name)));
    const deletedIdb = idbResults.filter(Boolean).length;
    if (deletedIdb > 0) {
      console.info(`[Cache] catálogo antigo limpo (IndexedDB: ${deletedIdb})`);
    }

    try {
      if ('caches' in window) {
        const names = await caches.keys();
        let deletedCaches = 0;
        await Promise.all(
          names.map(async (name) => {
            if (/redx-(images|api|v)\d+/i.test(name)) {
              const deleted = await caches.delete(name);
              if (deleted) deletedCaches += 1;
            }
          })
        );
        if (deletedCaches > 0) {
          console.info(`[Cache] catálogo antigo limpo (Cache Storage: ${deletedCaches})`);
        }
      }
    } catch {
      // ignore
    }

    try {
      window.localStorage.setItem(SOURCE_PURGE_MARKER, '1');
    } catch {
      // ignore
    }
  }
}
