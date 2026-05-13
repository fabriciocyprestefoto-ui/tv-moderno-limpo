import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const PAGE_SIZE = 1000;

const URL_FIELD_KEYS = [
  'stream_url',
  'streamUrl',
  'video_url',
  'videoUrl',
  'source_url',
  'sourceUrl',
  'play_url',
  'playUrl',
  'm3u8_url',
  'file_url',
  'url',
  'link',
];

const FAKE_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.org',
  'invalid',
  'domain.invalid',
]);

function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }

  return env;
}

function isPlaceholderOrFakeStreamUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return true;

  const low = raw.toLowerCase();
  if (!low.startsWith('http')) return true;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (FAKE_HOSTS.has(host)) return true;
    if (host.endsWith('.example.com') || host.endsWith('.example.org')) return true;
  } catch {
    return true;
  }

  if (low.includes('example.com/') || low.includes('example.org/')) return true;
  if (low.includes('undefined') || low.includes('null')) return true;
  if (low.includes('indisponivel') || low.includes('indisponível')) return true;

  return false;
}

function pickFirstRealStreamUrlFromRow(row) {
  if (!row || typeof row !== 'object') return '';

  for (const key of URL_FIELD_KEYS) {
    const value = row[key];
    if (typeof value !== 'string') continue;
    const cleaned = value.trim();
    if (!cleaned || cleaned.length <= 5) continue;
    if (isPlaceholderOrFakeStreamUrl(cleaned)) continue;
    return cleaned;
  }

  return '';
}

function hasPlayableUrl(row) {
  return pickFirstRealStreamUrlFromRow(row).length > 0;
}

