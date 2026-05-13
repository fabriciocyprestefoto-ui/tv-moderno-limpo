import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parseDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed
        .slice(0, eq)
        .replace(/^export\s+/, '')
        .trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    });
    return out;
  } catch {
    return {};
  }
}

function loadEnv() {
  const candidates = [
    path.join(projectRoot, '.env.local'),
    path.join(projectRoot, '.env.development'),
    path.join(projectRoot, '.env'),
  ];
  let envFromFile = {};
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      envFromFile = { ...envFromFile, ...parseDotEnv(p) };
    }
  }
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    envFromFile.SUPABASE_URL ||
    envFromFile.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    envFromFile.SUPABASE_ANON_KEY ||
    envFromFile.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error(
      '❌ SUPABASE_URL/VITE_SUPABASE_URL ou SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY não encontrados.'
    );
    console.error(
      '   Defina variáveis de ambiente ou crie .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
    );
    process.exit(1);
  }
  return { url, anon };
}

function normalizeChannel(row) {
  const name = row.name || row.nome || '';
  const stream_url = row.stream_url || row.url || row.link || '';
  const category = row.category || row.genero || row.grupo || 'Geral';
  return { id: row.id, name, stream_url, category };
}

function inferExt(u) {
  if (!u || typeof u !== 'string') return 'empty';
  const lower = u.toLowerCase();
  if (lower.includes('.m3u8')) return 'm3u8';
  if (lower.includes('format=m3u8') || lower.includes('type=hls')) return 'm3u8?';
  if (lower.includes('.mpd')) return 'mpd';
  if (lower.includes('.mp4')) return 'mp4';
  if (lower.includes('.ts')) return 'ts';
  if (lower.includes('.flv')) return 'flv';
  if (lower.includes('.mov')) return 'mov';
  try {
    const uo = new URL(u);
    const i = uo.pathname.lastIndexOf('.');
    if (i >= 0) return uo.pathname.slice(i + 1).toLowerCase();
  } catch {}
  return 'unknown';
}

async function main() {
  const { url, anon } = loadEnv();
  const supabase = createClient(url, anon);

  const PAGE = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('❌ Erro ao buscar canais:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const channels = rows.map(normalizeChannel);
  const counts = {};
  const nonM3u8 = [];
  for (const c of channels) {
    const ext = inferExt(c.stream_url);
    counts[ext] = (counts[ext] || 0) + 1;
    if (ext !== 'm3u8' && ext !== 'm3u8?') {
      nonM3u8.push({ ...c, ext });
    }
  }

  console.log('=== Auditoria de Extensões de Canais ===');
  console.log(`Total de canais: ${channels.length}`);
  console.log('Distribuição por extensão:');
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ext, n]) => console.log(`- ${ext}: ${n}`));

  if (nonM3u8.length === 0) {
    console.log('✅ Todos os canais parecem ser HLS (.m3u8).');
  } else {
    console.log(`⚠️ Canais não-m3u8 detectados: ${nonM3u8.length}`);
    nonM3u8.slice(0, 50).forEach((c) => {
      console.log(`- [${c.ext}] ${c.name} (#${c.id}) → ${c.stream_url}`);
    });
    if (nonM3u8.length > 50) {
      console.log(`... (+${nonM3u8.length - 50} outros)`);
    }
  }
}

main().catch((e) => {
  console.error('Erro inesperado:', e);
  process.exit(1);
});
