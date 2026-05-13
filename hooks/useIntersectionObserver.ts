import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  /** Se true, desconecta o observer assim que o elemento entrar na viewport (one-shot). Default: false */
  once?: boolean;
  /** Se false, não criar o observer (útil para condicional). Default: true */
  enabled?: boolean;
}

/**
 * Hook genérico de IntersectionObserver.
 *
 * Retorna `[ref, isIntersecting]`:
 * - `ref` — attach no elemento que deseja observar
 * - `isIntersecting` — true quando o elemento está visível conforme as opções
 *
 * @example
 * const [ref, isVisible] = useIntersectionObserver({ rootMargin: '200px', once: true });
 * return <div ref={ref}>{isVisible ? <ExpensiveComponent /> : null}</div>;
 */
export function useIntersectionObserver<T extends Element = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
): [React.RefCallback<T>, boolean] {
  const { once = false, enabled = true, ...ioOptions } = options;
  const [isIntersecting, setIsIntersecting] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<T | null>(null);

  const disconnect = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const ref: React.RefCallback<T> = useCallback(
    (element: T | null) => {
      disconnect();
      elementRef.current = element;

      if (!element || !enabled) return;

      observerRef.current = new IntersectionObserver(([entry]) => {
        const intersecting = entry.isIntersecting;
        setIsIntersecting(intersecting);
        if (intersecting && once) disconnect();
      }, ioOptions);

      observerRef.current.observe(element);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, once, ioOptions.root, ioOptions.rootMargin, ioOptions.threshold, disconnect]
  );

  // Limpa no unmount
  useEffect(() => () => disconnect(), [disconnect]);

  return [ref, isIntersecting];
}
