/**
 * Detecta se o app está rodando em modo TV (controle remoto D-pad).
 * Usado para exibir anel de foco, desativar scroll por setas em desktop, etc.
 * Em Capacitor Android TV, o D-pad é injetado pela MainActivity; esta flag
 * pode ser usada para UI (ex.: classe .show-focus).
 */
let cached: boolean | null = null;

export function isTvMode(): boolean {
  if (cached !== null) return cached;

  if (typeof navigator === 'undefined') {
    cached = false;
    return cached;
  }

  const ua = navigator.userAgent.toLowerCase();

  // Capacitor Android (TV Box costuma ter "Android" e às vezes "TV" no UA)
  if (ua.indexOf('android') !== -1 && (ua.indexOf('tv') !== -1 || ua.indexOf('aftm') !== -1)) {
    cached = true;
    return cached;
  }

  // Tizen, WebOS, Viera (referência Jellyfin)
  if (
    ua.indexOf('tv') !== -1 ||
    ua.indexOf('samsungbrowser') !== -1 ||
    ua.indexOf('viera') !== -1
  ) {
    cached = true;
    return cached;
  }

  if (ua.indexOf('web0s') !== -1 || ua.indexOf('netcast') !== -1) {
    cached = true;
    return cached;
  }

  // Padrões adicionais comuns em TV Boxes brasileiros e globais
  const tvBoxPatterns = [
    'tvbox',
    'tv box',
    'tv-box',
    'bravia',
    'tizen',
    'netcast',
    'webos',
    'philips tv',
    'panasonic tv',
    'lg tv',
    'hbbtv',
    'smarttv',
    'smart-tv',
    // Amazon Fire TV
    'aftm',
    'aftb',
    'afts',
    'aftn',
    'aftss',
    'aftr',
    // Nvidia Shield
    'shield',
    // Chromecast
    'crkey',
  ];
  if (tvBoxPatterns.some((p) => ua.includes(p))) {
    cached = true;
    return cached;
  }

  // Opcional: Capacitor.getPlatform() === 'android' em app apenas TV
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform?.() === 'android') {
      // TV Boxes Android geralmente não têm "mobile" no UA.
      // Se é Capacitor Android e não é mobile → assumir TV mode.
      const isMobileUA = /mobile|phone|android(?!.*tv)/i.test(ua);
      cached = !isMobileUA;
      return cached;
    }
  } catch {
    // ignore
  }

  cached = false;
  return cached;
}

export function setTvMode(value: boolean): void {
  cached = value;
}
