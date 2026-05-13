/**
 * Store global de erros para diagnóstico em Firestick/TV Box (sem console).
 * Captura erros de ErrorBoundary, window.onerror e unhandledrejection.
 */

export interface StoredError {
  message: string;
  stack?: string;
  componentStack?: string;
  source: 'boundary' | 'window' | 'promise';
  timestamp: number;
}

let lastError: StoredError | null = null;
const STORAGE_KEY = 'redx-last-error';

export function setLastError(
  err: Error | null,
  source: StoredError['source'] = 'boundary',
  componentStack?: string
) {
  if (!err) {
    lastError = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return;
  }
  const stored: StoredError = {
    message: err?.message || String(err),
    stack: err?.stack,
    componentStack,
    source,
    timestamp: Date.now(),
  };
  lastError = stored;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {}
}

export function getLastError(): StoredError | null {
  if (lastError) return lastError;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredError;
  } catch {}
  return null;
}

export function clearLastError() {
  lastError = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Retorna texto completo para exibição na tela */
export function getErrorDisplayText(e: StoredError | null): string {
  if (!e) return '';
  const msg = (e.message || '').trim() || '(erro sem mensagem)';
  const parts: string[] = [msg];
  if (e.stack) parts.push('\n--- Stack ---\n' + e.stack);
  if (e.componentStack) parts.push('\n--- Component ---\n' + e.componentStack);
  parts.push('\n[' + e.source + ' @ ' + new Date(e.timestamp).toISOString() + ']');
  return parts.join('');
}
