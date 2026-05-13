/**
 * utils/timeUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilitários de formatação de tempo para o player de mídia.
 * Centralizados aqui para evitar duplicação entre Player.tsx e PlayerProgress.tsx.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Formata segundos para exibição no player: `m:ss` ou `h:mm:ss`.
 * Trata valores inválidos (NaN, Infinity, negativos) retornando `'0:00'`.
 */
export function formatMediaTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
