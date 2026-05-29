/**
 * imageProxy.ts
 *
 * Converte URLs de imagens TMDB para WebP otimizado via proxy weserv.nl.
 * Usado em TODOS os pontos de geração de URL (runtime) e insert/update (banco).
 *
 * REGRAS:
 *  - Só converte URLs do domínio image.tmdb.org
 *  - Logos NÃO são convertidas (PNG transparente degrada em WebP)
 *  - URLs já otimizadas (weserv.nl, supabase.co, .webp) são retornadas sem alteração
 *  - Se URL é inválida/vazia/placeholder → retorna sem alterar
 *
 * Tamanhos máximos (otimização TV Box):
 *  - poster:  500px de largura
 *  - backdrop: 1280px de largura
 *
 * Qualidade WebP: 80 (bom equilíbrio tamanho/qualidade)
 */

const WEBP_QUALITY = 80;

const MAX_WIDTHS: Record<string, number> = {
  // Cards de poster renderizam ~185px na TV; w342 cobre densidade sem baixar w500 à toa.
  poster: 342,
  backdrop: 1280, // 1080p TV Box: w1280 para qualidade nítida em telas Full HD
};

/**
 * Normaliza a URL TMDB para a largura alvo e serve DIRETO da CDN do TMDB (sem wsrv).
 * Motivo: wsrv.nl é host único (limite ~6 conexões no WebView) → no scroll de grades
 * grandes a fila estoura e imagens "param de carregar". A CDN do TMDB distribui a carga
 * e é confiável. Custo: JPEG (~40% maior que WebP), mas w342 é pequeno e nunca fica em
 * branco. wsrv permanece só p/ origens http inseguras (mixed-content) e como fallback.
 */
function sizeTmdbDirect(url: string, width: number): string {
  return url.replace(/\/t\/p\/(?:original|w\d+|h\d+)\//i, `/t/p/w${width}/`);
}

/**
 * Constrói URL de proxy para poster a partir de poster_path TMDB.
 * Valida entrada e retorna null se inválida.
 */
export function buildPosterUrl(poster_path: string | null | undefined): string | null {
  if (!poster_path || typeof poster_path !== 'string' || !poster_path.startsWith('/')) {
    return null;
  }
  return `https://image.tmdb.org/t/p/w500${poster_path}`;
}

/**
 * Converte URL de imagem para formato WebP via proxy weserv.nl (apenas para TMDB).
 * TMDB não fornece WebP nativamente, então o proxy é necessário para performance em TV Boxes.
 */
export function toWebP(
  url: string | null | undefined,
  imageType: 'poster' | 'backdrop' | 'logo' = 'poster'
): string {
  if (!url || url.length < 5) return url || '';

  // Se já for uma URL do weserv ou local/data, não mexe
  if (isProxyUrl(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;

  // Logos TMDB: manter PNG/SVG (transparência); não forçar WebP via wsrv.nl
  if (imageType === 'logo') {
    const isTmdbLogo = url.includes('tmdb.org') || url.includes('themoviedb.org');
    if (isTmdbLogo) return url;
  }

  // Imagem http insegura (qualquer host) -> wsrv.nl https para evitar Mixed Content no WebView.
  // wsrv busca a origem http server-side e serve via https (ex.: http://file.gstaticontent.com,
  // que NAO tem https). Tambem redimensiona/converte para WebP (menor).
  if (url.startsWith('http://')) {
    const cleanUrl = url.replace(/^https?:\/\//, '');
    const width = MAX_WIDTHS[imageType] || 500;
    return `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=${width}&output=webp&q=${WEBP_QUALITY}`;
  }

  // TMDB https (poster/backdrop) -> DIRETO da CDN TMDB no tamanho alvo (sem wsrv).
  // Evita o gargalo de host único do wsrv que travava o carregamento no scroll.
  if (url.includes('image.tmdb.org')) {
    const width = MAX_WIDTHS[imageType] || MAX_WIDTHS.poster;
    return sizeTmdbDirect(url, width);
  }

  // Demais https -> direto (sem proxy de terceiro).
  return url;
}

/**
 * Alias para toWebP — compatível com NetflixImage e outros consumidores.
 * O parâmetro format (avif/webp) é ignorado; usa WebP para compatibilidade com weserv.nl.
 */
export function getProxyUrl(
  url: string | null | undefined,
  options?: { format?: string; imageType?: 'poster' | 'backdrop' | 'logo' | 'preview' }
): string {
  const imageType = (options?.imageType as 'poster' | 'backdrop' | 'logo') || 'poster';
  return toWebP(url, imageType);
}

/**
 * Verifica se a URL já é do proxy (evita desfazer e causar CORS).
 */
export function isProxyUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('wsrv.nl') || url.includes('images.weserv.nl') || url.includes('/img-proxy/');
}

/**
 * Extrai a URL TMDB original de uma URL proxy weserv.nl.
 * Útil para fallback quando o proxy está offline.
 *
 * @param proxyUrl - URL do proxy weserv.nl
 * @returns URL TMDB original ou a própria URL se não for proxy
 */
export function extractOriginalUrl(proxyUrl: string | null | undefined): string {
  if (!proxyUrl) return '';
  if (
    !proxyUrl.includes('wsrv.nl') &&
    !proxyUrl.includes('images.weserv.nl') &&
    !proxyUrl.includes('/img-proxy/')
  )
    return proxyUrl;

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(proxyUrl, base);
    const originalPath = parsed.searchParams.get('url');
    if (originalPath) {
      const decoded = decodeURIComponent(originalPath);
      return decoded.startsWith('http') ? decoded : `https://${decoded}`;
    }
  } catch {
    // URL malformada — retornar original
  }
  return proxyUrl;
}

type ResponsiveImageType = 'poster' | 'backdrop';

const RESPONSIVE_WIDTHS: Record<ResponsiveImageType, number[]> = {
  // Posters: 185/342 cobrem cards na TV sem baixar w500 desnecessário.
  poster: [185, 342],
  backdrop: [780, 1280],
};

/** Reescreve TMDB para o tamanho alvo, servindo DIRETO da CDN (alinhado ao src). */
function resizeTmdbImageUrl(url: string, width: number): string | null {
  const original = extractOriginalUrl(url);
  if (!original || !original.includes('image.tmdb.org/t/p/')) return null;
  return sizeTmdbDirect(original, width);
}

/**
 * Gera srcset responsivo (WebP) apenas para imagens TMDB. URLs de proxy/local ficam no src normal.
 */
export function getResponsiveImageSrcSet(
  url: string | null | undefined,
  imageType: ResponsiveImageType
): string | undefined {
  if (!url) return undefined;
  const entries = RESPONSIVE_WIDTHS[imageType]
    .map((width) => {
      const resized = resizeTmdbImageUrl(url, width);
      return resized ? `${resized} ${width}w` : null;
    })
    .filter(Boolean);
  return entries.length > 1 ? entries.join(', ') : undefined;
}

/**
 * Aplica toWebP() nos campos poster e backdrop de um objeto.
 * Útil para sanitizar payloads antes de insert/update no banco.
 *
 * @param data - Objeto com campos poster/backdrop opcionais
 * @returns Mesmo objeto com poster/backdrop convertidos para WebP
 */
export function optimizeImageFields<T extends Record<string, any>>(data: T): T {
  const result: Record<string, any> = { ...data };
  if (result.poster && typeof result.poster === 'string') {
    result.poster = toWebP(result.poster, 'poster');
  }
  if (result.backdrop && typeof result.backdrop === 'string') {
    result.backdrop = toWebP(result.backdrop, 'backdrop');
  }
  return result as T;
}
