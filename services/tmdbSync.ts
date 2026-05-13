/**
 * tmdbSync.ts — Auto-Cura de IDs TMDB errados
 * ═══════════════════════════════════════════════════════════
 * Se um tmdb_id retorna 404/erro, busca pelo nome no TMDB,
 * corrige o ID no Supabase e retorna os dados corretos.
 * ═══════════════════════════════════════════════════════════
 */

import { supabase } from './supabaseService';
import { fetchDetails, getImageUrl } from './tmdb';
import { Media } from '../types';
import { getFetchOptions } from './tmdbKeys';

const BASE_URL = 'https://api.themoviedb.org/3';

/** ETAPA 6 — Títulos em PT que falham na busca TMDB → ID correto */
const TITLE_TO_TMDB_ID: Record<string, number> = {
  'bob esponja: o incrível resgate': 400160,
  'bob esponja o incrível resgate': 400160,
  'bob esponja - o incrível resgate': 400160,
  luca: 508943,
};

const TRAILER_OVERRIDES: Record<number, string> = {
  2288: 'AWMW7a_5VHM', // Prison Break
  37680: 'k13aNEQKawA', // Suits
  21510: 'c5iVTy-GuJ0', // White Collar
  1396: '0FfGm0Y4G8M', // Breaking Bad
  44217: '9GgxinPwAGc', // Vikings
  1405: '0g5T2zL_5rg', // Dexter
  2691: 'HzY9B5G4WHo', // Two and a Half Men
  119051: 'f6wgSkW7giQ', // Wandinha
  223530: 'W3wwRspWEEg', // Star Trek: Starfleet Academy
};

/** Normaliza resposta raw do TMDB para formato esperado pelo MediaCard (logo, backdrop, trailer) */
function normalizeDetails(data: any, tmdbId?: number): any {
  if (!data || data.status_code) return null;
  const id = tmdbId ?? data.id;
  const logo =
    data.images?.logos?.find((l: any) => l.iso_639_1 === 'pt-BR') ||
    data.images?.logos?.find((l: any) => l.iso_639_1 === 'pt') ||
    data.images?.logos?.find((l: any) => l.iso_639_1 === 'en') ||
    data.images?.logos?.find((l: any) => l.iso_639_1 === null);
  const trailerObj = data.videos?.results?.find(
    (v: any) => v.type === 'Trailer' && v.site === 'YouTube'
  );
  const trailer = (id && TRAILER_OVERRIDES[id]) || trailerObj?.key;
  const poster =
    getImageUrl(data.poster_path, 'w500') ||
    (data.backdrop_path ? getImageUrl(data.backdrop_path, 'w780') : undefined);
  return {
    backdrop: getImageUrl(data.backdrop_path, 'w1280'),
    poster,
    logo: logo ? getImageUrl(logo.file_path, 'original', 'logo') : undefined,
    trailer,
    description: data.overview,
    year:
      data.release_date || data.first_air_date
        ? new Date(data.release_date || data.first_air_date).getFullYear()
        : undefined,
    rating: data.vote_average?.toFixed?.(1),
  };
}

const fetchOptions = () => getFetchOptions();

/**
 * Busca detalhes no TMDB com Auto-Cura.
 * Se o tmdb_id falhar, busca pelo título, corrige no banco e retorna.
 */
async function getOrFixDetails(localItem: any, type: 'movie' | 'tv'): Promise<any | null> {
  if (!localItem) return null;
  const tmdbId = localItem.tmdb_id || localItem.id;

  // 1. Tenta busca normal pelo ID
  if (tmdbId && Number(tmdbId) > 0) {
    try {
      const raw = await fetchDetails(Number(tmdbId), type);
      if (raw && !raw.status_code) {
        return normalizeDetails(raw, Number(tmdbId));
      }
    } catch (e) {
      console.warn(`[Auto-Heal] ID ${tmdbId} falhou para "${localItem.title}".`);
    }
  }

  // 2. Auto-Cura: busca por nome no TMDB (ou ID conhecido ETAPA 6)
  const searchName = localItem.title || localItem.name;
  if (!searchName) return null;

  const titleKey = searchName.toLowerCase().trim();
  const normalizedKey = titleKey
    .replace(/[:\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const knownId = TITLE_TO_TMDB_ID[titleKey] || TITLE_TO_TMDB_ID[normalizedKey];
  if (knownId) {
    try {
      const raw = await fetchDetails(knownId, type);
      if (raw && !raw.status_code) {
        const details = normalizeDetails(raw, knownId);
        if (details) {
          const table = type === 'movie' ? 'movies' : 'series';
          await supabase
            .from(table)
            .update({ tmdb_id: knownId, poster: details.poster, backdrop: details.backdrop })
            .eq('id', localItem.id);
          return details;
        }
      }
    } catch (e) {
      console.warn(`[Auto-Heal] ID conhecido ${knownId} falhou para "${searchName}".`);
    }
  }

  console.log(`[Auto-Heal] Corrigindo: "${searchName}" (ID antigo: ${tmdbId})`);
  try {
    const endpoint = type === 'movie' ? 'movie' : 'tv';
    const res = await fetch(
      `${BASE_URL}/search/${endpoint}?query=${encodeURIComponent(searchName)}&language=pt-BR&page=1`,
      fetchOptions()
    );
    if (!res.ok) return null;
    const data = await res.json();

    const correct = data.results?.[0];
    if (!correct) {
      console.warn(`[Auto-Heal] Nenhum resultado TMDB para "${searchName}"`);
      return null;
    }

    // 3. Corrige o ID no Supabase para não precisar buscar de novo
    const table = type === 'movie' ? 'movies' : 'series';
    const updatePayload: any = { tmdb_id: correct.id };
    if (correct.poster_path) updatePayload.poster = getImageUrl(correct.poster_path, 'w500');
    else if (correct.backdrop_path)
      updatePayload.poster = getImageUrl(correct.backdrop_path, 'w780');
    if (correct.backdrop_path) updatePayload.backdrop = getImageUrl(correct.backdrop_path, 'w1280');
    if (correct.overview) updatePayload.description = correct.overview;

    const { error: updateError } = await supabase
      .from(table)
      .update(updatePayload)
      .eq('id', localItem.id);

    if (updateError) {
      console.warn(`[Auto-Heal] Erro ao atualizar DB:`, updateError);
    } else {
      console.log(`[Auto-Heal] ✅ Corrigido "${searchName}": ${tmdbId} → ${correct.id}`);
    }

    // 4. Retorna os detalhes normalizados com o ID correto
    const raw = await fetchDetails(correct.id, type);
    return raw ? normalizeDetails(raw, correct.id) : null;
  } catch (err) {
    console.error(`[Auto-Heal] Falha total para "${searchName}":`, err);
    return null;
  }
}

/**
 * Versão enriquecida do getMediaDetailsByID com auto-cura
 */
async function getDetailsWithHeal(media: Media): Promise<any | null> {
  const type = media.type === 'series' ? 'tv' : 'movie';
  return getOrFixDetails(media, type);
}

// ─── Export ──────────────────────────────────────────────────
export { getOrFixDetails, getDetailsWithHeal };
export default { getOrFixDetails, getDetailsWithHeal };
