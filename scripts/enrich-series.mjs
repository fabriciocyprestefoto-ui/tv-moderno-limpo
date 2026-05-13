/**
 * enrich-series.mjs
 * ══════════════════════════════════════════════════════════════════
 * Enriquece séries do Supabase que têm tmdb_id mas falta poster/backdrop/genre.
 * Busca dados completos no TMDB e faz UPDATE no banco.
 *
 * Uso: node scripts/enrich-series.mjs
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

const TV_GENRES = {
  10759: 'Ação & Aventura',
  16: 'Animação',
  35: 'Comédia',
  80: 'Crime',
  99: 'Documentário',
  18: 'Drama',
  10751: 'Família',
  10762: 'Infantil',
  9648: 'Mistério',
  10765: 'Sci-Fi & Fantasia',
  10768: 'Guerra & Política',
  10749: 'Romance',
  53: 'Thriller',
  37: 'Faroeste',
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

const HEADERS_SB = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};
const HEADERS_TMDB = { accept: 'application/json', Authorization: `Bearer ${TMDB_TOKEN}` };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdbFetch(path, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${TMDB_BASE}${path}`, { headers: HEADERS_TMDB });
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

// Busca todas as séries sem poster (ou sem genre limpo)
async function fetchSeriesNeedingEnrichment() {
  const rows = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/series?select=id,tmdb_id,title,poster,genre&limit=1000&offset=${offset}`,
      { headers: HEADERS_SB }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    for (const row of batch) {
      // Enriquece se: sem poster, ou genre está com prefixo IPTV
      const needsPoster = !row.poster || !row.poster.includes('image.tmdb.org');
      const hasBadGenre =
        Array.isArray(row.genre) &&
        row.genre.some((g) => String(g).includes('|') || String(g).includes('SÉRIES'));
      if ((needsPoster || hasBadGenre) && row.tmdb_id) rows.push(row);
    }
    if (batch.length < 1000) break;
    offset += 1000;
    await sleep(100);
  }
  return rows;
}

async function enrichSeries(row) {
  const id = row.tmdb_id;
  const [details, images, videos, credits, providers] = await Promise.all([
    tmdbFetch(`/tv/${id}?language=pt-BR`),
    tmdbFetch(`/tv/${id}/images?include_image_language=pt,en,null`),
    tmdbFetch(`/tv/${id}/videos?language=pt-BR`),
    tmdbFetch(`/tv/${id}/credits?language=pt-BR`),
    tmdbFetch(`/tv/${id}/watch/providers`),
  ]);

  if (!details) return null;

  // Poster + backdrop
  const poster = details.poster_path ? `${IMG_W500}${details.poster_path}` : null;
  const backdrop = details.backdrop_path ? `${IMG_ORIG}${details.backdrop_path}` : null;

  // Logo
  const logos = images?.logos || [];
  const ptLogo = logos.find((l) => l.iso_639_1 === 'pt');
  const enLogo = logos.find((l) => l.iso_639_1 === 'en' || !l.iso_639_1);
  const logoUrl = (ptLogo || enLogo || logos[0])?.file_path
    ? `${IMG_ORIG}${(ptLogo || enLogo || logos[0]).file_path}`
    : null;

  // Trailer
  const allVid = videos?.results || [];
  const trailer =
    (
      allVid.find((v) => v.type === 'Trailer' && v.iso_639_1 === 'pt') ||
      allVid.find((v) => v.type === 'Trailer')
    )?.key || null;

  // Gêneros
  const genres = (details.genres || []).map((g) => TV_GENRES[g.id] || g.name).filter(Boolean);

  // Stars
  const stars = (credits?.cast || [])
    .slice(0, 5)
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ');

  // Plataforma
  let platform = null;
  const brFlat = providers?.results?.BR?.flatrate || [];
  for (const [pid, name] of Object.entries(PLATFORMS)) {
    if (brFlat.some((p) => p.provider_id === Number(pid))) {
      platform = name;
      break;
    }
  }

  return {
    poster: poster || row.poster,
    backdrop: backdrop || undefined,
    logo_url: logoUrl || undefined,
    trailer_key: trailer || undefined,
    genre: genres.length > 0 ? genres : row.genre || ['Drama'],
    stars: stars || undefined,
    platform: platform || undefined,
    year: details.first_air_date ? parseInt(details.first_air_date.slice(0, 4)) : undefined,
    description: details.overview || undefined,
    rating: details.vote_average ? Math.round(details.vote_average * 10) / 10 : undefined,
  };
}

async function updateSeries(id, data) {
  // Remove undefined values
  const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const r = await fetch(`${SUPABASE_URL}/rest/v1/series?id=eq.${id}`, {
    method: 'PATCH',
    headers: HEADERS_SB,
    body: JSON.stringify(body),
  });
  return r.status === 204 || r.ok;
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  enrich-series.mjs — Enriquecimento de Séries via TMDB  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('🔍 Buscando séries sem poster ou com genre IPTV...');
  const toEnrich = await fetchSeriesNeedingEnrichment();
  console.log(`   → ${toEnrich.length} séries precisam de enriquecimento\n`);

  if (toEnrich.length === 0) {
    console.log('✅ Todas as séries já estão enriquecidas!');
    return;
  }

  let enriched = 0,
    failed = 0;
  for (let i = 0; i < toEnrich.length; i++) {
    const row = toEnrich[i];
    process.stdout.write(
      `   [${i + 1}/${toEnrich.length}] ${(row.title || '').slice(0, 40).padEnd(40)} \r`
    );
    const data = await enrichSeries(row);
    if (data) {
      const ok = await updateSeries(row.id, data);
      if (ok) enriched++;
      else failed++;
    } else {
      failed++;
    }
    await sleep(120); // ~8 séries/s para evitar rate limit TMDB
  }

  console.log(`\n\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  CONCLUÍDO — ${enriched} enriquecidas | ${failed} falhas                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
