/**
 * enrich-incremental.mjs
 * ════════════════════════════════════════════════════════════════════
 * Enriquece e filtra filmes/séries via TMDB com apply incremental:
 * - Aplica DELETE e UPDATE ao Supabase a cada título processado
 * - Retomável: salva progresso em .enrich-inc.json (IDs já processados)
 * - Rotação automática entre 3 tokens TMDB (sem 429)
 * - Filtro: nota >= 7.0 e >= 100 votos, 2020+
 *
 * Uso: node scripts/enrich-incremental.mjs
 *      node scripts/enrich-incremental.mjs --movies-only
 *      node scripts/enrich-incremental.mjs --series-only
 * ════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireSupabaseUrl, requireServiceRoleKey, loadRootEnv } from './supabase-env.mjs';

loadRootEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.join(__dirname, '../.enrich-inc.json');

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();

// ─── Tokens TMDB (rotação round-robin) ───────────────────────────
const TMDB_TOKENS = (process.env.VITE_TMDB_READ_TOKENS || process.env.VITE_TMDB_READ_TOKEN || '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

if (!TMDB_TOKENS.length) {
  console.error('ERRO: Nenhum token TMDB encontrado em VITE_TMDB_READ_TOKENS');
  process.exit(1);
}

let _tok = 0;
const getToken = () => TMDB_TOKENS[_tok++ % TMDB_TOKENS.length];

// ─── Constantes ───────────────────────────────────────────────────
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_ORIG = 'https://image.tmdb.org/t/p/original';
const MIN_YEAR = 2020;
const MIN_RATING = 7.0;
const MIN_VOTES_MOVIE = 100; // filmes: exige votos mínimos
const MIN_VOTES_SERIES = 0; // séries: sem exigência de votos
const CONCURRENCY = 5; // threads (3 tokens × ~2 req em voo)
const DELAY_MS = 120; // delay entre requisições por thread
const PAGE_SIZE = 1000;
const SAVE_EVERY = 200; // salva progresso a cada N títulos novos

// ─── Headers ─────────────────────────────────────────────────────
const SB = (extra = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
  ...extra,
});

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
  546: 'Looke',
};

// ─── Utilitários ─────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanMovieTitle(raw) {
  return (raw || '')
    .replace(/\s+(4K|HDR|HD|SD|UHD|BluRay|HDTV|WEBDL|WEB-DL|WEBRIP|HEVC)\s*$/i, '')
    .replace(/\s*[-–(]\s*((?:19|20)\d{2})\s*[)–-]?\s*$/, '')
    .trim();
}

function cleanSeriesTitle(raw) {
  return (raw || '')
    .replace(/\s*[-–:]\s*S\d{1,2}E\d{1,3}.*$/i, '')
    .replace(/\s*S\d{1,2}E\d{1,3}.*$/i, '')
    .replace(/\s*[-–:]\s*S\d{1,2}.*$/i, '')
    .replace(/\s*[-–:]\s*(Temporada|Season)\s*\d+.*/i, '')
    .replace(/\s*\(S\d{1,2}.*$/i, '')
    .replace(/\s+(4K|HDR|HD|SD|UHD|BluRay|HDTV|WEBDL|WEB-DL|WEBRIP|HEVC)\s*$/i, '')
    .replace(/\s*[-–(]\s*((?:19|20)\d{2})\s*[)–-]?\s*$/, '')
    .trim();
}

// ─── Progresso (incremental) ──────────────────────────────────────
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    /* ignore */
  }
  return { done: [] };
}
function saveProgress(done) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ done }));
  } catch {
    /* ignore */
  }
}

