import { Capacitor, CapacitorHttp } from '@capacitor/core';

const NATIVE_FETCH_MARKER = '__redxNativeHttpFetchInstalled';

declare global {
  interface Window {
    __redxNativeHttpFetchInstalled?: boolean;
  }
}

function safeUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.slice(0, 96);
  }
}

function shouldUseNativeHttp(url: string, method: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;

  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false;

    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
    if (supabaseUrl && parsed.href.startsWith(supabaseUrl.replace(/\/$/, ''))) {
      return true;
    }

    return (
      parsed.hostname === 'api.themoviedb.org' ||
      parsed.hostname.endsWith('.themoviedb.org') ||
      parsed.hostname === 'image.tmdb.org'
    );
  } catch {
    return false;
  }
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }

  return { ...headers };
}

function responseHeadersToHeaders(headers: Record<string, string> | undefined): Headers {
  const out = new Headers();
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) out.set(key, String(value));
  }
  return out;
}

function bodyToResponseBody(data: unknown): BodyInit | null {
  if (data == null) return null;
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return data;
  return JSON.stringify(data);
}

export function installNativeHttpFetchForAndroidTV(): void {
  if (typeof window === 'undefined') return;
  if (window[NATIVE_FETCH_MARKER]) return;
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'android') return;
  if (typeof window.fetch !== 'function') return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    const method = String(init?.method || request?.method || 'GET').toUpperCase();

    if (!shouldUseNativeHttp(url, method)) {
      return originalFetch(input, init);
    }

    const headers = {
      ...headersToRecord(request?.headers),
      ...headersToRecord(init?.headers),
    };
    const startedAt = Date.now();

    try {
      const response = await CapacitorHttp.request({
        method,
        url,
        headers,
        connectTimeout: 15_000,
        readTimeout: 45_000,
      });
      const elapsedMs = Date.now() - startedAt;
      const status = Number(response.status || 0) || 200;

      console.info(
        `[NativeHttpFetch] ${method} ${safeUrlLabel(url)} -> ${status} (${elapsedMs}ms)`
      );

      return new Response(bodyToResponseBody(response.data), {
        status,
        statusText: String(status),
        headers: responseHeadersToHeaders(response.headers as Record<string, string> | undefined),
      });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      console.warn(
        `[NativeHttpFetch] ${method} ${safeUrlLabel(url)} failed (${elapsedMs}ms):`,
        error
      );
      return originalFetch(input, init);
    }
  };

  window[NATIVE_FETCH_MARKER] = true;
  console.info('[NativeHttpFetch] Android native GET/HEAD bridge enabled');
}
