/**
 * import-vod-m3u.mjs
 * Lê playlist_2450460821_plus.m3u, extrai APENAS .mp4 (VOD)
 * e importa movies + series no Supabase, substituindo tudo.
 *
 * Uso: node scripts/import-vod-m3u.mjs
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

  // ═══ FILMES ═══
  if (g.startsWith('FILMES |') || g.startsWith('FILMES|')) {
    const sub = g.replace(/^FILMES\s*\|\s*/, '').trim();
    const genreMap = {
      LANÇAMENTO: 'Lançamento',
      LANCAMENTO: 'Lançamento',
      '4K': '4K',
      AÇÃO: 'Ação',
      ACAO: 'Ação',
      AVENTURA: 'Aventura',
      CINEMA: 'Cinema',
      'CINEMA TV': 'Cinema TV',
      COMÉDIA: 'Comédia',
      COMEDIA: 'Comédia',
      CRIME: 'Crime',
      DOCUMENTÁRIO: 'Documentário',
      DOCUMENTARIO: 'Documentário',
      DRAMA: 'Drama',
      FAMÍLIA: 'Família',
      FAMILIA: 'Família',
      FANTASIA: 'Fantasia',
      FAROESTE: 'Faroeste',
      'FICÇÃO CIENTÍFICA': 'Ficção Científica',
      'FICCAO CIENTIFICA': 'Ficção Científica',
      GUERRA: 'Guerra',
      HISTÓRIA: 'História',
      HISTORIA: 'História',
      LEGENDADO: 'Legendado',
      MISTÉRIO: 'Mistério',
      MISTERIO: 'Mistério',
      MÚSICA: 'Música',
      MUSICA: 'Música',
      NACIONAL: 'Nacional',
      RELIGIOSOS: 'Religiosos',
      ROMANCE: 'Romance',
      TERROR: 'Terror',
      THRILLER: 'Thriller',
      VARIADOS: 'Variados',
      2025: 'Lançamento',
      2026: 'Lançamento',
    };
    const genre = genreMap[sub] || sub || 'Variados';
    return { table: 'movies', genre: [genre], platform: null };
  }

  // ═══ ANIMAÇÃO ═══
  if (
    g.startsWith('ANIMAÇÃO') ||
    g.startsWith('ANIMACAO') ||
    g.startsWith('ANIMAÇÃO |') ||
    g.startsWith('ANIMACAO |')
  ) {
    return { table: 'movies', genre: ['Animação'], platform: null };
  }

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
    return { table: 'series', genre, platform };
  }

  // ═══ ANIMES ═══
  if (g.startsWith('ANIMES')) {
    return { table: 'series', genre: ['Anime'], platform: null };
  }

  // ═══ DORAMAS ═══
  if (g.startsWith('DORAMAS')) {
    return { table: 'series', genre: ['Dorama'], platform: null };
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
    return { table: 'series', genre: [genreMap[sub] || 'Novela'], platform: null };
  }

  return null; // ignorar (canais ao vivo, etc.)
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
  // Converte de wsrv.nl para tmdb direto se possível
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

// ── Truncar tabela ───────────────────────────────────────────────
async function truncateTable(table) {
  // Usa DELETE sem filtro (service_role bypassa RLS)
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`;
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
    console.warn(`[truncate ${table}] HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
}

// ── MAIN ─────────────────────────────────────────────────────────
async function main() {
  console.log('📂 Lendo M3U...');
  const raw = fs.readFileSync(M3U_FILE, 'utf8');
  const lines = raw.split('\n');

  console.log(`   ${lines.length.toLocaleString()} linhas no arquivo`);

  const movies = [];
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

    // Parse EXTINF
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

    const row = {
      title,
      poster,
      logo_url: logo || null,
      year,
      stream_url: url,
      genre: classification.genre,
      platform: classification.platform,
      status: 'active',
    };

    if (classification.table === 'movies') {
      movies.push(row);
    } else {
      series.push(row);
    }

    i++;
  }

  console.log(
    `✅ Parsed: ${movies.length.toLocaleString()} filmes  |  ${series.length.toLocaleString()} séries`
  );

  // Limpar tabelas
  console.log('\n🗑️  Limpando tabela movies...');
  await truncateTable('movies');
  console.log('🗑️  Limpando tabela series...');
  await truncateTable('series');
  console.log('   Tabelas limpas!\n');

  // Inserir filmes
  console.log(`🎬 Inserindo ${movies.length.toLocaleString()} filmes em batches de ${BATCH}...`);
  let moviesDone = 0;
  for (let b = 0; b < movies.length; b += BATCH) {
    const batch = movies.slice(b, b + BATCH);
    await insertBatch('movies', batch);
    moviesDone += batch.length;
    if (moviesDone % 5000 === 0 || moviesDone === movies.length) {
      process.stdout.write(
        `\r   ${moviesDone.toLocaleString()} / ${movies.length.toLocaleString()} filmes inseridos`
      );
    }
  }
  console.log('\n   ✅ Filmes concluídos!\n');

  // Inserir séries
  console.log(`📺 Inserindo ${series.length.toLocaleString()} séries em batches de ${BATCH}...`);
  let seriesDone = 0;
  for (let b = 0; b < series.length; b += BATCH) {
    const batch = series.slice(b, b + BATCH);
    await insertBatch('series', batch);
    seriesDone += batch.length;
    if (seriesDone % 5000 === 0 || seriesDone === series.length) {
      process.stdout.write(
        `\r   ${seriesDone.toLocaleString()} / ${series.length.toLocaleString()} séries inseridas`
      );
    }
  }
  console.log('\n   ✅ Séries concluídas!\n');

  console.log('🎉 Importação completa!');
  console.log(`   Movies: ${movies.length.toLocaleString()}`);
  console.log(`   Series: ${series.length.toLocaleString()}`);
  console.log(`   Total:  ${(movies.length + series.length).toLocaleString()}`);
}

main().catch((e) => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
