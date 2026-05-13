/**
 * seed-kids.mjs — Insere conteúdo infantil SEM campo 'kids' (filtrado por gênero)
 */
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const TMDB_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const MOVIE_GENRES = {
  28: 'Ação',
  12: 'Aventura',
  16: 'Animação',
  35: 'Comédia',
  80: 'Crime',
  99: 'Documentário',
  18: 'Drama',
  10751: 'Família',
  14: 'Fantasia',
  36: 'História',
  27: 'Terror',
  10402: 'Música',
  9648: 'Mistério',
  10749: 'Romance',
  878: 'Ficção Científica',
  53: 'Thriller',
  10752: 'Guerra',
  37: 'Faroeste',
};
const TV_GENRES = {
  10759: 'Ação & Aventura',
  16: 'Animação',
  35: 'Comédia',
  80: 'Crime',
  99: 'Documentário',
  18: 'Drama',
  10751: 'Família',
  10762: 'Kids',
  9648: 'Mistério',
  10765: 'Sci-Fi & Fantasia',
  10768: 'Guerra & Política',
  37: 'Faroeste',
  10749: 'Romance',
  53: 'Thriller',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmdbH = { accept: 'application/json', Authorization: `Bearer ${TMDB_TOKEN}` };

async function tmdbGet(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${TMDB_BASE}${path}`, { headers: tmdbH });
      if (r.status === 429) {
        await sleep(3000);
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

function img(path, size = 'w500') {
  if (!path) return null;
  const base =
    size === 'original' ? 'https://image.tmdb.org/t/p/original' : 'https://image.tmdb.org/t/p/w500';
  return `${base}${path}`;
}

function mapG(ids, map) {
  return (ids || []).map((id) => map[id]).filter(Boolean);
}
function year(item) {
  const d = item.release_date || item.first_air_date || '';
  const y = parseInt(d.substring(0, 4));
  return isNaN(y) ? null : y;
}

async function enrich(id, type) {
  const [vids, imgs, creds] = await Promise.all([
    tmdbGet(`/${type}/${id}/videos`),
    tmdbGet(`/${type}/${id}/images?include_image_language=pt-BR,pt,en,null`),
    tmdbGet(`/${type}/${id}/credits`),
  ]);
  const trailer =
    vids?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube')?.key || null;
  const logos = imgs?.logos || [];
  const logo =
    logos.find((l) => l.iso_639_1 === 'pt-BR') ||
    logos.find((l) => l.iso_639_1 === 'en') ||
    logos[0];
  const logoUrl = logo ? img(logo.file_path, 'original') : null;
  const stars = (creds?.cast || [])
    .slice(0, 5)
    .map((a) => a.name)
    .filter(Boolean);
  await sleep(150);
  return { trailer, logoUrl, stars };
}

async function getExisting(table) {
  const ids = new Set();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=tmdb_id&limit=5000`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const d = await r.json();
  if (Array.isArray(d)) d.forEach((row) => row.tmdb_id && ids.add(row.tmdb_id));
  console.log(`  ℹ ${table}: ${ids.size} existentes`);
  return ids;
}

async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) {
      const e = await r.text();
      console.error('  ✗', e.substring(0, 200));
    } else console.log(`  ✓ ${table}: +${chunk.length}`);
    await sleep(300);
  }
}

async function discover(type, genreId, pages = 5) {
  const results = [];
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const voteField = type === 'movie' ? 'vote_count.gte=50' : 'vote_count.gte=30';
  for (let p = 1; p <= pages; p++) {
    const d = await tmdbGet(
      `/discover/${endpoint}?language=pt-BR&sort_by=popularity.desc&include_adult=false&with_genres=${genreId}&${dateField}.gte=2022-01-01&${voteField}&page=${p}`
    );
    if (!d?.results?.length) break;
    results.push(...d.results);
    await sleep(200);
  }
  return results;
}

