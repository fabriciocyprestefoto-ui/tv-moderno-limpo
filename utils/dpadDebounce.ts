/**
 * Debounce para navegação D-Pad em TV Box.
 * Controles baratos enviam eventos repetidos muito rápido.
 * Este utilitário filtra pressionamentos duplicados.
 */

// Debounces independentes por eixo — um press horizontal não bloqueia o próximo vertical
let lastHNavTime = 0;
let lastVNavTime = 0;
const NAV_DEBOUNCE_MS = 90; // horizontal: fluido, permite navegação rápida em listas
const NAV_VERTICAL_DEBOUNCE_MS = 160; // vertical: um pouco mais longo, evita pular linhas

/**
 * Retorna true se o evento de navegação horizontal deve ser processado.
 */
export function shouldProcessNavEvent(): boolean {
  const now = Date.now();
  if (now - lastHNavTime < NAV_DEBOUNCE_MS) return false;
  lastHNavTime = now;
  return true;
}

/** Debounce independente para seta cima/baixo — não bloqueia horizontal */
export function shouldProcessVerticalNavEvent(): boolean {
  const now = Date.now();
  if (now - lastVNavTime < NAV_VERTICAL_DEBOUNCE_MS) return false;
  lastVNavTime = now;
  return true;
}

/**
 * Reseta o timer de debounce (útil ao mudar de página)
 */
export function resetNavDebounce(): void {
  lastHNavTime = 0;
  lastVNavTime = 0;
}
