import { logger } from './logger';

const RECOVERY_KEY = 'redx-chunk-recovery-v1';
const RECOVERY_TTL_MS = 10 * 60 * 1000;

function now(): number {
  return Date.now();
}

function getRecoveryTs(): number | null {
  try {
    const raw = window.sessionStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number };
    return typeof parsed.ts === 'number' ? parsed.ts : null;
  } catch {
    return null;
  }
}

export function resetChunkRecoveryFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // noop
  }
}

export function markChunkRecoveryAttempt(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ ts: now() }));
  } catch {
    // noop
  }
}

export function canAttemptChunkRecovery(): boolean {
  if (typeof window === 'undefined') return false;
  const ts = getRecoveryTs();
  if (!ts) return true;
  return now() - ts > RECOVERY_TTL_MS;
}

export function isLikelyChunkError(error?: unknown): boolean {
  const msg = String((error as { message?: string } | undefined)?.message || error || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('chunk') ||
    msg.includes('dynamically imported') ||
    msg.includes('loading css chunk') ||
    msg.includes('loading module') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed')
  );
}

export async function hardRefreshAfterChunkError(reason: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const at = now();

  // Telemetria local para diagnóstico de regressões de chunk mismatch.
  try {
    window.dispatchEvent(
      new CustomEvent('redx:chunk-recovery', {
        detail: {
          reason,
          at,
          href: window.location.href,
        },
      })
    );
  } catch {
    // noop
  }

  try {
    markChunkRecoveryAttempt();

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch (error) {
    logger.warn('[chunkRecovery] falha ao limpar cache/SW', reason, error);
  }

  logger.warn('[chunkRecovery] forçando hard refresh por erro de chunk', reason);

  const url = new URL(window.location.href);
  url.searchParams.set('chunk_recover', String(at));
  window.location.replace(url.toString());
}
