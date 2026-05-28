#!/usr/bin/env node
/**
 * Testa cada stream da tabela adult_streams e remove os que não respondem.
 *
 *   node scripts/prune-dead-adult-streams.cjs            (dry-run: só reporta)
 *   node scripts/prune-dead-adult-streams.cjs --apply    (deleta os mortos)
 *
 * "Responde" = GET com redirect seguido retornando HTTP 200 dentro do timeout.
 * Lê VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env (service_role só local).
 * URLs mascaradas nos logs.
 */
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 12000;
const CONCURRENCY = 12;

function loadEnv(file) {
  const e = {};
  if (!fs.existsSync(file)) return e;
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    e[t.slice(0, i).trim()] = v;
  }
  return e;
}
function mask(u) {
  try { const x = new URL(u); const s = x.pathname.split('/').filter(Boolean); return `${x.host}/.../${s[s.length - 1] || ''}`; }
  catch { return String(u).slice(0, 24) + '…'; }
}

async function testUrl(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
    clearTimeout(to);
    return res.status; // 200 = vivo
  } catch {
    clearTimeout(to);
    return 0; // timeout/erro de conexão
  }
}

async function pool(items, worker, concurrency) {
  const out = new Array(items.length);
  let idx = 0;
  async function run() {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = { ...loadEnv(path.resolve('.env')), ...process.env };
  const URL_ = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const SR = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !SR) { console.error('Faltando VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(URL_, SR, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: rows, error } = await supabase.from('adult_streams').select('id, title, stream_url');
  if (error) { console.error('erro ao ler adult_streams:', error.message); process.exit(1); }
  console.log(`[prune] testando ${rows.length} streams (timeout=${TIMEOUT_MS}ms, conc=${CONCURRENCY})...`);

  let done = 0;
  const results = await pool(rows, async (r) => {
    const status = await testUrl(r.stream_url);
    done++;
    if (done % 25 === 0) console.log(`   ...${done}/${rows.length}`);
    return { ...r, status, alive: status === 200 };
  }, CONCURRENCY);

  const alive = results.filter((r) => r.alive);
  const dead = results.filter((r) => !r.alive);
  console.log('═══════════════════════════════════════════════');
  console.log(`[prune] VIVOS=${alive.length}  MORTOS=${dead.length}  (total=${rows.length})`);
  console.log('[prune] mortos:');
  dead.forEach((d) => console.log(`   ✗ ${d.status || 'timeout'}  ${d.title}  ${mask(d.stream_url)}`));
  console.log('═══════════════════════════════════════════════');

  if (!apply) { console.log('[prune] DRY-RUN — nada deletado. Rode com --apply para remover os mortos.'); return; }
  if (!dead.length) { console.log('[prune] nada a remover.'); return; }

  const deadIds = dead.map((d) => d.id);
  const BATCH = 100;
  let deleted = 0;
  for (let off = 0; off < deadIds.length; off += BATCH) {
    const batch = deadIds.slice(off, off + BATCH);
    const { error: delErr } = await supabase.from('adult_streams').delete().in('id', batch);
    if (delErr) { console.error('erro ao deletar lote:', delErr.message); }
    else deleted += batch.length;
  }
  console.log(`[prune] removidos=${deleted}. adult_streams agora deve ter ${alive.length} streams vivos.`);
}

main().catch((e) => { console.error('erro fatal:', e && e.message ? e.message : e); process.exit(1); });
