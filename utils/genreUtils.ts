/**
 * genreUtils.ts — Classificação correta de gêneros para o projeto
 * Garante que conteúdo infantil mostre apenas o que é adequado para crianças.
 */

import { Media } from '../types';
import { stripDiacriticsSafe } from './safeUnicodeNormalize';

/** Gêneros que indicam conteúdo adequado para crianças (pt-BR e en do TMDB) */
export const TMDB_KIDS_GENRE_IDS = [16, 10751, 10762] as const;
export const TMDB_NON_KIDS_GENRE_IDS = [27, 80, 99, 9648, 10763, 10764, 10766, 10768] as const;

export const KIDS_SAFE_GENRES = [
  'Animação',
  'Animation',
  'Família',
  'Family',
  'Kids',
  'Infantil',
  'Desenho',
  'Cartoon',
  'Crianças',
  'Children',
  'Juvenil',
  'Teen',
  'Anime',
] as const;

/** Gêneros que indicam conteúdo NÃO adequado para crianças — excluir sempre.
 *  NOTA: Drama, Comédia, Aventura etc. coexistem normalmente com animações kids,
 *  por isso ficam fora desta lista. Somente gêneros 18+ ou violentos são bloqueantes. */
export const ADULT_GENRES = [
  'Terror',
  'Horror',
  'Crime',
  'Thriller',
  'Suspense',
  'Guerra',
  'War',
  'Talk Show',
  'News',
  'Notícias',
  'Soap',
  'Novela',
  'Policial',
  'Politica',
  'Politics',
] as const;

/** Normaliza nome de gênero para comparação (lowercase, sem acentos) */
function normalizeGenre(g: string): string {
  return stripDiacriticsSafe(String(g || '').toLowerCase()).trim();
}

/** Verifica se o gênero está na lista (comparação normalizada, aceita pt-BR e en) */
function genreMatches(genre: string, list: readonly string[]): boolean {
  const n = normalizeGenre(genre);
  if (!n) return false;
  return list.some((item) => {
    const ni = normalizeGenre(item);
    return n === ni || n.includes(ni) || ni.includes(n);
  });
}

/** Mapeamento en→pt-BR para gêneros do TMDB. Normaliza para exibição consistente. */
export const GENRE_EN_TO_PT: Record<string, string> = {
  Animation: 'Animação',
  Family: 'Família',
  Kids: 'Infantil',
  Comedy: 'Comédia',
  Adventure: 'Aventura',
  Fantasy: 'Fantasia',
  Action: 'Ação',
  Drama: 'Drama',
  Horror: 'Terror',
  Thriller: 'Suspense',
  Crime: 'Crime',
  'Sci-Fi': 'Ficção Científica',
  'Science Fiction': 'Ficção Científica',
  Romance: 'Romance',
  War: 'Guerra',
  Documentary: 'Documentário',
  Mystery: 'Mistério',
};

/** Converte gênero para pt-BR quando possível (para exibição consistente) */
export function genreToPtBr(genre: string): string {
  const trimmed = (genre || '').trim();
  return GENRE_EN_TO_PT[trimmed] ?? trimmed;
}

/**
 * Verifica se o conteúdo é adequado para a página Kids.
 * Regras: deve ter pelo menos um gênero kids-safe E não pode ter nenhum gênero adulto.
 * Se o item tiver flag `kids: true` no banco, considera kids mesmo sem gênero.
 */
export function isKidsContent(media: Media): boolean {
  // 1. Prioridade Máxima: Flag manual no banco de dados
  if (media.kids === true) return true;

  // 2. Bloqueio por idade indicativa (TMDB adult ou rating 18+)
  const ratingStr = String(media.rating || '').toUpperCase();
  if (ratingStr.includes('18') || (media as { adult?: boolean }).adult === true) return false;

  const genreIds = Array.isArray(media.genre_ids)
    ? media.genre_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];

  const genres = Array.isArray(media.genre) ? media.genre : [];

  // 3. Verificação de ID de Gêneros TMDB (Priorizando exclusão)
  if (genreIds.length > 0) {
    // Se tiver QUALQUER gênero bloqueante por ID, descarta imediatamente
    const hasForbiddenId = genreIds.some((id) =>
      (TMDB_NON_KIDS_GENRE_IDS as readonly number[]).includes(id)
    );
    if (hasForbiddenId) return false;

    // Se tiver gênero kids por ID (Animation/Family/Kids), aceita
    const hasKidsId = genreIds.some((id) => (TMDB_KIDS_GENRE_IDS as readonly number[]).includes(id));
    if (hasKidsId) return true;
  }

  // 4. Verificação de Gêneros por Texto (Priorizando exclusão)
  if (genres.length > 0) {
    // Se tiver gênero adulto estrito (Terror/Crime/Guerra/etc.), descarta
    const hasAdultText = genres.some((g) => genreMatches(g, ADULT_GENRES));
    if (hasAdultText) return false;

    // Precisa ter pelo menos um gênero kids-safe para ser aceito
    const hasKidsText = genres.some((g) => genreMatches(g, KIDS_SAFE_GENRES));
    if (hasKidsText) return true;
  }

  // Se não tem gêneros ou não bateu em nenhuma regra, por segurança não exibe no Kids
  return false;
}

/**
 * Filtra lista de Media para conteúdo kids-only.
 */
export function filterKidsContent(items: Media[]): Media[] {
  return items.filter(isKidsContent);
}
