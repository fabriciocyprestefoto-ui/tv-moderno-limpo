#!/usr/bin/env node
/**
 * fix-catalog-db.mjs
 *
 * Limpeza completa do catálogo Supabase:
 *  1. Remove itens duplicados (mesmo tmdb_id+tipo, ou título+tipo+ano)
 *  2. Remove conteúdo anterior a 2022
 *  3. Enriquece via TMDB: gênero correto (pt-BR), poster_path, backdrop_path, logo, rating
 *
 * Uso:
 *   node scripts/fix-catalog-db.mjs             # executa tudo
 *   node scripts/fix-catalog-db.mjs --dry-run   # só mostra o que faria
 *   node scripts/fix-catalog-db.mjs --step=dedup
 *   node scripts/fix-catalog-db.mjs --step=pre2022
 *   node scripts/fix-catalog-db.mjs --step=enrich
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const TMDB_API_KEY = 'ddb1bdf6aa91bdf3357978538848b0c1d';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/original';
const MIN_YEAR = 2022; // Remove conteúdo anterior a este ano
const BATCH_SIZE = 50; // Supabase: itens por query
const TMDB_BATCH = 8; // Requisições TMDB paralelas por vez
const TMDB_DELAY_MS = 260; // ~4 req/s — bem abaixo do limite de 40/s

// ─────────────────────────────────────────────────────────────
// CLI ARGS
// ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STEP = args.find((a) => a.startsWith('--step='))?.split('=')[1] || 'all';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─────────────────────────────────────────────────────────────
// HELPERS — Supabase
// ─────────────────────────────────────────────────────────────
async function fetchTable(table) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + BATCH_SIZE - 1)
      .order('id');
    if (error) throw new Error(`Supabase fetch (${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(
      ...data.map((r) => ({ ...r, _table: table, type: table === 'movies' ? 'movie' : 'series' }))
    );
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  return all;
}

async function fetchAllMedia() {
  const [movies, series] = await Promise.all([fetchTable('movies'), fetchTable('series')]);
  return [...movies, ...series];
}

async function deleteRows(table, ids) {
  if (ids.length === 0) return;
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] delete ${table} ${ids.length} IDs: ${ids.slice(0, 5).join(',')}...`);
    return;
  }
  const chunks = chunk(ids, 100);
  for (const ch of chunks) {
    const { error } = await supabase.from(table).delete().in('id', ch);
    if (error) console.error(`  ⚠️  delete error (${table}): ${error.message}`);
  }
}

async function updateRow(item, fields) {
  const table = item._table;
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] update ${table} id=${item.id}`, JSON.stringify(fields).slice(0, 120));
    return;
  }
  const { error } = await supabase.from(table).update(fields).eq('id', item.id);
  if (error) console.error(`  ⚠️  update ${table}/${item.id}: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────
// HELPERS — general
// ─────────────────────────────────────────────────────────────
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeTitle(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getItemYear(item) {
  const src = item.year || item.release_date || item.first_air_date || '';
  const m = String(src).match(/(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

function selectBest(items) {
  // Escolhe o item com mais campos preenchidos (stream_url > poster > backdrop > logo > descrição)
  const score = (i) =>
    (i.stream_url ? 4 : 0) +
    (i.video_url ? 4 : 0) +
    (i.source_url ? 4 : 0) +
    (i.poster_path ? 2 : 0) +
    (i.poster ? 1 : 0) +
    (i.backdrop_path ? 2 : 0) +
    (i.backdrop ? 1 : 0) +
    (i.logo_url ? 1 : 0) +
    (i.description ? 1 : 0);
  return items.sort((a, b) => score(b) - score(a))[0];
}

// ─────────────────────────────────────────────────────────────
// HELPERS — TMDB
// ─────────────────────────────────────────────────────────────
async function tmdbFetch(path, extraParams = {}) {
  const params = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'pt-BR', ...extraParams });
  const url = `${TMDB_BASE}${path}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      await sleep(2000);
      return tmdbFetch(path, extraParams);
    }
    return null;
  }
  return res.json().catch(() => null);
}

async function tmdbImages(tmdbId, type) {
  const endpoint = type === 'movie' ? `/movie/${tmdbId}/images` : `/tv/${tmdbId}/images`;
  const data = await tmdbFetch(endpoint, { include_image_language: 'en,null' });
  if (!data) return null;
  const logos = data.logos || [];
  // Preferir logo inglês PNG/SVG
  const logo = logos.find((l) => l.iso_639_1 === 'en') || logos[0];
  return logo ? `${TMDB_IMG_BASE}${logo.file_path}` : null;
}

async function tmdbSearch(title, type, year) {
  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
  const params = { query: title };
  if (year) params[type === 'movie' ? 'year' : 'first_air_date_year'] = year;
  const data = await tmdbFetch(endpoint, params);
  const results = data?.results || [];
  return results[0] || null;
}

async function tmdbDetails(tmdbId, type) {
  const endpoint = type === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
  return tmdbFetch(endpoint);
}

function extractGenres(details) {
  return (details?.genres || []).map((g) => g.name).filter(Boolean);
}

function extractYear(details, type) {
  const raw = type === 'movie' ? details?.release_date : details?.first_air_date;
  const m = String(raw || '').match(/(\d{4})/);
  return m ? parseInt(m[1]) : null;
}

// ─────────────────────────────────────────────────────────────
// PHASE 1 — Remover conteúdo anterior a 2022
// ─────────────────────────────────────────────────────────────
async function removePre2022(all) {
  console.log('\n📅 FASE 1 — Removendo conteúdo anterior a 2022...');
  const toDelete = [];
  for (const item of all) {
    const yr = getItemYear(item);
    if (yr !== null && yr < MIN_YEAR) {
      console.log(`  ✂️  [pre-2022] ${item.type} "${item.title}" (${yr}) id=${item.id}`);
      toDelete.push(item.id);
    }
  }
  console.log(`  Total a remover: ${toDelete.length}`);
  // separar por tabela
  const byTable = {};
  for (const item of all) {
    if (toDelete.includes(item.id)) {
      if (!byTable[item._table]) byTable[item._table] = [];
      byTable[item._table].push(item.id);
    }
  }
  for (const [tbl, ids] of Object.entries(byTable)) await deleteRows(tbl, ids);
  const deletedSet = new Set(toDelete);
  return all.filter((i) => !deletedSet.has(i.id));
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 — Remover duplicatas
// ─────────────────────────────────────────────────────────────
async function removeDuplicates(all) {
  console.log('\n🔁 FASE 2 — Removendo duplicatas...');

  // Grupo por tmdb_id+type
  const byTmdb = new Map();
  const noTmdb = [];

  for (const item of all) {
    if (item.tmdb_id) {
      const key = `${item.type}:${item.tmdb_id}`;
      const group = byTmdb.get(key) || [];
      group.push(item);
      byTmdb.set(key, group);
    } else {
      noTmdb.push(item);
    }
  }

  // Grupo por título normalizado+type+ano (sem tmdb_id)
  const byTitle = new Map();
  for (const item of noTmdb) {
    const yr = getItemYear(item) || 0;
    const key = `${item.type}:${normalizeTitle(item.title)}:${yr}`;
    const group = byTitle.get(key) || [];
    group.push(item);
    byTitle.set(key, group);
  }

  const toDelete = [];
  const kept = [];

  for (const [key, group] of byTmdb) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const best = selectBest(group);
    const dups = group.filter((i) => i.id !== best.id);
    console.log(
      `  🔁 tmdb-dup: ${group[0].type} tmdb_id=${group[0].tmdb_id} — mantendo id=${best.id}, deletando ${dups.map((d) => d.id).join(',')}`
    );
    dups.forEach((d) => toDelete.push(d.id));
    kept.push(best);
  }

  for (const [key, group] of byTitle) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const best = selectBest(group);
    const dups = group.filter((i) => i.id !== best.id);
    console.log(
      `  🔁 title-dup: "${group[0].title}" — mantendo id=${best.id}, deletando ${dups.map((d) => d.id).join(',')}`
    );
    dups.forEach((d) => toDelete.push(d.id));
    kept.push(best);
  }

  console.log(`  Duplicatas a deletar: ${toDelete.length}`);
  const byTable2 = {};
  for (const item of all) {
    if (toDelete.includes(item.id)) {
      if (!byTable2[item._table]) byTable2[item._table] = [];
      byTable2[item._table].push(item.id);
    }
  }
  for (const [tbl, ids] of Object.entries(byTable2)) await deleteRows(tbl, ids);
  return kept;
}

// ─────────────────────────────────────────────────────────────
// PHASE 3 — Enriquecer via TMDB
// ─────────────────────────────────────────────────────────────
async function enrichWithTmdb(all) {
  console.log('\n🎬 FASE 3 — Enriquecendo com TMDB...');
  const batches = chunk(all, TMDB_BATCH);
  let done = 0;
  let updated = 0;
  let linked = 0;

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (item) => {
        try {
          let tmdbId = item.tmdb_id ? Number(item.tmdb_id) : null;

          // Se não tem tmdb_id, tenta buscar pelo título
          if (!tmdbId) {
            const yr = getItemYear(item);
            const result = await tmdbSearch(item.title, item.type, yr);
            if (result?.id) {
              tmdbId = result.id;
              console.log(`  🔗 Linkado: "${item.title}" → tmdb_id=${tmdbId}`);
              linked++;
            }
          }

          if (!tmdbId) {
            done++;
            return;
          }

          // Busca detalhes + imagens em paralelo
          const [details, logoUrl] = await Promise.all([
            tmdbDetails(tmdbId, item.type),
            tmdbImages(tmdbId, item.type),
          ]);

          if (!details) {
            done++;
            return;
          }

          const genres = extractGenres(details);
          const posterPath = details.poster_path || item.poster_path || null;
          const bkPath = details.backdrop_path || item.backdrop_path || null;
          const rating = details.vote_average || item.rating || null;
          const overview = details.overview || item.description || null;
          const tmdbYear = extractYear(details, item.type);

          const relDate =
            item.type === 'movie'
              ? details.release_date || item.release_date || null
              : details.first_air_date || item.first_air_date || null;

          const fields = {
            tmdb_id: tmdbId,
            poster_path: posterPath,
            backdrop_path: bkPath,
            genre: genres.length > 0 ? genres : item.genre || [],
            rating: rating !== null ? parseFloat(String(rating)).toFixed(1) : item.rating,
          };

          if (overview) fields.description = overview;
          if (relDate) fields.release_date = relDate;
          if (tmdbYear && !item.year) fields.year = tmdbYear;

          // Poster e backdrop como URLs completas
          if (posterPath) fields.poster = `${TMDB_IMG_BASE}${posterPath}`;
          if (bkPath) fields.backdrop = `${TMDB_IMG_BASE}${bkPath}`;
          if (logoUrl) fields.logo_url = logoUrl;

          await updateRow(item, fields);
          updated++;
          console.log(
            `  ✅ ${item.type} "${item.title}" id=${item.id} | gêneros: ${genres.join(', ') || '—'}`
          );
        } catch (err) {
          console.error(`  ⚠️  Erro em "${item.title}": ${err.message}`);
        }
        done++;
      })
    );

    const pct = Math.round((done / all.length) * 100);
    process.stdout.write(
      `\r  Progresso: ${done}/${all.length} (${pct}%) — atualizados: ${updated} | linkados: ${linked}   `
    );
    await sleep(TMDB_DELAY_MS);
  }

  console.log(`\n  ✔ Concluído: ${updated} atualizados, ${linked} novos links TMDB`);
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 fix-catalog-db.mjs — Limpeza e enriquecimento do catálogo');
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log(`   Min year: ${MIN_YEAR}`);
  console.log(`   Mode: ${DRY_RUN ? '⚠️  DRY-RUN (sem gravação)' : '✍️  LIVE'}`);
  console.log(`   Step: ${STEP}`);

  console.log('\n📦 Carregando todos os registros...');
  let all = await fetchAllMedia();
  console.log(`   Total carregado: ${all.length}`);

  const runAll = STEP === 'all';

  if (runAll || STEP === 'pre2022') {
    all = await removePre2022(all);
    console.log(`   Restantes após remoção pre-2022: ${all.length}`);
  }

  if (runAll || STEP === 'dedup') {
    all = await removeDuplicates(all);
    console.log(`   Restantes após dedup: ${all.length}`);
  }

  if (runAll || STEP === 'enrich') {
    await enrichWithTmdb(all);
  }

  console.log('\n🎉 Concluído!');
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err.message || err);
  process.exit(1);
});
