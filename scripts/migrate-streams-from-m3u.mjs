// migrate-streams-from-m3u.mjs
// Substitui stream_url no Supabase (movies, series, channels) usando o m3u local.
// Match por título normalizado. Apenas linhas existentes — não insere novas.
// Uso:
//   node scripts/migrate-streams-from-m3u.mjs            (dry-run, mostra plano)
//   node scripts/migrate-streams-from-m3u.mjs --apply    (executa PATCH no Supabase)

import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import process from 'node:process';

const APPLY = process.argv.includes('--apply');
const VOD_M3U_PATH = path.resolve(
  process.cwd(),
  'playlist_myfilmestest100_plus (1).m3u'
);
const CHAN_M3U_PATH = path.resolve(process.cwd(), 'playlist_fhd.m3u');

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || readEnv('VITE_SUPABASE_URL')).trim();
const SERVICE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY || readEnv('SUPABASE_SERVICE_ROLE_KEY')
).trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente. Verifique .env.');
  process.exit(1);
}

function readEnv(key) {
  try {
    const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    const m = envFile.match(new RegExp('^' + key + '=(.+)$', 'm'));
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

// ── Normalização ───────────────────────────────────────────────────────────
function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function normTitle(raw) {
  if (!raw) return '';
  let s = stripDiacritics(String(raw)).toLowerCase();
  // remove tags comuns
  s = s.replace(/\[(l|d|legendado|dublado|nacional|hd|fhd|sd|4k|uhd)\]/g, ' ');
  s = s.replace(/\b(4k|fhd|hd|sd|uhd|hevc|h265|h264|3d)\b/g, ' ');
  // remove ano entre parens ou final
  s = s.replace(/\((\d{4})\)/g, ' ');
  s = s.replace(/\b(19|20)\d{2}\b/g, ' ');
  // remove pontuação
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return s;
}
function seriesKey(raw) {
  // mantém SxxEyy
  if (!raw) return '';
  const m = String(raw).match(/s(\d{1,2})e(\d{1,3})/i);
  if (!m) return null;
  const base = normTitle(String(raw).replace(/s\d{1,2}e\d{1,3}.*$/i, ''));
  if (!base) return null;
  const s = String(parseInt(m[1], 10));
  const e = String(parseInt(m[2], 10));
  return `${base}::s${s}e${e}`;
}

// ── Parser M3U VOD (movies + series .mp4) ──────────────────────────────────
async function parseVodM3u(filePath) {
  const movies = new Map();       // normTitle → url
  const seriesEp = new Map();     // seriesKey → url
  const seriesByShow = new Map(); // show normTitle → primeira url

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let pendingMeta = null;
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const tvgName = (line.match(/tvg-name="([^"]+)"/) || [])[1] || '';
      const lastComma = line.lastIndexOf(',');
      const display = lastComma > -1 ? line.slice(lastComma + 1).trim() : '';
      pendingMeta = { tvgName, display };
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!pendingMeta) continue;
    const url = line;
    const meta = pendingMeta;
    pendingMeta = null;

    if (!url.endsWith('.mp4')) continue; // só VOD aqui (.mp4)
    if (url.includes('/movie/')) {
      const key = normTitle(meta.display || meta.tvgName);
      if (key && !movies.has(key)) movies.set(key, url);
    } else if (url.includes('/series/')) {
      const title = meta.display || meta.tvgName;
      const k = seriesKey(title);
      if (k && !seriesEp.has(k)) seriesEp.set(k, url);
      const base = normTitle(String(title).replace(/s\d{1,2}e\d{1,3}.*$/i, ''));
      if (base && !seriesByShow.has(base)) seriesByShow.set(base, url);
    }
  }
  return { movies, seriesEp, seriesByShow };
}

// ── Parser M3U Canais (.m3u8) ──────────────────────────────────────────────
async function parseChannelsM3u(filePath) {
  const byName = new Map();
  const byTvg = new Map();
  const tokensPool = [];

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let pendingMeta = null;
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const tvgName = (line.match(/tvg-name="([^"]+)"/) || [])[1] || '';
      const tvgId = (line.match(/tvg-id="([^"]+)"/) || [])[1] || '';
      const lastComma = line.lastIndexOf(',');
      const display = lastComma > -1 ? line.slice(lastComma + 1).trim() : '';
      pendingMeta = { tvgName, tvgId, display };
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!pendingMeta) continue;
    const url = line;
    const meta = pendingMeta;
    pendingMeta = null;

    if (!url.endsWith('.m3u8')) continue; // só canais .m3u8
    const k1 = normTitle(meta.display);
    const k2 = normTitle(meta.tvgName);
    const k3 = normTitle(meta.tvgId);
    if (k1 && !byName.has(k1)) byName.set(k1, url);
    if (k2 && !byTvg.has(k2)) byTvg.set(k2, url);
    if (k3 && !byTvg.has(k3)) byTvg.set(k3, url);
    const tokens = (k1 || k2 || k3).split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length) tokensPool.push({ tokens, url });
  }
  return { byName, byTvg, tokensPool };
}

