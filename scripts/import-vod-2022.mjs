/**
 * import-vod-2022.mjs
 *
 * 1. Baixa M3U: http://api.cdnapp.fun:80/playlist/new_app/Q24Wb98eYc/m3u_plus
 * 2. Filtra: Apenas conteúdo (Filmes/Séries) >= 2022.
 * 3. Seleciona: Os 1000 itens mais recentes (Slice 1000).
 * 4. Enriquece via TMDB (rotação de 3 tokens).
 * 5. Importa no Supabase.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://rqtzmgbduomwrhgrfsvp.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdHptZ2JkdW9td3JoZ3Jmc3ZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY1NDQyMCwiZXhwIjoyMDkwMjMwNDIwfQ.85fwYAK6O4lDv0TX1i0C5w0eR6ASQlWCy_-sZQG8Z8g';

const TMDB_TOKENS = [
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U',
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhYTFkOTIxZmViOTkwNjllNDY0ZjVmNzEzYzQxNWZmZCIsIm5iZiI6MTc2NDU1ODAzOS40OTksInN1YiI6IjY5MmQwNGQ3MWZjNjllMmZkMjUxMWY0NiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.C8QC-KAWSt8si3dtsURcBY1aOz_eqabWQyyxLIVl-zk',
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0YjEyZDUzZDRjOWEyOTljZDFiNWI0MjVlZTI2MzM2YSIsIm5iZiI6MTc2NTYzMzc2MC43NjQ5OTk5LCJzdWIiOiI2OTNkNmVlMDFiMDAwODRjNjk4M2U1NTUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.o3TOssJuZFIPY6bD4qk2gtyRXKJVYEGU24n4Q8ROZCY',
];
let tokenIdx = 0;

const M3U_URL = 'http://api.cdnapp.fun:80/playlist/new_app/Q24Wb98eYc/m3u_plus';
const MIN_YEAR = 2022;
const MAX_ITEMS = 1000;
const BATCH_SIZE = 50;

// ── Helpers ──────────────────────────────────────────────────────
function toM3u8(url) {
  return url.replace(/\.ts(\?.*)?$/, '.m3u8$1').replace(':80', '');
}

function extractYear(name) {
  const match = name.match(/\((\d{4})\)/) || name.match(/\s(\d{4})\s/) || name.match(/(\d{4})$/);
  return match ? parseInt(match[1]) : null;
}

function cleanTitle(name) {
  return name
    .replace(/S\d{2}E\d{2}/gi, '')
    .replace(/\(\d{4}\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\b(FHD|HD|4K|UHD|SD|DUB|LEG|PT|BR|S\d{2}|E\d{2})\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchTMDB(endpoint, queryParams = {}) {
  const token = TMDB_TOKENS[tokenIdx];
  tokenIdx = (tokenIdx + 1) % TMDB_TOKENS.length;

  const q = new URLSearchParams({ language: 'pt-BR', ...queryParams });
  const res = await fetch(`https://api.themoviedb.org/3/${endpoint}?${q}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    return fetchTMDB(endpoint, queryParams);
  }
  return res.ok ? res.json() : null;
}

async function getTMDBDetails(title, year, type) {
  const searchType = type === 'series' ? 'tv' : 'movie';
  const search = await fetchTMDB(`search/${searchType}`, {
    query: title,
    ...(year
      ? type === 'series'
        ? { first_air_date_year: year }
        : { primary_release_year: year }
      : {}),
  });

  const exact = search?.results?.[0];
  if (!exact) return null;

  const details = await fetchTMDB(`${searchType}/${exact.id}`, { append_to_response: 'images' });
  if (!details) return exact;

  const logo =
    details.images?.logos?.find((l) => l.iso_639_1 === 'pt') ||
    details.images?.logos?.find((l) => l.iso_639_1 === 'en') ||
    details.images?.logos?.[0];

  return { ...details, logo_path: logo?.file_path };
}

async function bulkInsert(table, rows) {
  if (!rows.length) return;
  console.log(`📤 Inserindo ${rows.length} em ${table}...`);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
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
    if (res.ok) process.stdout.write(`\r   ✅ ${i + batch.length}/${rows.length}`);
    else console.error(`\n   ❌ Erro: ${await res.text()}`);
  }
  console.log('\n');
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('🎬 Ingestão VOD (Top 1000 mais novos >= 2022)\n');

  const res = await fetch(M3U_URL);
  const text = await res.text();
  const lines = text.split('\n');

  const allFiltered = []; // { title, year, url, group, type }
  let meta = null;

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('#EXTINF:')) {
      const g = (l.match(/group-title="([^"]*)"/) || [])[1] || '';
      const n = l.split(',').slice(1).join(',').trim() || '';
      meta = { name: n, group: g };
    } else if (meta && l && !l.startsWith('#')) {
      const year = extractYear(meta.name);
      if (year >= MIN_YEAR) {
        const type = l.includes('/series/') ? 'series' : l.includes('/movie/') ? 'movie' : null;
        if (type)
          allFiltered.push({
            title: cleanTitle(meta.name),
            year,
            url: toM3u8(l),
            group: meta.group,
            type,
          });
      }
      meta = null;
    }
  }

  // Ordenar por ano DESC e pegar 1000
  allFiltered.sort((a, b) => b.year - a.year);
  const top1000 = allFiltered.slice(0, MAX_ITEMS);

  console.log(`📌 Processando ${top1000.length} itens (de ${allFiltered.length} filtrados)\n`);

  const moviesInsert = [];
  const seriesInsert = [];
  const seenSeries = new Set();

  for (const item of top1000) {
    if (item.type === 'series' && seenSeries.has(item.title)) continue;
    if (item.type === 'series') seenSeries.add(item.title);

    const tmdb = await getTMDBDetails(item.title, item.year, item.type);
    const row = {
      title: item.title,
      description: tmdb?.overview || null,
      poster: tmdb?.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : null,
      backdrop: tmdb?.backdrop_path
        ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
        : null,
      logo_url: tmdb?.logo_path ? `https://image.tmdb.org/t/p/w500${tmdb.logo_path}` : null,
      rating: tmdb?.vote_average ? parseFloat(tmdb.vote_average.toFixed(1)) : null,
      year:
        item.year ||
        (tmdb?.release_date
          ? new Date(tmdb.release_date || tmdb.first_air_date).getFullYear()
          : null),
      genre: tmdb?.genres?.map((g) => g.name) || [item.group],
      stream_url: item.url,
      status: 'published',
    };

    if (item.type === 'movie') moviesInsert.push(row);
    else {
      row.seasons_count = tmdb?.number_of_seasons || 1;
      seriesInsert.push(row);
    }

    process.stdout.write(
      `\r🔍 Processado: ${moviesInsert.length + seriesInsert.length}/${top1000.length}`
    );
  }

  console.log('\n');
  await bulkInsert('movies', moviesInsert);
  await bulkInsert('series', seriesInsert);

  console.log('🎉 Finalizado.');
}

main().catch(console.error);
