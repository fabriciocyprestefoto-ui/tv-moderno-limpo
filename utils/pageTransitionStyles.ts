/**
 * Injeta os estilos de transição de página (util DOM puro, sem React).
 *
 * Vive em utils/ — e não em components/ — para que hooks (ex.: useRemoteNavigation)
 * possam importá-lo sem criar uma aresta hooks→components, que forçava o Rollup a
 * fundir os chunks `app-hooks` e `app-ui` num único `app-ui-hooks` (ciclo de chunk).
 */
export const addPageTransitionStyles = (): void => {
  if (typeof document === 'undefined') return;

  const styleId = 'page-transition-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .page-transition-wrapper {
      width: 100%;
      height: 100%;
    }

    .page-exit {
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 0.15s ease-out, transform 0.15s ease-out;
    }

    .page-enter {
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.15s ease-in, transform 0.15s ease-in;
    }
  `;

  document.head.appendChild(style);
};
