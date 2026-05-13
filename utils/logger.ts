/**
 * Logger condicional para a aplicação.
 *
 * Níveis de prioridade:
 *  - log / info / debug → apenas em desenvolvimento (silenciados em produção)
 *  - warn / error       → SEMPRE visíveis (diagnóstico de problemas em produção)
 *  - time / timeEnd     → apenas em desenvolvimento
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  time: (label: string) => {
    if (isDev) console.time(label);
  },
  timeEnd: (label: string) => {
    if (isDev) console.timeEnd(label);
  },

  // warn e error são sempre exibidos — erros reais precisam de visibilidade em produção
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),

  /** Reprodução / WebView TV: sempre no console — filtrar `[Player]` (Chrome remote debugging). */
  playerDiag: (...args: unknown[]) => console.warn('[Player]', ...args),
};
