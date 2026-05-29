/**
 * catalogUtils.ts — Utilitarios compartilhados para processar listas de midia do catalogo.
 * Centraliza funcoes partilhadas pelo carregamento de catálogo (LegacyApp / useCatalogLoader).
 */

import { Media } from '../types';
import { stripDiacriticsSafe } from './safeUnicodeNormalize';

/**
 * Extrai o nome do arquivo de poster TMDB (ex: "abc123xyz.jpg").
 * Dois itens com o mesmo arquivo de poster são definitivamente o mesmo conteúdo.
 */
function extractPosterFile(url: string | null | undefined): string | null {
  if (!url) return null;
  // wsrv.nl encoded: ...%2Fabc123.jpg...
  const wsrv = url.match(/%2F([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))(?:%3F|&|$)/i);
  if (wsrv) return wsrv[1].toLowerCase();
  // URL direta: /t/p/w500/abc123.jpg
  const direct = url.match(/\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))(?:\?|$)/i);
  return direct ? direct[1].toLowerCase() : null;
}

/**
 * Remove duplicatas de uma lista de midia.
 * Prioriza dedupe por tmdb_id; sem tmdb_id usa titulo normalizado + tipo + ano.
 * Chave secundária: nome do arquivo de poster TMDB — dois itens com o mesmo poster
 * são definitivamente o mesmo conteúdo, mesmo que tenham tmdb_ids diferentes no DB.
 */
export const removeDuplicates = (mediaList: Media[]): Media[] => {
  const seen = new Set<string>();
  const normalizeTitle = (value: string | undefined): string =>
    stripDiacriticsSafe(String(value || ''))
      .toLowerCase()
      .trim();

  return mediaList.filter((m) => {
    const primaryKey = m.tmdb_id
      ? `tmdb:${m.type}:${m.tmdb_id}`
      : `fallback:${m.type}:${normalizeTitle(m.title)}:${m.year || 0}`;

    const posterFile = extractPosterFile(m.poster);
    const posterKey = posterFile ? `poster:${posterFile}` : null;

    if (seen.has(primaryKey) || (posterKey && seen.has(posterKey))) return false;

    seen.add(primaryKey);
    if (posterKey) seen.add(posterKey);
    return true;
  });
};

/** Normaliza genero para chave unica (remove acentos, pontuacao e variacoes EN/PT). */
export const normalizeGenreKey = (g: string): string =>
  stripDiacriticsSafe(g.trim().toLowerCase())
    .replace(/&/g, ' e ')
    .replace(/\band\b/g, 'e')
    .replace(/[/|]+/g, ' ')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ');

const normalizeTitleKey = (value: string | undefined): string =>
  stripDiacriticsSafe(String(value || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const mediaIdentityKey = (item: Media): string =>
  item.tmdb_id
    ? `tmdb:${item.type}:${item.tmdb_id}`
    : `fallback:${item.type}:${normalizeTitleKey(item.title)}:${item.year || 0}`;

/**
 * Organiza uma lista de midia por genero num Map.
 * Generos duplicados (ex: "Acao" e "acao") sao unificados e o conteudo mesclado.
 * Generos com menos de 8 itens sao ignorados.
 * O Map e ordenado por quantidade de itens (decrescente).
 */
export const organizeByGenre = (items: Media[]): Map<string, Media[]> => {
  const byNormalized = new Map<
    string,
    { displayName: string; itemIds: Set<string>; items: Media[] }
  >();

  items.forEach((item) => {
    let rawGenres: string[] = [];
    if (Array.isArray(item.genre)) {
      rawGenres = item.genre.map(String);
    } else if (typeof item.genre === 'string') {
      rawGenres = (item.genre as string)
        .split(/[,|]/)
        .map((g) => g.trim())
        .filter(Boolean);
    }

    rawGenres.forEach((g) => {
      const clean = g.trim();
      if (!clean || clean.length < 2) return;
      const norm = normalizeGenreKey(clean);
      if (!norm) return;
      if (!byNormalized.has(norm)) {
        // Tenta capitalizar bem o nome de exibição
        const display = clean
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        byNormalized.set(norm, { displayName: display, itemIds: new Set(), items: [] });
      }
      const bucket = byNormalized.get(norm)!;
      const identityKey = mediaIdentityKey(item);
      if (!bucket.itemIds.has(identityKey)) {
        bucket.itemIds.add(identityKey);
        bucket.items.push(item);
      }
    });
  });

  return new Map(
    Array.from(byNormalized.entries())
      .map(([, { displayName, items }]) => [displayName, items] as [string, Media[]])
      .filter(([, genreItems]) => genreItems.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
  );
};

/**
 * Comparador para ordenar midia por rating (decrescente).
 * Usado em Array.sort().
 */
export const sortByRating = (a: Media, b: Media): number => {
  const ra = parseFloat(String(a.rating || '0'));
  const rb = parseFloat(String(b.rating || '0'));
  return rb - ra;
};
