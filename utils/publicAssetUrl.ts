/**
 * Resolve paths under `public/` for Vite (`base: './'`) and Capacitor WebView.
 * Absolute `/foo` breaks on some legacy TV WebViews when the app is served from `./index.html`.
 */
export function publicAssetUrl(relativePath: string, cacheBust?: string): string {
  const cleaned = relativePath.replace(/^\/+/, '');
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const url = `${prefix}${cleaned}`;
  if (!cacheBust) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}v=${encodeURIComponent(cacheBust)}`;
}

/** Retry URLs when the first load fails (query string / absolute path quirks on Fire TV). */
export function platformBannerFallbackUrls(relativePath: string, cacheBust?: string): string[] {
  const cleaned = relativePath.replace(/^\/+/, '');
  const urls = new Set<string>();
  urls.add(publicAssetUrl(cleaned, cacheBust));
  urls.add(publicAssetUrl(cleaned));
  urls.add(`/${cleaned}`);
  if (cacheBust) urls.add(`/${cleaned}?v=${encodeURIComponent(cacheBust)}`);
  return [...urls];
}
