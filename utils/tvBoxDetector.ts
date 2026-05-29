/**
 * tvBoxDetector.ts
 * Detecta automaticamente se o app roda em TV Box / Android TV / hardware fraco
 * e aplica otimizações de performance via CSS class no <html>.
 */

interface DeviceProfile {
  isTVBox: boolean;
  isLowPower: boolean;
  isWebView: boolean;
  isAndroidTV: boolean;
  /** Capacitor WebView em hardware de TV (sem touch) — distingue TV de phone/tablet */
  isCapacitorTV: boolean;
}

const TV_UA_PATTERNS = [
  /Android TV/i,
  /AFT/i, // Amazon Fire TV
  /BRAVIA/i, // Sony TV
  /SMART-TV/i,
  /SmartTV/i,
  /Tizen/i, // Samsung TV
  /Web0S/i, // LG TV
  /CrKey/i, // Chromecast
  /TV Box/i,
  /RedflixTV/i, // UA próprio do APK Capacitor
];

const WEBVIEW_UA_PATTERNS = [
  /wv\)/i, // Android WebView
  /; wv/i,
];

function detectDevice(): DeviceProfile {
  const ua = navigator.userAgent || '';

  const isAndroidTV = TV_UA_PATTERNS.some((p) => p.test(ua));
  const isWebView =
    WEBVIEW_UA_PATTERNS.some((p) => p.test(ua)) ||
    typeof window.Capacitor !== 'undefined' ||
    /capacitor:\/\//.test(window.location.origin);
  const isRedflixNative = /RedflixTV/i.test(ua);

  // TV remotes têm maxTouchPoints = 0; phones/tablets têm ≥ 1.
  // WebView antigo (Android 5/6) retorna undefined → tratar como sem touch (é TV Box).
  // isCapacitorTV = WebView/Capacitor SEM touch → é TV Box com controle remoto, não phone.
  const noTouch = !navigator.maxTouchPoints; // 0 ou undefined → falsy → noTouch=true
  const isCapacitorTV = isWebView && (noTouch || isRedflixNative);

  // Memória: navigator.deviceMemory (Chrome/Edge) — undefined em outros browsers
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8;
  const lowMemory = deviceMemory <= 2;

  // Hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 4;
  const lowCores = cores <= 2;

  // DPR baixo pode indicar TV box barato
  const lowDPR = window.devicePixelRatio <= 1;

  const isLowPower = lowMemory || (lowCores && lowDPR) || (isAndroidTV && lowMemory);
  // TV Box = Android TV por UA OU Capacitor sem touch (TV Box genérico/Fire Stick via controle remoto).
  // Phone/tablet com Capacitor TEM touch → não é TV Box.
  const isTVBox = isAndroidTV || isCapacitorTV || isRedflixNative;

  return { isTVBox, isLowPower, isWebView, isAndroidTV, isCapacitorTV };
}

/**
 * Aplica classes CSS no <html> para que o CSS possa ajustar estilos.
 * Classes adicionadas:
 *   .tv-box     — qualquer TV Box / WebView / Android TV
 *   .low-power  — hardware fraco (pouca RAM, poucos cores)
 */
