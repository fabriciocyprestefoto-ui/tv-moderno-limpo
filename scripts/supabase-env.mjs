/**
 * Carrega `.env` da raiz e expõe URL/chaves do Supabase **atual**.
 * Scripts não devem embutir URLs de projetos antigos nem service_role em código.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let loaded = false;

export function loadRootEnv() {
  if (loaded) return;
  loaded = true;
  const p = resolve(ROOT, '.env');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function getSupabaseUrl() {
  loadRootEnv();
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

export function requireSupabaseUrl() {
  const u = getSupabaseUrl();
  if (!u) {
    console.error(
      '[scripts] Defina SUPABASE_URL ou VITE_SUPABASE_URL no .env (projeto Supabase em uso).'
    );
    process.exit(1);
  }
  return u;
}

export function getServiceRoleKey() {
  loadRootEnv();
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
}

export function requireServiceRoleKey() {
  const k = getServiceRoleKey();
  if (!k) {
    console.error(
      '[scripts] Defina SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_SERVICE_ROLE_KEY) no .env.'
    );
    process.exit(1);
  }
  return k;
}
