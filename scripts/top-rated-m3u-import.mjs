/**
 * top-rated-m3u-import.mjs
 * ══════════════════════════════════════════════════════════════════
 * 1. Busca filmes Top Rated de TODOS OS TEMPOS via TMDB (páginas 1-50)
 * 2. Lê o M3U local e extrai todos os filmes (grupos "FILMES |")
 * 3. Cruza TMDB top-rated com M3U por título+ano (fuzzy)
 * 4. Para cada match: faz upsert no Supabase (movies) com a URL do M3U
 *
 * SEM filtro de ano — aceita clássicos de qualquer época.
 *
 * Uso: node scripts/top-rated-m3u-import.mjs
 *      node scripts/top-rated-m3u-import.mjs --dry-run   (só mostra matches)
 *      node scripts/top-rated-m3u-import.mjs --pages 10  (limita N páginas TMDB)
 * ══════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Carregar .env da raiz ────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

// ── Configuração ─────────────────────────────────────────────────
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SERVICE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  ''
).trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERRO: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar no .env');
  process.exit(1);
}

const TMDB_TOKENS = (process.env.VITE_TMDB_READ_TOKENS || process.env.VITE_TMDB_READ_TOKEN || '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

if (!TMDB_TOKENS.length) {
  console.error('ERRO: Defina VITE_TMDB_READ_TOKENS no .env');
  process.exit(1);
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const IMG_ORIG = 'https://image.tmdb.org/t/p/original';

const M3U_PATH = path.join(ROOT, 'playlist_2450460821_plus.m3u');

// ── Args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const maxPages = (() => {
  const idx = args.indexOf('--pages');
  return idx !== -1 ? parseInt(args[idx + 1]) || 50 : 50;
})();

console.log(`\n${'═'.repeat(60)}`);
console.log(`  top-rated-m3u-import.mjs`);
console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN (sem escrita)' : 'PRODUÇÃO'}`);
console.log(`  Páginas   : ${maxPages} (máx ${maxPages * 20} filmes TMDB)`);
console.log(`  Tokens    : ${TMDB_TOKENS.length}`);
console.log(`${'═'.repeat(60)}\n`);

// ── Gêneros TMDB ────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _tok = 0;
const nextToken = () => TMDB_TOKENS[_tok++ % TMDB_TOKENS.length];

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, '') // só alfanumérico
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(name) {
  const m =
    name.match(/[-–(]\s*((?:19|20)\d{2})\s*[)–-]?\s*$/) ||
    name.match(/\s((?:19|20)\d{2})\s*$/) ||
    name.match(/((?:19|20)\d{2})/);
  return m ? parseInt(m[1]) : null;
}

function cleanTitle(raw) {
  return (raw || '')
    .replace(/\s*[-–(]\s*((?:19|20)\d{2})\s*[)–-]?\s*$/, '') // ano no final
    .replace(/\s+(4K|HDR|HD|SD|UHD|BluRay|HDTV|WEBDL|WEB-DL|WEBRIP|HEVC|DUB|LEG)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── TMDB fetch com retry ──────────────────────────────────────────
async function tmdbFetch(endpoint, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const token = nextToken();
    try {
      const r = await fetch(`${TMDB_BASE}${endpoint}`, {
        headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (r.status === 429) {
        const wait = 800 * (Math.floor(i / TMDB_TOKENS.length) + 1);
        await sleep(wait);
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

// ── Supabase helpers ─────────────────────────────────────────────
const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

async function sbFetchAll(table, select, filter = '') {
  const rows = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const q = filter ? `&${filter}` : '';
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${select}&offset=${offset}&limit=${PAGE}${q}`,
      { headers: SB_HEADERS }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
    await sleep(100);
  }
  return rows;
}

async function sbDeleteWhere(table, filter) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: SB_HEADERS,
  });
  if (!r.ok) {
    const t = await r.text();
    console.warn(`  [WARN] DELETE ${table} HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.ok;
}

async function sbUpsert(table, rows) {
  if (!rows.length) return;
  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) {
      const t = await r.text();
      console.warn(`  [WARN] UPSERT HTTP ${r.status}: ${t.slice(0, 300)}`);
    } else {
      inserted += chunk.length;
    }
    if (i + CHUNK < rows.length) await sleep(150);
  }
  return inserted;
}

// ── 1. Buscar Top Rated no TMDB (todas as páginas) ────────────────
async function fetchTopRatedTmdb(maxPg) {
  console.log(`\n[1/4] Buscando top-rated movies no TMDB (${maxPg} páginas)...`);
  const movies = [];
  for (let page = 1; page <= maxPg; page++) {
    const data = await tmdbFetch(`/movie/top_rated?language=pt-BR&page=${page}`);
    if (!data || !data.results) break;
    movies.push(...data.results);
    const totalPages = data.total_pages || maxPg;
    if (page >= totalPages) break;
    process.stdout.write(
      `\r  Página ${page}/${Math.min(maxPg, totalPages)} — ${movies.length} filmes`
    );
    await sleep(80);
  }
  console.log(`\r  ✓ ${movies.length} filmes top-rated carregados do TMDB`);
  return movies;
}

// ── 2. Ler M3U e extrair entradas de filmes ───────────────────────
function parseM3uMovies(m3uPath) {
  console.log('\n[2/4] Lendo M3U...');
  const content = fs.readFileSync(m3uPath, 'utf-8');
  const lines = content.split('\n');
  const entries = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (!line.includes('group-title="FILMES')) continue;
    const nameMatch = line.match(/,([^,\r\n]+)$/);
    const urlLine = (lines[i + 1] || '').trim();
    const groupMatch = line.match(/group-title="([^"]+)"/);
    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
    if (!nameMatch || !urlLine) continue;
    const rawName = nameMatch[1].trim();
    const year = extractYear(rawName);
    const clean = cleanTitle(rawName);
    entries.push({
      rawName,
      clean,
      normClean: normalize(clean),
      year,
      url: urlLine,
      group: groupMatch ? groupMatch[1] : '',
      logo: logoMatch ? logoMatch[1] : '',
    });
  }
  console.log(`  ✓ ${entries.length} entradas de filmes no M3U`);
  return entries;
}

// ── 3. Cruzar TMDB top-rated × M3U ───────────────────────────────
function matchMovies(tmdbList, m3uList) {
  console.log('\n[3/4] Cruzando TMDB × M3U...');
  // Índice M3U por título normalizado
  const m3uByTitle = new Map();
  for (const e of m3uList) {
    const key = e.normClean;
    if (!m3uByTitle.has(key)) m3uByTitle.set(key, []);
    m3uByTitle.get(key).push(e);
  }

  const matched = [];
  const seen = new Set();

  for (const tmdb of tmdbList) {
    const tmdbTitle = normalize(tmdb.title || '');
    const tmdbOriginal = normalize(tmdb.original_title || '');
    const tmdbYear = tmdb.release_date ? parseInt(tmdb.release_date.slice(0, 4)) : null;

    // Tenta match exato por título PT-BR
    let candidates = m3uByTitle.get(tmdbTitle) || [];

    // Se não achou, tenta pelo título original
    if (!candidates.length) {
      candidates = m3uByTitle.get(tmdbOriginal) || [];
    }

    // Filtra por ano se disponível (tolerância ±1)
    let best = null;
    if (candidates.length && tmdbYear) {
      best = candidates.find((c) => c.year && Math.abs(c.year - tmdbYear) <= 1);
    }
    if (!best && candidates.length) {
      best = candidates[0]; // sem ano no M3U, aceita o primeiro
    }

    if (best && !seen.has(best.url)) {
      seen.add(best.url);
      matched.push({ tmdb, m3u: best });
    }
  }

  console.log(`  ✓ ${matched.length} matches encontrados`);
  return matched;
}

// ── 4. Buscar detalhes extras TMDB (providers, backdrop) ──────────
async function enrichMatch(tmdb) {
  const details = await tmdbFetch(
    `/movie/${tmdb.id}?language=pt-BR&append_to_response=watch/providers`
  );
  if (!details) return null;

  const genres = (details.genres || []).map((g) => MOVIE_GENRES[g.id] || g.name).filter(Boolean);

  const providers = details['watch/providers']?.results?.BR;
  const allProviders = [
    ...(providers?.flatrate || []),
    ...(providers?.buy || []),
    ...(providers?.rent || []),
  ];
  const platform = allProviders.map((p) => BR_PROVIDERS[p.provider_id]).filter(Boolean)[0] || null;

  const poster = details.poster_path ? `${IMG_W500}${details.poster_path}` : null;
  const backdrop = details.backdrop_path ? `${IMG_ORIG}${details.backdrop_path}` : null;
  const year = details.release_date ? parseInt(details.release_date.slice(0, 4)) : null;
  const rating = details.vote_average ? String(Math.round(details.vote_average * 10) / 10) : null;

  return { genres, platform, poster, backdrop, year, rating, overview: details.overview };
}

// ── Função principal ──────────────────────────────────────────────
async function main() {
  // ── Passo 1: TMDB top-rated
  const tmdbMovies = await fetchTopRatedTmdb(maxPages);

  // ── Passo 2: M3U
  if (!fs.existsSync(M3U_PATH)) {
    console.error(`ERRO: M3U não encontrado em ${M3U_PATH}`);
    process.exit(1);
  }
  const m3uMovies = parseM3uMovies(M3U_PATH);

  // ── Passo 3: Cruzar
  const matches = matchMovies(tmdbMovies, m3uMovies);

  if (DRY_RUN) {
    console.log('\n═══ DRY RUN — primeiros 30 matches ══════════════════════════');
    matches.slice(0, 30).forEach((m, i) => {
      const yr = m.tmdb.release_date?.slice(0, 4) || '????';
      console.log(`  ${String(i + 1).padStart(3)}. [${yr}] ${m.tmdb.title} → ${m.m3u.rawName}`);
      console.log(`       URL: ${m.m3u.url.slice(0, 80)}`);
    });
    console.log(`\n  Total matches: ${matches.length}`);
    return;
  }

  // ── Passo 4: Upsert no Supabase
  console.log(`\n[4/4] Enriquecendo e importando ${matches.length} filmes no Supabase...`);

  // Carregar IDs existentes no Supabase (por tmdb_id) para saber se é insert ou update
  const existing = await sbFetchAll('movies', 'id,tmdb_id', `type=eq.movie&tmdb_id=not.is.null`);
  const existingByTmdbId = new Map(existing.map((r) => [r.tmdb_id, r.id]));
  console.log(`  ✓ ${existing.length} filmes existentes com tmdb_id no Supabase`);

  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let idx = 0; idx < matches.length; idx++) {
    const { tmdb, m3u } = matches[idx];

    process.stdout.write(
      `\r  Processando ${idx + 1}/${matches.length} — OK:${upserted} skip:${skipped} err:${errors}   `
    );

    // Buscar detalhes extras (watch/providers, backdrop)
    const extras = await enrichMatch(tmdb);
    if (!extras) {
      skipped++;
      continue;
    }

    // Montar registro
    const row = {
      type: 'movie',
      tmdb_id: tmdb.id,
      title: tmdb.title || extras.overview?.slice(0, 80) || m3u.rawName,
      video_url: m3u.url,
      poster: extras.poster || m3u.logo || null,
      backdrop: extras.backdrop || null,
      genre: extras.genres?.length ? extras.genres : null,
      platform: extras.platform || null,
      rating: extras.rating || null,
      year: extras.year || m3u.year || null,
      overview: extras.overview || null,
      poster_path: tmdb.poster_path || null,
      backdrop_path: tmdb.backdrop_path || null,
      // Se já existe no banco, mantém o id para merge-duplicates funcionar
      ...(existingByTmdbId.has(tmdb.id) ? { id: existingByTmdbId.get(tmdb.id) } : {}),
    };

    try {
      await sbUpsert('movies', [row]);
      upserted++;
    } catch (e) {
      errors++;
      console.warn(`\n  [WARN] Falha upsert ${tmdb.title}: ${e.message}`);
    }

    // Rate-limit gentil
    await sleep(60);
  }

  console.log(`\n\n${'═'.repeat(60)}`);
  console.log(`  ✅ Concluído!`);
  console.log(`  Importados : ${upserted}`);
  console.log(`  Pulados    : ${skipped}`);
  console.log(`  Erros      : ${errors}`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch((err) => {
  console.error('\nERRO FATAL:', err);
  process.exit(1);
});
