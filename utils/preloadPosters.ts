import { getPosterUrl } from './mediaUtils';
import { preloadImage } from './imagePreloadQueue';
import type { Media } from '../types';

const MAX_PRELOAD = 24;
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 150;

/**
 * Precarrega URLs de posters com concorrência limitada.
 * URLs prioritárias são processadas primeiro.
 * Dispara em lotes de BATCH_SIZE para não saturar a rede.
 */
export function preloadPosterUrls(urls: string[], priorityUrls?: string[]): void {
  const filtered = urls.filter((u) => u && !u.startsWith('data:'));

  // Inclui priority URLs no conjunto total (ex.: hero backdrop)
  const allUrls = priorityUrls
    ? [...new Set([...priorityUrls.filter((u) => u && !u.startsWith('data:')), ...filtered])]
    : [...new Set(filtered)];

  const deduped = allUrls.slice(0, MAX_PRELOAD);

  const priority = priorityUrls ? deduped.filter((u) => priorityUrls.includes(u)) : [];
  const rest = priorityUrls ? deduped.filter((u) => !priorityUrls.includes(u)) : deduped;

  const ordered = [...priority, ...rest];

  // Dispara em lotes para não saturar a rede de TV boxes
  for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
    const batch = ordered.slice(i, i + BATCH_SIZE);
    if (i === 0) {
      // Primeiro lote (prioridade) — imediato
      batch.forEach((url) => {
        preloadImage(url).catch(() => {});
      });
    } else {
      // Lotes seguintes — com delay escalonado
      const delay = (i / BATCH_SIZE) * BATCH_DELAY_MS;
      setTimeout(() => {
        batch.forEach((url) => {
          preloadImage(url).catch(() => {});
        });
      }, delay);
    }
  }
}

/**
 * Precarrega posters a partir de lista de media.
 * Aceita URLs prioritárias (ex.: hero backdrop, primeira linha).
 */
export function preloadPostersFromMedia(mediaList: Media[], priorityUrls?: string[]): void {
  const urls = mediaList.map((m) => getPosterUrl(m)).filter(Boolean);
  preloadPosterUrls([...new Set(urls)], priorityUrls);
}
