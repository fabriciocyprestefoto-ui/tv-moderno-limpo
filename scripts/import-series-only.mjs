/**
 * import-series-only.mjs
 * Lê playlist_2450460821_plus.m3u, extrai APENAS as séries (.mp4)
 * e reimporta SOMENTE a tabela `series` no Supabase.
 * A tabela `movies` NÃO é tocada.
 *
 * Uso: node scripts/import-series-only.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const M3U_FILE = path.join(__dirname, '../playlist_2450460821_plus.m3u');
const BATCH = 500;

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();

// ── Mapeamento grupo → tabela + gênero + plataforma ──────────────
function classifyGroup(group) {
  const g = (group || '').trim().toUpperCase();

  // ═══ SÉRIES ═══
  if (g.startsWith('SERIES |') || g.startsWith('SÉRIES |') || g.startsWith('SERIES|')) {
    const sub = g.replace(/^S[EÉ]RIES\s*\|\s*/, '').trim();
    const platformMap = {
      'AMC+': 'AMC+',
      'APPLE TV+': 'Apple TV+',
      'BRASIL PARALELO': 'Brasil Paralelo',
      'DISNEY+': 'Disney+',
      GLOBOPLAY: 'Globoplay',
      'HBO MAX': 'HBO Max',
      NETFLIX: 'Netflix',
      'PARAMOUNT+': 'Paramount+',
      'PRIME VIDEO': 'Amazon Prime Video',
      'AMAZON PRIME': 'Amazon Prime Video',
    };
    const genreMap = {
      LANÇAMENTO: 'Lançamento',
      LANCAMENTO: 'Lançamento',
      LEGENDADO: 'Legendado',
      VARIADOS: 'Variados',
    };
    const platform = platformMap[sub] || null;
    const genre = genreMap[sub] ? [genreMap[sub]] : ['Série'];
    return { genre, platform };
  }

  // ═══ ANIMES ═══
  if (g.startsWith('ANIMES')) {
    return { genre: ['Anime'], platform: null };
  }

  // ═══ DORAMAS ═══
  if (g.startsWith('DORAMAS')) {
    return { genre: ['Dorama'], platform: null };
  }

  // ═══ NOVELAS ═══
  if (g.startsWith('NOVELAS')) {
    const sub = g.replace(/^NOVELAS\s*\|\s*/, '').trim();
    const genreMap = {
      BRASILEIRAS: 'Novela Brasileira',
      INDIANAS: 'Novela Indiana',
      MEXICANAS: 'Novela Mexicana',
      NOVELAS: 'Novela',
      TURCAS: 'Novela Turca',
    };
    return { genre: [genreMap[sub] || 'Novela'], platform: null };
  }

  return null; // não é série
}

// ── Extrai ano do título ──────────────────────────────────────────
function extractYear(title) {
  const m = title.match(/[-–(]\s*((?:19|20)\d{2})\s*[)–-]?\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Limpa o título (remove ano do final) ─────────────────────────
function cleanTitle(title) {
  return title.replace(/\s*[-–]\s*(?:19|20)\d{2}\s*$/, '').trim();
}

// ── Extrai a URL limpa da poster TMDB ─────────────────────────────
function cleanPoster(logo) {
  if (!logo) return null;
  const t = logo.match(/image\.tmdb\.org\/t\/p\/\w+\/([a-zA-Z0-9_./]+\.(?:jpg|png|webp))/);
  if (t) return `https://image.tmdb.org/t/p/w500/${t[1]}`;
  return logo || null;
}

// ── Inserir batch via REST ────────────────────────────────────────
async function insertBatch(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[${table}] HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
}

// ── Truncar tabela series ────────────────────────────────────────
async function truncateSeries() {
  const url = `${SUPABASE_URL}/rest/v1/series?id=neq.00000000-0000-0000-0000-000000000000`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.warn(`[truncate series] HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  console.log('📂 Lendo M3U...');
  const raw = fs.readFileSync(M3U_FILE, 'utf8');
  const lines = raw.split('\n');
  console.log(`   ${lines.length.toLocaleString()} linhas no arquivo`);

  const series = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF')) {
      i++;
      continue;
    }

    const url = (lines[i + 1] || '').trim();
    if (!url.endsWith('.mp4')) {
      i++;
      continue;
    }

    const nameMatch = line.match(/,(.+)$/);
    const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
    const groupMatch = line.match(/group-title="([^"]+)"/);

    const rawTitle = tvgNameMatch ? tvgNameMatch[1] : nameMatch ? nameMatch[1] : '';
    const logo = logoMatch ? logoMatch[1] : null;
    const group = groupMatch ? groupMatch[1] : '';

    if (!rawTitle || rawTitle.length < 2) {
      i++;
      continue;
    }

    const classification = classifyGroup(group);
    if (!classification) {
      i++;
      continue;
    }

    const year = extractYear(rawTitle);
    const title = cleanTitle(rawTitle);
    const poster = cleanPoster(logo);

    series.push({
      title,
      poster,
      logo_url: logo || null,
      year,
      stream_url: url,
      genre: classification.genre,
      platform: classification.platform,
      status: 'active',
    });

    i++;
  }

  console.log(`✅ Parsed: ${series.length.toLocaleString()} linhas de séries`);

  // Limpar APENAS tabela series
  console.log('\n🗑️  Limpando tabela series (movies não será tocada)...');
  await truncateSeries();
  console.log('   Tabela series limpa!\n');

  // Inserir séries
  console.log(`📺 Inserindo ${series.length.toLocaleString()} séries em batches de ${BATCH}...`);
  let done = 0;
  for (let b = 0; b < series.length; b += BATCH) {
    const batch = series.slice(b, b + BATCH);
    await insertBatch('series', batch);
    done += batch.length;
    if (done % 5000 === 0 || done === series.length) {
      process.stdout.write(
        `\r   ${done.toLocaleString()} / ${series.length.toLocaleString()} séries inseridas`
      );
    }
  }

  console.log('\n\n🎉 Importação de séries completa!');
  console.log(`   Series: ${series.length.toLocaleString()}`);
  console.log('   ⚠️  Movies NÃO foram alterados.');
}

main().catch((e) => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
