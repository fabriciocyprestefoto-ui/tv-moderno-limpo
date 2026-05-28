#!/usr/bin/env node
/**
 * Atualiza o conteúdo adulto da tabela `adult_streams` no Supabase a partir de
 * adulto-data.m3u (a tabela já existe; este script só insere novos e atualiza
 * metadados de existentes — match por stream_url).
 *
 * Uso:
 *   node scripts/import-adult-m3u-to-supabase.cjs --dry-run
 *   node scripts/import-adult-m3u-to-supabase.cjs --import
 *
 * Lê VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env da raiz.
 * service_role é usado SOMENTE aqui (script local) — nunca no frontend.
 * URLs com token são mascaradas nos logs.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const M3U_PATH = path.join(ROOT, 'adulto-data.m3u');
const SOURCE_FILE = 'adulto-data.m3u';
const TABLE = 'adult_streams';

// ── .env parser (sem dotenv) ─────────────────────────────────────────────────
function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// ── Mascarar URL sensível ────────────────────────────────────────────────────
function maskUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    return `${u.host}/.../${seg.length ? seg[seg.length - 1] : ''}`;
  } catch {
    return String(url).slice(0, 24) + '…';
  }
}

// ── Parser M3U ───────────────────────────────────────────────────────────────
function attr(line, name) {
  const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(line);
  return m ? m[1] : '';
}

function parseM3U(raw) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const items = [];
  let pending = null;
  const isUrl = (l) => /^https?:\/\//i.test(l);

  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const tvgName = attr(line, 'tvg-name');
      const tvgLogo = attr(line, 'tvg-logo');
      const groupTitle = attr(line, 'group-title');
      const comma = line.indexOf(',');
      const title = (comma >= 0 ? line.slice(comma + 1) : '').trim();
      pending = {
        title: (title || tvgName || '').trim(),
        logo_url: tvgLogo || null,
        group_title: groupTitle || null,
      };
    } else if (isUrl(line) && pending) {
      pending.stream_url = line;
      items.push(pending);
      pending = null;
    }
  }
  return items;
}

function analyze(items) {
  const missingUrl = items.filter((i) => !i.stream_url);
  const missingName = items.filter((i) => !i.title);
  const seen = new Map();
  const duplicates = [];
  for (const i of items) {
    if (!i.stream_url) continue;
    if (seen.has(i.stream_url)) duplicates.push(i);
    else seen.set(i.stream_url, i);
  }
  const groups = new Map();
  for (const i of items) {
    const g = (i.group_title || 'Sem categoria').trim();
    groups.set(g, (groups.get(g) || 0) + 1);
  }
  const uniqueValid = Array.from(seen.values()).filter((i) => i.title);
  return { missingUrl, missingName, duplicates, groups, uniqueValid };
}

async function main() {
  const mode = process.argv.includes('--import') ? 'import'
    : process.argv.includes('--dry-run') ? 'dry-run'
    : null;
  if (!mode) {
    console.error('Uso: node scripts/import-adult-m3u-to-supabase.cjs --dry-run | --import');
    process.exit(1);
  }
  if (!fs.existsSync(M3U_PATH)) {
    console.error(`[Adulto-import] Arquivo não encontrado: ${M3U_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(M3U_PATH, 'utf8');
  const items = parseM3U(raw);
  const { missingUrl, missingName, duplicates, groups, uniqueValid } = analyze(items);

  console.log('═══════════════════════════════════════════════');
  console.log(`[Adulto-import] modo=${mode} fonte=${SOURCE_FILE} alvo=${TABLE}`);
  console.log(`[Adulto-import] total parseado=${items.length}`);
  console.log(`[Adulto-import] categorias (group-title)=${groups.size}`);
  for (const [name, count] of groups) console.log(`   • ${name}  (itens=${count})`);
  console.log(`[Adulto-import] itens sem URL=${missingUrl.length}`);
  console.log(`[Adulto-import] itens sem nome=${missingName.length}`);
  console.log(`[Adulto-import] duplicados (stream_url)=${duplicates.length}`);
  duplicates.slice(0, 10).forEach((d) => console.log(`   - dup: ${d.title} → ${maskUrl(d.stream_url)}`));
  console.log(`[Adulto-import] itens válidos únicos=${uniqueValid.length}`);
  console.log('[Adulto-import] primeiros 10:');
  uniqueValid.slice(0, 10).forEach((i, idx) =>
    console.log(`   ${idx + 1}. ${i.title}  [${i.group_title || 'Sem categoria'}]  ${maskUrl(i.stream_url)}`)
  );
  console.log('═══════════════════════════════════════════════');

  if (mode === 'dry-run') {
    console.log('[Adulto-import] DRY-RUN — nenhuma escrita no Supabase.');
    return;
  }

  const env = { ...loadEnv(ENV_PATH), ...process.env };
  const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('[Adulto-import] Faltando VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Existentes (match por stream_url)
  const { data: existing, error: exErr } = await supabase
    .from(TABLE)
    .select('id, title, logo_url, group_title, stream_url');
  if (exErr) {
    console.error('[Adulto-import] erro ao ler existentes:', exErr.message);
    process.exit(1);
  }
  const byUrl = new Map((existing || []).map((r) => [r.stream_url, r]));

  const toInsert = [];
  const toUpdate = [];
  for (const i of uniqueValid) {
    const cur = byUrl.get(i.stream_url);
    if (!cur) {
      toInsert.push({
        title: i.title,
        logo_url: i.logo_url,
        group_title: i.group_title,
        stream_url: i.stream_url,
        source: SOURCE_FILE,
      });
    } else if (
      cur.title !== i.title ||
      cur.logo_url !== i.logo_url ||
      cur.group_title !== i.group_title
    ) {
      toUpdate.push({ id: cur.id, title: i.title, logo_url: i.logo_url, group_title: i.group_title });
    }
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  if (toInsert.length) {
    const BATCH = 100;
    for (let off = 0; off < toInsert.length; off += BATCH) {
      const batch = toInsert.slice(off, off + BATCH);
      const { error } = await supabase.from(TABLE).insert(batch);
      if (error) { errors += batch.length; console.error('[Adulto-import] erro insert:', error.message); }
      else inserted += batch.length;
    }
  }

  for (const u of toUpdate) {
    const { error } = await supabase
      .from(TABLE)
      .update({ title: u.title, logo_url: u.logo_url, group_title: u.group_title })
      .eq('id', u.id);
    if (error) { errors++; console.error('[Adulto-import] erro update:', error.message); }
    else updated++;
  }

  const skipped = items.length - inserted - updated - errors;
  console.log('═══════════════════════════════════════════════');
  console.log(`[Adulto-import] UPDATE concluído em ${TABLE}`);
  console.log(`   inseridos=${inserted} atualizados=${updated} inalterados/pulados=${skipped} erros=${errors}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[Adulto-import] erro fatal:', err && err.message ? err.message : err);
  process.exit(1);
});
