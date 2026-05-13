/**
 * fix-genres.mjs
 * ══════════════════════════════════════════════════════════════════
 * Normaliza TODOS os gêneros nas tabelas movies e series:
 *   • Remove prefixos IPTV ("Filmes | X", "SÉRIES | X")
 *   • Converte para nomes PT-BR padrão TMDB
 *   • Remove tags técnicas (4K, Legendados, Nacionais…)
 *   • Traduz gêneros em inglês para PT-BR
 *   • Corrige capitalização
 *   • Deduplica arrays
 *   • Garante mínimo de 1 gênero por item (fallback "Drama")
 *
 * Uso: node scripts/fix-genres.mjs
 * ══════════════════════════════════════════════════════════════════
 */

import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Mapa de normalização ──────────────────────────────────────────────────
// Chave: valor exato (case-insensitive trim) → Valor: gênero normalizado ou null (remover)
const GENRE_MAP = {
  // Prefixos IPTV → gênero limpo
  'filmes | drama': 'Drama',
  'filmes | comedia': 'Comédia',
  'filmes | acao': 'Ação',
  'filmes | terror': 'Terror',
  'filmes | animacao': 'Animação',
  'filmes | romance': 'Romance',
  'filmes | fantasia': 'Fantasia',
  'filmes | crime': 'Crime',
  'filmes | ficcao': 'Ficção Científica',
  'filmes | suspense': 'Thriller',
  'filmes | guerra': 'Guerra',
  'filmes | família': 'Família',
  'filmes | familia': 'Família',
  'filmes | aventura': 'Aventura',
  'filmes | faroeste': 'Faroeste',
  'filmes | infantis': 'Infantil',
  'filmes | natalino': null, // remove — tag sazonal
  'filmes | religiosos': null, // remove — não é gênero TMDB
  'filmes | nacionais': null, // remove — flag de origem
  'filmes | legendados': null, // remove — flag técnica
  'filmes | 4k': null, // remove — flag de qualidade
  'filmes | dublagemnaoficial': null,
  'filmes | dublagem nao oficial': null,
  'filmes | oscar 2025': null,
  'filmes | oscar 2024': null,
  'filmes | lancamentos': null,
  'filmes | cinema': null,
  'filmes | [xxx] adultos': null, // remove — adulto não é gênero de catálogo
  'filmes | xxx adultos': null,

  // Prefixos IPTV de séries
  'séries | hbomax': null,
  'series | hbomax': null,
  'séries | disney+': null,
  'series | disney+': null,
  'séries | animação': 'Animação',
  'series | animacao': 'Animação',

  // Inglês → PT-BR
  'action & adventure': 'Ação & Aventura',
  'sci-fi & fantasy': 'Sci-Fi & Fantasia',
  'war & politics': 'Guerra & Política',
  kids: 'Infantil',
  animation: 'Animação',
  comedy: 'Comédia',
  drama: 'Drama',
  crime: 'Crime',
  documentary: 'Documentário',
  family: 'Família',
  mystery: 'Mistério',
  thriller: 'Thriller',
  horror: 'Terror',
  romance: 'Romance',
  fantasy: 'Fantasia',
  action: 'Ação',
  adventure: 'Aventura',
  western: 'Faroeste',
  war: 'Guerra',
  history: 'História',
  music: 'Música',
  'science fiction': 'Ficção Científica',
  'sci-fi': 'Ficção Científica',

  // Capitalização/ortografia incorretas
  'ficção científica': 'Ficção Científica', // c minúsculo
  documentarios: 'Documentário',
  documentário: 'Documentário',
  'ficção cientifica': 'Ficção Científica',

  // Tags vagas/não-gêneros
  'cinema tv': null, // "TV Movie" — remove
  shows: null,
  'stand up comedy': 'Comédia',
  nacional: null,
  reality: 'Reality TV',
  novela: 'Drama',
};

