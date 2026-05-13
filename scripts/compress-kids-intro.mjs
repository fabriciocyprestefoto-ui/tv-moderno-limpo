/**
 * Re-encoda `public/kids.mp4` com H.264 (boa compatibilidade WebView/Android),
 * CRF + preset lento para reduzir tamanho mantendo qualidade visual.
 *
 * Usa `ffmpeg-static` (npm) se existir; senão ffmpeg no PATH.
 *
 * Uso:
 *   npm run compress:kids-intro
 *   node scripts/compress-kids-intro.mjs --crf 22
 *   node scripts/compress-kids-intro.mjs --input C:\\Videos\\kids_original.mp4
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'public', 'kids.mp4');
const TMP_OUT = path.join(ROOT, 'public', 'kids.compressed.tmp.mp4');
const BAK = path.join(ROOT, 'public', 'kids.mp4.bak');

function compressedOutputPath(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}-compressed.mp4`);
}

function parseArgs(argv) {
  let crf = 21;
  let input = DEFAULT_INPUT;
  let noScale = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--crf' && argv[i + 1]) {
      crf = Number(argv[++i]);
      if (!Number.isFinite(crf) || crf < 16 || crf > 28) {
        console.error('Use --crf entre 16 (maior ficheiro) e 28 (menor).');
        process.exit(1);
      }
    } else if (a === '--input' && argv[i + 1]) {
      input = path.resolve(argv[++i]);
    } else if (a === '--no-scale') {
      noScale = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`compress-kids-intro.mjs

  --crf N       Qualidade H.264 (predefinido 21). Menor = melhor / maior ficheiro.
  --input PATH  Ficheiro de origem (predefinido public/kids.mp4)
  --no-scale    Não reduzir resolução (só re-encode)
`);
      process.exit(0);
    }
  }
  return { crf, input, noScale };
}

function whichFfmpeg() {
  try {
    const bundled = require('ffmpeg-static');
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {
    /* optional devDependency */
  }
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: true });
  if (r.status === 0) return 'ffmpeg';
  const common = ['C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe'];
  for (const p of common) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const { crf, input, noScale } = parseArgs(process.argv);

if (!fs.existsSync(input)) {
  console.error(`Ficheiro não encontrado: ${input}`);
  console.error('Coloque o vídeo em public/kids.mp4 ou use --input <caminho>.');
  process.exit(1);
}

const ffmpegBin = whichFfmpeg();
if (!ffmpegBin) {
  console.error(
    'ffmpeg não encontrado. Execute `npm install` (inclui ffmpeg-static) ou instale ffmpeg no PATH.'
  );
  process.exit(1);
}

/** Máx. 1920×1080: desnecessário guardar 4K numa vinheta curta no APK. */
const vf = noScale
  ? 'format=yuv420p'
  : "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,format=yuv420p";

const args = [
  '-y',
  '-i',
  input,
  '-vf',
  vf,
  '-c:v',
  'libx264',
  '-crf',
  String(crf),
  '-preset',
  'slow',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
  TMP_OUT,
];

console.log(`A codificar com ${ffmpegBin} (CRF ${crf})…`);
const run = spawnSync(ffmpegBin, args, { stdio: 'inherit', shell: ffmpegBin !== 'ffmpeg' });
if (run.status !== 0) {
  if (fs.existsSync(TMP_OUT)) fs.unlinkSync(TMP_OUT);
  process.exit(run.status ?? 1);
}

const before = fs.statSync(input).size;
const after = fs.statSync(TMP_OUT).size;
const pct = ((1 - after / before) * 100).toFixed(1);

if (input === DEFAULT_INPUT) {
  if (fs.existsSync(BAK)) fs.unlinkSync(BAK);
  fs.renameSync(input, BAK);
  fs.renameSync(TMP_OUT, DEFAULT_INPUT);
  console.log(
    `Concluído. Original guardado em public/kids.mp4.bak\n` +
      `  Antes: ${(before / 1e6).toFixed(2)} MB → Depois: ${(after / 1e6).toFixed(2)} MB (~${pct}% menor)`
  );
} else {
  const out = compressedOutputPath(input);
  fs.renameSync(TMP_OUT, out);
  console.log(
    `Concluído: ${out}\n` +
      `  Antes: ${(before / 1e6).toFixed(2)} MB → Depois: ${(after / 1e6).toFixed(2)} MB (~${pct}% menor)\n` +
      `Copie para public/kids.mp4 quando estiver satisfeito com a qualidade.`
  );
}
