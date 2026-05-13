const BLOCKED_DOMAINS = [
  'encrypted-tbn0.gstatic.com',
  'encrypted-tbn1.gstatic.com',
  'encrypted-tbn2.gstatic.com',
  'encrypted-tbn3.gstatic.com',
  'googleusercontent.com',
  'blogger.googleusercontent.com',
  'yt3.googleusercontent.com',
];

export function isLogoUrlBlocked(url: string | null | undefined): boolean {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  return BLOCKED_DOMAINS.some((domain) => lowerUrl.includes(domain));
}

export function getSafeLogoUrl(
  channelName: string,
  logoUrl: string | null | undefined,
  fallbackLogos: Record<string, string> = {}
): string {
  if (isLogoUrlBlocked(logoUrl)) {
    const upperName = channelName.toUpperCase();
    for (const [key, url] of Object.entries(fallbackLogos)) {
      if (upperName.includes(key.toUpperCase())) {
        return url;
      }
    }
    return '/placeholder-logo.png';
  }
  return logoUrl!;
}

export const DEFAULT_CHANNEL_LOGOS: Record<string, string> = {
  'TV ESCOLA': 'https://img.onetv.plus/icones_channels/TV_ESCOLA.png',
  'REDE SECULO 21': 'https://img.onetv.plus/icones_channels/REDE_SECULO_21.png',
  ZOOMOO: 'https://img.onetv.plus/icones_channels/ZOOMOO.png',
  'TV GIDEOES': 'https://img.onetv.plus/icones_channels/TV_GIDEOES.png',
  'GOLF CHANNEL': 'https://img.onetv.plus/icones_channels/GOLF_CHANNEL.png',
  'CANAL BRASIL': 'https://img.onetv.plus/icones_channels/CANAL_BRASIL.png',
  TBC: 'https://img.onetv.plus/icones_channels/TBC.png',
  BRTVMAX: 'https://img.onetv.plus/icones_channels/BRTVMAX.png',
  'BM&C': 'https://img.onetv.plus/icones_channels/BMC.png',
};
