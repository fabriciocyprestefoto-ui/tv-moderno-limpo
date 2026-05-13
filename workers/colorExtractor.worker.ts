/**
 * colorExtractor.worker.ts — Web Worker for dominant color extraction.
 * Uses OffscreenCanvas (Chromium/Android TV supported) to avoid blocking the main thread.
 * Receives: { id: string; url: string }
 * Sends:    { id: string; color: string | null }
 */

function hexChannel(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, '0');
}

self.onmessage = async (e: MessageEvent<{ id: string; url: string }>) => {
  const { id, url } = e.data;

  try {
    // Fetch with CORS — TMDB CDN (image.tmdb.org) supports Access-Control-Allow-Origin: *
    const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    // Resize to 64×64 during decode — native pipeline, much faster than canvas drawImage
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: 64,
      resizeHeight: 64,
      resizeQuality: 'low',
    });

    const canvas = new OffscreenCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const { data } = ctx.getImageData(0, 0, 64, 64);

    // Simple bucket quantization (same as main-thread version)
    const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
    for (let i = 0; i < data.length; i += 16) {
      // sample every 4th pixel
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
      (self as any).postMessage({ id, color: null });
      return;
    }

    const dom = entries.reduce((a, b) => (a.count > b.count ? a : b));
    const c = dom.count;
    const hex = '#' + hexChannel(dom.r / c) + hexChannel(dom.g / c) + hexChannel(dom.b / c);
    (self as any).postMessage({ id, color: hex });
  } catch {
    (self as any).postMessage({ id, color: null });
  }
};
