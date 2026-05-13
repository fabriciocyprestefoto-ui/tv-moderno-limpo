/**
 * fix-series-posters.mjs
 * ══════════════════════════════════════════════════════════════════
 * Busca os 50 melhores séries do TMDB e atualiza as linhas existentes
 * no Supabase com poster/backdrop/logo/trailer vindos diretamente do TMDB.
 *
 * Uso: node scripts/fix-series-posters.mjs
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

// Busca top séries do TMDB — 2022+ com nota ≥ 6.5
async function discoverTopSeries(pages = 4) {
  const results = [];
  const seen = new Set();
  for (let page = 1; page <= pages; page++) {
    const params = new URLSearchParams({
      sort_by: 'vote_average.desc',
      'vote_count.gte': '500',
      'first_air_date.gte': '2022-01-01',
      'vote_average.gte': '6.5',
      with_original_language: 'en|pt|es|ja|ko|fr|it|de',
      page: String(page),
      language: 'pt-BR',
    });
    const data = await tmdbFetch(`/discover/tv?${params}`);
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

// Busca detalhes completos de uma série
async function getSeriesDetails(tmdbId) {
  const [details, images, videos, credits, providers] = await Promise.all([
    tmdbFetch(`/tv/${tmdbId}?language=pt-BR`),
    tmdbFetch(`/tv/${tmdbId}/images?include_image_language=pt,en,null`),
    tmdbFetch(`/tv/${tmdbId}/videos?language=pt-BR`),
    tmdbFetch(`/tv/${tmdbId}/credits?language=pt-BR`),
    tmdbFetch(`/tv/${tmdbId}/watch/providers`),
  ]);
  if (!details?.poster_path) return null;

  const poster = `${IMG_W500}${details.poster_path}`;
  const backdrop = details.backdrop_path ? `${IMG_ORIG}${details.backdrop_path}` : null;

  const logos = images?.logos || [];
  const ptLogo = logos.find((l) => l.iso_639_1 === 'pt');
  const enLogo = logos.find((l) => l.iso_639_1 === 'en' || !l.iso_639_1);
  const logo_url = (ptLogo || enLogo || logos[0])?.file_path
    ? `${IMG_ORIG}${(ptLogo || enLogo || logos[0]).file_path}`
    : null;

  const allVid = videos?.results || [];
  const trailer_key =
    (
      allVid.find((v) => v.type === 'Trailer' && v.iso_639_1 === 'pt') ||
      allVid.find((v) => v.type === 'Trailer')
    )?.key || null;

  const genre = (details.genres || []).map((g) => TV_GENRES[g.id] || g.name).filter(Boolean);
  const stars = (credits?.cast || [])
    .slice(0, 5)
    .map((a) => a.name)
    .filter(Boolean)
    .join(', ');
  const brFlat = providers?.results?.BR?.flatrate || [];
  let platform = null;
  for (const [pid, name] of Object.entries(PLATFORMS)) {
    if (brFlat.some((p) => p.provider_id === Number(pid))) {
      platform = name;
      break;
    }
  }

  return {
    poster,
    backdrop,
    logo_url,
    trailer_key,
    genre,
    stars,
    platform,
    title: details.name || details.original_name,
    year: details.first_air_date ? parseInt(details.first_air_date.slice(0, 4)) : null,
    description: details.overview || null,
    rating: details.vote_average ? Math.round(details.vote_average * 10) / 10 : null,
  };
}

// Verifica se a série já existe no Supabase (por tmdb_id)
async function findSeries(tmdbId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/series?tmdb_id=eq.${tmdbId}&select=id,poster&limit=1`,
    { headers: HEADERS_SB }
  );
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// PATCH série existente
async function patchSeries(id, data) {
  const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null));
  const r = await fetch(`${SUPABASE_URL}/rest/v1/series?id=eq.${id}`, {
    method: 'PATCH',
    headers: HEADERS_SB,
    body: JSON.stringify(body),
  });
  return r.status === 204 || r.ok;
}

// INSERT nova série
async function insertSeries(tmdbId, data) {
  const body = Object.fromEntries(
    Object.entries({ ...data, tmdb_id: tmdbId, type: 'series' }).filter(([, v]) => v != null)
  );
  const r = await fetch(`${SUPABASE_URL}/rest/v1/series`, {
    method: 'POST',
    headers: { ...HEADERS_SB, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  return r.status === 201 || r.ok;
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  fix-series-posters.mjs — Posters TMDB para Séries       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('📺 Buscando top 50 séries no TMDB (2022+, nota ≥ 6.5)...');
  const raw = await discoverTopSeries(4);
  const top50 = raw.slice(0, 50);
  console.log(`  → ${top50.length} séries selecionadas\n`);

  let patched = 0,
    inserted = 0,
    failed = 0;

  for (let i = 0; i < top50.length; i++) {
    const item = top50[i];
    const name = (item.name || '').slice(0, 40).padEnd(40);
    process.stdout.write(`  [${i + 1}/${top50.length}] ${name} \r`);

    const details = await getSeriesDetails(item.id);
    if (!details) {
      failed++;
      await sleep(120);
      continue;
    }

    const existing = await findSeries(item.id);
    if (existing) {
      // Série existe: PATCH com dados TMDB (sobrescreve poster Supabase Storage)
      const ok = await patchSeries(existing.id, details);
      if (ok) {
        patched++;
      } else {
        failed++;
      }
    } else {
      // Série nova: INSERT
      const ok = await insertSeries(item.id, details);
      if (ok) {
        inserted++;
      } else {
        failed++;
      }
    }
    await sleep(120);
  }

  console.log(`\n\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  CONCLUÍDO — ${patched} atualizadas | ${inserted} inseridas | ${failed} falhas`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
