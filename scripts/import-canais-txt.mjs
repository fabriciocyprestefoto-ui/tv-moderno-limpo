/**
 * import-canais-txt.mjs
 * Lê canais.txt (M3U), faz upsert na tabela `channels` do Supabase
 * preservando os campos não-URL (tmdb_id, is_premium, etc.).
 *
 * Uso: node scripts/import-canais-txt.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const M3U_FILE = path.join(__dirname, '../canais.txt');
const BATCH_SIZE = 200;

const SUPABASE_URL = requireSupabaseUrl();
const SERVICE_KEY = requireServiceRoleKey();

// ── Parse M3U ────────────────────────────────────────────────────
function parseM3U(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const channels = [];
  let meta = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const tvgName = (line.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const tvgLogo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const groupRaw = (line.match(/group-title="([^"]*)"/) || [])[1] || '';
      const displayName = line.split(',').slice(1).join(',').trim() || tvgName;
      meta = { name: displayName || tvgName, logo: tvgLogo, category: groupRaw };
    } else if (line && !line.startsWith('#') && meta) {
      channels.push({ ...meta, stream_url: line });
      meta = null;
    }
  }
  console.log(`📺 ${channels.length} canais lidos de canais.txt`);
  return channels;
}

// ── Buscar canais existentes ──────────────────────────────────────
async function fetchExistingChannels() {
  let all = [];
  let from = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/channels?select=id,name,stream_url&limit=${limit}&offset=${from}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!res.ok) {
      console.error('Erro ao buscar canais existentes:', await res.text());
      break;
    }
    const batch = await res.json();
    all = all.concat(batch);
    if (batch.length < limit) break;
    from += limit;
  }
  console.log(`🗄️  ${all.length} canais existentes no Supabase`);
  return all;
}

// ── Normaliza nome para matching ──────────────────────────────────
function normName(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/\b(4k|fhd|hd|sd)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Upsert em lotes ───────────────────────────────────────────────
async function upsertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error('Erro no upsert:', res.status, await res.text());
    return false;
  }
  return true;
}

// ── PATCH stream_url de canais existentes ────────────────────────
async function patchStreamUrl(id, stream_url) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stream_url }),
  });
  return res.ok;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(M3U_FILE)) {
    console.error(`❌ Arquivo não encontrado: ${M3U_FILE}`);
    process.exit(1);
  }

  const parsed = parseM3U(M3U_FILE);
  const existing = await fetchExistingChannels();

  // Mapa nome-norm → existente
  const existingMap = new Map();
  for (const ch of existing) {
    existingMap.set(normName(ch.name), ch);
  }

  let updated = 0;
  let inserted = 0;
  const toInsert = [];

  for (const ch of parsed) {
    const key = normName(ch.name);
    const found = existingMap.get(key);
    if (found) {
      // Atualiza apenas a stream_url do canal existente
      const ok = await patchStreamUrl(found.id, ch.stream_url);
      if (ok) updated++;
    } else {
      // Novo canal — será inserido
      toInsert.push({
        name: ch.name,
        logo: ch.logo || null,
        category: ch.category || 'Geral',
        stream_url: ch.stream_url,
      });
    }
  }

  // Inserir novos em lotes
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const ok = await upsertBatch(batch);
    if (ok) inserted += batch.length;
    console.log(
      `  Inserindo lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toInsert.length / BATCH_SIZE)}...`
    );
  }

  console.log(`\n✅ Concluído:`);
  console.log(`   URLs atualizadas: ${updated}`);
  console.log(`   Novos canais inseridos: ${inserted}`);
  console.log(`   Sem correspondência (ignorados): ${parsed.length - updated - inserted}`);
}

main().catch((e) => {
  console.error('❌ Erro fatal:', e);
  process.exit(1);
});
