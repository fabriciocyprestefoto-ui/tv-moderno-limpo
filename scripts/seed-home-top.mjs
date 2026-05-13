/**
 * seed-home-top.mjs
 * ══════════════════════════════════════════════════════════════════
 * Popula a Home com os 50 filmes e 50 séries mais bem avaliados
 * e mais recentes do TMDB (2022+, nota ≥ 7.0, votos ≥ 500).
 *
 * Uso: node scripts/seed-home-top.mjs
 * ══════════════════════════════════════════════════════════════════
 */

import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const TMDB_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_ORIG = 'https://image.tmdb.org/t/p/original';

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
  10749: 'Romance',
  53: 'Thriller',
};

const PLATFORMS = {
  8: 'Netflix',
  119: 'Amazon Prime',
  337: 'Disney+',
  531: 'Paramount+',
  384: 'HBO Max',
  2: 'Apple TV+',
  283: 'Crunchyroll',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmdbHeaders = { accept: 'application/json', Authorization: `Bearer ${TMDB_TOKEN}` };

async function tmdbFetch(path, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${TMDB_BASE}${path}`, { headers: tmdbHeaders });
      if (r.status === 429) {
        await sleep(4000);
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      if (i === retries - 1) return null;
      await sleep(1000);
    }
  }
  return null;
}

// Busca N páginas de discover e retorna resultados únicos
async function discoverTopRated(type, pages = 3) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const results = [];
  const seen = new Set();

  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      sort_by: 'vote_average.desc',
      'vote_count.gte': '500',
      [`${dateField}.gte`]: '2022-01-01',
      'vote_average.gte': '6.5',
      with_original_language: 'en|pt|es|ja|ko|fr|it|de',
      page: String(page),
      language: 'pt-BR',
    });
    const data = await tmdbFetch(`/discover/${endpoint}?${params}`);
    if (!data?.results) break;
    for (const item of data.results) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    }
    await sleep(300);
  }
  return results;
}

// Busca detalhes completos: trailer, logo, cast, plataformas
async function enrichItem(item, type) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const [details, videos, images, credits, providers] = await Promise.all([
    tmdbFetch(`/${endpoint}/${item.id}?language=pt-BR`),
    tmdbFetch(`/${endpoint}/${item.id}/videos?language=pt-BR`),
    tmdbFetch(`/${endpoint}/${item.id}/images?include_image_language=pt,en,null`),
    tmdbFetch(`/${endpoint}/${item.id}/credits?language=pt-BR`),
    tmdbFetch(`/${endpoint}/${item.id}/watch/providers`),
  ]);

  // Trailer (PT-BR preferido, fallback EN)
  let trailerKey = null;
  const allVideos = videos?.results || [];
  const ptTrailer = allVideos.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube' && v.iso_639_1 === 'pt'
  );
  const enTrailer = allVideos.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
  trailerKey = ptTrailer?.key || enTrailer?.key || null;

  // Logo (PT-BR preferido, fallback EN)
  let logoUrl = null;
  const logos = images?.logos || [];
  const ptLogo = logos.find((l) => l.iso_639_1 === 'pt');
  const enLogo = logos.find((l) => l.iso_639_1 === 'en' || !l.iso_639_1);
  const bestLogo = ptLogo || enLogo || logos[0];
  if (bestLogo?.file_path) logoUrl = `${IMG_ORIG}${bestLogo.file_path}`;

  // Cast (top 5)
  const cast = (credits?.cast || [])
    .slice(0, 5)
    .map((a) => a.name)
    .filter(Boolean);

  // Plataforma
  let platform = null;
  const brProviders = providers?.results?.BR?.flatrate || [];
  for (const [id, name] of Object.entries(PLATFORMS)) {
    if (brProviders.some((p) => p.provider_id === Number(id))) {
      platform = name;
      break;
    }
  }

  // Gêneros
  const genreMap = type === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const rawGenreIds = item.genre_ids || details?.genres?.map((g) => g.id) || [];
  const genres = rawGenreIds.map((id) => genreMap[id]).filter(Boolean);

  // Campos específicos por tipo
  const title = type === 'movie' ? details?.title || item.title : details?.name || item.name;
  const year =
    type === 'movie'
      ? parseInt((details?.release_date || item.release_date || '').slice(0, 4))
      : parseInt((details?.first_air_date || item.first_air_date || '').slice(0, 4));
  const overview = details?.overview || item.overview || '';
  const vote = details?.vote_average ?? item.vote_average ?? 0;
  const poster = item.poster_path ? `${IMG_W500}${item.poster_path}` : null;
  const backdrop = item.backdrop_path ? `${IMG_ORIG}${item.backdrop_path}` : null;

  return {
    title,
    year,
    overview,
    vote,
    poster,
    backdrop,
    logoUrl,
    trailerKey,
    cast,
    genres,
    platform,
    tmdb_id: item.id,
  };
}

// Supabase UPSERT — insere novos E atualiza existentes (merge no tmdb_id)
async function supabaseUpsert(table, rows) {
  const CHUNK = 50;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(chunk),
    });
    const body = await r.json().catch(() => []);
    const count = Array.isArray(body) ? body.length : 0;
    upserted += count;
    console.log(`  ✔ chunk ${Math.floor(i / CHUNK) + 1}: ${count} upsertados`);
    await sleep(200);
  }
  return upserted;
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  seed-home-top.mjs — Top 50 Filmes + 50 Séries  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // ── FILMES ───────────────────────────────────────────────────────────────
  console.log('🎬 Buscando top filmes no TMDB...');
  const rawMovies = await discoverTopRated('movie', 4);
  console.log(`  → ${rawMovies.length} filmes encontrados, pegando top 50...`);
  const topMovies = rawMovies.slice(0, 50);

  console.log('  Enriquecendo com detalhes, trailers, logos...');
  const movieRows = [];
  for (let i = 0; i < topMovies.length; i++) {
    const m = topMovies[i];
    process.stdout.write(
      `  [${i + 1}/${topMovies.length}] ${(m.title || m.name || '').slice(0, 40).padEnd(40)} \r`
    );
    const enriched = await enrichItem(m, 'movie');
    if (!enriched.title || !enriched.year) continue;
    movieRows.push({
      tmdb_id: enriched.tmdb_id,
      title: enriched.title,
      year: enriched.year,
      description: enriched.overview,
      rating: Math.round(enriched.vote * 10) / 10,
      genre: enriched.genres, // coluna: genre (array)
      poster: enriched.poster, // coluna: poster
      backdrop: enriched.backdrop, // coluna: backdrop
      logo_url: enriched.logoUrl,
      trailer_key: enriched.trailerKey,
      stars: enriched.cast.join(', '), // coluna: stars (string)
      platform: enriched.platform,
    });
    await sleep(150);
  }
  console.log(`\n  → ${movieRows.length} filmes prontos para inserção`);
  const moviesInserted = await supabaseUpsert('movies', movieRows);
  console.log(`  ✅ ${moviesInserted} filmes novos inseridos na tabela movies\n`);

  // ── SÉRIES ───────────────────────────────────────────────────────────────
  console.log('📺 Buscando top séries no TMDB...');
  const rawSeries = await discoverTopRated('tv', 4);
  console.log(`  → ${rawSeries.length} séries encontradas, pegando top 50...`);
  const topSeries = rawSeries.slice(0, 50);

  console.log('  Enriquecendo com detalhes, trailers, logos...');
  const seriesRows = [];
  for (let i = 0; i < topSeries.length; i++) {
    const s = topSeries[i];
    process.stdout.write(
      `  [${i + 1}/${topSeries.length}] ${(s.name || '').slice(0, 40).padEnd(40)} \r`
    );
    const enriched = await enrichItem(s, 'tv');
    if (!enriched.title || !enriched.year) continue;
    seriesRows.push({
      tmdb_id: enriched.tmdb_id,
      title: enriched.title,
      year: enriched.year,
      description: enriched.overview,
      rating: Math.round(enriched.vote * 10) / 10,
      genre: enriched.genres, // coluna: genre (array)
      poster: enriched.poster, // coluna: poster
      backdrop: enriched.backdrop, // coluna: backdrop
      logo_url: enriched.logoUrl,
      trailer_key: enriched.trailerKey,
      stars: enriched.cast.join(', '), // coluna: stars (string)
      platform: enriched.platform,
    });
    await sleep(150);
  }
  console.log(`\n  → ${seriesRows.length} séries prontas para inserção`);
  const seriesInserted = await supabaseUpsert('series', seriesRows);
  console.log(`  ✅ ${seriesInserted} séries novas inseridas na tabela series\n`);

  console.log('╔══════════════════════════════════════════════════╗');
  console.log(
    `║  CONCLUÍDO — +${String(moviesInserted).padStart(2)} filmes | +${String(seriesInserted).padStart(2)} séries            ║`
  );
  console.log('╚══════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
