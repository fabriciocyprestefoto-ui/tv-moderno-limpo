/**
 * Baixa imagens do TMDB (poster, backdrop, logo), converte para WebP (sharp)
 * e envia para Supabase Storage; atualiza URLs em `movies` / `series`.
 *
 * Filtro padrão: year >= 2022 e tmdb_id > 0
 *
 * Uso:
 *   node scripts/sync-tmdb-images-to-supabase.mjs
 *   node scripts/sync-tmdb-images-to-supabase.mjs --limit=50
 *   node scripts/sync-tmdb-images-to-supabase.mjs --dry-run
 *   node scripts/sync-tmdb-images-to-supabase.mjs --min-year=2022 --force
 *
 * .env (raiz do projeto):
 *   VITE_SUPABASE_URL=
 *   SUPABASE_SERVICE_ROLE_KEY=   (service_role — necessário para upload + update)
 *   VITE_TMDB_READ_TOKENS=       (vários tokens separados por vírgula)
 *   VITE_TMDB_READ_TOKEN=        (opcional, token único extra)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

function readTmdbTokens() {
  const pool = (process.env.VITE_TMDB_READ_TOKENS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const single = (process.env.VITE_TMDB_READ_TOKEN || '').trim();
  if (single) pool.push(single);
  return [...new Set(pool)];
}

let tmdbRound = 0;
const TMDB_TOKENS = readTmdbTokens();
function tmdbAuthHeaders() {
  if (TMDB_TOKENS.length === 0)
    throw new Error('Defina VITE_TMDB_READ_TOKENS ou VITE_TMDB_READ_TOKEN no .env');
  const token = TMDB_TOKENS[tmdbRound % TMDB_TOKENS.length];
  tmdbRound++;
  return {
    accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

const BASE = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';

function pickLogo(logos) {
  if (!logos?.length) return null;
  const pt = logos.filter((l) => l.iso_639_1 === 'pt');
  const en = logos.filter((l) => l.iso_639_1 === 'en');
  const pool = pt.length ? pt : en.length ? en : logos;
  return pool.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))[0];
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: tmdbAuthHeaders() });
  if (res.status === 429) {
    await sleep(2000);
    return fetchJson(url);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function downloadBuffer(imagePath, size) {
  if (!imagePath || typeof imagePath !== 'string' || !imagePath.startsWith('/')) return null;
  const url = `${IMAGE}/${size}${imagePath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function toWebp(buf, quality = 82) {
  return sharp(buf).webp({ quality }).toBuffer();
}

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {
    limit: Infinity,
    minYear: 2022,
    dryRun: false,
    force: false,
    delayMs: 350,
    pageSize: 200,
  };
  for (const x of a) {
    if (x === '--dry-run') out.dryRun = true;
    if (x === '--force') out.force = true;
    const m = x.match(/^--limit=(\d+)$/);
    if (m) out.limit = Number(m[1]);
    const y = x.match(/^--min-year=(\d{4})$/);
    if (y) out.minYear = Number(y[1]);
    const d = x.match(/^--delay=(\d+)$/);
    if (d) out.delayMs = Number(d[1]);
  }
  return out;
}

async function processOne(supabase, row, mediaType, opts) {
  const tmdbId = Number(row.tmdb_id);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return { skip: true, reason: 'no tmdb' };

  const prefix = mediaType === 'series' ? 'tv' : 'movie';
  const storageBase = `${prefix}/${tmdbId}`;

  if (!opts.force) {
    const p = String(row.poster || '');
    const b = String(row.backdrop || '');
    if (
      p.includes('/storage/v1/object/public/posters/') &&
      b.includes('/storage/v1/object/public/backdrops/')
    ) {
      return { skip: true, reason: 'already supabase' };
    }
  }

  const pathApi = mediaType === 'series' ? 'tv' : 'movie';
  const url = `${BASE}/${pathApi}/${tmdbId}?append_to_response=images&include_image_language=pt,en,null&language=pt-BR`;
  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    return { skip: true, reason: `tmdb: ${e.message}` };
  }

  const posterPath = data.poster_path;
  const backdropPath = data.backdrop_path;
  const logoObj = pickLogo(data.images?.logos || []);

  const updates = { id: row.id };
  let uploaded = 0;

  if (posterPath) {
    const raw = await downloadBuffer(posterPath, 'w780');
    if (raw) {
      const webp = await toWebp(raw);
      const filePath = `${storageBase}-poster.webp`;
      if (!opts.dryRun) {
        const { error } = await supabase.storage.from('posters').upload(filePath, webp, {
          contentType: 'image/webp',
          upsert: true,
        });
        if (error) return { error: `poster upload: ${error.message}` };
        const { data: pub } = supabase.storage.from('posters').getPublicUrl(filePath);
        updates.poster = pub.publicUrl;
        uploaded++;
      } else {
        updates.poster = `(dry-run poster ${filePath})`;
      }
    }
  }

  if (backdropPath) {
    const raw = await downloadBuffer(backdropPath, 'w1280');
    if (raw) {
      const webp = await toWebp(raw, 78);
      const filePath = `${storageBase}-backdrop.webp`;
      if (!opts.dryRun) {
        const { error } = await supabase.storage.from('backdrops').upload(filePath, webp, {
          contentType: 'image/webp',
          upsert: true,
        });
        if (error) return { error: `backdrop upload: ${error.message}` };
        const { data: pub } = supabase.storage.from('backdrops').getPublicUrl(filePath);
        updates.backdrop = pub.publicUrl;
        uploaded++;
      } else {
        updates.backdrop = `(dry-run backdrop ${filePath})`;
      }
    }
  }

  if (logoObj?.file_path) {
    const raw = await downloadBuffer(logoObj.file_path, 'original');
    if (raw) {
      const webp = await toWebp(raw, 90);
      const filePath = `${storageBase}-logo.webp`;
      if (!opts.dryRun) {
        const { error } = await supabase.storage.from('logos').upload(filePath, webp, {
          contentType: 'image/webp',
          upsert: true,
        });
        if (error) return { error: `logo upload: ${error.message}` };
        const { data: pub } = supabase.storage.from('logos').getPublicUrl(filePath);
        updates.logo_url = pub.publicUrl;
        uploaded++;
      } else {
        updates.logo_url = `(dry-run logo ${filePath})`;
      }
    }
  }

  if (opts.dryRun) {
    console.log(`[dry-run] ${mediaType} tmdb=${tmdbId} ${row.title || ''} → poster/backdrop/logo`);
    return { ok: true, dry: true };
  }

  const patch = {};
  if (updates.poster && !String(updates.poster).startsWith('(dry-run'))
    patch.poster = updates.poster;
  if (updates.backdrop && !String(updates.backdrop).startsWith('(dry-run'))
    patch.backdrop = updates.backdrop;
  if (updates.logo_url && !String(updates.logo_url).startsWith('(dry-run'))
    patch.logo_url = updates.logo_url;

  if (Object.keys(patch).length === 0) return { skip: true, reason: 'no images from TMDB' };

  const table = mediaType === 'series' ? 'series' : 'movies';
  const { error: upErr } = await supabase.from(table).update(patch).eq('id', row.id);
  if (upErr) return { error: `db: ${upErr.message}` };

  return { ok: true, uploaded, title: row.title, tmdbId };
}

async function fetchPage(supabase, table, minYear, from, pageSize) {
  const { data, error } = await supabase
    .from(table)
    .select('id, tmdb_id, title, poster, backdrop, logo_url, year')
    .gte('year', minYear)
    .gt('tmdb_id', 0)
    .order('year', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  return data || [];
}

async function main() {
  const opts = parseArgs();

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env');
    process.exit(1);
  }

  console.log('═ TMDB → WebP → Supabase ═');
  console.log(
    `minYear=${opts.minYear} limit=${opts.limit === Infinity ? '∞' : opts.limit} dryRun=${opts.dryRun} force=${opts.force}`
  );
  console.log(`TMDB tokens no pool: ${TMDB_TOKENS.length}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let done = 0;
  let skipped = 0;
  let errors = 0;

  for (const table of ['movies', 'series']) {
    const mediaType = table === 'series' ? 'series' : 'movie';
    let offset = 0;
    while (done < opts.limit) {
      const rows = await fetchPage(supabase, table, opts.minYear, offset, opts.pageSize);
      if (rows.length === 0) break;
      offset += rows.length;

      for (const row of rows) {
        if (done >= opts.limit) break;
        await sleep(opts.delayMs);
        const r = await processOne(supabase, row, mediaType, opts);
        if (r.error) {
          console.error(`ERR ${table} id=${row.id} tmdb=${row.tmdb_id}: ${r.error}`);
          errors++;
        } else if (r.skip) {
          skipped++;
        } else if (r.ok) {
          done++;
          if (!r.dry)
            console.log(
              `OK [${done}] ${table} tmdb=${r.tmdbId} ${r.title || ''} (+${r.uploaded} files)`
            );
        }
      }
      if (rows.length < opts.pageSize) break;
    }
  }

  console.log('─');
  console.log(`Concluído: processados com upload=${done} ignorados≈${skipped} erros=${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
