import { logger } from './logger';
/**
 * withRetry — Executa uma função assíncrona com retry automático.
 * Ideal para operações de rede em TV Boxes com conexão instável.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`[withRetry] Tentativa ${attempt + 1}/${maxRetries} falhou:`, lastError.message);
      if (attempt < maxRetries - 1) {
        // Backoff exponencial
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}
