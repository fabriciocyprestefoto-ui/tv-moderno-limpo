/**
 * channelsIdbCache — Persistência da lista de canais em IndexedDB
 * Evita refetch completo a cada visita. TTL 6h. Mesmo padrão do epgIdbStorage.
 */

import type { Channel } from '@/types';

const IDB_NAME = 'redx-channels-db';
const IDB_STORE = 'channels';
// Bump quando lógica de fetch/adapter mudar para invalidar cache antigo.
const STORE_KEY = 'channels-v2';
const TTL_MS = 6 * 60 * 60 * 1000;

type CachePayload = { channels: Channel[]; timestamp: number };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB indisponível'));
      return;
    }
    let settled = false;
    // Timeout: alguns WebViews antigos (Firestick Android 5 stock) deixam
    // indexedDB.open pendurado quando store está corrompido. 2s evita travar UI.
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('indexedDB.open timeout'));
      }
    }, 2000);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(IDB_NAME, 1);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      try {
        req.result.createObjectStore(IDB_STORE);
      } catch {
        // store já existe
      }
    };
    req.onsuccess = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(req.error);
    };
    req.onblocked = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('indexedDB.open blocked'));
    };
  });
}

export async function loadChannelsFromIdb(): Promise<Channel[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(STORE_KEY);
      req.onsuccess = () => {
        const result = req.result as CachePayload | undefined;
        if (!result?.channels?.length || !result.timestamp) {
          resolve(null);
          return;
        }
        if (Date.now() - result.timestamp > TTL_MS) {
          resolve(null);
          return;
        }
        resolve(result.channels);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveChannelsToIdb(channels: Channel[]): Promise<void> {
  if (!channels.length) return;
  try {
    const db = await openDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ channels, timestamp: Date.now() }, STORE_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
