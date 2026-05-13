// Logger centralizado — substitui todos os `catch (e) {}` vazados
// Em dev: console.{info,warn,error}. Em prod: ignora ou envia para Sentry.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

function formatMsg(level: LogLevel, ctx: string, msg: string, extra?: unknown) {
  const prefix = `[${level.toUpperCase()}] [${ctx}]`;
  return extra !== undefined ? `${prefix} ${msg}` : `${prefix} ${msg} ${String(extra)}`;
}

export const logger = {
  debug(ctx: string, msg: string, extra?: unknown) {
    if (isDev) console.debug(formatMsg('debug', ctx, msg, extra));
  },
  info(ctx: string, msg: string, extra?: unknown) {
    if (isDev) console.info(formatMsg('info', ctx, msg, extra));
  },
  warn(ctx: string, msg: string, extra?: unknown) {
    console.warn(formatMsg('warn', ctx, msg, extra));
    // Em prod enviar para Sentry ignorando 3rd-party
    if (!isDev && extra instanceof Error) {
      void import('@sentry/react')
        .then(({ captureException }) => {
          captureException(extra, { extra: { ctx } });
        })
        .catch(() => {});
    }
  },
  error(ctx: string, msg: string, extra?: unknown) {
    console.error(formatMsg('error', ctx, msg, extra));
    if (!isDev && extra instanceof Error) {
      void import('@sentry/react')
        .then(({ captureException }) => {
          captureException(extra, { extra: { ctx } });
        })
        .catch(() => {});
    }
  },
};
