import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Retorna uma versão debounced do valor.
 * O valor atualizado só é emitido após `delay`ms sem mudanças.
 *
 * @example
 * const debouncedSearch = useDebounce(searchTerm, 400);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Retorna uma versão debounced de uma função callback.
 * Útil para handlers de eventos (input, scroll, resize).
 *
 * @example
 * const handleSearch = useDebouncedCallback((q) => search(q), 400);
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const timerRef = useRef<number | null>(null);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay]
  );

  // Limpa timer no unmount
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  return debounced;
}
