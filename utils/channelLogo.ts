/**
 * utils/channelLogo.ts
 * Resolução robusta da logo do canal entre as variações de nome de campo que
 * vêm do Supabase / M3U, e tratamento de logo quebrada no render (sem retry).
 */

const LOGO_FIELDS = [
  'logo',
  'logo_url',
  'logoUrl',
  'logoURL',
  'logo_uri',
  'logoUri',
  'tvg_logo',
  'tvgLogo',
  'tvg-logo',
  'thumbnail',
  'image',
  'image_url',
  'imageUrl',
  'img',
  'icon',
  'icon_url',
  'iconUrl',
  'poster',
  'channel_logo',
  'channelLogo',
  'channelLogoUrl',
  'channel_icon',
  'channelIcon',
  'url_logo',
] as const;

// Diagnóstico: loga cada campo escolhido apenas uma vez por sessão (evita spam
// com 1000+ canais). Revela no logcat se a logo veio do campo esperado ou nenhum.
const seenLogoFields = new Set<string>();

function normalizeChannelLogoUrl(value: string): string {
  const clean = value
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/&amp;/g, '&');

  if (!clean) return '';
  if (clean.startsWith('//')) return `https:${clean}`;
  if (/^(https?:|data:|blob:|\/)/i.test(clean)) return clean;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(clean)) return `https://${clean}`;
  return clean;
}

/** Seleciona a primeira logo não-vazia entre os nomes de campo conhecidos. */
export function resolveChannelLogo(row: Record<string, unknown>): { logo: string; field: string } {
  for (const field of LOGO_FIELDS) {
    const value = row[field];
    if (typeof value === 'string' && value.trim()) {
      const logo = normalizeChannelLogoUrl(value);
      if (!logo) continue;
      if (!seenLogoFields.has(field)) {
        seenLogoFields.add(field);
        console.log(`[Channels] logo field selected=${field}`);
      }
      return { logo, field };
    }
  }
  return { logo: '', field: 'none' };
}

const loggedFallbackChannels = new Set<string>();

/**
 * Esconde uma logo que falhou ao carregar (fonte morta/bloqueada), sem reentrar
 * em retry infinito, e loga o fallback uma vez por canal.
 */
export function handleChannelLogoError(channelName: string, img: HTMLImageElement): void {
  img.onerror = null; // impede re-disparo / retry loop
  img.style.display = 'none';
  const name = (channelName || '').trim() || 'desconhecido';
  if (!loggedFallbackChannels.has(name)) {
    loggedFallbackChannels.add(name);
    console.log(`[Channels] logo fallback used channel=${name}`);
  }
}
