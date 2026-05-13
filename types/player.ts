/**
 * types/player.ts
 * Tipos do Player de vídeo — HLS tracks + TMDB-specific types para o Player.
 *
 * NOTA SOBRE DUPLICAÇÃO INTENCIONAL:
 * - `CastMember`, `Episode`, `Season` de types.ts são tipos do domínio da app (DB + TMDB mesclados).
 * - Os tipos abaixo são específicos do Player: Season/Episode vêm da API TMDB (id: number),
 *   enquanto em types.ts id: string (UUID do Supabase). Não unificar — são contextos diferentes.
 */

// Re-exporta tipos compartilhados de tipos.ts para evitar imports duplicados em componentes player
export type { CastMember, CrewMember, Video, SimilarSeries } from '../types';

/** Faixa de áudio retornada pelo HLS.js (audioTracks) */
export interface AudioTrack {
  id: number;
  name: string;
  lang: string;
  groupId?: string;
  default?: boolean;
}

/** Faixa de legenda/subtitle retornada pelo HLS.js (subtitleTracks) */
export interface SubtitleTrack {
  id: number;
  name: string;
  lang?: string;
  forced?: boolean;
  default?: boolean;
}

/** Nível de qualidade (rendition) retornado pelo HLS.js manifest */
export interface QualityLevel {
  /** Altura em pixels (ex.: 1080, 720, 480, 360) */
  height: number;
  /** Largura em pixels */
  width?: number;
  /** Bitrate em bps */
  bitrate?: number;
  /** Codec de vídeo */
  videoCodec?: string;
}

/** Temporada de série como retornada pela API TMDB (id numérico TMDB, não UUID do DB) */
export interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date?: string | null;
  poster_path?: string | null;
}

/** Episódio de série como retornado pela API TMDB */
export interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
  air_date?: string | null;
  runtime?: number | null;
  /** URL do stream (do Supabase) — pode estar ausente */
  stream_url?: string;
}

/**
 * @deprecated Use TmdbSeason. Mantido por compatibilidade com imports existentes.
 * Remover após migrar Player.tsx.
 */
export type Season = TmdbSeason;

/**
 * @deprecated Use TmdbEpisode. Mantido por compatibilidade com imports existentes.
 * Remover após migrar Player.tsx.
 */
export type Episode = TmdbEpisode;
