import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parseDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed
        .slice(0, eq)
        .replace(/^export\s+/, '')
        .trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    });
    return out;
  } catch {
    return {};
  }
}

function loadEnv() {
  const candidates = [
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env.development'),
    path.join(projectRoot, '.env'),
  ];

  let envFromFile = {};
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    envFromFile = { ...envFromFile, ...parseDotEnv(candidate) };
  }

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    envFromFile.SUPABASE_URL ||
    envFromFile.VITE_SUPABASE_URL;

  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    envFromFile.SUPABASE_ANON_KEY ||
    envFromFile.VITE_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    console.error(
      'Missing Supabase credentials. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
    process.exit(1);
  }

  return { url, anon };
}

function parseArgs(argv) {
  const options = {
    limit: 100,
    offset: 0,
    concurrency: 5,
    timeoutMs: 12000,
    table: 'all',
    all: false,
    verbose: false,
    report: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    const [flag, inlineValue] = arg.split('=');
    const value = inlineValue ?? next;
    const consumesNext = inlineValue == null;

    switch (flag) {
      case '--limit':
        options.limit = Number(value);
        if (consumesNext) i += 1;
        break;
      case '--offset':
        options.offset = Number(value);
        if (consumesNext) i += 1;
        break;
      case '--concurrency':
        options.concurrency = Number(value);
        if (consumesNext) i += 1;
        break;
      case '--timeout':
        options.timeoutMs = Number(value);
        if (consumesNext) i += 1;
        break;
      case '--table':
        options.table = String(value || 'all').toLowerCase();
        if (consumesNext) i += 1;
        break;
      case '--report':
        options.report = String(value || '');
        if (consumesNext) i += 1;
        break;
      default:
        break;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = 100;
  if (!Number.isFinite(options.offset) || options.offset < 0) options.offset = 0;
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) options.concurrency = 5;
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) options.timeoutMs = 12000;
  if (!['all', 'movies', 'episodes'].includes(options.table)) options.table = 'all';

  return options;
}

function printHelp() {
  console.log('Usage: node scripts/audit-vod-streams.mjs [options]');
  console.log('');
  console.log('Checks movie and episode stream_url values stored in Supabase.');
  console.log('Series rows are not tested directly because stream_url usually lives on episodes.');
  console.log('');
  console.log('Options:');
  console.log('  --table all|movies|episodes   Which dataset to test (default: all)');
  console.log('  --limit 100                   Number of rows to test per run (default: 100)');
  console.log('  --offset 0                    Offset for pagination windows (default: 0)');
  console.log(
    '  --all                         Scan every row with stream_url instead of using --limit'
  );
  console.log('  --concurrency 5               Parallel URL checks (default: 5)');
  console.log('  --timeout 12000               Timeout per URL in ms (default: 12000)');
  console.log('  --report reports/vod.json     Save full JSON report');
  console.log('  --verbose                     Print every checked row');
}

function normalizeUrl(rawUrl) {
  return String(rawUrl || '').trim();
}

