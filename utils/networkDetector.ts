/**
 * networkDetector.ts
 * Detecta qualidade de rede em dois passos:
 *  1. Sync: Network Information API (Chrome 61+ / Android WebView 61+)
 *  2. Async: timing probe com HEAD request em asset local existente
 *
 * Resultado cacheado por 5 minutos no sessionStorage para evitar probes repetidos.
 */

export type NetworkQuality = 'fast' | 'slow' | 'unknown';

const CACHE_KEY = 'redx-net-quality';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface NetworkInfoAPI {
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  downlink?: number; // Mbps
  rtt?: number;      // ms
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

function getConnectionAPI(): NetworkInfoAPI | null {
  if (typeof navigator === 'undefined') return null;
  return (
    (navigator as any).connection ??
    (navigator as any).mozConnection ??
    (navigator as any).webkitConnection ??
    null
  );
}

/**
 * Verificação síncrona via Network Information API.
 * Retorna 'unknown' se a API não estiver disponível.
 */
export function getNetworkQualitySync(): NetworkQuality {
  const conn = getConnectionAPI();
  if (!conn) return 'unknown';

  const { effectiveType: et, downlink: dl, rtt } = conn;

  if (et === 'slow-2g' || et === '2g') return 'slow';
  if (et === '4g') return dl === undefined || dl >= 1.5 ? 'fast' : 'slow';
  if (et === '3g') {
    if (dl !== undefined) return dl >= 1 ? 'fast' : 'slow';
    return 'slow'; // 3g sem dados → considerar lento
  }

  if (rtt !== undefined && rtt > 1000) return 'slow';
  if (rtt !== undefined && rtt < 150) return 'fast';
  if (dl !== undefined && dl < 0.3) return 'slow';
  if (dl !== undefined && dl >= 2) return 'fast';

  return 'unknown';
}

/**
 * Verifica se mudança na conexão indica degradação em tempo real.
 * Chama `callback` sempre que effectiveType mudar para lento.
 */
export function watchNetworkQuality(callback: (q: NetworkQuality) => void): () => void {
  const conn = getConnectionAPI();
  if (!conn || typeof conn.addEventListener !== 'function') return () => {};

  const handler = () => {
    const q = getNetworkQualitySync();
    callback(q);
  };

  conn.addEventListener('change', handler);
  return () => conn.removeEventListener?.('change', handler);
}

/**
 * Probe assíncrono: mede tempo de um HEAD request num asset local.
 * Resultado cacheado em sessionStorage.
 * - Se fetch não disponível (WebView antigo): retorna 'slow' direto.
 * - Se já tiver cache válido: retorna cacheado sem nova requisição.
 */
export async function probeNetworkQuality(): Promise<NetworkQuality> {
  // WebView sem fetch = dispositivo muito antigo = tratar como lento
  if (typeof fetch === 'undefined') return 'slow';

  // Tenta cache
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const { q, t } = JSON.parse(raw) as { q: NetworkQuality; t: number };
      if (Date.now() - t < CACHE_TTL_MS) return q;
    }
  } catch { /* sessionStorage indisponível */ }

  // Sync primeiro (evita round-trip desnecessário)
  const sync = getNetworkQualitySync();
  if (sync !== 'unknown') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ q: sync, t: Date.now() }));
    } catch { /* ignore */ }
    return sync;
  }

  // Timing probe: HEAD no logored.webp (~8KB) — asset que já existe no public/
  // Timeout manual via AbortController (Chrome 66+ / WebView 66+, coexiste com fetch)
  let abortController: AbortController | undefined;
  let timeoutId: number | undefined;
  try {
    const t0 = performance.now();

    if (typeof AbortController !== 'undefined') {
      abortController = new AbortController();
      timeoutId = window.setTimeout(() => abortController!.abort(), 4500);
    }

    const resp = await fetch('/logored.webp', {
      method: 'HEAD',
      cache: 'no-store',
      ...(abortController ? { signal: abortController.signal } : {}),
    });

    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    const ms = performance.now() - t0;

    if (!resp.ok) throw new Error('probe-failed');

    // > 2500ms para TTFB de um ativo local = conexão lenta
    const q: NetworkQuality = ms > 2500 ? 'slow' : ms < 600 ? 'fast' : 'unknown';

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ q, t: Date.now() }));
    } catch { /* ignore */ }

    return q;
  } catch {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    return 'unknown'; // offline, timeout ou erro → não força lite mode
  }
}

/** Invalida o cache de qualidade de rede (usado em testes / reconexão). */
export function clearNetworkQualityCache(): void {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
