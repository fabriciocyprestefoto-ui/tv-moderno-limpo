// fix-channels-ts-to-m3u8.mjs
// Converte URLs .ts em canais para HLS .m3u8 do mesmo provider fontez.cc.
// Padrão: http://fontez.cc:80/myfilmestest100/jkZwXZ4K4F/<id>.ts
//      → http://fontez.cc:80/live/myfilmestest100/jkZwXZ4K4F/<id>.m3u8
// Uso: node scripts/fix-channels-ts-to-m3u8.mjs            (dry-run)
//      node scripts/fix-channels-ts-to-m3u8.mjs --apply    (PATCH)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const APPLY = process.argv.includes('--apply');

function readEnv(k) {
  try {
    const t = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    const m = t.match(new RegExp('^' + k + '=(.+)$', 'm'));
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const SUP = (process.env.VITE_SUPABASE_URL || readEnv('VITE_SUPABASE_URL')).trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || readEnv('SUPABASE_SERVICE_ROLE_KEY')).trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const FONTEZ_TS = /^http:\/\/fontez\.cc(?::\d+)?\/([^/]+)\/([^/]+)\/(\d+)\.ts(\?.*)?$/i;

function rewriteUrl(url) {
  if (!url) return null;
  const m = url.match(FONTEZ_TS);
  if (!m) return null;
  const [, user, pass, id, qs = ''] = m;
  return `http://fontez.cc:80/live/${user}/${pass}/${id}.m3u8${qs}`;
}

async function fetchAll() {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const r = await fetch(`${SUP}/rest/v1/channels?select=id,name,stream_url`, {
      headers: { ...H, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function patch(id, stream_url) {
  const r = await fetch(`${SUP}/rest/v1/channels?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ stream_url }),
  });
  if (!r.ok) throw new Error(`PATCH ${r.status}: ${await r.text()}`);
}

async function main() {
  const rows = await fetchAll();
  const updates = [];
  for (const r of rows) {
    const newUrl = rewriteUrl(r.stream_url);
    if (newUrl && newUrl !== r.stream_url) {
      updates.push({ id: r.id, name: r.name, old: r.stream_url, new: newUrl });
    }
  }
  console.log(`Total channels: ${rows.length}`);
  console.log(`Will update: ${updates.length}`);
  updates.slice(0, 6).forEach((u) => console.log(`  ${u.name}\n    ${u.old}\n  → ${u.new}`));
  if (!APPLY) {
    console.log('\nDry-run. --apply para gravar.');
    return;
  }
  let ok = 0, fail = 0;
  const CONC = 8;
  let idx = 0;
  async function worker() {
    while (idx < updates.length) {
      const i = idx++;
      const u = updates[i];
      try { await patch(u.id, u.new); ok++; if (ok % 50 === 0) console.log(`  ${ok}/${updates.length} ok`); }
      catch (e) { fail++; console.error(`fail ${u.id}: ${e.message}`); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`Done. ok=${ok} fail=${fail}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