function inferKind(url, contentType) {
  const lowerUrl = String(url || '').toLowerCase();
  const lowerType = String(contentType || '').toLowerCase();

  if (lowerType.includes('video/')) return 'video';
  if (lowerType.includes('application/octet-stream')) return 'video';
  if (
    lowerType.includes('application/vnd.apple.mpegurl') ||
    lowerType.includes('application/x-mpegurl')
  )
    return 'hls';
  if (lowerType.includes('application/dash+xml')) return 'dash';
  if (/\.(mp4|m4v|mov|webm|ogg|ogv)(?:[?#].*)?$/.test(lowerUrl)) return 'video';
  if (/\.m3u8(?:[?#].*)?$/.test(lowerUrl)) return 'hls';
  if (/\.mpd(?:[?#].*)?$/.test(lowerUrl)) return 'dash';
  if (lowerType.includes('text/html')) return 'html';
  return 'unknown';
}

function classifyProbe(status, kind) {
  if (status >= 200 && status < 300) {
    if (kind === 'video' || kind === 'hls' || kind === 'dash') return 'ok';
    if (kind === 'html') return 'invalid_content';
    return 'unknown_content';
  }
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400) return 'http_error';
  return 'unknown_error';
}

async function probeUrl(url, timeoutMs) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return {
      ok: false,
      status: 0,
      kind: 'empty',
      classification: 'missing_url',
      contentType: '',
      finalUrl: normalizedUrl,
      error: 'Missing stream_url',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-0',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const kind = inferKind(response.url || normalizedUrl, contentType);
    const classification = classifyProbe(response.status, kind);

    return {
      ok: classification === 'ok',
      status: response.status,
      kind,
      classification,
      contentType,
      finalUrl: response.url || normalizedUrl,
      error: '',
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      kind: 'network_error',
      classification: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      contentType: '',
      finalUrl: normalizedUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchPagedRows(queryBuilder, pageSize, maxRows) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder.range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);

    if (data.length < pageSize) break;
    if (rows.length >= maxRows) break;
    from += pageSize;
  }

  return rows.slice(0, maxRows);
}

async function fetchMovies(supabase, options) {
  const pageSize = Math.min(options.all ? 1000 : Math.max(options.limit, 100), 1000);
  const maxRows = options.all ? Number.MAX_SAFE_INTEGER : options.offset + options.limit;
  const query = supabase
    .from('movies')
    .select('id, title, tmdb_id, stream_url')
    .not('stream_url', 'is', null)
    .order('id', { ascending: false });

  const rows = await fetchPagedRows(query, pageSize, maxRows);
  return rows.slice(options.offset, options.all ? rows.length : options.offset + options.limit);
}

async function fetchEpisodeMetadata(supabase) {
  const [seasonsResult, seriesResult] = await Promise.all([
    fetchPagedRows(
      supabase
        .from('seasons')
        .select('id, series_id, season_number')
        .order('id', { ascending: true }),
      1000,
      Number.MAX_SAFE_INTEGER
    ),
    fetchPagedRows(
      supabase.from('series').select('id, title, tmdb_id').order('id', { ascending: true }),
      1000,
      Number.MAX_SAFE_INTEGER
    ),
  ]);

  const seasonMap = new Map();
  seasonsResult.forEach((row) => seasonMap.set(row.id, row));

  const seriesMap = new Map();
  seriesResult.forEach((row) => seriesMap.set(row.id, row));

  return { seasonMap, seriesMap };
}

async function fetchEpisodes(supabase, options) {
  const pageSize = Math.min(options.all ? 1000 : Math.max(options.limit, 100), 1000);
  const maxRows = options.all ? Number.MAX_SAFE_INTEGER : options.offset + options.limit;
  const query = supabase
    .from('episodes')
    .select('id, title, episode_number, season_id, stream_url')
    .not('stream_url', 'is', null)
    .order('id', { ascending: false });

  const rows = await fetchPagedRows(query, pageSize, maxRows);
  return rows.slice(options.offset, options.all ? rows.length : options.offset + options.limit);
}

function normalizeMovie(row) {
  return {
    table: 'movies',
    id: row.id,
    title: row.title || 'Untitled movie',
    stream_url: normalizeUrl(row.stream_url),
    tmdb_id: row.tmdb_id || null,
    label: row.title || 'Untitled movie',
  };
}

function normalizeEpisode(row, metadata) {
  const season = metadata.seasonMap.get(row.season_id);
  const series = season ? metadata.seriesMap.get(season.series_id) : null;
  const seasonNumber = season?.season_number ?? '?';
  const episodeNumber = row.episode_number ?? '?';
  const seriesTitle = series?.title || 'Unknown series';

  return {
    table: 'episodes',
    id: row.id,
    title: row.title || 'Untitled episode',
    stream_url: normalizeUrl(row.stream_url),
    tmdb_id: series?.tmdb_id || null,
    label:
      seriesTitle +
      ' S' +
      seasonNumber +
      'E' +
      episodeNumber +
      ' - ' +
      (row.title || 'Untitled episode'),
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function next() {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    await next();
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

function summarize(results) {
  const summary = {
    tested: results.length,
    ok: 0,
    failed: 0,
    byTable: {},
    byClassification: {},
  };

  results.forEach((result) => {
    const tableBucket = summary.byTable[result.table] || { tested: 0, ok: 0, failed: 0 };
    tableBucket.tested += 1;
    if (result.ok) {
      summary.ok += 1;
      tableBucket.ok += 1;
    } else {
      summary.failed += 1;
      tableBucket.failed += 1;
    }
    summary.byTable[result.table] = tableBucket;
    summary.byClassification[result.classification] =
      (summary.byClassification[result.classification] || 0) + 1;
  });

  return summary;
}

function printSummary(summary, failures) {
  console.log('=== VOD stream audit ===');
  console.log('Tested: ' + summary.tested);
  console.log('OK:     ' + summary.ok);
  console.log('Failed: ' + summary.failed);
  console.log('');
  console.log('By table:');
  Object.entries(summary.byTable).forEach(([table, bucket]) => {
    console.log(
      '- ' + table + ': tested=' + bucket.tested + ' ok=' + bucket.ok + ' failed=' + bucket.failed
    );
  });
  console.log('');
  console.log('By classification:');
  Object.entries(summary.byClassification)
    .sort((a, b) => b[1] - a[1])
    .forEach(([classification, count]) => {
      console.log('- ' + classification + ': ' + count);
    });

  if (failures.length > 0) {
    console.log('');
    console.log('First failures:');
    failures.slice(0, 20).forEach((failure) => {
      console.log('- [' + failure.table + '] ' + failure.label);
      console.log(
        '  status=' + failure.status + ' class=' + failure.classification + ' kind=' + failure.kind
      );
      console.log('  contentType=' + (failure.contentType || '(empty)'));
      console.log('  url=' + failure.stream_url);
      if (failure.error) console.log('  error=' + failure.error);
    });
  }
}

function saveReport(reportPath, payload) {
  const resolvedPath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(projectRoot, reportPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('');
  console.log('Report saved to ' + resolvedPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const { url, anon } = loadEnv();
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const includeMovies = options.table === 'all' || options.table === 'movies';
  const includeEpisodes = options.table === 'all' || options.table === 'episodes';

  const [movieRows, episodeRows, episodeMetadata] = await Promise.all([
    includeMovies ? fetchMovies(supabase, options) : Promise.resolve([]),
    includeEpisodes ? fetchEpisodes(supabase, options) : Promise.resolve([]),
    includeEpisodes
      ? fetchEpisodeMetadata(supabase)
      : Promise.resolve({ seasonMap: new Map(), seriesMap: new Map() }),
  ]);

  const targets = [
    ...movieRows.map(normalizeMovie),
    ...episodeRows.map((row) => normalizeEpisode(row, episodeMetadata)),
  ];

  if (targets.length === 0) {
    console.log('No stream_url rows found for the selected scope.');
    return;
  }

  console.log(
    'Preparing to test ' +
      targets.length +
      ' rows with concurrency=' +
      options.concurrency +
      ' timeout=' +
      options.timeoutMs +
      'ms'
  );

  const results = await runPool(targets, options.concurrency, async (target, index) => {
    const probe = await probeUrl(target.stream_url, options.timeoutMs);
    const result = {
      index,
      ...target,
      ...probe,
    };

    if (options.verbose) {
      console.log(
        '[' +
          (index + 1) +
          '/' +
          targets.length +
          '] ' +
          target.label +
          ' -> ' +
          result.classification +
          ' (' +
          result.status +
          ')'
      );
    }

    return result;
  });

  const summary = summarize(results);
  const failures = results.filter((result) => !result.ok);
  printSummary(summary, failures);

  if (options.report) {
    saveReport(options.report, {
      generatedAt: new Date().toISOString(),
      options,
      summary,
      failures,
      results,
    });
  }
}

main().catch((error) => {
  console.error('Unexpected error while auditing VOD streams:', error);
  process.exit(1);
});
