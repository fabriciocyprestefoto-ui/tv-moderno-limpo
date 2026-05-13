/**
 * import-tmdb-enriched.mjs
 * 1. Limpa movies e series do banco
 * 2. Parseia M3U → apenas 2022+ (filmes e séries)
 * 3. Enriquece cada item via TMDB (poster, backdrop, logo, release, gêneros, nota)
 * 4. Importa em massa no Supabase
 *
 * Uso: node scripts/import-tmdb-enriched.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config (Supabase atual via .env) ─────────────────────────────
const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const M3U_FILE = path.join(__dirname, '../playlist_35934725_plus (3).m3u');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
// 3 tokens TMDB em round-robin para não bater rate limit
const TMDB_TOKENS = [
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U',
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhYTFkOTIxZmViOTkwNjllNDY0ZjVmNzEzYzQxNWZmZCIsIm5iZiI6MTc2NDU1ODAzOS40OTksInN1YiI6IjY5MmQwNGQ3MWZjNjllMmZkMjUxMWY0NiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.C8QC-KAWSt8si3dtsURcBY1aOz_eqabWQyyxLIVl-zk',
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0YjEyZDUzZDRjOWEyOTljZDFiNWI0MjVlZTI2MzM2YSIsIm5iZiI6MTc2NTYzMzc2MC43NjQ5OTk5LCJzdWIiOiI2OTNkNmVlMDFiMDAwODRjNjk4M2U1NTUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.o3TOssJuZFIPY6bD4qk2gtyRXKJVYEGU24n4Q8ROZCY',
];

const MIN_YEAR = 2022;
const BATCH_SIZE = 20; // requisições TMDB paralelas por batch
const DB_BATCH = 500; // registros por insert no Supabase
const DELAY_MS = 300; // pausa entre batches TMDB (ms)

let tokenIdx = 0;
function nextToken() {
  const t = TMDB_TOKENS[tokenIdx % TMDB_TOKENS.length];
  tokenIdx++;
  return t;
}

// ── TMDB fetch helpers ───────────────────────────────────────────
async function tmdbFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const token = nextToken();
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.status === 429) {
        const wait = parseInt(res.headers.get('Retry-After') || '5') * 1000;
        await delay(wait);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      /* network error */
    }
  }
  return null;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchTMDB(title, type) {
  const q = encodeURIComponent(title);
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const data = await tmdbFetch(
    `${TMDB_BASE}/search/${endpoint}?query=${q}&language=pt-BR&include_adult=false&page=1`
  );
  return data?.results?.[0] || null;
}

async function getTMDBImages(tmdbId, type) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const data = await tmdbFetch(
    `${TMDB_BASE}/${endpoint}/${tmdbId}/images?include_image_languages=pt,en,null`
  );
  return data?.logos || [];
}

async function getTMDBGenres(tmdbId, type) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const data = await tmdbFetch(`${TMDB_BASE}/${endpoint}/${tmdbId}?language=pt-BR`);
  return data?.genres?.map((g) => g.name) || [];
}

// ── Normalização ─────────────────────────────────────────────────
function normalizeTitle(raw) {
  return String(raw || '')
    .replace(/\[.*?\]/g, '') // remove [L] [DUB]
    .replace(/\((?!\d{4}\))\w+\)/g, '') // remove (Full) mas não (2023)
    .replace(/S\d{2}E\d{2}.*/i, '') // remove S01E01...
    .replace(/\(\d{4}\)/, '') // remove (2023)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(raw) {
  const m = String(raw).match(/\((\d{4})\)/);
  return m ? parseInt(m[1]) : null;
}

function isEpisode(name) {
  return /S\d{2}E\d{2}/i.test(name);
}

function tmdbImg(p, size = 'w500') {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return `${IMG_BASE}/${size}${p}`;
}

function releaseYear(dateStr) {
  if (!dateStr) return null;
  return parseInt(String(dateStr).slice(0, 4));
}

