/**
 * sourceUrlPolicy — política central de fontes de stream.
 *
 * Regras:
 *  1. A fonte INICIAL (URL salva no Supabase) precisa vir de uma `activeSource`.
 *  2. Fontes em `inactiveSources` são IGNORADAS enquanto inativas — não são
 *     "banidas". Se uma voltar para `activeSources` no futuro, volta a funcionar
 *     sem refatoração (basta mover a entrada de lista).
 *  3. A URL FINAL pode ser qualquer IP/CDN (ex.: low.barberpro.fun, 205.x.x.x)
 *     desde que o canal tenha entrado pelo pipeline válido. `allowFinalIpOrCdnUrls`
 *     documenta que NUNCA filtramos o host final de um 302/redirect.
 *
 * Uma `source` é identificada por host[:porta]. Porta omitida casa com :80.
 */
export const SOURCE_POLICY = {
  activeSources: ['fontez.cc:80'],
  inactiveSources: ['newoneblue.site'],
  allowFinalIpOrCdnUrls: true,
} as const;

function hostPortOf(value: unknown): { host: string; port: string } | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return {
      host: parsed.hostname.replace(/^www\./i, '').toLowerCase(),
      port: parsed.port || '80',
    };
  } catch {
    return null;
  }
}

function matchesSource(value: unknown, source: string): boolean {
  const target = hostPortOf(value);
  if (!target) {
    // Fallback textual quando a URL não parseia (host:porta cru, substring).
    return String(value || '')
      .toLowerCase()
      .includes(source.toLowerCase());
  }
  const [srcHost, srcPort] = source.toLowerCase().split(':');
  if (target.host !== srcHost.replace(/^www\./i, '')) return false;
  // Porta na policy é opcional; quando presente precisa casar.
  return srcPort ? target.port === srcPort : true;
}

/** URL pertence a uma fonte INATIVA (legada) — deve ser ignorada, não tratada como erro. */
export function isInactiveSourceUrl(value: unknown): boolean {
  return SOURCE_POLICY.inactiveSources.some((src) => matchesSource(value, src));
}

/** URL pertence a uma fonte ATIVA válida (fonte inicial aceitável). */
export function isActiveSourceUrl(value: unknown): boolean {
  return SOURCE_POLICY.activeSources.some((src) => matchesSource(value, src));
}
