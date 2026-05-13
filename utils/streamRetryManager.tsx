import { useRef, useCallback } from 'react';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

export interface RetryState {
  attempt: number;
  lastError: Error | null;
  isRetrying: boolean;
  isFailed: boolean;
}

export type RetryCallback<T> = () => Promise<T>;
export type RetryOnRetry = (attempt: number, error: Error) => void;
export type RetryOnSuccess<T> = (result: T, attempt: number) => void;
export type RetryOnFail = (error: Error, attempts: number) => void;

interface RetryOptions<T> {
  config?: Partial<RetryConfig>;
  onRetry?: RetryOnRetry;
  onSuccess?: RetryOnSuccess<T>;
  onFail?: RetryOnFail;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const delayMs = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelayMs
  );
  return delayMs;
}

export function isRetryableError(error: unknown): boolean {
  if (!error) return true;
  // Non-Error thrown values (strings, objects) — treat as unknown/transient → retryable
  if (!(error instanceof Error)) return true;

  const retryableMessages = [
    'network',
    'timeout',
    'fetch',
    'connection',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'Failed to fetch',
    'NetworkError',
  ];

  const errorMessage = error instanceof Error ? error.message : String(error);

  return retryableMessages.some((msg) => errorMessage.toLowerCase().includes(msg.toLowerCase()));
}

export async function withRetry<T>(
  callback: RetryCallback<T>,
  options: RetryOptions<T> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options.config };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await callback();
      options.onSuccess?.(result, attempt);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error)) {
        if (options.onFail) {
          options.onFail(lastError, attempt);
        }
        throw lastError;
      }

      if (attempt === config.maxAttempts) {
        if (options.onFail) {
          options.onFail(lastError, attempt);
        }
        throw lastError;
      }

      if (options.onRetry) {
        options.onRetry(attempt, lastError);
      }

      const delayMs = calculateDelay(attempt, config);
      await delay(delayMs);
    }
  }

  throw lastError;
}

// ── Hook para uso em componentes React ─────────────────────────────────────

async function executeWithRetryImpl<T>(
  callback: RetryCallback<T>,
  options: RetryOptions<T> | undefined,
  retryStateRef: React.MutableRefObject<RetryState>
): Promise<T> {
  retryStateRef.current = {
    attempt: 0,
    lastError: null,
    isRetrying: true,
    isFailed: false,
  };

  try {
    const result = await withRetry<T>(callback, {
      ...options,
      onRetry: (attempt, error) => {
        retryStateRef.current.attempt = attempt;
        retryStateRef.current.lastError = error;
        options?.onRetry?.(attempt, error);
      },
    });

    retryStateRef.current.isRetrying = false;
    return result;
  } catch (error) {
    retryStateRef.current.isRetrying = false;
    retryStateRef.current.isFailed = true;
    retryStateRef.current.lastError = error instanceof Error ? error : new Error(String(error));
    throw error;
  }
}

export function useStreamRetry() {
  const retryStateRef = useRef<RetryState>({
    attempt: 0,
    lastError: null,
    isRetrying: false,
    isFailed: false,
  });

  const executeWithRetry = useCallback(
    <T,>(callback: RetryCallback<T>, options?: RetryOptions<T>): Promise<T> => {
      return executeWithRetryImpl(callback, options, retryStateRef);
    },
    []
  );

  const resetRetryState = useCallback(() => {
    retryStateRef.current = {
      attempt: 0,
      lastError: null,
      isRetrying: false,
      isFailed: false,
    };
  }, []);

  return {
    executeWithRetry,
    resetRetryState,
    retryState: retryStateRef.current,
  };
}
