/**
 * clean-and-enrich-catalog.mjs
 * ════════════════════════════════════════════════════════════════════
 * Fase 1 — Deleta filmes/séries com year < 2020 direto no Supabase.
 * Fase 2 — Para itens sem tmdb_id: busca no TMDB, deleta pré-2020
 *           encontrados, enriquece restantes com gênero, plataforma,
 *           poster, backdrop e nota TMDB.
 * Fase 3 — Para itens que já têm tmdb_id: re-enriquece gênero e
 *           plataforma que faltam.
 *
 * • Retomável: progresso salvo em .enrich-progress.json
 * • Rate-limit: CONCURRENCY threads paralelas (~240 req/min TMDB free)
 * • Agrupamento por título: evita buscas duplicadas para episódios
 *   da mesma série
 *
 * Uso: node scripts/clean-and-enrich-catalog.mjs
 *      node scripts/clean-and-enrich-catalog.mjs --enrich-only   (pula fase 1)
 *      node scripts/clean-and-enrich-catalog.mjs --delete-only   (só fase 1)
 * ════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireSupabaseUrl, requireServiceRoleKey, loadRootEnv } from './supabase-env.mjs';

loadRootEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.join(__dirname, '../.enrich-progress.json');

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();

// TMDB tokens: lê todos do .env e rotaciona entre eles
const TMDB_TOKENS = (
  process.env.VITE_TMDB_READ_TOKENS ||
  process.env.VITE_TMDB_READ_TOKEN ||
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U'
)
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

// Cada token tem seu próprio semáforo/índice — round-robin sequencial
let _tokenIdx = 0;
function nextToken() {
  const token = TMDB_TOKENS[_tokenIdx % TMDB_TOKENS.length];
  _tokenIdx++;
  return token;
}

console.log(`  Tokens TMDB  : ${TMDB_TOKENS.length} chaves carregadas`);

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_ORIG = 'https://image.tmdb.org/t/p/original';
const MIN_YEAR = 2020;
const CONCURRENCY = 6; // 2 threads por token (3 tokens × 2)
const UPDATE_BATCH = 500; // linhas por PATCH ao Supabase
const REQUEST_DELAY = 150; // ms entre buscas por thread (escalonado abaixo)
const PAGE_SIZE = 1000; // linhas por fetch do Supabase

// ─── Filtros de qualidade TMDB ───────────────────────────────────
const MIN_RATING = 7.0; // vote_average mínimo
const MIN_VOTES = 100; // vote_count mínimo para ser confiável
const DELETE_NOT_FOUND = true; // deletar itens não encontrados no TMDB

// ─── Gêneros TMDB ────────────────────────────────────────────────
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
  10770: 'Cinema TV',
  53: 'Suspense',
  10752: 'Guerra',
  37: 'Faroeste',
};

const TV_GENRES = {
  10759: 'Ação',
  16: 'Animação',
  35: 'Comédia',
  80: 'Crime',
  99: 'Documentário',
  18: 'Drama',
  10751: 'Família',
  10762: 'Infantil',
  9648: 'Mistério',
  10765: 'Ficção Científica',
  10768: 'Guerra',
  10749: 'Romance',
  53: 'Suspense',
  37: 'Faroeste',
};

// Provedores de plataformas no Brasil (watch/providers BR)
const BR_PROVIDERS = {
  8: 'Netflix',
  119: 'Amazon Prime Video',
  337: 'Disney+',
  531: 'Paramount+',
  384: 'Max',
  2: 'Apple TV+',
  283: 'Crunchyroll',
  307: 'Globoplay',
  167: 'Mubi',
  350: 'Apple TV',
  546: 'Looke',
  215: 'MUBI',
};

// ─── Headers ─────────────────────────────────────────────────────
const SB = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

// ─── Progresso ───────────────────────────────────────────────────
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    /* ignore */
  }
  return { processedTitles: [] };
}

function saveProgress(data) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
  } catch {
    /* ignore */
  }
}