// ─── TMDB fetch com retry e rotação de token ─────────────────────
async function tmdbFetch(endpoint, retries = TMDB_TOKENS.length * 3) {
  for (let i = 0; i < retries; i++) {
    const token = getToken();
    try {
      const r = await fetch(`${TMDB_BASE}${endpoint}`, {
        headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (r.status === 429) {
        await sleep(400 * (Math.floor(i / TMDB_TOKENS.length) + 1));
        continue;
      }
      if (r.status === 404) return null;
      if (!r.ok) return null;
      return await r.json();
    } catch {
      if (i === retries - 1) return null;
      await sleep(300);
    }
  }
  return null;
}

// ─── Supabase helpers ─────────────────────────────────────────────
async function sbFetch(table, select, filter = '') {
  const rows = [];
  let offset = 0;
  process.stdout.write(`  Carregando ${table}...`);
  while (true) {
    const q = filter ? `&${filter}` : '';
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${select}&offset=${offset}&limit=${PAGE_SIZE}${q}`,
      { headers: SB() }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (rows.length % 10000 === 0) process.stdout.write(` ${rows.length.toLocaleString()}`);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(100);
  }
  console.log(` ${rows.length.toLocaleString()} linhas`);
  return rows;
}

async function sbDeleteIds(table, ids) {
  if (!ids.length) return;
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const filter = `id=in.(${chunk.map((id) => `"${id}"`).join(',')})`;
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: SB(),
    });
    if (i + CHUNK < ids.length) await sleep(80);
  }
}

async function sbPatch(table, ids, updates) {
  if (!ids.length) return;
  const CHUNK = 30; // URL limit: 30 × 39 chars ≈ 1.170 chars por request
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const filter = `id=in.(${chunk.map((id) => `"${id}"`).join(',')})`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: SB({ Prefer: 'return=minimal' }),
      body: JSON.stringify(updates),
    });
    if (!r.ok && r.status !== 204) {
      const body = await r.text().catch(() => '');
      console.error(`\n  [patch erro ${r.status}] ${body.slice(0, 200)}`);
    }
    if (i + CHUNK < ids.length) await sleep(80);
  }
}

// ─── Watch Providers (Onde Assistir BR) ──────────────────────────
async function getProvider(tmdbId, type) {
  const ep = type === 'movie' ? 'movie' : 'tv';
  const data = await tmdbFetch(`/${ep}/${tmdbId}/watch/providers`);
  const br = data?.results?.BR;
  if (!br) return null;
  const all = [...(br.flatrate || []), ...(br.subscription || [])];
  const mapped = all.map((p) => BR_PROVIDERS[p.provider_id]).filter(Boolean);
  return mapped[0] || null;
}

// ─── Processar um grupo (título único) ───────────────────────────
async function processGroup(type, group, doneSet) {
  const key = `${type}:${group.key}`;
  if (doneSet.has(key)) return; // já processado e salvo

  await sleep(DELAY_MS);

  let result = null;
  if (type === 'movie') {
    const q = encodeURIComponent(group.title);
    const yr = group.year ? `&year=${group.year}` : '';
    const data = await tmdbFetch(`/search/movie?query=${q}${yr}&language=pt-BR&page=1`);
    if (data?.results?.length) {
      const exact = data.results.find(
        (r) =>
          r.title?.toLowerCase() === group.title.toLowerCase() ||
          r.original_title?.toLowerCase() === group.title.toLowerCase()
      );
      result = exact || data.results[0];
    }
  } else {
    const q = encodeURIComponent(group.title);
    const yr = group.year ? `&first_air_date_year=${group.year}` : '';
    const data = await tmdbFetch(`/search/tv?query=${q}${yr}&language=pt-BR&page=1`);
    if (data?.results?.length) {
      const exact = data.results.find(
        (r) =>
          r.name?.toLowerCase() === group.title.toLowerCase() ||
          r.original_name?.toLowerCase() === group.title.toLowerCase()
      );
      result = exact || data.results[0];
    }
  }

  const table = type === 'movie' ? 'movies' : 'series';
  const genreMap = type === 'movie' ? MOVIE_GENRES : TV_GENRES;

  if (!result) {
    // Não encontrado → deletar todos IDs do grupo
    await sbDeleteIds(table, group.ids);
    return key;
  }

  const releaseDate = type === 'movie' ? result.release_date : result.first_air_date;
  const foundYear = parseInt((releaseDate || '').slice(0, 4), 10);
  const voteAvg = result.vote_average || 0;
  const voteCount = result.vote_count || 0;

  // Filtro de qualidade
  const minVotes = type === 'movie' ? MIN_VOTES_MOVIE : MIN_VOTES_SERIES;
  if (
    (Number.isFinite(foundYear) && foundYear < MIN_YEAR) ||
    voteAvg < MIN_RATING ||
    voteCount < minVotes
  ) {
    await sbDeleteIds(table, group.ids);
    return key;
  }

  // Aprovado — enriquecer
  const genreNames = (result.genre_ids || []).map((id) => genreMap[id]).filter(Boolean);
  const platform = await getProvider(result.id, type);

  const updates = {
    tmdb_id: result.id,
    genre: genreNames.length ? genreNames : undefined,
    platform: platform || undefined,
    poster: result.poster_path ? `${IMG_W500}${result.poster_path}` : undefined,
    backdrop: result.backdrop_path ? `${IMG_ORIG}${result.backdrop_path}` : undefined,
    rating: result.vote_average ? String(Math.round(result.vote_average * 10) / 10) : undefined,
    year: Number.isFinite(foundYear) && foundYear > 1900 ? foundYear : undefined,
  };

  // Remove undefined
  const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  await sbPatch(table, group.ids, clean);
  return key;
}

// ─── Pool de concorrência com stagger ────────────────────────────
async function runPool(tasks, concurrency, onDone) {
  let idx = 0;
  async function worker(wIdx) {
    await sleep(wIdx * Math.floor(DELAY_MS / concurrency));
    while (idx < tasks.length) {
      const i = idx++;
      const result = await tasks[i]();
      if (result) onDone(result);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, (_, i) => worker(i))
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const moviesOnly = args.includes('--movies-only');
  const seriesOnly = args.includes('--series-only');

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Enriquecimento Incremental (TMDB)                     ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(
    `  Tokens: ${TMDB_TOKENS.length} | Threads: ${CONCURRENCY} | Min nota: ${MIN_RATING} | Min votos filmes: ${MIN_VOTES_MOVIE} | Min votos séries: ${MIN_VOTES_SERIES}`
  );

  const { done: doneArr } = loadProgress();
  const doneSet = new Set(doneArr);
  let newDone = 0;

  function onDone(key) {
    doneSet.add(key);
    newDone++;
    if (newDone % SAVE_EVERY === 0) {
      saveProgress(Array.from(doneSet));
      const total = doneSet.size;
      process.stdout.write(
        `\r  Progresso: ${total.toLocaleString()} títulos concluídos (${newDone} novos nesta sessão)     `
      );
    }
  }

  // ── FILMES ────────────────────────────────────────────────────
  if (!seriesOnly) {
    console.log('\n═══ Filmes ═════════════════════════════════════════════');
    const movies = await sbFetch('movies', 'id,title,year', 'tmdb_id=is.null');

    // Agrupar por título limpo
    const groups = new Map();
    for (const m of movies) {
      const title = cleanMovieTitle(m.title);
      const key = title.toLowerCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { key, title, year: m.year, ids: [] });
      const g = groups.get(key);
      g.ids.push(m.id);
      if (!g.year && m.year) g.year = m.year;
    }

    const pending = Array.from(groups.values()).filter((g) => !doneSet.has(`movie:${g.key}`));
    const total = groups.size;
    const skip = total - pending.length;
    console.log(
      `  ${total.toLocaleString()} títulos únicos | ${skip.toLocaleString()} já feitos | ${pending.toLocaleString ? pending.length.toLocaleString() : pending.length} a processar`
    );

    const tasks = pending.map((g) => () => processGroup('movie', g, doneSet));
    await runPool(tasks, CONCURRENCY, onDone);
    saveProgress(Array.from(doneSet));
    console.log(`\n  ✅ Filmes concluídos`);
  }

  // ── SÉRIES ────────────────────────────────────────────────────
  if (!moviesOnly) {
    console.log('\n═══ Séries ═════════════════════════════════════════════');
    const series = await sbFetch('series', 'id,title,year', 'tmdb_id=is.null');

    const groups = new Map();
    for (const s of series) {
      const title = cleanSeriesTitle(s.title);
      const key = title.toLowerCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { key, title, year: s.year, ids: [] });
      const g = groups.get(key);
      g.ids.push(s.id);
      if (!g.year && s.year) g.year = s.year;
    }

    const pending = Array.from(groups.values()).filter((g) => !doneSet.has(`series:${g.key}`));
    const total = groups.size;
    const skip = total - pending.length;
    console.log(
      `  ${total.toLocaleString()} títulos únicos | ${skip.toLocaleString()} já feitos | ${pending.length.toLocaleString()} a processar`
    );

    const tasks = pending.map((g) => () => processGroup('series', g, doneSet));
    await runPool(tasks, CONCURRENCY, onDone);
    saveProgress(Array.from(doneSet));
    console.log(`\n  ✅ Séries concluídas`);
  }

  // ── Contagem final ────────────────────────────────────────────
  const [rm, rs] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/movies?select=id`, {
      headers: { ...SB(), Prefer: 'count=exact', Range: '0-0' },
    }),
    fetch(`${SUPABASE_URL}/rest/v1/series?select=id`, {
      headers: { ...SB(), Prefer: 'count=exact', Range: '0-0' },
    }),
  ]);
  console.log('\n═══ RESULTADO FINAL ════════════════════════════════════');
  console.log(`  Filmes: ${rm.headers.get('content-range')?.split('/')[1] || '?'}`);
  console.log(`  Séries: ${rs.headers.get('content-range')?.split('/')[1] || '?'}`);
  console.log('\n🎉 Concluído!\n');

  try {
    fs.unlinkSync(PROGRESS_FILE);
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
