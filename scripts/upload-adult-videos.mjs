/**
 * Sobe os vídeos de "Nova pasta" para o Supabase Storage (bucket público `adultos`)
 * e gera public/adulto.txt (M3U) como ÚNICA fonte de conteúdo dos canais adultos.
 *
 * Por que hospedar: ~800MB não cabem num APK (Firestick ~1.9G livre) e o WebView
 * bloqueia file:// (setAllowFileAccess(false)); o parser de canais só aceita http(s).
 *
 * .env (raiz):
 *   VITE_SUPABASE_URL=
 *   SUPABASE_SERVICE_ROLE_KEY=
 *
 * Uso: node scripts/upload-adult-videos.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import ffmpegPath from 'ffmpeg-static';

/** Free tier Supabase: limite global de 50MB por arquivo. Margem p/ 48MB. */
const MAX_BYTES = 48 * 1024 * 1024;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'Nova pasta');
const BUCKET = 'adultos';
const OUT_TXT = path.join(ROOT, 'public', 'adulto-data.m3u');
const DRY = process.argv.includes('--dry-run');

function loadDotEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

/** "1a (1).mp4" -> "1a-1.mp4" (sem espaços/parênteses p/ URL limpa). */
function cleanName(name) {
  return name
    .replace(/\s+/g, '-')
    .replace(/[()]/g, '')
    .replace(/-+/g, '-')
    .toLowerCase();
}

async function ensureBucket() {
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) {
    console.log(`bucket "${BUCKET}" já existe`);
    return;
  }
  if (DRY) {
    console.log(`[dry] criaria bucket público "${BUCKET}"`);
    return;
  }
  const { error } = await sb.storage.createBucket(BUCKET, { public: true });
  if (error) throw new Error(`createBucket: ${error.message}`);
  console.log(`bucket "${BUCKET}" criado (público)`);
}

/** Transcoda p/ 480p caso o arquivo exceda o limite do plano. Retorna caminho a subir. */
function fitSize(full, dest) {
  const size = fs.statSync(full).size;
  if (size <= MAX_BYTES) return { path: full, size, transcoded: false };
  const tmp = path.join(os.tmpdir(), `adulto-${dest}`);
  process.stdout.write(`(>48MB, transcodando 480p) `);
  // crf 30 / 480p: reduz os clipes longos de alto bitrate p/ < 50MB.
  execFileSync(
    ffmpegPath,
    ['-y', '-i', full, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'veryfast',
     '-crf', '30', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp],
    { stdio: 'ignore' }
  );
  return { path: tmp, size: fs.statSync(tmp).size, transcoded: true };
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`pasta não encontrada: ${SRC_DIR}`);
    process.exit(1);
  }
  await ensureBucket();

  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => /\.mp4$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\((\d+)\)/)?.[1] || '0', 10);
      const nb = parseInt(b.match(/\((\d+)\)/)?.[1] || '0', 10);
      return na - nb;
    });

  console.log(`${files.length} mp4 a subir`);
  const entries = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dest = cleanName(file);
    const full = path.join(SRC_DIR, file);
    const rawSize = fs.statSync(full).size;
    const pub = `${URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(dest)}`;
    entries.push({ dest, title: `Adulto ${i + 1}`, url: pub });

    if (DRY) {
      const over = rawSize > MAX_BYTES ? ' [>48MB → transcode]' : '';
      console.log(`[dry] ${file} -> ${dest} (${(rawSize / 1e6).toFixed(1)}MB)${over}`);
      continue;
    }
    process.stdout.write(`(${i + 1}/${files.length}) ${dest} ${(rawSize / 1e6).toFixed(1)}MB ... `);
    const fit = fitSize(full, dest);
    const buf = fs.readFileSync(fit.path);
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(dest, buf, { contentType: 'video/mp4', upsert: true });
    if (fit.transcoded) {
      try { fs.unlinkSync(fit.path); } catch { /* noop */ }
    }
    if (error) {
      console.log(`ERRO: ${error.message}`);
      process.exit(1);
    }
    console.log(`ok (${(fit.size / 1e6).toFixed(1)}MB)`);
  }

  // Gera M3U (parseAdultoTxt: #EXTINF ... group-title="Adulto",Título + URL https)
  const m3u = ['#EXTM3U'];
  for (const e of entries) {
    m3u.push(`#EXTINF:-1 tvg-name="${e.title}" group-title="Adulto",${e.title}`);
    m3u.push(e.url);
  }
  const txt = m3u.join('\n') + '\n';
  if (DRY) {
    console.log('\n--- adulto.txt (preview) ---\n' + txt);
  } else {
    fs.mkdirSync(path.dirname(OUT_TXT), { recursive: true });
    fs.writeFileSync(OUT_TXT, txt, 'utf8');
    console.log(`\ngerado: ${OUT_TXT} (${entries.length} itens)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