// ─── Utilitários ────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanSeriesTitle(raw) {
  return (
    (raw || '')
      // Remove SxxExx, S01, E01, Temporada X, Season X
      .replace(/\s*[-–:]\s*S\d{1,2}E\d{1,3}.*$/i, '')
      .replace(/\s*S\d{1,2}E\d{1,3}.*$/i, '')
      .replace(/\s*[-–:]\s*S\d{1,2}.*$/i, '')
      .replace(/\s*[-–:]\s*Temporada\s*\d+.*/i, '')
      .replace(/\s*[-–:]\s*Season\s*\d+.*/i, '')
      .replace(/\s*\(S\d{1,2}.*$/i, '')
      // Remove sufixos de qualidade
      .replace(/\s+(4K|HDR|HD|SD|UHD|BluRay|HDTV|WEBDL|WEB-DL|WEBRIP|HEVC)\s*$/i, '')
      // Remove ano no final
      .replace(/\s*[-–(]\s*((?:19|20)\d{2})\s*[)–-]?\s*$/, '')
      .trim()
  );
}

function cleanMovieTitle(raw) {
  return (raw || '')
    .replace(/\s+(4K|HDR|HD|SD|UHD|BluRay|HDTV|WEBDL|WEB-DL|WEBRIP|HEVC)\s*$/i, '')
    .replace(/\s*[-–(]\s*((?:19|20)\d{2})\s*[)–-]?\s*$/, '')
    .trim();
}

// ─── TMDB fetch com rotação de tokens e retry ────────────────────
async function tmdbFetch(path, retries = TMDB_TOKENS.length * 2) {
  for (let i = 0; i < retries; i++) {
    const token = nextToken();
    try {
      const r = await fetch(`${TMDB_BASE}${path}`, {
        headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (r.status === 429) {
        // Rate limit: tenta próximo token imediatamente, pequena espera
        await sleep(300 * (Math.floor(i / TMDB_TOKENS.length) + 1));
        continue;
      }
      if (r.status === 404) return null;
      if (!r.ok) return null;
      return await r.json();
    } catch {
      if (i === retries - 1) return null;
      await sleep(500 * (i + 1));
    }
  }
  return null;
}

// ─── Buscar no TMDB por título ────────────────────────────────────
async function searchMovie(title, year) {
  const q = encodeURIComponent(title);
  const yearParam = year ? `&year=${year}` : '';
  const data = await tmdbFetch(`/search/movie?query=${q}${yearParam}&language=pt-BR&page=1`);
  if (!data?.results?.length) return null;

  // Prioriza match de título exato, depois mais popular
  const exactMatch = data.results.find(
    (r) =>
      r.title?.toLowerCase() === title.toLowerCase() ||
      r.original_title?.toLowerCase() === title.toLowerCase()
  );
  return exactMatch || data.results[0];
}

async function searchTV(title, year) {
  const q = encodeURIComponent(title);
  const yearParam = year ? `&first_air_date_year=${year}` : '';
  const data = await tmdbFetch(`/search/tv?query=${q}${yearParam}&language=pt-BR&page=1`);
  if (!data?.results?.length) return null;

  const exactMatch = data.results.find(
    (r) =>
      r.name?.toLowerCase() === title.toLowerCase() ||
      r.original_name?.toLowerCase() === title.toLowerCase()
  );
  return exactMatch || data.results[0];
}

// ─── Buscar provedores BR ─────────────────────────────────────────
async function getWatchProviders(tmdbId, type) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const data = await tmdbFetch(`/${endpoint}/${tmdbId}/watch/providers`);
  const br = data?.results?.BR;
  if (!br) return null;

  const allProviders = [...(br.flatrate || []), ...(br.subscription || []), ...(br.buy || [])];

  const mapped = allProviders.map((p) => BR_PROVIDERS[p.provider_id]).filter(Boolean);

  return mapped.length > 0 ? mapped[0] : null; // retorna a primeira plataforma disponível
}

// ─── Enriquecer um item via tmdb_id ─────────────────────────────
async function enrichByTmdbId(tmdbId, type) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const details = await tmdbFetch(`/${endpoint}/${tmdbId}?language=pt-BR`);
  if (!details) return null;

  const genreMap = type === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const genres = (details.genres || []).map((g) => genreMap[g.id] || g.name).filter(Boolean);

  const releaseYear =
    type === 'movie'
      ? parseInt((details.release_date || '').slice(0, 4), 10)
      : parseInt((details.first_air_date || '').slice(0, 4), 10);

  const poster = details.poster_path ? `${IMG_W500}${details.poster_path}` : null;
  const backdrop = details.backdrop_path ? `${IMG_ORIG}${details.backdrop_path}` : null;
  const rating = details.vote_average ? Math.round(details.vote_average * 10) / 10 : null;

  const platform = await getWatchProviders(tmdbId, type);

  return {
    tmdb_id: tmdbId,
    genre: genres.length > 0 ? genres : undefined,
    platform: platform || undefined,
    poster: poster || undefined,
    backdrop: backdrop || undefined,
    rating: rating ? String(rating) : undefined,
    year: Number.isFinite(releaseYear) && releaseYear > 1900 ? releaseYear : undefined,
  };
}

