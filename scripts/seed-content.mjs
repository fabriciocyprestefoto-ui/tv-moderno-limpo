/**
 * seed-content.mjs
 * ═══════════════════════════════════════════════════════════════
 * Popula o banco Supabase com filmes e séries do TMDB (2022+)
 *  - 100+ filmes (mín. 5 por gênero principal)
 *  - 100+ séries
 *  - Conteúdo Kids (Animação + Família) de 2022+
 *
 * Uso:  node scripts/seed-content.mjs
 * ═══════════════════════════════════════════════════════════════
 */

import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const TMDB_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_BASE_ORIG = 'https://image.tmdb.org/t/p/original';
const IMG_BASE_W780 = 'https://image.tmdb.org/t/p/w780';

// Plataformas conhecidas (IDs de provedores TMDB)
const PLATFORMS = {
  8: 'Netflix',
  119: 'Amazon Prime',
  337: 'Disney+',
  531: 'Paramount+',
  384: 'HBO Max',
  2: 'Apple TV+',
  283: 'Crunchyroll',
};

// ── Mapa de Gêneros PT-BR ─────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmdbHeaders = {
  accept: 'application/json',
  Authorization: `Bearer ${TMDB_TOKEN}`,
};

async function tmdbFetch(path, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${TMDB_BASE}${path}`, { headers: tmdbHeaders });
      if (r.status === 429) {
        console.warn('  ⚠ Rate limit TMDB, aguardando 3s...');
        await sleep(3000);
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      if (i === retries - 1) return null;
      await sleep(1000);
    }
  }
  return null;
}

function imgUrl(path, size = 'w500') {
  if (!path) return null;
  const base =
    size === 'original' ? IMG_BASE_ORIG : size === 'w780' ? IMG_BASE_W780 : IMG_BASE_W500;
  return `${base}${path}`;
}

function mapGenreIds(ids, genreMap) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => genreMap[id]).filter(Boolean);
}

function guessYear(item) {
  const d = item.release_date || item.first_air_date || '';
  const y = parseInt(d.substring(0, 4));
  return isNaN(y) ? null : y;
}

function guessPlatform(ids) {
  if (!ids || !ids.length) return null;
  for (const id of ids) {
    if (PLATFORMS[id]) return PLATFORMS[id];
  }
  return null;
}

// Busca provedores do item para detectar plataforma
async function fetchProviders(id, type) {
  const data = await tmdbFetch(`/${type}/${id}/watch/providers`);
  const br = data?.results?.BR;
  const providers = [...(br?.flatrate || []), ...(br?.buy || [])];
  return providers.map((p) => p.provider_id);
}

// Busca créditos (elenco)
async function fetchCredits(id, type) {
  const endpoint = type === 'movie' ? `/movie/${id}/credits` : `/tv/${id}/credits`;
  const data = await tmdbFetch(endpoint);
  if (!data) return [];
  return (data.cast || [])
    .slice(0, 5)
    .map((a) => a.name)
    .filter(Boolean);
}

// Busca trailer
async function fetchTrailerKey(id, type) {
  const endpoint = type === 'movie' ? `/movie/${id}/videos` : `/tv/${id}/videos`;
  const data = await tmdbFetch(endpoint);
  const trailer =
    data?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube') ||
    data?.results?.find((v) => v.site === 'YouTube');
  return trailer?.key || null;
}

// Busca logo
async function fetchLogo(id, type) {
  const endpoint = type === 'movie' ? `/movie/${id}/images` : `/tv/${id}/images`;
  const data = await tmdbFetch(`${endpoint}?include_image_language=pt-BR,pt,en,null`);
  const logos = data?.logos || [];
  const logo =
    logos.find((l) => l.iso_639_1 === 'pt-BR') ||
    logos.find((l) => l.iso_639_1 === 'pt') ||
    logos.find((l) => l.iso_639_1 === 'en') ||
    logos[0];
  return logo ? imgUrl(logo.file_path, 'original') : null;
}

// ── Supabase Insert ───────────────────────────────────────────
async function supabaseUpsert(table, rows) {
  const chunkSize = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
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
      const err = await r.text();
      console.error(`  ✗ Erro ao inserir em ${table}:`, err.substring(0, 200));
    } else {
      inserted += chunk.length;
      console.log(`  ✓ ${table}: +${chunk.length} inseridos (total: ${inserted})`);
    }
    await sleep(300);
  }
  return inserted;
}

// Verifica tmdb_ids já existentes para evitar duplicatas
async function getExistingTmdbIds(table) {
  const ids = new Set();
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=tmdb_id&limit=${pageSize}&offset=${page * pageSize}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach((row) => row.tmdb_id && ids.add(row.tmdb_id));
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`  ℹ ${table}: ${ids.size} registros já existentes`);
  return ids;
}

// ── Discover Movies ───────────────────────────────────────────
async function discoverMovies(genreId, pages = 3, minYear = 2022) {
  const results = [];
  for (let p = 1; p <= pages; p++) {
    const data = await tmdbFetch(
      `/discover/movie?language=pt-BR&sort_by=popularity.desc&include_adult=false` +
        `&with_genres=${genreId}&primary_release_date.gte=${minYear}-01-01` +
        `&vote_count.gte=100&page=${p}`
    );
    if (!data?.results?.length) break;
    results.push(...data.results);
    await sleep(200);
  }
  return results;
}

// ── Discover Series ───────────────────────────────────────────
async function discoverSeries(genreId, pages = 3, minYear = 2022) {
  const results = [];
  for (let p = 1; p <= pages; p++) {
    const data = await tmdbFetch(
      `/discover/tv?language=pt-BR&sort_by=popularity.desc&include_adult=false` +
        `&with_genres=${genreId}&first_air_date.gte=${minYear}-01-01` +
        `&vote_count.gte=50&page=${p}`
    );
    if (!data?.results?.length) break;
    results.push(...data.results);
    await sleep(200);
  }
  return results;
}

// ── Enrich item (trailer + logo + elenco + plataforma) ───────
async function enrichItem(item, type) {
  const id = item.id;
  console.log(`    🔍 Enriquecendo: ${item.title || item.name} (${id})`);

  const [trailerKey, logoUrl, stars, providerIds] = await Promise.all([
    fetchTrailerKey(id, type),
    fetchLogo(id, type),
    fetchCredits(id, type),
    fetchProviders(id, type),
  ]);

  await sleep(150);

  return { trailerKey, logoUrl, stars, platform: guessPlatform(providerIds) };
}

// ── Build movie row ───────────────────────────────────────────
function buildMovieRow(item, extra = {}) {
  const year = guessYear(item);
  return {
    tmdb_id: item.id,
    title: item.title || item.original_title || 'Sem título',
    original_title: item.original_title || null,
    description: item.overview || null,
    rating: item.vote_average ? String(item.vote_average.toFixed(1)) : null,
    year,
    genre: mapGenreIds(item.genre_ids, MOVIE_GENRES),
    poster: item.poster_path ? imgUrl(item.poster_path, 'w500') : null,
    backdrop: item.backdrop_path ? imgUrl(item.backdrop_path, 'original') : null,
    logo_url: extra.logoUrl || null,
    stars: extra.stars || [],
    trailer_key: extra.trailerKey || null,
    use_trailer: false,
    platform: extra.platform || null,
    status: 'published',
    stream_url: null,
  };
}

// ── Build series row ──────────────────────────────────────────
function buildSeriesRow(item, extra = {}) {
  const year = guessYear(item);
  return {
    tmdb_id: item.id,
    title: item.name || item.original_name || 'Sem título',
    original_title: item.original_name || null,
    description: item.overview || null,
    rating: item.vote_average ? String(item.vote_average.toFixed(1)) : null,
    year,
    seasons: item.number_of_seasons || null,
    genre: mapGenreIds(item.genre_ids, TV_GENRES),
    poster: item.poster_path ? imgUrl(item.poster_path, 'w500') : null,
    backdrop: item.backdrop_path ? imgUrl(item.backdrop_path, 'original') : null,
    logo_url: extra.logoUrl || null,
    stars: extra.stars || [],
    trailer_key: extra.trailerKey || null,
    use_trailer: false,
    platform: extra.platform || null,
    status: 'published',
    stream_url: null,
  };
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   RedFlix — Seed de Conteúdo TMDB 2022+     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── 1. Detectar duplicatas ────────────────────────────────
  console.log('📋 Verificando registros existentes...');
  const existingMovies = await getExistingTmdbIds('movies');
  const existingSeries = await getExistingTmdbIds('series');

  // ── 2. FILMES ─────────────────────────────────────────────
  console.log('\n🎬 Buscando FILMES por gênero...');

  // Gêneros principais para mínimo 5 filmes cada
  const movieGenres = [
    { id: 28, name: 'Ação' },
    { id: 35, name: 'Comédia' },
    { id: 18, name: 'Drama' },
    { id: 27, name: 'Terror' },
    { id: 878, name: 'Ficção Científica' },
    { id: 53, name: 'Thriller' },
    { id: 12, name: 'Aventura' },
    { id: 14, name: 'Fantasia' },
    { id: 80, name: 'Crime' },
    { id: 10749, name: 'Romance' },
    { id: 10752, name: 'Guerra' },
    { id: 9648, name: 'Mistério' },
    { id: 99, name: 'Documentário' },
    { id: 10402, name: 'Música' },
    { id: 36, name: 'História' },
  ];

  const allMovieItems = new Map(); // tmdb_id → item

  for (const genre of movieGenres) {
    console.log(`  📁 Gênero: ${genre.name}`);
    const items = await discoverMovies(genre.id, 3, 2022);
    let added = 0;
    for (const item of items) {
      if (!allMovieItems.has(item.id)) {
        allMovieItems.set(item.id, item);
        added++;
      }
    }
    console.log(
      `     → ${items.length} encontrados, ${added} novos únicos (total: ${allMovieItems.size})`
    );
    await sleep(400);
  }

  console.log(`\n  📊 Total de filmes únicos encontrados: ${allMovieItems.size}`);

  // Filtra já existentes e limita a 150
  const newMovieItems = [...allMovieItems.values()]
    .filter((m) => !existingMovies.has(m.id))
    .slice(0, 150);

  console.log(`  🆕 Novos a inserir: ${newMovieItems.length}`);

  // Enriquece com trailer/logo/elenco (em lotes para não sobrecarregar)
  console.log('\n  🔄 Enriquecendo filmes com trailer/logo/elenco...');
  const movieRows = [];
  const batchSize = 20;

  for (let i = 0; i < newMovieItems.length; i += batchSize) {
    const batch = newMovieItems.slice(i, i + batchSize);
    console.log(
      `  Lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(newMovieItems.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, newMovieItems.length)})`
    );

    for (const item of batch) {
      try {
        const extra = await enrichItem(item, 'movie');
        movieRows.push(buildMovieRow(item, extra));
      } catch (e) {
        // Insere sem enriquecimento se falhar
        movieRows.push(buildMovieRow(item));
      }
      await sleep(100);
    }
    await sleep(500);
  }

  console.log('\n  💾 Inserindo filmes no Supabase...');
  await supabaseUpsert('movies', movieRows);

  // ── 3. SÉRIES ─────────────────────────────────────────────
  console.log('\n📺 Buscando SÉRIES por gênero...');

  const seriesGenres = [
    { id: 18, name: 'Drama' },
    { id: 35, name: 'Comédia' },
    { id: 10759, name: 'Ação & Aventura' },
    { id: 80, name: 'Crime' },
    { id: 9648, name: 'Mistério' },
    { id: 10765, name: 'Sci-Fi & Fantasia' },
    { id: 10749, name: 'Romance' },
    { id: 53, name: 'Thriller' },
    { id: 99, name: 'Documentário' },
    { id: 10768, name: 'Guerra & Política' },
    { id: 10762, name: 'Kids' },
  ];

  const allSeriesItems = new Map();

  for (const genre of seriesGenres) {
    console.log(`  📁 Gênero: ${genre.name}`);
    const items = await discoverSeries(genre.id, 3, 2022);
    let added = 0;
    for (const item of items) {
      if (!allSeriesItems.has(item.id)) {
        allSeriesItems.set(item.id, item);
        added++;
      }
    }
    console.log(
      `     → ${items.length} encontrados, ${added} novos únicos (total: ${allSeriesItems.size})`
    );
    await sleep(400);
  }

  console.log(`\n  📊 Total de séries únicas encontradas: ${allSeriesItems.size}`);

  const newSeriesItems = [...allSeriesItems.values()]
    .filter((s) => !existingSeries.has(s.id))
    .slice(0, 150);

  console.log(`  🆕 Novas a inserir: ${newSeriesItems.length}`);

  console.log('\n  🔄 Enriquecendo séries com trailer/logo/elenco...');
  const seriesRows = [];

  for (let i = 0; i < newSeriesItems.length; i += batchSize) {
    const batch = newSeriesItems.slice(i, i + batchSize);
    console.log(
      `  Lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(newSeriesItems.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, newSeriesItems.length)})`
    );

    for (const item of batch) {
      try {
        const extra = await enrichItem(item, 'tv');
        seriesRows.push(buildSeriesRow(item, extra));
      } catch (e) {
        seriesRows.push(buildSeriesRow(item));
      }
      await sleep(100);
    }
    await sleep(500);
  }

  console.log('\n  💾 Inserindo séries no Supabase...');
  await supabaseUpsert('series', seriesRows);

  // ── 4. KIDS ────────────────────────────────────────────────
  console.log('\n👶 Buscando conteúdo KIDS (Animação + Família)...');

  // Filmes kids
  const kidsMovieItems = new Map();
  for (const genreId of [16, 10751]) {
    const items = await discoverMovies(genreId, 5, 2022);
    items.forEach((i) => kidsMovieItems.set(i.id, i));
    await sleep(400);
  }

  // Busca também com certificação para garantir conteúdo infantil
  const kidsMovieSearch = await tmdbFetch(
    `/discover/movie?language=pt-BR&sort_by=popularity.desc&include_adult=false` +
      `&with_genres=16,10751&primary_release_date.gte=2022-01-01&vote_count.gte=50&page=1`
  );
  (kidsMovieSearch?.results || []).forEach((i) => kidsMovieItems.set(i.id, i));

  const kidsMovieNew = [...kidsMovieItems.values()]
    .filter((m) => !existingMovies.has(m.id))
    .slice(0, 60);

  console.log(`  👶 Filmes kids novos: ${kidsMovieNew.length}`);
  const kidsMovieRows = [];

  for (let i = 0; i < kidsMovieNew.length; i += batchSize) {
    const batch = kidsMovieNew.slice(i, i + batchSize);
    for (const item of batch) {
      try {
        const extra = await enrichItem(item, 'movie');
        const row = buildMovieRow(item, extra);
        row.kids = true; // marca como infantil
        // Garante que Animação/Família esteja nos gêneros
        if (!row.genre.includes('Animação') && !row.genre.includes('Família')) {
          row.genre = ['Animação', ...row.genre];
        }
        kidsMovieRows.push(row);
      } catch (e) {
        const row = buildMovieRow(item);
        row.kids = true;
        kidsMovieRows.push(row);
      }
      await sleep(100);
    }
    await sleep(500);
  }

  console.log('\n  💾 Inserindo filmes kids no Supabase...');
  await supabaseUpsert('movies', kidsMovieRows);

  // Séries kids
  const kidsSeriesItems = new Map();
  for (const genreId of [10762, 16]) {
    const items = await discoverSeries(genreId, 5, 2022);
    items.forEach((i) => kidsSeriesItems.set(i.id, i));
    await sleep(400);
  }

  const kidsSeriesNew = [...kidsSeriesItems.values()]
    .filter((s) => !existingSeries.has(s.id))
    .slice(0, 60);

  console.log(`  👶 Séries kids novas: ${kidsSeriesNew.length}`);
  const kidsSeriesRows = [];

  for (let i = 0; i < kidsSeriesNew.length; i += batchSize) {
    const batch = kidsSeriesNew.slice(i, i + batchSize);
    for (const item of batch) {
      try {
        const extra = await enrichItem(item, 'tv');
        const row = buildSeriesRow(item, extra);
        row.kids = true;
        kidsSeriesRows.push(row);
      } catch (e) {
        const row = buildSeriesRow(item);
        row.kids = true;
        kidsSeriesRows.push(row);
      }
      await sleep(100);
    }
    await sleep(500);
  }

  console.log('\n  💾 Inserindo séries kids no Supabase...');
  await supabaseUpsert('series', kidsSeriesRows);

  // ── 5. Resumo ──────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║            ✅ SEED CONCLUÍDO!                ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Filmes adultos inseridos:  ${String(movieRows.length).padEnd(16)}║`);
  console.log(`║  Séries adultas inseridas:  ${String(seriesRows.length).padEnd(16)}║`);
  console.log(`║  Filmes kids inseridos:     ${String(kidsMovieRows.length).padEnd(16)}║`);
  console.log(`║  Séries kids inseridas:     ${String(kidsSeriesRows.length).padEnd(16)}║`);
  console.log(
    `║  TOTAL INSERIDO:            ${String(movieRows.length + seriesRows.length + kidsMovieRows.length + kidsSeriesRows.length).padEnd(16)}║`
  );
  console.log('╚══════════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
