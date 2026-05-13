export interface Media {
  id: string;
  tmdb_id?: number;
  title: string;
  original_title?: string; // Título original (ex: "Luca", "The SpongeBob Movie")
  type: 'movie' | 'series';
  /** Tipo bruto vindo de APIs/rotas legadas; `type` continua sendo o contrato normalizado. */
  media_type?: 'movie' | 'tv' | 'series' | string;
  description?: string;
  rating?: number;
  year?: number;
  release_date?: string; // Added
  first_air_date?: string; // Added for series
  duration?: string;
  genre?: string[];
  genre_ids?: number[]; // Added
  backdrop?: string;
  banner_url?: string;
  poster?: string;
  poster_path?: string | null; // Path raw do TMDB (ex: /abc.jpg)
  backdrop_path?: string | null; // Path raw do TMDB
  logo_url?: string;
  stream_url?: string;
  video_url?: string;
  source_url?: string;
  trailer_url?: string;
  use_trailer?: boolean;
  platform?: string; // Netflix, Prime, Disney, etc.
  status?: 'published' | 'draft';
  stars?: string[];
  director?: string;
  seasons?: number;
  trailer_key?: string;
  group_title?: string;
  provider_ids?: number[]; // IDs dos provedores (Netflix=8, Amazon=119, etc.)
  kids?: boolean; // Flag manual para conteúdo infantil
  /** Timestamp de inserção no banco — vem do Supabase como ISO 8601 */
  created_at?: string;
  /** Qualidade declarada do stream — evita parse de URL heurístico */
  quality?: 'SD' | 'HD' | '4K' | 'FHD';
  /** Vinheta de abertura no Player (ex.: `/kids.mp4` na página Kids — só cliente, não persiste no DB) */
  introVideoUrl?: string | null;
  /** Uso interno: a vinheta global já foi exibida antes de montar o Player. */
  skipIntro?: boolean;
  // ── Contexto de episódio (preenchido ao abrir episódio de série no Player) ──
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
  /** Episódios embutidos — fallback para séries sem tmdb_id */
  episodes?: Episode[];
}

export interface Channel {
  id?: string;
  name: string;
  logo: string;
  category: string;
  stream_url: string;
  number?: number;
  is_premium?: boolean;
  program?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
  avatarColor?: string;
  isKids: boolean;
  language?: string;
  // Controle Parental
  parentalRating?: string; // L, 10+, 12+, 14+, 16+, 18+
  parentalPin?: string; // PIN de 4 dígitos
  parentalEnabled?: boolean;
  autoPlayNext?: boolean;
  maturityLevel?: number; // 0=L, 10, 12, 14, 16, 18
  updated_at?: string;
  created_at?: string;
}

export enum Page {
  LOGIN = 'LOGIN',
  PROFILES = 'PROFILES',
  PLANS = 'PLANS',
  HOME = 'HOME',
  GENRES = 'GENRES',
  MOVIES = 'MOVIES',
  SERIES = 'SERIES',
  LIVE = 'LIVE',
  MY_LIST = 'MY_LIST',
  KIDS = 'KIDS',
  DETAILS = 'DETAILS',
  PLAYER = 'PLAYER',
  SEARCH = 'SEARCH',
  ADMIN = 'ADMIN',
  SETTINGS = 'SETTINGS',
  FUTEBOL = 'FUTEBOL',
  TEAM_DETAILS = 'TEAM_DETAILS',
  DEBUG = 'DEBUG',
  ADULTO = 'ADULTO',
}

// Interfaces adicionadas para o novo design VisionStream
export interface SeriesDetail {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  status?: string;
  original_language?: string;
  genres: { id: number; name: string }[];
  tagline?: string;
  popularity?: number;
  adult?: boolean;
  runtime?: number; // Para filmes
  title?: string; // Para filmes
  release_date?: string; // Para filmes
  seasons?: Season[];
  credits?: { cast: CastMember[]; crew: CrewMember[] };
  similar?: { results: SimilarSeries[] };
  videos?: { results: Video[] };
  trailerKey?: string;
  /** Presente quando detalhes são buscados com append_to_response=images */
  images?: {
    logos?: Array<{ file_path?: string | null; iso_639_1?: string | null; vote_count?: number }>;
  };
  production_companies?: Array<{ id?: number; name: string }>;
  homepage?: string | null;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order?: number;
  department?: string;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  profile_path: string | null;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  still_path: string | null;
  episode_number: number;
  season_number: number;
  air_date: string;
  vote_average: number;
  runtime?: number | null;
  stream_url?: string;
  video_url?: string;
  source_url?: string; // Do nosso DB
  title?: string; // Alias
  thumbnail?: string; // Alias
  description?: string; // Alias
}

export interface Season {
  id: string; // UUID do DB (use TmdbSeason de types/player.ts para IDs numéricos TMDB)
  name: string;
  season_number: number;
  poster_path?: string | null;
  episode_count?: number;
  air_date?: string | null;
  title?: string; // Alias
}

export interface SimilarSeries {
  id: number;
  name: string;
  title?: string; // Para filmes
  poster_path: string | null;
  vote_average: number;
  first_air_date?: string;
  media_type?: string;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface PersonDetail {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
}

export interface AppConfig {
  id?: string;
  maintenance_mode: boolean;
  min_version?: string;
  force_update?: boolean;
  announcement?: string;
  primary_color?: string;
  tmdb_enabled?: boolean;
}

export interface PaymentSettings {
  id?: string;
  gateway?: 'stripe' | 'mercadopago' | 'none';
  is_active: boolean;
  public_key?: string;
  monthly_price?: number;
  yearly_price?: number;
}

export interface HeroBannerAsset {
  backdrop: string;
  logo: string | null;
  trailerKey: string | null;
  description: string | null;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  description?: string;
  features?: string[];
}
