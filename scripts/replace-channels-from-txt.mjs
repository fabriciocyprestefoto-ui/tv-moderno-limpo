/**
 * replace-channels-from-txt.mjs
 * Substitui TODO o conteúdo da tabela `channels` pelo canais.txt.
 * 1. Apaga todos os canais existentes no Supabase.
 * 2. Insere os 2000+ canais do canais.txt em lotes de 200.
 *
 * Uso: node scripts/replace-channels-from-txt.mjs
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
      const tvgId = (line.match(/tvg-id="([^"]*)"/) || [])[1] || '';
      const tvgName = (line.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const tvgLogo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const groupRaw = (line.match(/group-title="([^"]*)"/) || [])[1] || '';
      const displayName = line.split(',').slice(1).join(',').trim() || tvgName;
      meta = {
        name: displayName || tvgName,
        logo: tvgLogo || null,
        category: groupRaw || 'Geral',
      };
      void tvgId; // não existe coluna tvg_id na tabela
    } else if (line && !line.startsWith('#') && meta) {
      channels.push({ ...meta, stream_url: line });
      meta = null;
    }
  }

  console.log(`📺 ${channels.length} canais lidos de canais.txt`);
  return channels;
}

// ── Apaga todos os canais existentes ─────────────────────────────
async function deleteAllChannels() {
  console.log('🗑️  Apagando todos os canais existentes...');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/channels?id=gte.0`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    // Fallback: tentar sem filtro de id (RLS pode precisar de outro filtro)
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/channels?name=neq.`, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'count=exact',
      },
    });
    if (!res2.ok) {
      console.error('❌ Erro ao apagar canais:', res2.status, await res2.text());
      process.exit(1);
    }
    const count = res2.headers.get('content-range') || '?';
    console.log(`   Apagados (fallback): ${count}`);
    return;
  }
  const count = res.headers.get('content-range') || '?';
  console.log(`   Apagados: ${count}`);
}

// ── Insere um lote de canais ──────────────────────────────────────
async function insertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/channels`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error('❌ Erro no insert:', res.status, await res.text());
    return false;
  }
  return true;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(M3U_FILE)) {
    console.error(`❌ Arquivo não encontrado: ${M3U_FILE}`);
    process.exit(1);
  }

  const channels = parseM3U(M3U_FILE);
  if (channels.length === 0) {
    console.error('❌ Nenhum canal encontrado no arquivo.');
    process.exit(1);
  }

  await deleteAllChannels();

  let inserted = 0;
  const totalBatches = Math.ceil(channels.length / BATCH_SIZE);

  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`  Inserindo lote ${batchNum}/${totalBatches}... `);
    const ok = await insertBatch(batch);
    if (ok) {
      inserted += batch.length;
      console.log(`✓`);
    } else {
      console.log(`✗`);
    }
  }

  console.log(`\n✅ Concluído:`);
  console.log(`   Canais inseridos: ${inserted} / ${channels.length}`);
}

main().catch((e) => {
  console.error('❌ Erro fatal:', e);
  process.exit(1);
});
