import { Media } from '../types';
import { extractOriginalUrl, toWebP, isProxyUrl } from './imageProxy';
import { pickFirstRealStreamUrlFromRow } from './streamUrlGuards';

/* ============================================================
   MEDIA UTILS – Dedup, Validation, Poster Fallback, Season Filter
   ============================================================ */

/** Sem placeholder visual local: quando não houver imagem oficial TMDB retornamos string vazia. */
export const PLACEHOLDER_POSTER = '';

const TMDB_IMAGE_HOST = 'image.tmdb.org';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Verifica se uma URL de imagem é válida (não corrompida) */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const s = url.trim();
  if (s.length < 5) return false;
  if (/undefined|null|%7B%7B|%%|^\s*$/.test(s)) return false;
  if (s.includes('undefined') || s.includes('null')) return false;
  if (!/^(https?:\/\/|data:|blob:|\/|\.\/)/i.test(s)) return false;
  return true;
}

function sanitizeImageUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const cleaned = url.trim();
  if (!cleaned || cleaned.includes('undefined') || cleaned.includes('null')) return '';
  return cleaned;
}

function normalizeOfficialTmdbImageUrl(url: string | null | undefined): string {
  const originalUrl = extractOriginalUrl(url);
  const cleaned = sanitizeImageUrl(originalUrl);
  if (!cleaned) return '';

  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname.toLowerCase().includes(TMDB_IMAGE_HOST)) return '';
  } catch {
    return '';
  }

  return cleaned.replace(/\/t\/p\/(?:original|w\d+|h\d+)\//i, '/t/p/original/');
}