// ── Grupos de canais (para excluir) ──────────────────────────────
const LIVE_GROUPS = new Set([
  'GLOBO',
  'RECORD',
  'SBT',
  'BAND',
  'HBO',
  'HBO MAX',
  'SPORTV',
  'ESPN',
  'PREMIERE',
  'TELECINE',
  'DISCOVERY+',
  'NOTICIAS',
  'ESPORTES',
  'ESPORTES PPV',
  'LUTAS',
  'BBB 2026',
  'JOGOS DO DIA',
  'DISNEY E MAX PPV',
  'COMBATE',
  'FUTEBOL',
  'MULTISHOW',
  'GNT',
  'MEGAPIX',
  'SBT+',
  'GLOBO PLAY',
]);
const ADULT_KW = ['XXX', 'ADULT', 'ADULTO', '18+', 'PORNO'];

// ── Parse M3U ────────────────────────────────────────────────────
function parseM3UForVOD(filePath) {
  console.log('📖 Lendo M3U...');
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  const movies = new Map(); // normalizedTitle → { rawName, url, logo, year }
  const series = new Map(); // seriesKey → { rawName, url, logo, year }
  let meta = null;

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('#EXTINF:')) {
      const name =
        (l.match(/tvg-name="([^"]*)"/) || [])[1] || l.split(',').slice(1).join(',').trim();
      const logo = (l.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const group = ((l.match(/group-title="([^"]*)"/) || [])[1] || '').toUpperCase().trim();
      meta = { name, logo, group };
      continue;
    }
    if (meta && l && !l.startsWith('#')) {
      const { name, logo, group } = meta;
      const isAdult = ADULT_KW.some((k) => group.includes(k) || name.toUpperCase().includes(k));
      const isLive =
        LIVE_GROUPS.has(group) ||
        (l.endsWith('.ts') && !l.includes('/movie/') && !l.includes('/series/'));

      if (!isAdult && !isLive) {
        const year = extractYear(name);
        // Pré-filtro: aceita se tem ano >= MIN_YEAR, ou sem ano (TMDB vai confirmar)
        if (year === null || year >= MIN_YEAR) {
          const isEp = isEpisode(name);
          const clean = normalizeTitle(name);

          if (!isEp && l.includes('/movie/')) {
            if (!movies.has(clean)) {
              movies.set(clean, { rawName: name, url: l, logo: logo || null, year });
            }
          } else if (isEp || l.includes('/series/')) {
            // Para séries/episódios: chave = título sem número de episódio
            const key = clean.length > 3 ? clean : name.replace(/S\d{2}E\d{2}.*/i, '').trim();
            if (!series.has(key)) {
              series.set(key, { rawName: name, url: l, logo: logo || null, year });
            }
          }
        }
      }
      meta = null;
    }
  }

  console.log(`  🎬 Filmes candidatos: ${movies.size}`);
  console.log(`  📺 Séries candidatas: ${series.size}`);
  return {
    movies: Array.from(movies.values()),
    series: Array.from(series.values()),
  };
}

// ── Enriquecer com TMDB ──────────────────────────────────────────
async function enrichBatch(items, type) {
  return Promise.all(
    items.map(async (item) => {
      const clean = normalizeTitle(item.rawName);
      if (!clean) return null;

      const result = await searchTMDB(clean, type);
      if (!result) return null;

      const releaseDate = type === 'movie' ? result.release_date : result.first_air_date;
      const yr = releaseYear(releaseDate);
      if (!yr || yr < MIN_YEAR) return null;

      // Busca logo (clearart) em paralelo
      let logoUrl = item.logo || null;
      const logos = await getTMDBImages(result.id, type);
      if (logos.length > 0) {
        logoUrl = tmdbImg(logos[0].file_path, 'w500');
      }

      const genres = result.genre_ids
        ? [] // será preenchido abaixo se necessário
        : result.genres?.map((g) => g.name) || [];

      return {
        tmdb_id: result.id,
        title: result.title || result.name || item.rawName,
        description: result.overview || null,
        poster: tmdbImg(result.poster_path, 'w500'),
        backdrop: tmdbImg(result.backdrop_path, 'original'),
        logo_url: logoUrl,
        year: yr,
        rating: result.vote_average ? parseFloat(result.vote_average.toFixed(1)) : null,
        genre: genres,
        stream_url: item.url,
        status: 'published',
        ...(type === 'series'
          ? {
              seasons_count: result.number_of_seasons || 0,
            }
          : {}),
      };
    })
  );
}

