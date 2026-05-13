import type { Media } from '../types';
import type { Movie, Series } from '../services/supabaseService';

/**
 * utils/mediaMapper.ts
 *
 * Mapper centralizado: converte Movie/Series do Supabase
 * para o tipo unificado Media usado em toda a UI.
 *
 * Benefícios:
 * - Fonte única de verdade para conversão DB → UI
 * - Facilita mudar schema sem tocar em dezenas de componentes
 * - Garante campos obrigatórios preenchidos com fallback seguro
 */

/** Converte um registro Movie do Supabase para Media */
export function movieToMedia(movie: Movie): Media {
  return {
    id: movie.id,
    tmdb_id: movie.tmdb_id,
    title: movie.title,
    type: 'movie',
    description: movie.description,
    rating: movie.rating,
    year: movie.year,
    genre: movie.genre,
    backdrop: movie.backdrop,
    poster: movie.poster,
    logo_url: movie.logo_url,
    stream_url: movie.stream_url,
    trailer_url: movie.trailer_url,
    use_trailer: movie.use_trailer,
    platform: movie.platform,
    status: movie.status,
  };
}

/** Converte um registro Series do Supabase para Media */
export function seriesToMedia(series: Series): Media {
  return {
    id: series.id,
    tmdb_id: series.tmdb_id,
    title: series.title,
    type: 'series',
    description: series.description,
    rating: series.rating,
    year: series.year,
    genre: series.genre,
    backdrop: series.backdrop,
    poster: series.poster,
    logo_url: series.logo_url,
    stream_url: series.stream_url,
    trailer_url: series.trailer_url,
    use_trailer: series.use_trailer,
    platform: series.platform,
    status: series.status,
    seasons: series.seasons_count,
  };
}

/** Converte arrays de Movie[] + Series[] → Media[] unificado */
export function toMediaList(movies: Movie[], series: Series[]): Media[] {
  const mappedMovies = movies.map(movieToMedia);
  const mappedSeries = series.map(seriesToMedia);
  return [...mappedMovies, ...mappedSeries];
}

/** Agrupa Media[] por gênero → { [genre]: Media[] } */
export function groupByGenre(items: Media[]): Record<string, Media[]> {
  const groups: Record<string, Media[]> = {};
  for (const item of items) {
    if (!item.genre?.length) continue;
    for (const g of item.genre) {
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    }
  }
  return groups;
}