// ─── Supabase helpers ────────────────────────────────────────────
async function sbDelete(table, filter) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const r = await fetch(url, { method: 'DELETE', headers: SB });
  if (!r.ok) {
    const txt = await r.text();
    console.error(`[DELETE ${table}] HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.ok;
}

async function sbFetch(table, select, rangeFrom, rangeTo, extraFilter = '') {
  const filter = extraFilter ? `&${extraFilter}` : '';
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&offset=${rangeFrom}&limit=${rangeTo - rangeFrom}${filter}`;
  const r = await fetch(url, { headers: { ...SB, Prefer: 'count=exact' } });
  if (!r.ok) return [];
  return r.json();
}

async function sbPatch(table, ids, updates) {
  if (ids.length === 0) return;
  // Atualiza por id usando POST com upsert
  const rows = ids.map((id) => ({ id, ...updates }));
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...SB, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error(`[UPSERT ${table}] HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
}

async function sbDeleteByIds(table, ids) {
  if (ids.length === 0) return;
  // Deleta em lotes para evitar URL muito longa
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const filter = `id=in.(${chunk.map((id) => `"${id}"`).join(',')})`;
    await sbDelete(table, filter);
    if (i + CHUNK < ids.length) await sleep(100);
  }
}

// Busca todas as linhas de uma tabela paginando
async function fetchAllRows(table, select, extraFilter = '') {
  const rows = [];
  let offset = 0;
  while (true) {
    const batch = await sbFetch(table, select, offset, offset + PAGE_SIZE, extraFilter);
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(150);
  }
  return rows;
}

// ─── Pool de concorrência ─────────────────────────────────────────
async function runConcurrent(tasks, concurrency, onProgress) {
  const results = [];
  let idx = 0;
  let done = 0;

  async function worker(workerIdx) {
    // Stagger inicial: cada worker espera um offset diferente para evitar burst
    await sleep(workerIdx * Math.floor(REQUEST_DELAY / concurrency));
    while (idx < tasks.length) {
      const i = idx++;
      const result = await tasks[i]();
      results[i] = result;
      done++;
      if (onProgress) onProgress(done, tasks.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, (_, i) => worker(i));
  await Promise.all(workers);
  return results;
}

// ─── FASE 1: Deletar conteúdo pré-2020 ──────────────────────────
async function phase1DeleteOld() {
  console.log('\n═══ FASE 1: Remover conteúdo com year < 2020 ══════════════');

  console.log('  🗑️  Deletando filmes pré-2020 (year IS NOT NULL AND year < 2020)...');
  await sbDelete('movies', `year=lt.${MIN_YEAR}&year=not.is.null`);
  console.log('      ✓ Filmes antigos removidos');

  console.log('  🗑️  Deletando séries pré-2020 (year IS NOT NULL AND year < 2020)...');
  await sbDelete('series', `year=lt.${MIN_YEAR}&year=not.is.null`);
  console.log('      ✓ Séries antigas removidas');

  console.log('\n  ✅ Fase 1 concluída!');
}

// ─── FASE 2: Busca TMDB para itens sem tmdb_id ───────────────────
async function phase2SearchAndEnrich(progress) {
  console.log('\n═══ FASE 2: Buscar no TMDB (itens sem tmdb_id) ════════════');

  const processedTitles = new Set(progress.processedTitles || []);

  // Busca filmes sem tmdb_id
  console.log('  📥 Carregando filmes sem tmdb_id...');
  const moviesNeedSearch = await fetchAllRows(
    'movies',
    'id,title,year,genre,platform',
    'tmdb_id=is.null'
  );
  console.log(`     ${moviesNeedSearch.length.toLocaleString()} filmes para pesquisar`);

  // Busca séries sem tmdb_id
  console.log('  📥 Carregando séries sem tmdb_id...');
  const seriesNeedSearch = await fetchAllRows(
    'series',
    'id,title,year,genre,platform',
    'tmdb_id=is.null'
  );
  console.log(`     ${seriesNeedSearch.length.toLocaleString()} séries para pesquisar`);

  // Agrupar filmes por título limpo
  const movieGroups = new Map(); // cleanTitle → [{id, year}]
  for (const row of moviesNeedSearch) {
    const key = cleanMovieTitle(row.title).toLowerCase();
    if (!key) continue;
    if (!movieGroups.has(key))
      movieGroups.set(key, { title: cleanMovieTitle(row.title), year: row.year, ids: [] });
    movieGroups.get(key).ids.push(row.id);
  }

  // Agrupar séries por título base (sem episódio/temporada)
  const seriesGroups = new Map();
  for (const row of seriesNeedSearch) {
    const key = cleanSeriesTitle(row.title).toLowerCase();
    if (!key) continue;
    if (!seriesGroups.has(key))
      seriesGroups.set(key, { title: cleanSeriesTitle(row.title), year: row.year, ids: [] });
    const g = seriesGroups.get(key);
    g.ids.push(row.id);
    if (!g.year && row.year) g.year = row.year; // usa o primeiro ano encontrado
  }

  console.log(`\n  🔍 ${movieGroups.size.toLocaleString()} títulos únicos de filmes`);
  console.log(`  🔍 ${seriesGroups.size.toLocaleString()} títulos únicos de séries`);

  const toDeleteMovies = [];
  const toDeleteSeries = [];
  const toUpdateMovies = [];
  const toUpdateSeries = [];

  let searched = 0;
  const totalUnique = movieGroups.size + seriesGroups.size;

  function printProgress(current, total) {
    if (current % 100 === 0 || current === total) {
      process.stdout.write(
        `\r    Pesquisado: ${current.toLocaleString()} / ${total.toLocaleString()} | Deletar: ${(toDeleteMovies.length + toDeleteSeries.length).toLocaleString()} | Atualizar: ${(toUpdateMovies.length + toUpdateSeries.length).toLocaleString()}      `
      );
    }
  }

  // Processar filmes
  console.log('\n\n  🎬 Pesquisando filmes no TMDB...');
  const movieTasks = Array.from(movieGroups.entries()).map(([key, group]) => async () => {
    if (processedTitles.has(`movie:${key}`)) {
      searched++;
      return;
    }
    await sleep(REQUEST_DELAY);

    const result = await searchMovie(group.title, group.year);

    if (!result) {
      // Sem resultado no TMDB: deletar (conteúdo desconhecido/lixo)
      if (DELETE_NOT_FOUND) toDeleteMovies.push(...group.ids);
      processedTitles.add(`movie:${key}`);
      searched++;
      return;
    }

    const foundYear = parseInt((result.release_date || '').slice(0, 4), 10);
    const voteAvg = result.vote_average || 0;
    const voteCount = result.vote_count || 0;

    if (Number.isFinite(foundYear) && foundYear < MIN_YEAR) {
      // Pré-2020: deletar
      toDeleteMovies.push(...group.ids);
    } else if (voteAvg < MIN_RATING || voteCount < MIN_VOTES) {
      // Abaixo do padrão de qualidade: deletar
      toDeleteMovies.push(...group.ids);
    } else {
      // Qualidade OK: enriquecer + buscar plataforma (Onde Assistir)
      const genreNames = (result.genre_ids || []).map((id) => MOVIE_GENRES[id]).filter(Boolean);
      const platform = await getWatchProviders(result.id, 'movie');
      const entry = {
        ids: group.ids,
        updates: {
          tmdb_id: result.id,
          genre: genreNames.length > 0 ? genreNames : undefined,
          platform: platform || undefined,
          poster: result.poster_path ? `${IMG_W500}${result.poster_path}` : undefined,
          backdrop: result.backdrop_path ? `${IMG_ORIG}${result.backdrop_path}` : undefined,
          rating: result.vote_average
            ? String(Math.round(result.vote_average * 10) / 10)
            : undefined,
          year: Number.isFinite(foundYear) && foundYear > 1900 ? foundYear : undefined,
        },
      };
      toUpdateMovies.push(entry);
    }

    processedTitles.add(`movie:${key}`);
    searched++;
    printProgress(searched, totalUnique);

    // Salvar progresso periodicamente
    if (searched % 500 === 0) {
      progress.processedTitles = Array.from(processedTitles);
      saveProgress(progress);
    }
  });

  await runConcurrent(movieTasks, CONCURRENCY, () => {});

  // Processar séries
  console.log('\n\n  📺 Pesquisando séries no TMDB...');
  const seriesTasks = Array.from(seriesGroups.entries()).map(([key, group]) => async () => {
    if (processedTitles.has(`series:${key}`)) {
      searched++;
      return;
    }
    await sleep(REQUEST_DELAY);

    const result = await searchTV(group.title, group.year);

    if (!result) {
      // Não encontrado no TMDB: deletar todos os episódios do grupo
      if (DELETE_NOT_FOUND) toDeleteSeries.push(...group.ids);
      processedTitles.add(`series:${key}`);
      searched++;
      return;
    }

    const foundYear = parseInt((result.first_air_date || '').slice(0, 4), 10);
    const voteAvg = result.vote_average || 0;
    const voteCount = result.vote_count || 0;

    if (Number.isFinite(foundYear) && foundYear < MIN_YEAR) {
      toDeleteSeries.push(...group.ids);
    } else if (voteAvg < MIN_RATING || voteCount < MIN_VOTES) {
      // Abaixo do padrão de qualidade: deletar
      toDeleteSeries.push(...group.ids);
    } else {
      // Qualidade OK: enriquecer + buscar plataforma (Onde Assistir)
      const genreNames = (result.genre_ids || []).map((id) => TV_GENRES[id]).filter(Boolean);
      const platform = await getWatchProviders(result.id, 'tv');
      toUpdateSeries.push({
        ids: group.ids,
        updates: {
          tmdb_id: result.id,
          genre: genreNames.length > 0 ? genreNames : undefined,
          platform: platform || undefined,
          poster: result.poster_path ? `${IMG_W500}${result.poster_path}` : undefined,
          backdrop: result.backdrop_path ? `${IMG_ORIG}${result.backdrop_path}` : undefined,
          rating: result.vote_average
            ? String(Math.round(result.vote_average * 10) / 10)
            : undefined,
          year: Number.isFinite(foundYear) && foundYear > 1900 ? foundYear : undefined,
        },
      });
    }

    processedTitles.add(`series:${key}`);
    searched++;
    printProgress(searched, totalUnique);

    if (searched % 500 === 0) {
      progress.processedTitles = Array.from(processedTitles);
      saveProgress(progress);
    }
  });

  await runConcurrent(seriesTasks, CONCURRENCY, () => {});
  console.log('\n');

  // Aplicar deleções
  if (toDeleteMovies.length > 0) {
    console.log(
      `  🗑️  Deletando ${toDeleteMovies.length.toLocaleString()} filmes pré-2020 (via TMDB)...`
    );
    await sbDeleteByIds('movies', toDeleteMovies);
    console.log('      ✓ Filmes deletados');
  }

  if (toDeleteSeries.length > 0) {
    console.log(
      `  🗑️  Deletando ${toDeleteSeries.length.toLocaleString()} séries pré-2020 (via TMDB)...`
    );
    await sbDeleteByIds('series', toDeleteSeries);
    console.log('      ✓ Séries deletadas');
  }

  // Aplicar atualizações em batches (watch/providers são tratados na Fase 3)
  console.log(
    `\n  💾 Salvando enriquecimento de filmes (${toUpdateMovies.length.toLocaleString()} grupos)...`
  );
  let doneUpdates = 0;
  for (const entry of toUpdateMovies) {
    if (entry.ids.length === 0) continue;
    const updates = Object.fromEntries(
      Object.entries(entry.updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(updates).length === 0) continue;
    for (let b = 0; b < entry.ids.length; b += UPDATE_BATCH) {
      await sbPatch('movies', entry.ids.slice(b, b + UPDATE_BATCH), updates);
    }
    doneUpdates++;
    if (doneUpdates % 500 === 0) {
      process.stdout.write(
        `\r    ✏️  ${doneUpdates.toLocaleString()} / ${toUpdateMovies.length.toLocaleString()} grupos de filmes`
      );
    }
  }
  console.log(`\n      ✓ ${doneUpdates.toLocaleString()} grupos de filmes enriquecidos`);

  console.log(
    `\n  💾 Salvando enriquecimento de séries (${toUpdateSeries.length.toLocaleString()} grupos)...`
  );
  doneUpdates = 0;
  for (const entry of toUpdateSeries) {
    if (entry.ids.length === 0) continue;
    const updates = Object.fromEntries(
      Object.entries(entry.updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(updates).length === 0) continue;
    for (let b = 0; b < entry.ids.length; b += UPDATE_BATCH) {
      await sbPatch('series', entry.ids.slice(b, b + UPDATE_BATCH), updates);
    }
    doneUpdates++;
    if (doneUpdates % 500 === 0) {
      process.stdout.write(
        `\r    ✏️  ${doneUpdates.toLocaleString()} / ${toUpdateSeries.length.toLocaleString()} grupos de séries`
      );
    }
  }
  console.log(`\n      ✓ ${doneUpdates.toLocaleString()} grupos de séries enriquecidas`);

  // Salvar progresso final
  progress.processedTitles = Array.from(processedTitles);
  saveProgress(progress);

  console.log('\n  ✅ Fase 2 concluída!');
}

// ─── FASE 3: Re-enriquecer itens com tmdb_id (gênero + plataforma + poster) ──
async function phase3ReenrichExisting() {
  console.log('\n═══ FASE 3: Re-enriquecer itens com tmdb_id (gênero + plataforma) ════');

  // ── FILMES ──────────────────────────────────────────────────────
  console.log('  📥 Carregando filmes com tmdb_id para re-enriquecer...');
  const allMoviesWithId = await fetchAllRows(
    'movies',
    'id,tmdb_id,genre,platform,poster',
    'tmdb_id=not.is.null'
  );

  // Agrupar por tmdb_id para chamar TMDB apenas uma vez por filme
  const moviesByTmdbId = new Map();
  for (const m of allMoviesWithId) {
    const key = String(m.tmdb_id);
    if (!moviesByTmdbId.has(key)) {
      const needsGenre =
        !Array.isArray(m.genre) ||
        m.genre.length === 0 ||
        m.genre.some(
          (g) =>
            String(g).includes('|') ||
            g === 'Variados' ||
            String(g).toUpperCase().includes('FILMES')
        );
      const needsPlatform = !m.platform;
      const needsPoster = !m.poster || m.poster.includes('tvg-logo');
      moviesByTmdbId.set(key, {
        tmdb_id: m.tmdb_id,
        ids: [],
        needsEnrich: needsGenre || needsPlatform || needsPoster,
      });
    }
    moviesByTmdbId.get(key).ids.push(m.id);
  }

  const movieGroupsToEnrich = Array.from(moviesByTmdbId.values()).filter((g) => g.needsEnrich);
  console.log(
    `     ${movieGroupsToEnrich.length.toLocaleString()} IDs TMDB únicos de filmes para enriquecer`
  );

  let doneMovies = 0;
  const moviePhase3Tasks = movieGroupsToEnrich.map((group) => async () => {
    await sleep(REQUEST_DELAY);
    const enriched = await enrichByTmdbId(group.tmdb_id, 'movie');
    if (enriched) {
      const updates = Object.fromEntries(
        Object.entries(enriched).filter(
          ([k, v]) => v !== undefined && k !== 'tmdb_id' && k !== 'year'
        )
      );
      if (Object.keys(updates).length > 0) {
        for (let b = 0; b < group.ids.length; b += UPDATE_BATCH) {
          await sbPatch('movies', group.ids.slice(b, b + UPDATE_BATCH), updates);
        }
      }
    }
    doneMovies++;
    if (doneMovies % 100 === 0) {
      process.stdout.write(
        `\r    🎬 ${doneMovies.toLocaleString()} / ${movieGroupsToEnrich.length.toLocaleString()} grupos de filmes re-enriquecidos`
      );
    }
  });

  await runConcurrent(moviePhase3Tasks, CONCURRENCY, () => {});
  console.log(`\n      ✓ ${doneMovies.toLocaleString()} grupos de filmes re-enriquecidos`);

  // ── SÉRIES ──────────────────────────────────────────────────────
  console.log('  📥 Carregando séries com tmdb_id para re-enriquecer...');
  const allSeriesWithId = await fetchAllRows(
    'series',
    'id,tmdb_id,genre,platform,poster',
    'tmdb_id=not.is.null'
  );

  const seriesByTmdbId = new Map();
  for (const s of allSeriesWithId) {
    const key = String(s.tmdb_id);
    if (!seriesByTmdbId.has(key)) {
      const needsGenre =
        !Array.isArray(s.genre) ||
        s.genre.length === 0 ||
        s.genre.some(
          (g) =>
            String(g).includes('|') ||
            String(g).toUpperCase().includes('SÉRIE') ||
            String(g) === 'Série'
        );
      const needsPlatform = !s.platform;
      const needsPoster = !s.poster || s.poster.includes('tvg-logo');
      seriesByTmdbId.set(key, {
        tmdb_id: s.tmdb_id,
        ids: [],
        needsEnrich: needsGenre || needsPlatform || needsPoster,
      });
    }
    seriesByTmdbId.get(key).ids.push(s.id);
  }

  const seriesGroupsToEnrich = Array.from(seriesByTmdbId.values()).filter((g) => g.needsEnrich);
  console.log(
    `     ${seriesGroupsToEnrich.length.toLocaleString()} IDs TMDB únicos de séries para enriquecer`
  );

  let doneSeries = 0;
  const seriesPhase3Tasks = seriesGroupsToEnrich.map((group) => async () => {
    await sleep(REQUEST_DELAY);
    const enriched = await enrichByTmdbId(group.tmdb_id, 'tv');
    if (enriched) {
      const updates = Object.fromEntries(
        Object.entries(enriched).filter(
          ([k, v]) => v !== undefined && k !== 'tmdb_id' && k !== 'year'
        )
      );
      if (Object.keys(updates).length > 0) {
        for (let b = 0; b < group.ids.length; b += UPDATE_BATCH) {
          await sbPatch('series', group.ids.slice(b, b + UPDATE_BATCH), updates);
        }
      }
    }
    doneSeries++;
    if (doneSeries % 50 === 0) {
      process.stdout.write(
        `\r    📺 ${doneSeries.toLocaleString()} / ${seriesGroupsToEnrich.length.toLocaleString()} grupos de séries re-enriquecidas`
      );
    }
  });

  await runConcurrent(seriesPhase3Tasks, CONCURRENCY, () => {});
  console.log(`\n      ✓ ${doneSeries.toLocaleString()} grupos de séries re-enriquecidas`);

  console.log('\n  ✅ Fase 3 concluída!');
}

// ─── CONTAGEM FINAL ───────────────────────────────────────────────
async function printFinalCount() {
  const mCount = await fetch(`${SUPABASE_URL}/rest/v1/movies?select=id`, {
    headers: { ...SB, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
  });
  const sCount = await fetch(`${SUPABASE_URL}/rest/v1/series?select=id`, {
    headers: { ...SB, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
  });

  const mTotal = parseInt(mCount.headers.get('Content-Range')?.split('/')[1] || '?', 10);
  const sTotal = parseInt(sCount.headers.get('Content-Range')?.split('/')[1] || '?', 10);

  console.log('\n═══ CONTAGEM FINAL ═════════════════════════════════════════');
  console.log(`  🎬 Filmes restantes : ${isNaN(mTotal) ? '?' : mTotal.toLocaleString()}`);
  console.log(`  📺 Séries restantes : ${isNaN(sTotal) ? '?' : sTotal.toLocaleString()}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const deleteOnly = args.includes('--delete-only');
  const enrichOnly = args.includes('--enrich-only');
  const skipPhase3 = args.includes('--skip-reenrich');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║    Limpeza + Enriquecimento do Catálogo Supabase       ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`  MIN_YEAR   : ${MIN_YEAR}`);
  console.log(`  CONCURRENCY: ${CONCURRENCY}`);
  console.log(
    `  Modo       : ${deleteOnly ? 'delete-only' : enrichOnly ? 'enrich-only' : 'completo'}`
  );

  const progress = loadProgress();

  if (!enrichOnly) {
    await phase1DeleteOld();
  }

  if (!deleteOnly) {
    await phase2SearchAndEnrich(progress);

    if (!skipPhase3) {
      await phase3ReenrichExisting();
    }
  }

  await printFinalCount();

  // Limpar arquivo de progresso ao concluir
  try {
    fs.unlinkSync(PROGRESS_FILE);
  } catch {
    /* ignore */
  }

  console.log('\n🎉 Concluído!\n');
}

main().catch((e) => {
  console.error('\n❌ Erro fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});