async function main() {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   Kids Seed — Animação + Família  ║');
  console.log('╚══════════════════════════════════╝\n');

  const exMovies = await getExisting('movies');
  const exSeries = await getExisting('series');

  // ── Filmes kids ─────────────────────────────────────────
  console.log('\n🎬 Filmes Kids (Animação 16 + Família 10751)...');
  const kMap = new Map();
  for (const gid of [16, 10751]) {
    const items = await discover('movie', gid, 6);
    items.forEach((i) => kMap.set(i.id, i));
    await sleep(400);
  }
  const newMovies = [...kMap.values()].filter((m) => !exMovies.has(m.id)).slice(0, 80);
  console.log(`  🆕 Novos filmes kids: ${newMovies.length}`);

  const movieRows = [];
  for (let i = 0; i < newMovies.length; i += 20) {
    const batch = newMovies.slice(i, i + 20);
    console.log(`  Lote ${Math.floor(i / 20) + 1}: ${i + 1}-${Math.min(i + 20, newMovies.length)}`);
    for (const item of batch) {
      try {
        const e = await enrich(item.id, 'movie');
        movieRows.push({
          tmdb_id: item.id,
          title: item.title || item.original_title || 'Sem título',
          original_title: item.original_title || null,
          description: item.overview || null,
          rating: item.vote_average ? String(item.vote_average.toFixed(1)) : null,
          year: year(item),
          genre: mapG(item.genre_ids, MOVIE_GENRES),
          poster: img(item.poster_path, 'w500'),
          backdrop: img(item.backdrop_path, 'original'),
          logo_url: e.logoUrl,
          stars: e.stars,
          trailer_key: e.trailer,
          use_trailer: false,
          status: 'published',
          stream_url: null,
          platform: null,
        });
      } catch {
        movieRows.push({
          tmdb_id: item.id,
          title: item.title || 'Sem título',
          genre: mapG(item.genre_ids, MOVIE_GENRES),
          poster: img(item.poster_path, 'w500'),
          backdrop: img(item.backdrop_path, 'original'),
          year: year(item),
          status: 'published',
          use_trailer: false,
          stars: [],
          stream_url: null,
        });
      }
      await sleep(120);
    }
    await sleep(500);
  }
  console.log(`\n  💾 Inserindo ${movieRows.length} filmes kids...`);
  await upsert('movies', movieRows);

  // ── Séries kids ─────────────────────────────────────────
  console.log('\n📺 Séries Kids (10762 + 16 + 10751)...');
  const sMap = new Map();
  for (const gid of [10762, 16, 10751]) {
    const items = await discover('tv', gid, 5);
    items.forEach((i) => sMap.set(i.id, i));
    await sleep(400);
  }
  const newSeries = [...sMap.values()].filter((s) => !exSeries.has(s.id)).slice(0, 80);
  console.log(`  🆕 Novas séries kids: ${newSeries.length}`);

  const seriesRows = [];
  for (let i = 0; i < newSeries.length; i += 20) {
    const batch = newSeries.slice(i, i + 20);
    console.log(`  Lote ${Math.floor(i / 20) + 1}: ${i + 1}-${Math.min(i + 20, newSeries.length)}`);
    for (const item of batch) {
      try {
        const e = await enrich(item.id, 'tv');
        seriesRows.push({
          tmdb_id: item.id,
          title: item.name || item.original_name || 'Sem título',
          original_title: item.original_name || null,
          description: item.overview || null,
          rating: item.vote_average ? String(item.vote_average.toFixed(1)) : null,
          year: year(item),
          seasons: item.number_of_seasons || null,
          genre: mapG(item.genre_ids, TV_GENRES),
          poster: img(item.poster_path, 'w500'),
          backdrop: img(item.backdrop_path, 'original'),
          logo_url: e.logoUrl,
          stars: e.stars,
          trailer_key: e.trailer,
          use_trailer: false,
          status: 'published',
          stream_url: null,
          platform: null,
        });
      } catch {
        seriesRows.push({
          tmdb_id: item.id,
          title: item.name || 'Sem título',
          genre: mapG(item.genre_ids, TV_GENRES),
          poster: img(item.poster_path, 'w500'),
          backdrop: img(item.backdrop_path, 'original'),
          year: year(item),
          status: 'published',
          use_trailer: false,
          stars: [],
          stream_url: null,
        });
      }
      await sleep(120);
    }
    await sleep(500);
  }
  console.log(`\n  💾 Inserindo ${seriesRows.length} séries kids...`);
  await upsert('series', seriesRows);

  console.log('\n╔══════════════════════════════════╗');
  console.log(`║  ✅ Kids concluído!               ║`);
  console.log(`║  Filmes: ${String(movieRows.length).padEnd(24)}║`);
  console.log(`║  Séries: ${String(seriesRows.length).padEnd(24)}║`);
  console.log('╚══════════════════════════════════╝\n');
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
