/**
 * useGeoState — detecta o estado brasileiro do usuário via IP
 * Usa ipapi.co (gratuito, sem API key, 1000 req/dia).
 * Resultado cacheado em sessionStorage para não chamar a API a cada render.
 */
import { useState, useEffect } from 'react';

const CACHE_KEY = 'redx-geo-state';
const API_URL = 'https://ipapi.co/json/';

/**
 * Retorna o código UF detectado (ex: "SP", "RJ") ou null se indisponível.
 *
 * `enabled=false` (default) → não dispara fetch. Hook só consulta sessionStorage.
 * Página de canais ativa apenas quando usuário abre canal regional, evitando
 * concorrência com fetch do Supabase no carregamento inicial.
 */
export function useGeoState(enabled: boolean = false): string | null {
  const [stateCode, setStateCode] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(CACHE_KEY) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!enabled || stateCode) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(API_URL, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const uf =
          typeof data?.region_code === 'string' && data?.country_code === 'BR'
            ? (data.region_code as string).toUpperCase()
            : null;
        if (uf) {
          try {
            sessionStorage.setItem(CACHE_KEY, uf);
          } catch {
            /* privado */
          }
          setStateCode(uf);
        }
      })
      .catch(() => {
        // Falha silenciosa — sem região padrão
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [enabled, stateCode]);

  return stateCode;
}
