/**
 * epgIdbStorage — Persistência de EPG em IndexedDB
 * Evita refetch completo em cada visita (TTL 4h)
 */

import type { EPGChannel, EPGProgramme } from '@/services/epgService';
import { logger } from './logger';

const IDB_NAME = 'redx-epg-db';
const IDB_STORE = 'epg';
/** Bump when a fonte XMLTV muda para não reutilizar cache antigo */
const STORE_KEY = 'cache-claro-xml-v1';
const TTL_MS = 4 * 60 * 60 * 1000; // 4 horas

type SerializedProgramme = Omit<EPGProgramme, 'start' | 'stop'> & { start: number; stop: number };
type SerializedChannel = Omit<EPGChannel, 'programmes'> & { programmes: SerializedProgramme[] };
type SerializedCache = { channels: [string, SerializedChannel][]; timestamp: number };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function toSerialized(cache: Map<string, EPGChannel>): SerializedCache {
  const channels: [string, SerializedChannel][] = [];
  cache.forEach((ch, id) => {
    channels.push([
      id,
      {
        ...ch,
        programmes: ch.programmes.map((p) => ({
          ...p,
          start: p.start.getTime(),
          stop: p.stop.getTime(),
        })),
      },
    ]);
  });
  return { channels, timestamp: Date.now() };
}

function fromSerialized(data: SerializedCache): Map<string, EPGChannel> {
  const map = new Map<string, EPGChannel>();
  data.channels.forEach(([id, ch]) => {
    map.set(id, {
      ...ch,
      programmes: ch.programmes.map((p) => ({
        ...p,
        start: new Date(p.start),
        stop: new Date(p.stop),
      })),
    });
  });
  return map;
}

export async function loadEpgFromIdb(): Promise<Map<string, EPGChannel> | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(STORE_KEY);
      req.onsuccess = () => {
        const result = req.result as SerializedCache | undefined;
        if (!result?.channels?.length || !result.timestamp) {
          resolve(null);
          return;
        }
        if (Date.now() - result.timestamp > TTL_MS) {
          resolve(null);
          return;
        }
        resolve(fromSerialized(result));
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveEpgToIdb(cache: Map<string, EPGChannel>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(toSerialized(cache), STORE_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (import.meta.env.DEV) {
      logger.log('[EPG] Cache salvo em IndexedDB');
    }
  } catch {
    // Ignore storage errors
  }
}
