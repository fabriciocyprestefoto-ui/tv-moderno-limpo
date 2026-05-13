/**
 * diagnose-dupes.mjs — verifica duplicatas por título normalizado
 * Uso: node scripts/diagnose-dupes.mjs
 */
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();
const PAGE_SIZE = 1000;

const SB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function fetchAll(table) {
  const rows = [];
  let offset = 0;
  process.stdout.write(`  Carregando ${table}...`);
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id,title,year&offset=${offset}&limit=${PAGE_SIZE}`,
      { headers: SB }
    );
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    offset += PAGE_SIZE;
    process.stdout.write(` ${rows.length.toLocaleString()}`);
    if (batch.length < PAGE_SIZE) break;
  }
  console.log();
  return rows;
}

// Normaliza título: remove sufixos de versão, qualidade, idioma
function normalizeTitle(raw) {
  return (
    (raw || '')
      // Remove sufixos de idioma/versão entre parênteses ou colchetes
      .replace(
        /\s*[\(\[]\s*(dub|dublado|leg|legendado|nacional|dual\s*audio|dual|4k|hd|hdr|uhd|bluray|blu-ray|webrip|webdl|web-dl|hevc|hdtv|extended|unrated|directors?\s*cut|versão\s*\w+)\s*[\)\]]\s*$/gi,
        ''
      )
      // Remove sufixos soltos no final
      .replace(
        /\s+[-–]\s*(dub|dublado|leg|legendado|nacional|dual\s*audio|dual|4k|hdr|uhd)\s*$/gi,
        ''
      )
      .replace(/\s+(dub|dublado|leg|legendado|nacional|dual\s*audio)\s*$/gi, '')
      // Remove qualidade no final
      .replace(
        /\s+(4K|HDR|HD|SD|UHD|BluRay|BLUray|HDTV|WEBDL|WEB-DL|WEBRIP|HEVC|XviD|x264|x265)\s*$/gi,
        ''
      )
      // Remove ano entre parênteses no final
      .replace(/\s*\(\s*((?:19|20)\d{2})\s*\)\s*$/, '')
      // Remove ano com traço no final
      .replace(/\s*[-–]\s*((?:19|20)\d{2})\s*$/, '')
      // Normaliza espaços
      .trim()
      .toLowerCase()
      // Remove acentos
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Remove pontuação extra
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function analyzeTable(rows, tableName) {
  const groups = new Map(); // normalizedTitle+year → [rows]
  let noYearCount = 0;

  for (const row of rows) {
    const norm = normalizeTitle(row.title);
    const year = row.year || 0;
    if (!year) noYearCount++;
    const key = `${norm}|||${year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicated = Array.from(groups.entries())
    .filter(([, v]) => v.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  const totalDupeRows = duplicated.reduce((acc, [, v]) => acc + v.length - 1, 0);

  console.log(`\n═══ ${tableName} ═══════════════════════════════`);
  console.log(`  Total de linhas      : ${rows.length.toLocaleString()}`);
  console.log(`  Títulos únicos       : ${groups.size.toLocaleString()}`);
  console.log(`  Títulos com duplicata: ${duplicated.length.toLocaleString()}`);
  console.log(`  Linhas duplicadas    : ${totalDupeRows.toLocaleString()} (podem ser removidas)`);
  console.log(`  Sem ano              : ${noYearCount.toLocaleString()}`);

  console.log(`\n  Top 20 mais duplicados:`);
  duplicated.slice(0, 20).forEach(([key, dupes]) => {
    const [title, year] = key.split('|||');
    const rawTitles = dupes.map((d) => d.title).join(' | ');
    console.log(
      `    [${year || 's/ano'}] "${title}" → ${dupes.length}x  |  ${rawTitles.slice(0, 90)}`
    );
  });

  return totalDupeRows;
}

async function main() {
  console.log('══ Diagnóstico de Duplicatas ══════════════════════════════');
  const movies = await fetchAll('movies');
  const series = await fetchAll('series');

  const movieDupes = analyzeTable(movies, 'FILMES');
  const seriesDupes = analyzeTable(series, 'SÉRIES');

  console.log('\n═══ RESUMO ════════════════════════════════════════════════');
  console.log(
    `  Filmes: ${movies.length.toLocaleString()} linhas → ${(movies.length - movieDupes).toLocaleString()} após dedup`
  );
  console.log(
    `  Séries: ${series.length.toLocaleString()} linhas → ${(series.length - seriesDupes).toLocaleString()} após dedup`
  );
  console.log(`  Total removível: ${(movieDupes + seriesDupes).toLocaleString()} linhas`);
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
