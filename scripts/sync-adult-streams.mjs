// sync-adult-streams.mjs
// Lê playlist_adultos.m3u, apaga adult_streams antigos e insere novos.
// Uso:
//   node scripts/sync-adult-streams.mjs            (dry-run)
//   node scripts/sync-adult-streams.mjs --apply    (wipe + insert)

import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import process from 'node:process';

const APPLY = process.argv.includes('--apply');
// Procura M3U em public/ primeiro (caminho atual), depois fallback no root.
const M3U = (() => {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'playlist_adultos.m3u'),
    path.resolve(process.cwd(), 'playlist_adultos.m3u'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
})();

function readEnv(key) {
  try {
    const t = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    const m = t.match(new RegExp('^' + key + '=(.+)$', 'm'));
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || readEnv('VITE_SUPABASE_URL')).trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || readEnv('SUPABASE_SERVICE_ROLE_KEY')).trim();
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE env ausente.');
  process.exit(1);
}
const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function parseM3u(file) {
  const out = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let meta = null;
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const tvgName = (line.match(/tvg-name="([^"]+)"/) || [])[1] || '';
      const tvgLogo = (line.match(/tvg-logo="([^"]+)"/) || [])[1] || null;
      const groupTitle = (line.match(/group-title="([^"]+)"/) || [])[1] || null;
      const lastComma = line.lastIndexOf(',');
      const display = lastComma > -1 ? line.slice(lastComma + 1).trim() : '';
      meta = { title: display || tvgName || 'Sem título', logo_url: tvgLogo, group_title: groupTitle };
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!meta) continue;
    if (!/^https?:\/\//i.test(line)) continue;
    out.push({ ...meta, stream_url: line, source: 'playlist_adultos.m3u' });
    meta = null;
  }
  return out;
}

async function countAdult() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/adult_streams?select=count`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = r.headers.get('content-range') || '';
  const total = Number(cr.split('/').pop()) || 0;
  return total;
}

async function wipe() {
  // PostgREST exige WHERE em DELETE — id IS NOT NULL apaga tudo
  const r = await fetch(`${SUPABASE_URL}/rest/v1/adult_streams?id=not.is.null`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(`DELETE ${r.status}: ${await r.text()}`);
}

async function insertBatch(rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/adult_streams`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`POST ${r.status}: ${await r.text()}`);
}

async function main() {
  console.log(`[m3u] ${M3U}`);
  const rows = await parseM3u(M3U);
  console.log(`[m3u] parsed ${rows.length} streams`);
  console.log('amostra:');
  rows.slice(0, 3).forEach((r) =>
    console.log(`  • ${r.title}\n    ${r.group_title}\n    ${r.stream_url}`)
  );

  const before = await countAdult();
  console.log(`[db] adult_streams atual: ${before} linhas`);

  if (!APPLY) {
    console.log('\nDry-run. --apply para wipe+insert.');
    return;
  }

  console.log('\n[db] wipe …');
  await wipe();
  const after = await countAdult();
  console.log(`[db] após wipe: ${after} linhas`);

  console.log('[db] insert em lotes …');
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await insertBatch(batch);
    console.log(`  inserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  const final = await countAdult();
  console.log(`\nDone. adult_streams: ${final} linhas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
