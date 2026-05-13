/**
 * spatialNavFallback.ts
 *
 * Algoritmo de navegação espacial leve — usado como fallback no App.tsx
 * quando o sistema completo de useSpatialNavigation não está ativo
 * (ex.: rotas que não montam o SpatialNavProvider).
 *
 * Separado do App.tsx para:
 *  1. Reutilização sem importar o componente React raiz
 *  2. Testabilidade unitária independente
 *  3. Manter o App.tsx focado em roteamento/providers
 */

export type RemoteDir = 'up' | 'down' | 'left' | 'right';

const FALLBACK_SELECTOR =
  '[data-nav-item], [data-nav-livetv-category], [data-player-control], [tabindex="0"]';

/** Verifica se um elemento do DOM pode receber foco de navegação remota. */
export function isElementFocusable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.tabIndex < 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Encontra o melhor candidato de foco na direção indicada a partir do
 * elemento atual. Usa algoritmo de pontuação geométrica:
 *   score = distância_primária + distância_lateral × 2.4
 *
 * O fator 2.4 penaliza desvios laterais — favorece elementos alinhados
 * na mesma linha/coluna que o elemento atual.
 */
export function getDirectionalTarget(
  current: HTMLElement,
  direction: RemoteDir
): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll(FALLBACK_SELECTOR))
    .filter(isElementFocusable)
    .filter((el) => el !== current);

  if (candidates.length === 0) return null;

  const currentRect = current.getBoundingClientRect();
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;

    let primary = 0;
    let lateral = 0;
    let valid = false;

    switch (direction) {
      case 'up':
        valid = dy < -2;
        primary = Math.abs(dy);
        lateral = Math.abs(dx);
        break;
      case 'down':
        valid = dy > 2;
        primary = Math.abs(dy);
        lateral = Math.abs(dx);
        break;
      case 'left':
        valid = dx < -2;
        primary = Math.abs(dx);
        lateral = Math.abs(dy);
        break;
      case 'right':
        valid = dx > 2;
        primary = Math.abs(dx);
        lateral = Math.abs(dy);
        break;
    }

    if (!valid) continue;

    const score = primary + lateral * 2.4;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}
