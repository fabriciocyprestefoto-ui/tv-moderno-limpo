/** Campos serializáveis do evento Hls.Events.ERROR para Sentry (evita referências circulares). */
export function hlsErrorToDetails(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const err = d.error;
  const frag = d.frag as Record<string, unknown> | undefined;
  let errorMessage: string | undefined;
  if (err && typeof err === 'object' && err !== null && 'message' in err) {
    errorMessage = String((err as { message?: unknown }).message);
  }
  const response = d.response as Record<string, unknown> | undefined;
  return {
    type: d.type,
    details: d.details,
    fatal: d.fatal,
    fragUrl: frag && typeof frag.url === 'string' ? frag.url : undefined,
    fragSn: frag?.sn,
    level: d.level,
    errorMessage,
    responseCode: response && 'code' in response ? response.code : undefined,
  };
}
