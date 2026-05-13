/**
 * import-m3u.mjs
 * 1. Lê real_content.json (998 itens = catálogo atual do projeto)
 * 2. Cruza com o M3U para obter as URLs corretas (myfilmes.fun)
 * 3. Extrai canais ao vivo do M3U
 * 4. Importa tudo no novo Supabase via REST API
 *
 * Uso: node scripts/import-m3u.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config (URL e service_role vêm do .env — não embutir projeto antigo) ──
const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const M3U_FILE = path.join(__dirname, '../playlist_35934725_plus.m3u');
const REAL_CONTENT = path.join(
  __dirname,
  '../.claude/worktrees/interesting-keller/public/data/real_content.json'
);
const BATCH_SIZE = 500;

// ── Normalização de título para matching ─────────────────────────
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\[.*?\]/g, '') // remove [L] [DUB] [LEG]
    .replace(/\(.*?\)/g, '') // remove (2026) (4K)
    .replace(/\b(fhd|hd|4k|uhd|sd|ppv|ao vivo)\b/gi, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Grupos de canais ao vivo ──────────────────────────────────────
const LIVE_GROUPS = new Set([
  'GLOBO',
  'RECORD',
  'SBT',
  'BAND',
  'HBO',
  'HBO MAX',
  'SPORTV',
  'ESPN',
  'PREMIERE',
  'TELECINE',
  'DISCOVERY+',
  'NAT GEO',
  'NOTICIAS',
  'ESPORTES',
  'ESPORTES PPV',
  'LUTAS',
  'BBB 2026',
  'JOGOS DO DIA',
  'DISNEY E MAX PPV',
  'COMBATE',
  'BAND SPORTS',
  'BAND NEWS',
  'FUTEBOL',
  'FUTEBOL PPV',
  'MULTISHOW',
  'GNT',
  'MEGAPIX',
  'SBT+',
  'DISNEY+',
  'AMAZON PRIME VIDEO',
  'APPLE TV',
  'PARAMOUNT+',
  'STAR+',
  'GLOBO PLAY',
]);

const ADULT_KEYWORDS = ['XXX', 'ADULT', 'ADULTO', '18+', 'PORNO', 'PORN'];

// ── Parse M3U ────────────────────────────────────────────────────
function parseM3U(filePath) {
  console.log('📖 Lendo M3U (pode levar 20-30s)...');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const liveChannels = [];
  const vodIndex = new Map(); // normalizedTitle → [{ url, logo, group, rawName }]
  let meta = null;
  let cNum = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      const tvgName = (line.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const tvgLogo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const groupRaw = (line.match(/group-title="([^"]*)"/) || [])[1] || '';
      const displayName = line.split(',').slice(1).join(',').trim() || tvgName;
      meta = { name: displayName, logo: tvgLogo, group: groupRaw };
      continue;
    }

    if (meta && line && !line.startsWith('#')) {
      const url = line.trim();
      const group = meta.group.toUpperCase().trim();
      const isAdult = ADULT_KEYWORDS.some(
        (k) => group.includes(k) || meta.name.toUpperCase().includes(k)
      );

      if (!isAdult) {
        const isLive =
          LIVE_GROUPS.has(group) ||
          (url.endsWith('.ts') && !url.includes('/movie/') && !url.includes('/series/'));

        if (isLive) {
          liveChannels.push({
            name: meta.name,
            logo: meta.logo || null,
            category: toChannelCategory(group),
            stream_url: url,
            number: cNum++,
            is_premium: false,
          });
        } else {
          // Indexa VOD por título normalizado para busca rápida
          const normalized = normalizeTitle(meta.name);
          if (normalized.length > 2) {
            if (!vodIndex.has(normalized)) vodIndex.set(normalized, []);
            vodIndex.get(normalized).push({ url, logo: meta.logo, group, rawName: meta.name });
          }
        }
      }
      meta = null;
    }
  }

  console.log(`  📺 Canais ao vivo: ${liveChannels.length}`);
  console.log(`  🎬 VOD indexado:   ${vodIndex.size} títulos únicos`);
  return { liveChannels, vodIndex };
}

// ── Busca URL no índice VOD ───────────────────────────────────────
function findUrl(vodIndex, title, type) {
  const normalized = normalizeTitle(title);

  // Match exato
  if (vodIndex.has(normalized)) {
    const entries = vodIndex.get(normalized);
    // Prefere a URL no subpath correto (movie vs series)
    const preferred = entries.find((e) =>
      type === 'movie'
        ? e.url.includes('/movie/')
        : type === 'tv'
          ? e.url.includes('/series/')
          : true
    );
    return (preferred || entries[0]).url;
  }

  // Match parcial: verifica se o título normalizado está contido em alguma chave
  for (const [key, entries] of vodIndex) {
    if (key.startsWith(normalized) || normalized.startsWith(key)) {
      if (Math.abs(key.length - normalized.length) <= 4) {
        const preferred = entries.find((e) =>
          type === 'movie'
            ? e.url.includes('/movie/')
            : type === 'tv'
              ? e.url.includes('/series/')
              : true
        );
        return (preferred || entries[0]).url;
      }
    }
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────
function toChannelCategory(group) {
  if (['GLOBO', 'RECORD', 'SBT', 'BAND'].some((g) => group.includes(g))) return 'Abertos';
  if (['SPORTV', 'ESPN', 'ESPORT', 'PREMIERE', 'COMBATE', 'FUTEBOL'].some((g) => group.includes(g)))
    return 'Esportes';
  if (['HBO', 'TELECINE', 'MEGAPIX', 'MAX'].some((g) => group.includes(g)))
    return 'Filmes e Séries';
  if (['DISCOVERY', 'NAT GEO'].some((g) => group.includes(g))) return 'Documentários';
  if (['NOTICIA', 'NEWS'].some((g) => group.includes(g))) return 'Notícias';
  if (['LUTA', 'COMBATE'].some((g) => group.includes(g))) return 'Lutas';
  if (['DISNEY', 'INFANTIL', 'KIDS'].some((g) => group.includes(g))) return 'Infantil';
  if (['BBB', 'JOGOS', 'ENTRET'].some((g) => group.includes(g))) return 'Entretenimento';
  return 'Outros';
}

function tmdbPosterUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/w500${path}`;
}

// ── Supabase bulk insert ─────────────────────────────────────────
async function bulkInsert(table, rows) {
  if (!rows.length) {
    console.log(`  ⚠️  Nenhum registro para ${table}`);
    return 0;
  }

  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(batch),
    });

    if (res.ok || res.status === 201) {
      inserted += batch.length;
      process.stdout.write(`\r  ✅ ${table}: ${inserted}/${rows.length}...`);
    } else {
      const err = await res.text();
      console.error(`\n  ❌ Batch ${i}: HTTP ${res.status} — ${err.slice(0, 300)}`);
      failed++;
      if (failed >= 5) {
        console.error('  ❌ Muitos erros, abortando.');
        break;
      }
    }

    if (i + BATCH_SIZE < rows.length) await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n  ✅ ${table}: ${inserted} inseridos`);
  return inserted;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Importação: catálogo atual do projeto → novo Supabase\n');

  // 1. Parse M3U
  const { liveChannels, vodIndex } = parseM3U(M3U_FILE);

  // 2. Carrega real_content.json (998 itens do projeto atual)
  console.log('\n📦 Carregando catálogo atual (real_content.json)...');
  const realContent = JSON.parse(fs.readFileSync(REAL_CONTENT, 'utf-8'));
  const currentMovies = realContent.filter((x) => x.type === 'movie');
  const currentSeries = realContent.filter((x) => x.type === 'tv');
  console.log(`  🎬 ${currentMovies.length} filmes | 📺 ${currentSeries.length} séries`);

  // 3. Cruza com M3U para obter URLs corretas
  console.log('\n🔗 Cruzando com M3U para obter URLs...');
  let matchedMovies = 0,
    unmatchedMovies = 0;
  let matchedSeries = 0,
    unmatchedSeries = 0;

  const movies = currentMovies
    .map((item) => {
      const url = findUrl(vodIndex, item.title || item.name, 'movie');
      if (url) matchedMovies++;
      else unmatchedMovies++;
      return {
        title: item.title || item.name,
        description: item.overview || null,
        poster: tmdbPosterUrl(item.poster_path),
        backdrop: tmdbPosterUrl(item.backdrop_path),
        year: item.year || null,
        rating: item.vote_average || null,
        genre: Array.isArray(item.genres) ? item.genres : [],
        stream_url: url || item.streamUrl || null, // fallback para URL antiga se não encontrou
        tmdb_id: item.id > 0 && item.id < 1000000 ? item.id : null,
        status: 'published',
      };
    })
    .filter((m) => m.stream_url); // só importa itens com URL

  const series = currentSeries
    .map((item) => {
      const url = findUrl(vodIndex, item.title || item.name, 'tv');
      if (url) matchedSeries++;
      else unmatchedSeries++;
      return {
        title: item.title || item.name,
        description: item.overview || null,
        poster: tmdbPosterUrl(item.poster_path),
        backdrop: tmdbPosterUrl(item.backdrop_path),
        logo_url: item.logoUrl || null,
        year: item.year || null,
        rating: item.vote_average || null,
        genre: Array.isArray(item.genres) ? item.genres : [],
        stream_url: url || item.streamUrl || null,
        tmdb_id: typeof item.id === 'number' && item.id < 1000000 ? item.id : null,
        seasons_count: item.number_of_seasons || 0,
        status: 'published',
      };
    })
    .filter((s) => s.stream_url);

  console.log(
    `  🎬 Filmes:  ${matchedMovies} com URL nova | ${unmatchedMovies} usam URL antiga | ${movies.length} serão importados`
  );
  console.log(
    `  📺 Séries:  ${matchedSeries} com URL nova | ${unmatchedSeries} usam URL antiga | ${series.length} serão importados`
  );
  console.log(`  📡 Canais:  ${liveChannels.length} ao vivo`);

  // 4. Salva JSONs de backup
  const dataDir = path.join(__dirname, '../public/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels.json'), JSON.stringify(liveChannels, null, 2));
  fs.writeFileSync(path.join(dataDir, 'movies.json'), JSON.stringify(movies, null, 2));
  fs.writeFileSync(path.join(dataDir, 'series.json'), JSON.stringify(series, null, 2));
  console.log('\n💾 Backups salvos em public/data/\n');

  // 5. Importa no Supabase
  console.log('📤 Importando no Supabase...\n');
  await bulkInsert('channels', liveChannels);
  await bulkInsert('movies', movies);
  await bulkInsert('series', series);

  console.log('\n🎉 Concluído! Confira VITE_SUPABASE_URL no .env e reinicie o app se necessário.');
}

main().catch((err) => {
  console.error('\n💥', err.message);
  process.exit(1);
});
