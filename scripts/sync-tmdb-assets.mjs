#!/usr/bin/env node
/**
 * Run TMDB assets sync edge function.
 * Usage:
 *   node scripts/sync-tmdb-assets.mjs --fromYear=2020 --limit=0 --force=false --removeBroken=false
 */

import fs from 'node:fs';
import path from 'node:path';

function readEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = rawValue.replace(/^['\"]|['\"]$/g, '');
    }
  }
}

function parseBoolean(value, fallback) {
  if (value == null) return fallback;
  const v = String(value).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (const a of args) {
    const [k, v] = a.split('=');
    if (k?.startsWith('--')) {
      out[k.slice(2)] = v ?? 'true';
    }
  }
  return out;
}

async function main() {
  readEnvFile();

  const args = parseArgs();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  const payload = {
    fromYear: Number(args.fromYear || 2020),
    limit: Number(args.limit || 0),
    force: parseBoolean(args.force, false),
    removeBroken: parseBoolean(args.removeBroken, false),
  };

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sync_tmdb_assets`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}

  if (!response.ok) {
    console.error('[sync-tmdb-assets] failed', response.status, data);
    process.exit(1);
  }

  console.log('[sync-tmdb-assets] success');
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('[sync-tmdb-assets] error:', err.message || err);
  process.exit(1);
});