function normalizeGenres(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    return value
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isKidsLike(row) {
  if (row?.kids === true) return true;
  return normalizeGenres(row?.genre).some((genre) => {
    const low = String(genre || '').toLowerCase();
    return (
      low.includes('anim') ||
      low.includes('infant') ||
      low.includes('kids') ||
      low.includes('family') ||
      low.includes('famíl') ||
      low.includes('famil') ||
      low.includes('adventure') ||
      low.includes('aventur')
    );
  });
}

async function fetchAllRows(supabase, table) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from(table).select('*').range(from, to);
    if (error) {
      throw new Error(`[${table}] ${error.message}`);
    }

    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchAllCatalogMovies(supabase) {
  return fetchAllRows(supabase, 'movies');
}

async function fetchAllCatalogSeries(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .not('tmdb_id', 'is', null)
      .not('poster', 'is', null)
      .gt('seasons_count', 0)
      .range(from, to);

    if (error) {
      throw new Error(`[series-catalog] ${error.message}`);
    }

    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function buildSeriesIndexes(seasons, episodes) {
  const seasonIdsBySeriesId = new Map();
  const playableEpisodeCountBySeriesId = new Map();
  const totalEpisodeCountBySeriesId = new Map();

  for (const season of seasons) {
    const seriesId = String(season?.series_id || '').trim();
    const seasonId = String(season?.id || '').trim();
    if (!seriesId || !seasonId) continue;
    const list = seasonIdsBySeriesId.get(seriesId) || [];
    list.push(seasonId);
    seasonIdsBySeriesId.set(seriesId, list);
  }

  const seriesIdBySeasonId = new Map();
  for (const [seriesId, seasonIds] of seasonIdsBySeriesId.entries()) {
    for (const seasonId of seasonIds) {
      seriesIdBySeasonId.set(seasonId, seriesId);
    }
  }

  for (const episode of episodes) {
    const seasonId = String(episode?.season_id || '').trim();
    const seriesId = seriesIdBySeasonId.get(seasonId);
    if (!seriesId) continue;

    totalEpisodeCountBySeriesId.set(seriesId, (totalEpisodeCountBySeriesId.get(seriesId) || 0) + 1);

    if (hasPlayableUrl(episode)) {
      playableEpisodeCountBySeriesId.set(
        seriesId,
        (playableEpisodeCountBySeriesId.get(seriesId) || 0) + 1
      );
    }
  }

  return {
    seasonIdsBySeriesId,
    playableEpisodeCountBySeriesId,
    totalEpisodeCountBySeriesId,
  };
}

function dedupeByIdentity(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${String(item?.id || '')}::${String(item?.title || '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeProblemItem(row, extra = {}) {
  return {
    id: String(row?.id || ''),
    title: String(row?.title || row?.name || ''),
    tmdb_id: row?.tmdb_id ?? null,
    seasons_count: Number(row?.seasons_count || row?.seasons || 0) || 0,
    genre: normalizeGenres(row?.genre),
    ...extra,
  };
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Arquivo .env não encontrado em ${ENV_PATH}`);
  }

  const env = parseEnvFile(ENV_PATH);
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes no .env');
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [movies, series, seasons, episodes] = await Promise.all([
    fetchAllCatalogMovies(supabase),
    fetchAllCatalogSeries(supabase),
    fetchAllRows(supabase, 'seasons'),
    fetchAllRows(supabase, 'episodes'),
  ]);

  const { seasonIdsBySeriesId, playableEpisodeCountBySeriesId, totalEpisodeCountBySeriesId } =
    buildSeriesIndexes(seasons, episodes);

  const movieProblems = [];
  const seriesProblems = [];
  const seriesDirectOnly = [];
  const seriesEpisodeOnly = [];
  const kidsProblems = [];

  let directMovieCount = 0;
  let directSeriesCount = 0;
  let episodeBackedSeriesCount = 0;

  for (const movie of movies) {
    const directUrl = pickFirstRealStreamUrlFromRow(movie);
    const isProblem = !directUrl;

    if (directUrl) {
      directMovieCount += 1;
    } else {
      movieProblems.push(
        summarizeProblemItem(movie, {
          reason: 'movie_without_direct_stream',
        })
      );
    }

    if (isProblem && isKidsLike(movie)) {
      kidsProblems.push(
        summarizeProblemItem(movie, {
          type: 'movie',
          reason: 'kids_movie_without_direct_stream',
        })
      );
    }
  }

  for (const item of series) {
    const seriesId = String(item?.id || '').trim();
    const directUrl = pickFirstRealStreamUrlFromRow(item);
    const seasonIds = seasonIdsBySeriesId.get(seriesId) || [];
    const playableEpisodeCount = playableEpisodeCountBySeriesId.get(seriesId) || 0;
    const totalEpisodeCount = totalEpisodeCountBySeriesId.get(seriesId) || 0;
    const declaredSeasons = Number(item?.seasons_count || item?.seasons || 0) || 0;

    if (directUrl) {
      directSeriesCount += 1;
      if (declaredSeasons > 0 && seasonIds.length === 0) {
        seriesDirectOnly.push(
          summarizeProblemItem(item, {
            reason: 'series_has_direct_stream_but_no_season_rows',
            playable_episode_count: playableEpisodeCount,
            total_episode_count: totalEpisodeCount,
          })
        );
      }
      continue;
    }

    if (playableEpisodeCount > 0) {
      episodeBackedSeriesCount += 1;
      seriesEpisodeOnly.push(
        summarizeProblemItem(item, {
          reason: 'series_without_direct_stream_but_with_playable_episodes',
          playable_episode_count: playableEpisodeCount,
          total_episode_count: totalEpisodeCount,
        })
      );
      continue;
    }

    const reason =
      declaredSeasons > 0 && seasonIds.length === 0
        ? 'series_without_direct_stream_and_without_season_rows'
        : totalEpisodeCount > 0
          ? 'series_without_direct_stream_and_without_playable_episodes'
          : 'series_without_direct_stream_and_without_episode_data';

    const problem = summarizeProblemItem(item, {
      reason,
      playable_episode_count: playableEpisodeCount,
      total_episode_count: totalEpisodeCount,
      season_rows: seasonIds.length,
    });

    seriesProblems.push(problem);

    if (isKidsLike(item)) {
      kidsProblems.push({
        ...problem,
        type: 'series',
      });
    }
  }

  const normalizedMovieProblems = dedupeByIdentity(movieProblems);
  const normalizedSeriesProblems = dedupeByIdentity(seriesProblems);
  const normalizedKidsProblems = dedupeByIdentity(kidsProblems);
  const normalizedSeriesDirectOnly = dedupeByIdentity(seriesDirectOnly);
  const normalizedSeriesEpisodeOnly = dedupeByIdentity(seriesEpisodeOnly);

  const kidsTotal =
    dedupeByIdentity(movies.filter(isKidsLike)).length +
    dedupeByIdentity(series.filter(isKidsLike)).length;

  const summary = {
    movies: {
      total: movies.length,
      with_direct_stream: directMovieCount,
      without_direct_stream: normalizedMovieProblems.length,
    },
    series: {
      total: series.length,
      with_direct_stream: directSeriesCount,
      playable_via_episodes_only: episodeBackedSeriesCount,
      likely_to_fail_primary_play: normalizedSeriesProblems.length,
      direct_only_without_season_rows: normalizedSeriesDirectOnly.length,
    },
    kids: {
      total: kidsTotal,
      likely_to_fail_primary_play: normalizedKidsProblems.length,
    },
    raw_tables: {
      seasons: seasons.length,
      episodes: episodes.length,
    },
  };

  console.log(
    JSON.stringify(
      {
        summary,
        movieProblems: normalizedMovieProblems,
        seriesProblems: normalizedSeriesProblems,
        kidsProblems: normalizedKidsProblems,
        seriesDirectOnly: normalizedSeriesDirectOnly,
        seriesEpisodeOnly: normalizedSeriesEpisodeOnly,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