// Normaliza um array de gêneros
function normalizeGenres(genres) {
  if (!Array.isArray(genres)) return ['Drama'];
  const seen = new Set();
  const result = [];
  for (const g of genres) {
    if (typeof g !== 'string') continue;
    const key = g.trim().toLowerCase();
    if (GENRE_MAP.hasOwnProperty(key)) {
      const mapped = GENRE_MAP[key];
      if (mapped && !seen.has(mapped)) {
        seen.add(mapped);
        result.push(mapped);
      }
    } else {
      // Mantém o valor se não está no mapa (já é um gênero limpo)
      const clean = g.trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    }
  }
  // Garantia: ao menos 1 gênero
  return result.length > 0 ? result : ['Drama'];
}

// Verifica se os gêneros mudaram
function genresChanged(original, normalized) {
  if (original.length !== normalized.length) return true;
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== normalized[i]) return true;
  }
  return false;
}

// Busca todas as linhas de uma tabela (paginado) — coluna: genre (singular)
async function fetchAll(table) {
  const rows = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id,genre&limit=1000&offset=${offset}`,
      { headers: HEADERS }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
    await sleep(100);
  }
  return rows;
}

// Atualiza um lote de linhas (PATCH — coluna: genre)
async function updateRows(table, updates) {
  let updated = 0;
  for (const { id, genre } of updates) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ genre }),
    });
    if (r.status === 204 || r.ok) updated++;
    await sleep(20);
  }
  return updated;
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function processTable(table) {
  console.log(`\n📋 Processando tabela: ${table}`);
  const rows = await fetchAll(table);
  console.log(`   → ${rows.length} linhas carregadas`);

  const toUpdate = [];
  const genreStats = {};

  for (const row of rows) {
    const original = Array.isArray(row.genre) ? row.genre : [];
    const normalized = normalizeGenres(original);

    // Estatísticas de gêneros normalizados
    for (const g of normalized) {
      genreStats[g] = (genreStats[g] || 0) + 1;
    }

    if (genresChanged(original, normalized)) {
      toUpdate.push({ id: row.id, genre: normalized });
    }
  }

  console.log(`   → ${toUpdate.length} linhas precisam de atualização`);

  if (toUpdate.length === 0) {
    console.log('   ✅ Nenhuma atualização necessária');
    return { stats: genreStats, updated: 0 };
  }

  // Mostra preview das primeiras mudanças
  console.log('\n   📝 Preview das mudanças (primeiras 5):');
  for (const { id, genre } of toUpdate.slice(0, 5)) {
    const orig = rows.find((r) => r.id === id)?.genre || [];
    console.log(`     ID ${id}: [${orig.join(', ')}] → [${genre.join(', ')}]`);
  }

  // Executa as atualizações em lotes
  console.log(`\n   ⏳ Atualizando ${toUpdate.length} linhas...`);
  const BATCH = 100;
  let totalUpdated = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    const n = await updateRows(table, batch);
    totalUpdated += n;
    process.stdout.write(`   [${Math.min(i + BATCH, toUpdate.length)}/${toUpdate.length}] \r`);
  }
  console.log(`\n   ✅ ${totalUpdated} linhas atualizadas`);
  return { stats: genreStats, updated: totalUpdated };
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  fix-genres.mjs — Normalização de Gêneros Supabase   ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  const movieResult = await processTable('movies');
  const seriesResult = await processTable('series');

  console.log('\n\n📊 Gêneros finais — movies:');
  const sortedMovies = Object.entries(movieResult.stats).sort((a, b) => b[1] - a[1]);
  for (const [g, c] of sortedMovies) console.log(`   ${String(c).padStart(5)}  ${g}`);

  console.log('\n📊 Gêneros finais — series:');
  const sortedSeries = Object.entries(seriesResult.stats).sort((a, b) => b[1] - a[1]);
  for (const [g, c] of sortedSeries) console.log(`   ${String(c).padStart(5)}  ${g}`);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(
    `║  CONCLUÍDO — movies: ${movieResult.updated} atualizadas | series: ${seriesResult.updated} atualizadas`
  );
  console.log('╚═══════════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
