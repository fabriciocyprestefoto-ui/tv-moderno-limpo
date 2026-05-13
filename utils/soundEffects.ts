/* ============================================================
   SOUND EFFECTS SYSTEM FOR TV BOX / SMART TV
   Generates UI sounds using Web Audio API (no external files)
   - navigate: subtle tick when moving between items
   - select:   confirmation tone when pressing Enter
   - back:     soft descending tone on Escape/Back
   - error:    short buzz for invalid actions
   ============================================================ */

/** Subtle tick when navigating between items (D-Pad) */
export function playNavigateSound(): void {
  // Silent per user request
}

/** Confirmation tone when selecting/pressing Enter */
export function playSelectSound(): void {
  // Silent per user request
}

/** Soft descending tone on Back/Escape */
export function playBackSound(): void {
  // Silent per user request
}

/** Short buzz for invalid/error actions */
export function playErrorSound(): void {
  // Silent per user request
}

/**
 * Initialize audio context on first user interaction.
 * Call this once on the first click/keydown to unlock audio on mobile/TV.
 */
export function initAudio(): void {
  // Sons da UI estao desativados no projeto atual.
  // Nao criamos/resumimos AudioContext para evitar warnings de autoplay no WebView/Chrome TV.
}