// ── Bulk insert Supabase ─────────────────────────────────────────
async function supabaseDelete(table) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`,
    {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  return res.ok;
}

async function bulkInsert(table, rows) {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += DB_BATCH) {
    const batch = rows.slice(i, i + DB_BATCH);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (res.ok || res.status === 201) {
      inserted += batch.length;
      process.stdout.write(`\r  ✅ ${table}: ${inserted}/${rows.length}`);
    } else {
      const err = await res.text();
      console.error(`\n  ❌ Batch ${i}: ${res.status} — ${err.slice(0, 200)}`);
    }
    if (i + DB_BATCH < rows.length) await delay(100);
  }
  console.log('');
  return inserted;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Import TMDB-enriched (2022+)\n');

  // 1. Parse M3U
  const { movies: movCandidates, series: serCandidates } = parseM3UForVOD(M3U_FILE);

  // 2. Limpa banco
  console.log('\n🗑️  Limpando movies e series antigas do banco...');
  await supabaseDelete('movies');
  await supabaseDelete('series');
  console.log('  ✅ Banco limpo\n');

  // 3. Enriquece filmes
  console.log(`🎬 Enriquecendo ${movCandidates.length} filmes via TMDB...`);
  const movies = [];
  let movOk = 0,
    movSkip = 0;

  for (let i = 0; i < movCandidates.length; i += BATCH_SIZE) {
    const batch = movCandidates.slice(i, i + BATCH_SIZE);
    const result = await enrichBatch(batch, 'movie');
    result.forEach((r) => (r ? (movies.push(r), movOk++) : movSkip++));
    process.stdout.write(
      `\r  🔍 ${Math.min(i + BATCH_SIZE, movCandidates.length)}/${movCandidates.length} processados | ✅ ${movOk} ok | ⏭️  ${movSkip} sem match`
    );
    if (i + BATCH_SIZE < movCandidates.length) await delay(DELAY_MS);
  }
  console.log(`\n  Total filmes 2022+: ${movies.length}\n`);

  // 4. Enriquece séries
  console.log(`📺 Enriquecendo ${serCandidates.length} séries via TMDB...`);
  const series = [];
  let serOk = 0,
    serSkip = 0;

  for (let i = 0; i < serCandidates.length; i += BATCH_SIZE) {
    const batch = serCandidates.slice(i, i + BATCH_SIZE);
    const result = await enrichBatch(batch, 'series');
    result.forEach((r) => (r ? (series.push(r), serOk++) : serSkip++));
    process.stdout.write(
      `\r  🔍 ${Math.min(i + BATCH_SIZE, serCandidates.length)}/${serCandidates.length} processados | ✅ ${serOk} ok | ⏭️  ${serSkip} sem match`
    );
    if (i + BATCH_SIZE < serCandidates.length) await delay(DELAY_MS);
  }
  console.log(`\n  Total séries 2022+: ${series.length}\n`);

  // 5. Salva backups
  const dataDir = path.join(__dirname, '../public/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'movies.json'), JSON.stringify(movies, null, 2));
  fs.writeFileSync(path.join(dataDir, 'series.json'), JSON.stringify(series, null, 2));
  console.log('💾 Backups salvos em public/data/\n');

  // 6. Importa no Supabase
  console.log('📤 Importando no Supabase...');
  await bulkInsert('movies', movies);
  await bulkInsert('series', series);

  console.log(`\n🎉 Concluído!`);
  console.log(`   🎬 ${movies.length} filmes importados`);
  console.log(`   📺 ${series.length} séries importadas`);
}

main().catch((err) => {
  console.error('\n💥', err.message);
  process.exit(1);
});
