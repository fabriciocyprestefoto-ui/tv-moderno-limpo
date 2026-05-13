/**
 * fetchUtils.ts — Utilitários de fetch robustos para produção
 *
 * Expõe:
 *   fetchWithTimeout   — fetch com AbortController (padrão 10 s)
 *   fetchWithRetry     — retry exponencial sobre qualquer async fn
 *   fetchDedup         — deduplica requests in-flight para a mesma chave
 */

import { logger } from './logger';

// ─── fetchWithTimeout ────────────────────────────────────────────────────────

/**
 * Executa fetch com timeout automático via AbortController.
 * Se o tempo esgotar, lança `DOMException` com `name === 'AbortError'`.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ─── fetchWithRetry ──────────────────────────────────────────────────────────

export interface RetryOptions {
  retries?: number; // tentativas totais (padrão: 3)
  baseDelayMs?: number; // delay inicial em ms (padrão: 500, dobra a cada tentativa)
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

/**
 * Executa `fn` com retry automático (backoff exponencial).
 * Pode envolver qualquer função assíncrona — não apenas fetch.
 *
 * @example
 *   const data = await fetchWithRetry(() => fetchTmdb(url));
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 500, shouldRetry = defaultShouldRetry } = options;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err, attempt) || attempt === retries) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(`[fetchUtils] Tentativa ${attempt}/${retries} falhou. Retry em ${delay}ms…`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function defaultShouldRetry(err: unknown, _attempt: number): boolean {
  // Não retentar em AbortError (timeout intencional)
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  return true;
}

// ─── fetchDedup ──────────────────────────────────────────────────────────────

const _inFlight = new Map<string, Promise<unknown>>();

/**
 * Garante que apenas uma request seja feita por `key` ao mesmo tempo.
 * Chamadas subsequentes com a mesma chave reutilizam a promise existente.
 *
 * @example
 *   const data = await fetchDedup(`tmdb-details-${id}`, () => fetchTmdb(url));
 */
export function fetchDedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (_inFlight.has(key)) return _inFlight.get(key) as Promise<T>;
  const promise = fn().finally(() => _inFlight.delete(key));
  _inFlight.set(key, promise);
  return promise;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
