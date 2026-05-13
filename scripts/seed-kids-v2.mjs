/**
 * seed-kids-v2.mjs
 * ════════════════════════════════════════════════════════════
 * Seed dedicado ao conteúdo INFANTIL (Kids) — 2022+
 *  ✔ Gênero "Infantil" adicionado explicitamente
 *  ✔ Imagens buscadas diretamente do TMDB (poster + backdrop + logo)
 *  ✔ Paginação correta ao verificar duplicatas
 *  ✔ Inserção individual — evita falha em cascata por duplicata
 * ════════════════════════════════════════════════════════════
 */

import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const TMDB_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U';
const TMDB_BASE = 'https://api.themoviedb.org/3';

// ── Mapa de gêneros PT-BR ─────────────────────────────────
const MOVIE_GENRE_MAP = {
  16: 'Animação',
  10751: 'Família',
  12: 'Aventura',
  35: 'Comédia',
  18: 'Drama',
  14: 'Fantasia',
  878: 'Ficção Científica',
  28: 'Ação',
  10402: 'Música',
  9648: 'Mistério',
  10749: 'Romance',
};
const TV_GENRE_MAP = {
  16: 'Animação',
  10751: 'Família',
  10762: 'Kids',
  35: 'Comédia',
  18: 'Drama',
  14: 'Fantasia',
  12: 'Aventura',
  28: 'Ação',
  10759: 'Ação & Aventura',
  10402: 'Música',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmdbH = { accept: 'application/json', Authorization: `Bearer ${TMDB_TOKEN}` };

// ── Helpers TMDB ──────────────────────────────────────────
async function tmdbGet(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${TMDB_BASE}${path}`, { headers: tmdbH });
      if (r.status === 429) {
        console.warn('  ⚠ Rate limit, aguarda 4s');
        await sleep(4000);
        continue;
      }
      if (!r.ok) return null;
      return r.json();
    } catch {
      await sleep(1500);
    }
  }
  return null;
}

function img(path, size = 'w500') {
  if (!path) return null;
  const base =
    {
      w500: 'https://image.tmdb.org/t/p/w500',
      w780: 'https://image.tmdb.org/t/p/w780',
      original: 'https://image.tmdb.org/t/p/original',
    }[size] || 'https://image.tmdb.org/t/p/w500';
  return `${base}${path}`;
}

function mapGenres(ids, map) {
  return (ids || []).map((id) => map[id]).filter(Boolean);
}

function extractYear(item) {
  const d = item.release_date || item.first_air_date || '';
  const y = parseInt(d.substring(0, 4));
  return isNaN(y) ? null : y;
}

// Busca detalhes completos de um item (logo, trailer, elenco)
async function fetchDetails(id, type) {
  const ep = type === 'movie' ? 'movie' : 'tv';
  const [detail, imgs, vids, creds] = await Promise.all([
    tmdbGet(`/${ep}/${id}?language=pt-BR`),
    tmdbGet(`/${ep}/${id}/images?include_image_language=pt-BR,pt,en,null`),
    tmdbGet(`/${ep}/${id}/videos?language=pt-BR`),
    tmdbGet(`/${ep}/${id}/credits?language=pt-BR`),
  ]);
  await sleep(200);

  // Poster e backdrop do detalhe (maior qualidade)
  const poster = img(detail?.poster_path, 'w500');
  const backdrop = img(detail?.backdrop_path, 'original');

  // Logo (preferência pt-BR → en → qualquer)
  const logos = imgs?.logos || [];
  const logo =
    logos.find((l) => l.iso_639_1 === 'pt-BR') ||
    logos.find((l) => l.iso_639_1 === 'pt') ||
    logos.find((l) => l.iso_639_1 === 'en') ||
    logos[0];
  const logoUrl = logo ? img(logo.file_path, 'original') : null;

  // Trailer YouTube
  const trailer =
    vids?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube')?.key ||
    vids?.results?.find((v) => v.site === 'YouTube')?.key ||
    null;

  // Elenco (top 5)
  const stars = (creds?.cast || [])
    .slice(0, 5)
    .map((a) => a.name)
    .filter(Boolean);

  // Sinopse PT-BR do detalhe
  const description = detail?.overview || null;

  // Temporadas (séries)
  const seasons = detail?.number_of_seasons || null;

  return { poster, backdrop, logoUrl, trailer, stars, description, seasons };
}

// ── Supabase: buscar IDs existentes com paginação ─────────
async function getAllExistingIds(table) {
  const ids = new Set();
  let page = 0;
  const PS = 1000;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=tmdb_id&limit=${PS}&offset=${page * PS}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) break;
    const d = await r.json();
    if (!Array.isArray(d) || d.length === 0) break;
    d.forEach((row) => row.tmdb_id && ids.add(row.tmdb_id));
    console.log(`    página ${page + 1}: ${d.length} registros (acumulado: ${ids.size})`);
    if (d.length < PS) break;
    page++;
    await sleep(200);
  }
  return ids;
}

// ── Supabase: inserção individual com tratamento de duplicata ─
async function insertOne(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
  });
  if (!r.ok && r.status !== 409) {
    const err = await r.text();
    if (!err.includes('duplicate key') && !err.includes('23505')) {
      console.error(`    ✗ ${r.status}:`, err.substring(0, 120));
      return false;
    }
  }
  return true;
}

// ── Discover TMDB ─────────────────────────────────────────
async function discover(type, genreId, pages = 6) {
  const ep = type === 'movie' ? 'movie' : 'tv';
  const df = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const vf = type === 'movie' ? 'vote_count.gte=30' : 'vote_count.gte=20';
  const results = [];
  for (let p = 1; p <= pages; p++) {
    const d = await tmdbGet(
      `/discover/${ep}?language=pt-BR&sort_by=popularity.desc&include_adult=false` +
        `&with_genres=${genreId}&${df}.gte=2022-01-01&${vf}&page=${p}`
    );
    if (!d?.results?.length) break;
    results.push(...d.results);
    await sleep(250);
  }
  return results;
}

// ── MAIN ──────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   RedFlix — Seed Infantil v2 (gênero + TMDB img) ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // 1. Detectar existentes (paginado)
  console.log('📋 Carregando tmdb_ids existentes (movies)...');
  const exMovies = await getAllExistingIds('movies');
  console.log(`  → Total movies existentes: ${exMovies.size}\n`);

  console.log('📋 Carregando tmdb_ids existentes (series)...');
  const exSeries = await getAllExistingIds('series');
  console.log(`  → Total series existentes: ${exSeries.size}\n`);

  // ── Filmes Infantis ──────────────────────────────────────
  console.log('🎬 Descobrindo filmes infantis...');
  const movMap = new Map();
  for (const gid of [16, 10751]) {
    // Animação + Família
    const items = await discover('movie', gid, 7);
    items.forEach((i) => movMap.set(i.id, i));
    await sleep(500);
  }
  const newMovs = [...movMap.values()].filter((m) => !exMovies.has(m.id));
  console.log(`  → ${movMap.size} encontrados, ${newMovs.length} novos\n`);

  let movOk = 0,
    movSkip = 0;
  for (let i = 0; i < newMovs.length; i++) {
    const item = newMovs[i];
    const pct = Math.round(((i + 1) / newMovs.length) * 100);
    process.stdout.write(
      `\r  [${pct}%] ${i + 1}/${newMovs.length} — ${(item.title || item.name || '').substring(0, 40).padEnd(40)}`
    );

    try {
      const d = await fetchDetails(item.id, 'movie');
      const genres = mapGenres(item.genre_ids, MOVIE_GENRE_MAP);
      // Adiciona "Infantil" explicitamente se não tiver
      if (!genres.includes('Infantil')) genres.unshift('Infantil');

      const row = {
        tmdb_id: item.id,
        title: item.title || item.original_title || 'Sem título',
        original_title: item.original_title || null,
        description: d.description || item.overview || null,
        rating: item.vote_average ? String(item.vote_average.toFixed(1)) : null,
        year: extractYear(item),
        genre: genres,
        poster: d.poster || img(item.poster_path, 'w500'),
        backdrop: d.backdrop || img(item.backdrop_path, 'original'),
        logo_url: d.logoUrl,
        stars: d.stars,
        trailer_key: d.trailer,
        use_trailer: false,
        status: 'published',
        stream_url: null,
        platform: null,
      };
      const ok = await insertOne('movies', row);
      if (ok) movOk++;
      else movSkip++;
    } catch (e) {
      movSkip++;
    }
    await sleep(80);
  }
  console.log(`\n  ✅ Filmes inseridos: ${movOk} | ignorados/erros: ${movSkip}\n`);

  // ── Séries Infantis ──────────────────────────────────────
  console.log('📺 Descobrindo séries infantis...');
  const serMap = new Map();
  for (const gid of [10762, 16, 10751]) {
    // Kids + Animação + Família
    const items = await discover('tv', gid, 7);
    items.forEach((i) => serMap.set(i.id, i));
    await sleep(500);
  }
  const newSers = [...serMap.values()].filter((s) => !exSeries.has(s.id));
  console.log(`  → ${serMap.size} encontrados, ${newSers.length} novos\n`);

  let serOk = 0,
    serSkip = 0;
  for (let i = 0; i < newSers.length; i++) {
    const item = newSers[i];
    const pct = Math.round(((i + 1) / newSers.length) * 100);
    process.stdout.write(
      `\r  [${pct}%] ${i + 1}/${newSers.length} — ${(item.name || '').substring(0, 40).padEnd(40)}`
    );

    try {
      const d = await fetchDetails(item.id, 'tv');
      const genres = mapGenres(item.genre_ids, TV_GENRE_MAP);
      if (!genres.includes('Infantil')) genres.unshift('Infantil');

      const row = {
        tmdb_id: item.id,
        title: item.name || item.original_name || 'Sem título',
        original_title: item.original_name || null,
        description: d.description || item.overview || null,
        rating: item.vote_average ? String(item.vote_average.toFixed(1)) : null,
        year: extractYear(item),
        seasons: d.seasons,
        genre: genres,
        poster: d.poster || img(item.poster_path, 'w500'),
        backdrop: d.backdrop || img(item.backdrop_path, 'original'),
        logo_url: d.logoUrl,
        stars: d.stars,
        trailer_key: d.trailer,
        use_trailer: false,
        status: 'published',
        stream_url: null,
        platform: null,
      };
      const ok = await insertOne('series', row);
      if (ok) serOk++;
      else serSkip++;
    } catch (e) {
      serSkip++;
    }
    await sleep(80);
  }
  console.log(`\n  ✅ Séries inseridas: ${serOk} | ignoradas/erros: ${serSkip}\n`);

  // ── Resumo ────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║               ✅ KIDS SEED v2 CONCLUÍDO!         ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Filmes infantis novos inseridos: ${String(movOk).padEnd(14)}║`);
  console.log(`║  Séries infantis novas inseridas: ${String(serOk).padEnd(14)}║`);
  console.log(`║  Total novo conteúdo kids:        ${String(movOk + serOk).padEnd(14)}║`);
  console.log('╚══════════════════════════════════════════════════╝\n');
}

main().catch((e) => {
  console.error('\n❌ Erro fatal:', e);
  process.exit(1);
});