export function initTVBoxMode(): DeviceProfile {
  const profile = detectDevice();
  const root = document.documentElement;

  // `tv-box`: estilos gerais TV/WebView. `tv-box-mode`: mesmo sinal que deviceDetector.js
  // (preload, blur, timeouts). O bundle React roda antes do DOMContentLoaded em alguns casos;
  // aplicar ambas aqui evita LazyImage/Details sem otimização até o detector rodar.
  if (profile.isTVBox) {
    root.classList.add('tv-box');
    root.classList.add('tv-box-mode');
  }
  // deviceDetector pode ter ativado só `tv-box-mode` (fallback tela grande / leanback)
  if (root.classList.contains('tv-box-mode') && !root.classList.contains('tv-box')) {
    root.classList.add('tv-box');
  }
  if (profile.isLowPower) root.classList.add('low-power');
  if (profile.isAndroidTV) root.classList.add('android-tv');

  if (profile.isLowPower || profile.isTVBox) {
    // Reduzir motion preference para TV Box com pouca potência
    const style = document.createElement('style');
    style.id = 'tv-box-perf';
    style.textContent = `
      /* TV Box Performance Mode */
      .low-power *,
      .tv-box.low-power * {
        transition-duration: 0.15s !important;
        animation-duration: 0.2s !important;
      }
      .low-power .hero-banner-bg {
        transition-duration: 0.3s !important;
      }
      /* Reduzir sombras pesadas em low-power */
      .low-power [class*="shadow-2xl"],
      .low-power [class*="shadow-xl"] {
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3) !important;
      }
    `;
    document.head.appendChild(style);
  }

  return profile;
}

/**
 * O bundle roda (script defer) antes do `DOMContentLoaded` onde `deviceDetector.js`
 * pode acrescentar só `tv-box-mode`. Chame no `DOMContentLoaded` para alinhar `tv-box`.
 */
export function syncTvBoxClassWithHtml(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.classList.contains('tv-box-mode') && !root.classList.contains('tv-box')) {
    root.classList.add('tv-box');
  }
}

/** True em WebView/TV nativo: classe do React (`tv-box`) ou do deviceDetector (`tv-box-mode`). */
export function isTVBox(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  return el.classList.contains('tv-box') || el.classList.contains('tv-box-mode');
}

export function isLowPower(): boolean {
  return document.documentElement.classList.contains('low-power');
}

/**
 * TVs/WebViews antigos costumam falhar com HLS.js/MediaSource, mas ainda podem
 * reproduzir HLS direto no elemento HTML5 quando o firmware oferece suporte nativo.
 */
export function isLegacyHtml5OnlyTV(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  if (!isTVBox()) return false;
  // Firestick (qualquer Fire OS) suporta HLS.js — não tratar como legacy.
  // Caso contrário, em Fire OS 5 (Android 5.0/Chromium 39) cai em <video src=.m3u8>
  // que o WebView não decodifica → canal não toca. Regressão de versões recentes.
  if (isFireTV()) return false;

  const ua = navigator.userAgent || '';
  const androidVersion = ua.match(/Android\s+(\d+)/i);
  const chromeVersion = ua.match(/(?:Chrome|CriOS)\/(\d+)/i);
  const androidMajor = androidVersion ? Number(androidVersion[1]) : 0;
  const chromeMajor = chromeVersion ? Number(chromeVersion[1]) : 0;

  return (androidMajor > 0 && androidMajor <= 7) || (chromeMajor > 0 && chromeMajor < 80);
}

export function isFireTV(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /AFT|Fire\s?TV|Silk/i.test(navigator.userAgent || '');
}

/**
 * TV nova/Android TV WebView moderno: precisa iniciar autoplay em muted.
 * Fire TV e WebView antigo ficam fora para preservar autoplay com som quando permitido.
 */
export function isModernAndroidTVWebView(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  // Firestick excluído — autoplay com som funciona, não forçar muted (regressão de filmes).
  if (!isTVBox() || isFireTV() || isLegacyHtml5OnlyTV()) return false;
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isWebView =
    WEBVIEW_UA_PATTERNS.some((p) => p.test(ua)) ||
    typeof window.Capacitor !== 'undefined' ||
    /capacitor:\/\//.test(window.location.origin);
  return isAndroid && isWebView;
}

/**
 * True em qualquer contexto Capacitor/WebView (phone, tablet ou TV).
 * Use quando precisar de comportamento específico de WebView independente de ser TV.
 */
export function isCapacitorContext(): boolean {
  return typeof window.Capacitor !== 'undefined' || /capacitor:\/\//.test(window.location.origin);
}
