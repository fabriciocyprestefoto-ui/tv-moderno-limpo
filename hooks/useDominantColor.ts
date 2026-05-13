/**
 * useDominantColor — Extrai a cor dominante de uma imagem para usar no background.
 * Usa Web Worker (OffscreenCanvas) para não bloquear a thread principal.
 * Fallback para canvas main-thread se o worker não for suportado.
 */

import { useState, useEffect, useRef } from 'react';

const DEFAULT_COLOR = '#6D28D9'; // Roxo padrão REDx

/* ── Singleton Worker — reutilizado em todos os hooks ── */
let _worker: Worker | null = null;
let _workerSupported: boolean | null = null;

function getWorker(): Worker | null {
  if (_workerSupported === false) return null;
  if (_worker) return _worker;
  try {
    _worker = new Worker(new URL('../workers/colorExtractor.worker.ts', import.meta.url), {
      type: 'module',
    });
    _workerSupported = true;
    return _worker;
  } catch {
    _workerSupported = false;
    return null;
  }
}

/* ── Pending callbacks — id → resolve ── */
const _pending = new Map<string, (color: string | null) => void>();
let _workerListenerAttached = false;

function ensureWorkerListener() {
  if (_workerListenerAttached) return;
  _workerListenerAttached = true;
  const w = getWorker();
  if (!w) return;
  w.onmessage = (e: MessageEvent<{ id: string; color: string | null }>) => {
    const { id, color } = e.data;
    const resolve = _pending.get(id);
    if (resolve) {
      _pending.delete(id);
      resolve(color);
    }
  };
}

function extractViaWorker(url: string, id: string): Promise<string | null> {
  return new Promise((resolve) => {
    const w = getWorker();
    if (!w) {
      resolve(null);
      return;
    }
    ensureWorkerListener();
    _pending.set(id, resolve);
    w.postMessage({ id, url });
  });
}

/* ── Main-thread fallback (canvas) ── */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const h = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return h.length === 1 ? '0' + h : h;
      })
      .join('')
  );
}

function extractViaCanvas(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (
      imageUrl.startsWith('/') ||
      (typeof window !== 'undefined' && imageUrl.startsWith(window.location.origin))
    ) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2],
            a = data[i + 3];
          if (a < 128) continue;
          const brightness = (r + g + b) / 3;
          if (brightness < 30 || brightness > 240) continue;
          const key = `${Math.floor(r / 32)}-${Math.floor(g / 32)}-${Math.floor(b / 32)}`;
          if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
          buckets[key].r += r;
          buckets[key].g += g;
          buckets[key].b += b;
          buckets[key].count++;
        }
        const entries = Object.values(buckets);
        if (entries.length === 0) {
          resolve(null);
          return;
        }
        const dom = entries.reduce((a, b) => (a.count > b.count ? a : b));
        resolve(rgbToHex(dom.r / dom.count, dom.g / dom.count, dom.b / dom.count));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

let _idCounter = 0;

export function useDominantColor(imageUrl: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!imageUrl || imageUrl.length < 10 || imageUrl.startsWith('data:')) {
      setColor(null);
      return;
    }

    cancelRef.current = false;
    const id = `dc-${++_idCounter}`;

    const run = async () => {
      // Try worker first, then main-thread canvas fallback
      let result = await extractViaWorker(imageUrl, id);
      if (result === null && !cancelRef.current) {
        result = await extractViaCanvas(imageUrl);
      }
      if (!cancelRef.current) setColor(result);
    };

    void run();

    return () => {
      cancelRef.current = true;
      // Remove pending callback to avoid stale state update
      _pending.delete(id);
    };
  }, [imageUrl]);

  return color;
}

export { DEFAULT_COLOR };
