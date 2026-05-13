/**
 * Fila de preload de imagens com concorrência limitada.
 * Evita sobrecarga de memória e rede em listas com muitos posters.
 */

import { isTVBox } from './tvBoxDetector';

const MAX_CONCURRENT_DESKTOP = 6;
const MAX_CONCURRENT_TV_BOX = 3;
const LOAD_TIMEOUT_MS = 10000;

function maxConcurrent(): number {
  if (typeof document === 'undefined') return MAX_CONCURRENT_DESKTOP;
  return isTVBox() ? MAX_CONCURRENT_TV_BOX : MAX_CONCURRENT_DESKTOP;
}

interface ActiveLoad {
  url: string;
  abort: () => void;
}

interface QueueItem {
  url: string;
  resolve: (success: boolean) => void;
  abort: () => void;
}

const active = new Map<string, ActiveLoad>();
const waiting: QueueItem[] = [];
const completed = new Set<string>();

function processNext(): void {
  if (active.size >= maxConcurrent() || waiting.length === 0) return;
  const item = waiting.shift()!;
  startLoad(item.url, item.resolve);
}

function startLoad(url: string, resolve: (success: boolean) => void): void {
  const img = new Image();
  let settled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    img.onload = null;
    img.onerror = null;
    active.delete(url);
    processNext();
  };

  const settle = (success: boolean) => {
    if (settled) return;
    settled = true;
    if (success) completed.add(url);
    cleanup();
    resolve(success);
  };

  timeoutId = setTimeout(() => settle(false), LOAD_TIMEOUT_MS);
  img.onload = () => settle(true);
  img.onerror = () => settle(false);

  active.set(url, {
    url,
    abort: () => settle(false),
  });

  img.src = url;
}

/**
 * Precarrega uma imagem. Retorna Promise<boolean>.
 * true = carregou; false = erro ou timeout.
 * Máximo simultâneo: 6 (desktop) ou 3 em modo TV (`tv-box` / `tv-box-mode`).
 */
export function preloadImage(url: string): Promise<boolean> {
  if (completed.has(url)) return Promise.resolve(true);
  if (active.has(url)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const item: QueueItem = {
      url,
      resolve,
      abort: () => {},
    };
    if (active.size < maxConcurrent()) {
      startLoad(item.url, item.resolve);
    } else {
      waiting.push(item);
    }
  });
}

/**
 * Remove URL da fila e aborta se ainda estiver carregando.
 * Chamar ao desmontar o componente.
 */
export function abortPreload(url: string): void {
  const activeItem = active.get(url);
  if (activeItem?.abort) activeItem.abort();
  const idx = waiting.findIndex((w) => w.url === url);
  if (idx >= 0) {
    waiting[idx].resolve(false);
    waiting.splice(idx, 1);
  }
}
