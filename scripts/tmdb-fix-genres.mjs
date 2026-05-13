/**
 * tmdb-fix-genres.mjs
 * ══════════════════════════════════════════════════════════════════
 * Usa a API TMDB para atualizar o gênero correto (pt-BR) de cada
 * filme e série no Supabase que possua tmdb_id.
 *
 * Também remove entradas duplicadas (mesmo poster ou mesmo tmdb_id).
 *
 * Uso: node scripts/tmdb-fix-genres.mjs
 *      node scripts/tmdb-fix-genres.mjs --dry-run   (só mostra, não salva)
 * ══════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = 'https://rqtzmgbduomwrhgrfsvp.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdHptZ2JkdW9td3JoZ3Jmc3ZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY1NDQyMCwiZXhwIjoyMDkwMjMwNDIwfQ.85fwYAK6O4lDv0TX1i0C5w0eR6ASQlWCy_-sZQG8Z8g';
const TMDB_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 5; // requisições paralelas ao TMDB
const DELAY = 250; // ms entre lotes (evita rate-limit)

const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};
const TMDB_HEADERS = {
  accept: 'application/json',
  Authorization: `Bearer ${TMDB_TOKEN}`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── TMDB ────────────────────────────────────────────────────────────────────

async function fetchTmdbDetails(tmdbId, mediaType, retries = 3) {
  const endpoint = mediaType === 'series' ? 'tv' : 'movie';
  const url = `${TMDB_BASE}/${endpoint}/${tmdbId}?language=pt-BR`;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: TMDB_HEADERS });
      if (r.status === 429) {
        await sleep(4000 * (i + 1));
        continue;
      }
      if (r.status === 404) return null;
      if (!r.ok) {
        await sleep(1000);
        continue;
      }
      return await r.json();
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

// Extrai nomes de gênero da resposta TMDB
function extractGenres(tmdbData) {
  if (!tmdbData?.genres || !Array.isArray(tmdbData.genres)) return null;
  return tmdbData.genres.map((g) => g.name).filter(Boolean);
}

// ── SUPABASE ────────────────────────────────────────────────────────────────

async function fetchAll(table) {
  const rows = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id,tmdb_id,title,genre,poster&limit=1000&offset=${offset}`,
      { headers: SB_HEADERS }
    );
    if (!r.ok) {
      console.error(`Erro ao buscar ${table}:`, await r.text());
      break;
    }
    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
    await sleep(100);
  }
  return rows;
}

async function updateGenre(table, id, genre) {
  if (DRY_RUN) return true;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify({ genre }),
  });
  return r.status === 204 || r.ok;
}

async function deleteRow(table, id) {
  if (DRY_RUN) return true;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: SB_HEADERS,
  });
  return r.status === 204 || r.ok;
}

// ── DEDUPLICATION ──────────────────────────────────────────────────────────

function extractPosterFile(url) {
  if (!url) return null;
  const m = url.match(/\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))(?:\?|$)/i);
  return m ? m[1].toLowerCase() : null;
}

function findDuplicates(rows) {
  const seenTmdb = new Map(); // tmdb_id → id do primeiro
  const seenPoster = new Map(); // posterFile → id do primeiro
  const toDelete = [];

  for (const row of rows) {
    let isDup = false;

    if (row.tmdb_id) {
      const k = `${row.tmdb_id}`;
      if (seenTmdb.has(k)) {
        toDelete.push({
          id: row.id,
          title: row.title,
          reason: `tmdb_id duplicado (já existe id=${seenTmdb.get(k)})`,
        });
        isDup = true;
      } else {
        seenTmdb.set(k, row.id);
      }
    }

    if (!isDup) {
      const pf = extractPosterFile(row.poster);
      if (pf) {
        if (seenPoster.has(pf)) {
          toDelete.push({
            id: row.id,
            title: row.title,
            reason: `poster duplicado (já existe id=${seenPoster.get(pf)})`,
          });
          isDup = true;
        } else {
          seenPoster.set(pf, row.id);
        }
      }
    }
  }
  return toDelete;
}

// ── MAIN ────────────────────────────────────────────────────────────────────

async function processTable(table, mediaType) {
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  ${table.padEnd(54)}║`);
  console.log(`╚═══════════════════════════════════════════════════════╝`);

  const rows = await fetchAll(table);
  console.log(`  📦 ${rows.length} linhas carregadas`);

  // 1. Remover duplicatas ──────────────────────────────────────────
  const duplicates = findDuplicates(rows);
  if (duplicates.length > 0) {
    console.log(`\n  🔴 ${duplicates.length} duplicatas encontradas:`);
    for (const d of duplicates) {
      console.log(`     • [${d.id}] "${d.title}" — ${d.reason}`);
    }
    if (!DRY_RUN) {
      let deleted = 0;
      for (const d of duplicates) {
        const ok = await deleteRow(table, d.id);
        if (ok) deleted++;
        await sleep(30);
      }
      console.log(`  ✅ ${deleted} duplicatas removidas`);
    } else {
      console.log(`  (--dry-run: nenhuma linha removida)`);
    }
  } else {
    console.log(`  ✅ Nenhuma duplicata encontrada`);
  }

  // 2. Atualizar gêneros via TMDB ──────────────────────────────────
  const withTmdbId = rows.filter((r) => r.tmdb_id && !duplicates.find((d) => d.id === r.id));
  console.log(`\n  🎬 ${withTmdbId.length} itens com tmdb_id para enriquecimento de gênero`);

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < withTmdbId.length; i += BATCH) {
    const batch = withTmdbId.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((row) => fetchTmdbDetails(row.tmdb_id, mediaType)));

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const tmdbData = results[j];

      if (!tmdbData) {
        failed++;
        continue;
      }

      const newGenres = extractGenres(tmdbData);
      if (!newGenres || newGenres.length === 0) {
        failed++;
        continue;
      }

      const currentGenres = Array.isArray(row.genre) ? row.genre : [];
      const genresMatch =
        currentGenres.length === newGenres.length &&
        currentGenres.every((g, idx) => g === newGenres[idx]);

      if (!genresMatch) {
        if (DRY_RUN) {
          console.log(
            `     [${row.id}] "${row.title}": [${currentGenres.join(', ')}] → [${newGenres.join(', ')}]`
          );
        }
        const ok = await updateGenre(table, row.id, newGenres);
        if (ok) updated++;
        else failed++;
      } else {
        unchanged++;
      }
    }

    process.stdout.write(`  [${Math.min(i + BATCH, withTmdbId.length)}/${withTmdbId.length}]\r`);
    await sleep(DELAY);
  }

  console.log(
    `\n  ✅ Gêneros: ${updated} atualizados | ${unchanged} sem mudança | ${failed} sem dados TMDB`
  );
  return { updated, unchanged, failed, duplicatesRemoved: DRY_RUN ? 0 : duplicates.length };
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  tmdb-fix-genres.mjs — Gêneros TMDB pt-BR             ║');
  if (DRY_RUN) {
    console.log('║  ⚠️  MODO DRY-RUN: nenhuma alteração será salva       ║');
  }
  console.log('╚═══════════════════════════════════════════════════════╝');

  const movies = await processTable('movies', 'movie');
  const series = await processTable('series', 'series');

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(`║  CONCLUÍDO`);
  console.log(
    `║  Filmes  — gêneros: ${movies.updated} atualizados | duplicatas: ${movies.duplicatesRemoved} removidas`
  );
  console.log(
    `║  Séries  — gêneros: ${series.updated} atualizados | duplicatas: ${series.duplicatesRemoved} removidas`
  );
  if (DRY_RUN) console.log('║  (dry-run — execute sem --dry-run para aplicar)');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
