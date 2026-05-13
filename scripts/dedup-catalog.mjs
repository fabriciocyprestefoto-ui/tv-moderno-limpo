/**
 * dedup-catalog.mjs — Remove duplicatas do catálogo Supabase
 *
 * Lógica:
 *   - Normaliza título (remove "Dublado", "Legendado", "4K", "HD", "(2024)", etc.)
 *   - Agrupa por (título_normalizado + ano)
 *   - Para cada grupo com > 1 linha: mantém a melhor e deleta as restantes
 *     Critério de melhor: título sem sufixo > com sufixo; nome mais curto; sem "(ano)"
 *
 * Uso: node scripts/dedup-catalog.mjs
 *      node scripts/dedup-catalog.mjs --dry-run   (só mostra, não deleta)
 */

import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 1000;
const DELETE_CHUNK = 50; // ids por DELETE request

const SB = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Normalização ────────────────────────────────────────────────
function normalizeTitle(raw) {
  return (
    (raw || '')
      // Remove sufixos de idioma/versão entre parênteses ou colchetes
      .replace(
        /\s*[\(\[]\s*(dub(lado)?|leg(endado)?|nacional|dual\s*audio|dual|4k|hdr|uhd|bluray|blu-ray|webrip|webdl|web-dl|hevc|hdtv|extended|unrated|directors?\s*cut|versão\s*\w+)\s*[\)\]]\s*$/gi,
        ''
      )
      // Remove sufixos soltos após traço/espaço
      .replace(
        /\s+[-–]\s*(dub(lado)?|leg(endado)?|nacional|dual\s*audio|dual|4k|hdr|uhd)\s*$/gi,
        ''
      )
      .replace(/\s+(dub(lado)?|leg(endado)?|nacional|dual\s*audio)\s*$/gi, '')
      // Remove qualidade de vídeo no final
      .replace(
        /\s+(4K|HDR|HD|SD|UHD|BluRay|BLUray|HDTV|WEBDL|WEB-DL|WEBRIP|HEVC|XviD|x264|x265)(\s+\[[\w\s]+\])?\s*$/gi,
        ''
      )
      // Remove ano entre parênteses
      .replace(/\s*\(\s*((?:19|20)\d{2})\s*\)\s*$/, '')
      // Remove ano com traço
      .replace(/\s*[-–]\s*((?:19|20)\d{2})\s*$/, '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// Score de qualidade: título limpo (sem sufixos) > 4K > HD > outros
// Maior score = melhor entrada a manter
function titleScore(title) {
  const t = (title || '').toLowerCase();
  let score = 100;
  if (/ 4k/i.test(t)) score += 5; // 4K é bom, mas pode ter duplicata com e sem
  if (/\[hdr\]/i.test(t)) score -= 1; // sufixo extra → penalidade leve
  if (/\(dub\)/i.test(t) || /dublado/i.test(t)) score -= 10;
  if (/\(leg\)/i.test(t) || /legendado/i.test(t)) score -= 8;
  if (/\(\d{4}\)\s*$/.test(t)) score -= 2; // ano redundante entre parênteses
  if (/ - \d{4}\s*$/.test(t)) score -= 2;
  // Título mais curto (mais limpo) tem leve vantagem
  score -= title.length * 0.01;
  return score;
}

// ─── Fetch all ────────────────────────────────────────────────────
async function fetchAll(table) {
  const rows = [];
  let offset = 0;
  process.stdout.write(`  📥 ${table}...`);
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id,title,year&offset=${offset}&limit=${PAGE_SIZE}`,
      { headers: SB }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    offset += PAGE_SIZE;
    if (rows.length % 10000 === 0) process.stdout.write(` ${rows.length.toLocaleString()}`);
    if (batch.length < PAGE_SIZE) break;
  }
  console.log(` ${rows.length.toLocaleString()} linhas`);
  return rows;
}

// ─── Find duplicates ─────────────────────────────────────────────
function findDuplicates(rows) {
  const groups = new Map();
  for (const row of rows) {
    const norm = normalizeTitle(row.title);
    if (!norm) continue;
    const year = row.year || 0;
    const key = `${norm}|||${year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const toDelete = [];
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    // Ordena: maior score primeiro (melhor entrada a manter)
    group.sort((a, b) => titleScore(b.title) - titleScore(a.title));
    // Mantém o primeiro, deleta os restantes
    toDelete.push(...group.slice(1).map((r) => r.id));
  }
  return toDelete;
}

// ─── Delete by IDs ────────────────────────────────────────────────
async function deleteByIds(table, ids) {
  if (ids.length === 0) return 0;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const chunk = ids.slice(i, i + DELETE_CHUNK);
    const filter = chunk.map((id) => `"${id}"`).join(',');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=in.(${filter})`, {
      method: 'DELETE',
      headers: SB,
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error(`[DELETE ${table}] HTTP ${r.status}: ${txt.slice(0, 120)}`);
    } else {
      deleted += chunk.length;
    }
    if (i % 500 === 0 && i > 0) {
      process.stdout.write(
        `\r    🗑️  ${deleted.toLocaleString()} / ${ids.length.toLocaleString()} deletados`
      );
      await sleep(50);
    }
  }
  process.stdout.write(
    `\r    🗑️  ${deleted.toLocaleString()} / ${ids.length.toLocaleString()} deletados\n`
  );
  return deleted;
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║         Deduplicação de Catálogo (Supabase)           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('  [DRY-RUN] Nenhuma alteração será salva.');
  console.log();

  const movies = await fetchAll('movies');
  const series = await fetchAll('series');

  console.log('\n  🔍 Calculando duplicatas...');
  const movieDups = findDuplicates(movies);
  const seriesDups = findDuplicates(series);

  console.log(`\n  📊 Filmes a remover : ${movieDups.length.toLocaleString()}`);
  console.log(`  📊 Séries a remover : ${seriesDups.length.toLocaleString()}`);
  console.log(`  📊 Total            : ${(movieDups.length + seriesDups.length).toLocaleString()}`);

  if (DRY_RUN) {
    console.log('\n  [DRY-RUN] Nenhuma deleção executada. Rode sem --dry-run para aplicar.');
    return;
  }

  console.log('\n  ══ Deletando duplicatas de filmes ══');
  const mDel = await deleteByIds('movies', movieDups);

  console.log('  ══ Deletando duplicatas de séries ══');
  const sDel = await deleteByIds('series', seriesDups);

  // Contagem final
  const mCount = await fetch(`${SUPABASE_URL}/rest/v1/movies?select=id`, {
    headers: { ...SB, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
  });
  const sCount = await fetch(`${SUPABASE_URL}/rest/v1/series?select=id`, {
    headers: { ...SB, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
  });
  const mTotal = parseInt(mCount.headers.get('Content-Range')?.split('/')[1] || '0', 10);
  const sTotal = parseInt(sCount.headers.get('Content-Range')?.split('/')[1] || '0', 10);

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                   RESULTADO FINAL                     ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`  Filmes deletados : ${mDel.toLocaleString()}`);
  console.log(`  Séries deletadas : ${sDel.toLocaleString()}`);
  console.log(`  Filmes restantes : ${isNaN(mTotal) ? '?' : mTotal.toLocaleString()}`);
  console.log(`  Séries restantes : ${isNaN(sTotal) ? '?' : sTotal.toLocaleString()}`);
  console.log(
    `  Total restante   : ${isNaN(mTotal + sTotal) ? '?' : (mTotal + sTotal).toLocaleString()}`
  );
  console.log('\n  ✅ Deduplicação concluída!');
}

main().catch((e) => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
