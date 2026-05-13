/**
 * tvScroll — Scroll otimizado para TV Box.
 * Considera a "safe area" (overscan) que TVs cortam nas bordas.
 */

// Margem segura para overscan de TVs (em pixels)
const TV_SAFE_MARGIN = 48;

/** Retorna 'smooth' ou 'auto' com base em prefers-reduced-motion */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function getScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const styles = window.getComputedStyle(parent);
    const overflowY = styles.overflowY || '';
    const overflow = styles.overflow || '';
    const canScrollY =
      /(auto|scroll|overlay)/i.test(overflowY) || /(auto|scroll|overlay)/i.test(overflow);
    if (canScrollY && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Faz scroll suave até o elemento focado,
 * garantindo que ele fique dentro da safe area da TV.
 */
export function scrollToFocusedElement(element: HTMLElement): void {
  // Primeiro: scroll padrão para ficar visível
  element.scrollIntoView({
    behavior: scrollBehavior(),
    block: 'nearest',
    inline: 'nearest',
  });

  // Depois: compensar overscan
  requestAnimationFrame(() => {
    const scrollContainer = getScrollableAncestor(element);
    const rect = element.getBoundingClientRect();
    const containerRect = scrollContainer?.getBoundingClientRect();
    const viewportTop = containerRect ? containerRect.top : 0;
    const viewportBottom = containerRect ? containerRect.bottom : window.innerHeight;

    // Se o elemento está muito perto do topo (dentro da zona de overscan)
    if (rect.top < viewportTop + TV_SAFE_MARGIN) {
      const deltaTop = rect.top - (viewportTop + TV_SAFE_MARGIN);
      if (scrollContainer) {
        scrollContainer.scrollBy({ top: deltaTop, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: deltaTop, behavior: 'smooth' });
      }
    }

    // Se o elemento está muito perto do fundo
    if (rect.bottom > viewportBottom - TV_SAFE_MARGIN) {
      const deltaBottom = rect.bottom - (viewportBottom - TV_SAFE_MARGIN);
      if (scrollContainer) {
        scrollContainer.scrollBy({ top: deltaBottom, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: deltaBottom, behavior: 'smooth' });
      }
    }
  });
}

/**
 * Centraliza a seção da row (data-nav-row) no centro da viewport.
 * Garante que o bloco completo (título + posters) fique
 * visualmente centralizado — experiência estilo Netflix.
 *
 * Não rola se estiver dentro de um modal/overlay fixo (ex: página de detalhes,
 * player), pois nesses casos só o container interno é rolável e o scroll
 * global causaria deslocamento indesejado.
 */
export function scrollRowSectionToCenter(element: HTMLElement): void {
  const rowSection = element.closest('[data-nav-row]') as HTMLElement;
  const target = rowSection || element;

  // Dentro de containers fixed (modais, overlays como detalhes/player):
  // usa 'nearest' para rolar apenas o suficiente para tornar o elemento visível,
  // sem tentar centralizar (que causaria scroll excessivo para baixo).
  if (element.closest('.fixed, [style*="position: fixed"]')) {
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    return;
  }

  // Na Home: centraliza a row na viewport (experiência estilo Netflix)
  target.scrollIntoView({
    behavior: scrollBehavior(),
    block: 'center',
  });
}

/**
 * Scroll horizontal otimizado dentro de um container de row.
 * Centraliza o elemento focado no container.
 */
export function scrollRowToElement(scrollContainer: HTMLElement, element: HTMLElement): void {
  const containerRect = scrollContainer.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  const offset = element.offsetLeft - containerRect.width / 2 + elRect.width / 2;
  scrollContainer.scrollTo({
    left: Math.max(0, offset),
    behavior: scrollBehavior(),
  });
}