// fuzzy channel match: token overlap score
function channelFuzzy(targetNorm, tokensPool) {
  const t = targetNorm.split(/\s+/).filter((x) => x.length >= 2);
  if (!t.length) return null;
  let best = null;
  let bestScore = 0;
  for (const c of tokensPool) {
    let s = 0;
    for (const tok of t) if (c.tokens.includes(tok)) s++;
    const need = Math.max(1, Math.min(t.length, c.tokens.length) * 0.5);
    if (s >= need && s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best?.url || null;
}

// ── Supabase helpers ────────────────────────────────────────────────────────
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function fetchAll(table, columns) {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${columns}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) {
      throw new Error(`${table} fetch ${res.status}: ${await res.text()}`);
    }
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function patchRow(table, id, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${table} ${id} ${res.status}: ${await res.text()}`);
  }
}

// ── Pipeline ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[vod-m3u] parsing ${VOD_M3U_PATH} …`);
  const {
    movies: m3uMovies,
    seriesEp: m3uSeriesEp,
    seriesByShow: m3uSeriesByShow,
  } = await parseVodM3u(VOD_M3U_PATH);
  console.log(`[vod-m3u] movies=${m3uMovies.size}  series-eps=${m3uSeriesEp.size}  shows=${m3uSeriesByShow.size}`);

  console.log(`[chan-m3u] parsing ${CHAN_M3U_PATH} …`);
  const { byName: m3uChan, byTvg: channelByTvg, tokensPool: channelTokens } =
    await parseChannelsM3u(CHAN_M3U_PATH);
  console.log(`[chan-m3u] channels=${m3uChan.size} (tvg=${channelByTvg.size}, fuzzyPool=${channelTokens.length})`);

  const [dbMovies, dbSeries, dbChannels] = await Promise.all([
    fetchAll('movies', 'id,title,stream_url'),
    fetchAll('series', 'id,title,stream_url'),
    fetchAll('channels', 'id,name,stream_url'),
  ]);
  console.log(
    `[db] movies=${dbMovies.length}  series=${dbSeries.length}  channels=${dbChannels.length}`
  );

  const plan = { movies: [], series: [], channels: [] };
  const missing = { movies: [], series: [], channels: [] };

  for (const row of dbMovies) {
    const key = normTitle(row.title);
    const url = m3uMovies.get(key);
    if (url) plan.movies.push({ id: row.id, title: row.title, oldUrl: row.stream_url, newUrl: url });
    else missing.movies.push(row.title);
  }
  for (const row of dbSeries) {
    const k = seriesKey(row.title);
    let url = k ? m3uSeriesEp.get(k) : null;
    if (!url) {
      // fallback: série inteira sem SxxEyy → primeira url do show no m3u
      const base = normTitle(String(row.title).replace(/s\d{1,2}e\d{1,3}.*$/i, ''));
      if (base) url = m3uSeriesByShow.get(base) || null;
    }
    if (url) plan.series.push({ id: row.id, title: row.title, oldUrl: row.stream_url, newUrl: url });
    else missing.series.push(row.title);
  }
  for (const row of dbChannels) {
    const k = normTitle(row.name);
    let url = m3uChan.get(k) || channelByTvg.get(k);
    if (!url) url = channelFuzzy(k, channelTokens);
    if (url) plan.channels.push({ id: row.id, title: row.name, oldUrl: row.stream_url, newUrl: url });
    else missing.channels.push(row.name);
  }

  console.log('\n=== PLAN ===');
  console.log(
    `movies  : ${plan.movies.length} / ${dbMovies.length} matched  (${missing.movies.length} sem match)`
  );
  console.log(
    `series  : ${plan.series.length} / ${dbSeries.length} matched  (${missing.series.length} sem match)`
  );
  console.log(
    `channels: ${plan.channels.length} / ${dbChannels.length} matched  (${missing.channels.length} sem match)`
  );

  if (!APPLY) {
    console.log('\nAmostra matches (movies):');
    plan.movies.slice(0, 5).forEach((p) =>
      console.log(`  ✓ ${p.title}\n    ${p.oldUrl}\n →  ${p.newUrl}`)
    );
    console.log('\nAmostra sem match (movies):');
    missing.movies.slice(0, 10).forEach((t) => console.log(`  ✗ ${t}`));
    console.log('\nAmostra sem match (channels):');
    missing.channels.slice(0, 10).forEach((t) => console.log(`  ✗ ${t}`));
    console.log('\nAmostra sem match (series):');
    missing.series.slice(0, 10).forEach((t) => console.log(`  ✗ ${t}`));
    console.log('\nDry-run. Use --apply para gravar.');
    return;
  }

  console.log('\n=== APPLY ===');
  let ok = 0, fail = 0;
  const work = [
    ...plan.movies.map((p) => ({ table: 'movies', ...p })),
    ...plan.series.map((p) => ({ table: 'series', ...p })),
    ...plan.channels.map((p) => ({ table: 'channels', ...p })),
  ];
  // pequenas rajadas paralelas para não estourar limites
  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < work.length) {
      const i = idx++;
      const item = work[i];
      try {
        await patchRow(item.table, item.id, { stream_url: item.newUrl });
        ok++;
        if (ok % 100 === 0) console.log(`  ${ok}/${work.length} ok`);
      } catch (e) {
        fail++;
        console.error(`  fail ${item.table} ${item.id} (${item.title}): ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone. ok=${ok}  fail=${fail}  total=${work.length}`);

  // gerar relatório dos não-matched
  const reportPath = path.resolve(process.cwd(), 'scripts', 'migrate-streams-missing.txt');
  fs.writeFileSync(
    reportPath,
    [
      '# Sem match no m3u (mantidos como estavam)',
      '',
      `## movies (${missing.movies.length})`,
      ...missing.movies,
      '',
      `## series (${missing.series.length})`,
      ...missing.series,
      '',
      `## channels (${missing.channels.length})`,
      ...missing.channels,
    ].join('\n')
  );
  console.log(`Relatório de não-matched: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