function getAssetFileKey(value: string | null | undefined): string {
  const cleaned = sanitizeImageUrl(extractOriginalUrl(value));
  if (!cleaned) return '';

  const directPathMatch = cleaned.match(/\/([^/?#]+)$/);
  if (directPathMatch?.[1]) return directPathMatch[1].trim().toLowerCase();

  try {
    const parsed = new URL(cleaned, IMAGE_BASE);
    const fileName = parsed.pathname.split('/').filter(Boolean).pop();
    return fileName ? fileName.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

function isArtworkReusedAsLogo(
  media:
    | Pick<Media, 'logo_url' | 'poster' | 'backdrop'>
    | {
        logo_url?: string | null;
        poster?: string | null;
        backdrop?: string | null;
        poster_path?: string | null;
        backdrop_path?: string | null;
      },
  rawLogo: string
): boolean {
  const logoKey = getAssetFileKey(rawLogo);
  if (!logoKey) return false;

  const posterPath = (media as any).poster_path;
  const backdropPath = (media as any).backdrop_path;
  const candidates = [
    (media as any).poster,
    (media as any).backdrop,
    typeof posterPath === 'string' && posterPath.startsWith('/')
      ? `${IMAGE_BASE}/original${posterPath}`
      : null,
    typeof backdropPath === 'string' && backdropPath.startsWith('/')
      ? `${IMAGE_BASE}/original${backdropPath}`
      : null,
  ];

  return candidates.some((candidate) => {
    const candidateKey = getAssetFileKey(candidate);
    return Boolean(candidateKey) && candidateKey === logoKey;
  });
}

function getOfficialTmdbPosterUrl(media: {
  tmdb_id?: string | number | null;
  poster?: string | null;
  poster_path?: string | null;
}): string {
  const tmdbId = Number((media as any).tmdb_id);

  if (Number.isFinite(tmdbId) && tmdbId > 0) {
    const posterPath = (media as any).poster_path;
    if (posterPath && typeof posterPath === 'string' && posterPath.startsWith('/')) {
      return toWebP(`${IMAGE_BASE}/w500${posterPath}`, 'poster');
    }
  }

  return normalizeOfficialTmdbImageUrl((media as any).poster);
}

/**
 * Get the best available image for a media item.
 * Fallback chain: poster → backdrop
 */
export function getMediaPoster(media: Media): string {
  return getPosterUrl(media);
}

/**
 * ETAPA 7 — Função segura para obter URL do poster.
 * Fallback: poster_path TMDB → backdrop_path TMDB → poster/backdrop oficial TMDB
 */
export function getPosterUrl(
  media:
    | Media
    | {
        tmdb_id?: string | number | null;
        type?: string | null;
        poster?: string | null;
        backdrop?: string | null;
        poster_path?: string | null;
        backdrop_path?: string | null;
      }
): string {
  const tmdbId = Number((media as any).tmdb_id);

  // 1. Se tem tmdb_id e poster_path TMDB, construir URL oficial (w500 para proxy)
  // Nunca usar backdrop_path aqui — essa função é para cards portrait (2:3)
  if (Number.isFinite(tmdbId) && tmdbId > 0) {
    const posterPath = (media as any).poster_path;
    if (posterPath && typeof posterPath === 'string' && posterPath.startsWith('/')) {
      return toWebP(`${IMAGE_BASE}/w500${posterPath}`, 'poster');
    }
  }

  // 2. Fallback para URLs já oficiais do TMDB salvas no banco ou via proxy
  // APENAS poster — NUNCA usar backdrop em cards portrait (2:3) para evitar imagem cortada
  // Preservar URLs do proxy (evita CORS ao desfazer)
  const posterUrl = (media as any).poster;
  if (posterUrl && isProxyUrl(posterUrl)) return posterUrl;
  // URLs TMDB do banco já têm tamanho correto (w500) — usar diretamente via WebP proxy
  // sem normalizar para 'original' (causava barra dupla e download de imagem full-res desnecessário)
  if (posterUrl && (posterUrl.includes('image.tmdb.org') || posterUrl.includes('themoviedb.org'))) {
    return toWebP(posterUrl, 'poster');
  }
  const officialPoster = normalizeOfficialTmdbImageUrl(posterUrl);
  if (officialPoster) return toWebP(officialPoster, 'poster');

  // 3. Fallback para poster_path cru (sem tmdb_id conhecido)
  const m = media as { poster_path?: string | null; backdrop_path?: string | null };
  if (m.poster_path && typeof m.poster_path === 'string' && m.poster_path.startsWith('/')) {
    return toWebP(`${IMAGE_BASE}/w500${m.poster_path}`, 'poster');
  }

  // NÃO usar backdrop_path como fallback para poster vertical
  // Isso causava imagens horizontais cortadas nos cards portrait (ex: Barbie 2012)
  return '';
}

/**
 * Get backdrop (imagem horizontal) — preferência para slot expandido.
 */
export function getMediaBackdrop(media: Media): string {
  const tmdbId = Number(media.tmdb_id);

  // 1. backdrop_path TMDB — NUNCA usar poster_path como fallback aqui.
  // Esta função é exclusiva para imagens horizontais (16:9).
  if (Number.isFinite(tmdbId) && tmdbId > 0) {
    const path = (media as any).backdrop_path;
    if (path && typeof path === 'string' && path.startsWith('/')) {
      return toWebP(`${IMAGE_BASE}/w1280${path}`, 'backdrop');
    }
  }

  // 2. URL de backdrop já resolvida no banco (deve ser uma imagem horizontal)
  // Preservar URLs do proxy (evita CORS ao desfazer)
  const backdropUrl = media.backdrop;
  if (backdropUrl && isProxyUrl(backdropUrl)) return backdropUrl;
  // URLs TMDB do banco já têm tamanho correto — usar diretamente via WebP proxy
  if (
    backdropUrl &&
    (backdropUrl.includes('image.tmdb.org') || backdropUrl.includes('themoviedb.org'))
  ) {
    return toWebP(backdropUrl, 'backdrop');
  }
  const officialBackdrop = normalizeOfficialTmdbImageUrl(backdropUrl);
  if (officialBackdrop) return toWebP(officialBackdrop, 'backdrop');
  return '';
}

export function getMediaLogo(
  media:
    | Pick<Media, 'logo_url' | 'poster' | 'backdrop'>
    | {
        logo_url?: string | null;
        poster?: string | null;
        backdrop?: string | null;
        poster_path?: string | null;
        backdrop_path?: string | null;
      }
): string {
  const rawLogo = sanitizeImageUrl((media as any).logo_url);
  if (!rawLogo) return '';
  if (isArtworkReusedAsLogo(media, rawLogo)) return '';
  if (rawLogo.startsWith('/')) return rawLogo;
  // Preservar URLs do proxy (evita CORS ao desfazer — logos e posters quebrados)
  if (isProxyUrl(rawLogo)) return rawLogo;
  const officialLogo = normalizeOfficialTmdbImageUrl(rawLogo);
  return officialLogo ? toWebP(officialLogo, 'logo') : rawLogo;
}

export function normalizeArtworkMedia<T extends Media>(media: T): T {
  const safeLogo = getMediaLogo(media);
  return {
    ...media,
    poster: getPosterUrl(media) || media.poster || '',
    backdrop: getMediaBackdrop(media) || media.backdrop || '',
    logo_url: safeLogo || undefined,
  } as T;
}

export function normalizeArtworkMediaList(items: Media[]): Media[] {
  return items.map((item) => normalizeArtworkMedia(item));
}

export function normalizeArtworkMediaMap(groups: Map<string, Media[]>): Map<string, Media[]> {
  return new Map(
    Array.from(groups.entries()).map(([genre, items]) => [genre, normalizeArtworkMediaList(items)])
  );
}

/**
 * Check if a media item has a valid poster image URL
 */
export function hasValidPoster(media: Media): boolean {
  const poster = getMediaPoster(media);
  return !!poster;
}

/**
 * Requer correspondência TMDB real com poster vertical oficial e logo oficial.
 * Itens sem TMDB válido devem sair das páginas VOD.
 */
export function hasRequiredTmdbCatalogPoster(
  media:
    | Media
    | {
        tmdb_id?: string | number | null;
        poster?: string | null;
        poster_path?: string | null;
      }
): boolean {
  const tmdbId = Number((media as any).tmdb_id);
  // Catálogo VOD só pode exibir conteúdo com correspondência TMDB real e poster oficial.
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return false;
  return Boolean(getOfficialTmdbPosterUrl(media as any));
}

export function filterMediaWithRequiredTmdbPoster<T extends Media>(items: T[]): T[] {
  return deduplicateMedia(
    filterOutSeasons(items.map((item) => normalizeArtworkMedia(item))).filter(
      (item) => Boolean(item) && hasRequiredTmdbCatalogPoster(item) && hasPosterAndVideo(item)
    )
  ) as T[];
}

export function filterMediaMapWithRequiredTmdbPoster(
  groups: Map<string, Media[]>
): Map<string, Media[]> {
  return new Map(
    Array.from(groups.entries())
      .map(([genre, items]) => [genre, filterMediaWithRequiredTmdbPoster(items)] as const)
      .filter(([, items]) => items.length > 0)
  );
}
/**
 * Legado / detalhes: mesmo critério que `hasRequiredTmdbCatalogPoster`.
 * Nota: não exige logo TMDB — quase nenhuma linha de série no Supabase tem `logo_url`
 * preenchido; exigir logo esvaziava a Home e as linhas por género.
 */
export function hasRequiredTmdbImages(
  media:
    | Media
    | {
        tmdb_id?: string | number | null;
        poster?: string | null;
        poster_path?: string | null;
        logo_url?: string | null;
      }
): boolean {
  return hasRequiredTmdbCatalogPoster(media);
}

export function filterMediaWithRequiredTmdbImages<T extends Media>(items: T[]): T[] {
  return deduplicateMedia(
    filterOutSeasons(items.map((item) => normalizeArtworkMedia(item))).filter(
      (item) => hasRequiredTmdbCatalogPoster(item) && hasPosterAndVideo(item)
    )
  ) as T[];
}

export function filterMediaMapWithRequiredTmdbImages(
  groups: Map<string, Media[]>
): Map<string, Media[]> {
  return new Map(
    Array.from(groups.entries())
      .map(([genre, items]) => [genre, filterMediaWithRequiredTmdbImages(items)] as const)
      .filter(([, items]) => items.length > 0)
  );
}

/**
 * Verifica se o item possui URL de vídeo válida (Supabase).
 * Campos: stream_url, video_url, videoUrl, source_url, url, link
 *
 * IMPORTANTE: não usa isPlaybackUrlKnownBroken aqui — um erro temporário de rede/CORS
 * não deve "banir" o conteúdo do catálogo por 12h. O cache de saúde é para feedback
 * na UI do player, não para filtrar o catálogo.
 */
/** Ano de lançamento >= minYear (usa `year` ou prefixo de `release_date`). */
export function isRecentMedia(media: Media, minYear: number): boolean {
  if (typeof media.year === 'number' && Number.isFinite(media.year)) {
    return media.year >= minYear;
  }
  const rd = media.release_date;
  if (typeof rd === 'string' && rd.length >= 4) {
    const y = parseInt(rd.slice(0, 4), 10);
    return Number.isFinite(y) && y >= minYear;
  }
  return false;
}

export function hasValidVideoUrl(media: Media | Record<string, unknown>): boolean {
  const s = pickFirstRealStreamUrlFromRow(media as Record<string, unknown>);
  const sLow = s.toLowerCase();

  if (!s || !s.startsWith('http') || s.length < 10) return false;

  return (
    !sLow.includes('undefined') &&
    !sLow.includes('null') &&
    !sLow.includes('indisponivel') &&
    !sLow.includes('unavailable') &&
    !sLow.includes('placeholder')
  );
}

/**
 * REGRA: Item só pode ser exibido se tiver poster E URL real de vídeo no Supabase.
 * Não usar season_count como permissão visual: se não existe URL real no catálogo,
 * o conteúdo não deve aparecer no app.
 */
export function hasPosterAndVideo(media: Media): boolean {
  if (!hasValidPoster(media)) return false;

  if (media.type === 'movie' || (media.type as string) === 'kids') {
    return hasValidVideoUrl(media) && hasRequiredTmdbCatalogPoster(media);
  }

  if (media.type === 'series' || (media.type as string) === 'tv') {
    if (!hasRequiredTmdbCatalogPoster(media)) return false;
    return hasValidVideoUrl(media);
  }

  return false;
}

/**
 * Filter out season-like entries that shouldn't appear as standalone content.
 * Seasons belong inside their parent series' details page.
 */
export function filterOutSeasons(items: Media[]): Media[] {
  const seasonPatterns = [
    /^temporada\s*\d+/i,
    /^season\s*\d+/i,
    /^s\d{1,2}$/i,
    /^t\d{1,2}\s*$/i,
    /^(\d+)[ªa]\s*temporada/i,
    /\btemporada\s*\d+$/i,
    /\bseason\s*\d+$/i,
    /^temp\s*\d+/i,
    /^s\d{1,2}\s*e\d+$/i,
    /^s\d{1,2}\s*·\s*e\d+/i,
  ];
  const episodePatterns = [
    /\bs\d{1,2}\s*e\d{1,3}\b/i,
    /\bt\d{1,2}\s*e\d{1,3}\b/i,
    /\bseason\s*\d+\s*episode\s*\d+\b/i,
    /\btemporada\s*\d+\s*epis[oó]dio\s*\d+\b/i,
  ];

  return items.filter((item) => {
    const title = (item.title || '').trim();
    if (!title) return false;

    // Pure season/episode reference (very short titles matching patterns)
    for (const pattern of seasonPatterns) {
      if (pattern.test(title)) return false;
    }
    for (const pattern of episodePatterns) {
      if (pattern.test(title)) return false;
    }

    // Check group_title for season indicators
    if (item.group_title) {
      const gt = item.group_title.trim();
      for (const pattern of seasonPatterns) {
        if (pattern.test(gt)) return false;
      }
      for (const pattern of episodePatterns) {
        if (pattern.test(gt)) return false;
      }
    }

    return true;
  });
}

/**
 * Extrai o nome do arquivo de poster TMDB para deduplicação secundária.
 * O hash do arquivo é único por conteúdo — dois itens com mesmo arquivo = mesmo título.
 */
function extractPosterFile(url: string | null | undefined): string | null {
  if (!url) return null;
  const wsrv = url.match(/%2F([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))(?:%3F|&|$)/i);
  if (wsrv) return wsrv[1].toLowerCase();
  const direct = url.match(/\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))(?:\?|$)/i);
  return direct ? direct[1].toLowerCase() : null;
}

/**
 * Deduplicate media items by tmdb_id (preferred) or title.
 * Secondary key: TMDB poster filename — same poster file = same content, even if tmdb_ids differ in DB.
 * Keeps the first occurrence (highest quality data).
 */
export function deduplicateMedia(items: Media[]): Media[] {
  const seen = new Set<string>();
  const result: Media[] = [];

  for (const item of items) {
    const primaryKey =
      item.tmdb_id && item.tmdb_id > 0
        ? `tmdb-${item.type}-${item.tmdb_id}`
        : `title-${item.type}-${(item.title || '').toLowerCase().trim()}`;

    const posterFile = extractPosterFile(item.poster);
    const posterKey = posterFile ? `poster-${posterFile}` : null;

    if (seen.has(primaryKey) || (posterKey && seen.has(posterKey))) continue;

    seen.add(primaryKey);
    if (posterKey) seen.add(posterKey);
    result.push(item);
  }

  return result;
}

/**
 * Validate that a media item has minimum required fields.
 */
export function isValidMedia(media: Media): boolean {
  if (!media) return false;
  if (!media.id) return false;
  if (!media.title || media.title.trim().length === 0) return false;
  if (!media.type || (media.type !== 'movie' && media.type !== 'series')) return false;
  return true;
}

/** Títulos excluídos do catálogo (vazio agora, os itens serão exibidos) */
const EXCLUDED_TITLES = new Set<string>([]);

function isExcludedTitle(title: string | undefined): boolean {
  if (!title) return false;
  const key = title.toLowerCase().trim().replace(/\s+/g, ' ');
  return EXCLUDED_TITLES.has(key) || EXCLUDED_TITLES.has(key.replace(/[:\-–—]/g, ' '));
}

/**
 * Full sanitization pipeline: validate → remove seasons → deduplicate → exige poster oficial TMDB e vídeo válido.
 */
export function sanitizeMediaList(items: Media[]): Media[] {
  return deduplicateMedia(
    filterOutSeasons(
      items
        .filter(isValidMedia)
        .filter((m) => !isExcludedTitle(m.title))
        .filter(hasPosterAndVideo)
    )
  ).map((item) => ({
    ...item,
    poster: getMediaPoster(item),
    backdrop: getMediaBackdrop(item),
    description: item.description || '',
    rating: typeof item.rating === 'number' ? item.rating : undefined,
    year: item.year || new Date().getFullYear(),
    genre: Array.isArray(item.genre)
      ? item.genre
      : typeof (item.genre as unknown) === 'string' && item.genre
        ? (item.genre as unknown as string)
            .split(/[,|]/)
            .map((g: string) => g.trim())
            .filter(Boolean)
        : [],
    stars: Array.isArray(item.stars) ? item.stars : [],
  }));
}

/**
 * Sanitize a raw TMDB API response item.
 * Returns null if invalid.
 */
export function sanitizeTMDBItem(item: any, type: 'movie' | 'series'): any | null {
  if (!item) return null;
  if (!item.id) return null;
  if (type === 'movie' && !item.title) return null;
  if (type === 'series' && !item.name && !item.title) return null;

  return {
    ...item,
    poster_path: item.poster_path || null,
    backdrop_path: item.backdrop_path || null,
    overview: item.overview || '',
    vote_average: typeof item.vote_average === 'number' ? item.vote_average : 0,
  };
}

/**
 * Get display text for media duration/seasons
 */
export function getMediaDuration(media: Media): string {
  if (media.duration) return media.duration;
  if (media.type === 'series' && media.seasons && media.seasons > 0) {
    return `${media.seasons} Temp.`;
  }
  return media.type === 'movie' ? 'Filme' : 'Série';
}

/**
 * Detectar plataforma/fonte a partir da URL de stream.
 * Retorna nome legível ou null se não identificável.
 */
export function detectPlatformFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // CDN / IPTV providers
    if (hostname.includes('cdnapp') || hostname.includes('cdn.app')) return 'CDN App';
    if (hostname.includes('xtream') || hostname.includes('xstream')) return 'Xtream';
    if (hostname.includes('iptv')) return 'IPTV';
    if (hostname.includes('m3u')) return 'IPTV';
    // Cloud storage
    if (hostname.includes('supabase')) return 'Supabase';
    if (hostname.includes('cloudflare') || hostname.includes('r2.dev')) return 'Cloudflare';
    if (hostname.includes('amazonaws') || hostname.includes('s3.')) return 'AWS S3';
    if (hostname.includes('storage.googleapis')) return 'GCS';
    if (hostname.includes('blob.core.windows')) return 'Azure';
    // Streaming
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'YouTube';
    if (hostname.includes('vimeo')) return 'Vimeo';
    if (hostname.includes('dailymotion')) return 'Dailymotion';
    // Generic patterns
    if (hostname.includes('stream') || hostname.includes('vod')) return 'VOD';
    if (hostname.includes('api.')) return 'API Stream';
    // Fallback: pegar domínio base (2 últimas partes)
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const domain = parts.slice(-2).join('.');
      return domain;
    }
    return 'Desconhecido';
  } catch {
    // URL inválida
    if (url.startsWith('/') || url.startsWith('./')) return 'Local';
    return null;
  }
}
