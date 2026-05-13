/**
 * Mapa síncrono de progresso (%) por tmdb_id — usado pelo MediaCard para a barra
 * sem acoplar UI a hooks. Mantido junto ao fluxo de useContinueWatching.
 */
const MAX_PROGRESS_MAP_SIZE = 500;
const _progressMap = new Map<string, number>();

export function getWatchProgress(tmdbId: string | number): number {
  return _progressMap.get(String(tmdbId)) || 0;
}

export function setProgressMapEntry(tmdbId: string, pct: number): void {
  if (_progressMap.size >= MAX_PROGRESS_MAP_SIZE) {
    const firstKey = _progressMap.keys().next().value;
    if (firstKey !== undefined) _progressMap.delete(firstKey);
  }
  _progressMap.set(tmdbId, pct);
}

export function clearContinueWatchingProgressMap(): void {
  _progressMap.clear();
}
