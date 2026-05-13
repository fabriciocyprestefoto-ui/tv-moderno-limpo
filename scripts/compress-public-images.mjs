#!/usr/bin/env node
/**
 * Comprime imagens grandes em /public para WebP.
 * Uso: node scripts/compress-public-images.mjs [--dry-run]
 *
 * Requer: npm install -D sharp
 *
 * Prioridade (por tamanho atual):
 *   redx.png        1.6MB  → redx.webp       ~80KB  (-95%)
 *   jogos-do-dia.png 1.3MB → jogos-do-dia.webp ~60KB  (-95%)
 *   x.png           486KB  → x.webp           ~40KB  (-92%)
 *   Prime_Video_014 797KB  → mantém jpg (já é jpg, usar quality 80)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, basename, extname } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes('--dry-run');

const publicDir = join(__dirname, '../public');

// Limiar: comprimir se > 200KB
const SIZE_THRESHOLD = 200 * 1024;

// Imagens que NÃO devem virar WebP (usadas como favicon/OG por ferramentas externas)
const SKIP = new Set(['favicon.ico', 'logored.png']);

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('❌ sharp não instalado. Execute: npm install -D sharp');
  process.exit(1);
}

const files = readdirSync(publicDir).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));

let totalSaved = 0;

for (const file of files) {
  if (SKIP.has(file)) {
    console.log(`⏭  Pulando ${file} (na lista de exclusão)`);
    continue;
  }

  const src = join(publicDir, file);
  const size = statSync(src).size;

  if (size < SIZE_THRESHOLD) {
    console.log(`✅ ${file} (${(size / 1024).toFixed(0)}KB) — abaixo do limiar, pulando`);
    continue;
  }

  const ext = extname(file);
  const name = basename(file, ext);
  const dest = join(publicDir, `${name}.webp`);

  if (existsSync(dest)) {
    const destSize = statSync(dest).size;
    console.log(`⏭  ${file} → ${name}.webp já existe (${(destSize / 1024).toFixed(0)}KB)`);
    continue;
  }

  const saved = size;

  if (isDryRun) {
    console.log(`🔍 [dry-run] ${file} (${(size / 1024).toFixed(0)}KB) → ${name}.webp`);
    continue;
  }

  try {
    await sharp(src).webp({ quality: 82, effort: 6 }).toFile(dest);

    const destSize = statSync(dest).size;
    const reduction = ((1 - destSize / saved) * 100).toFixed(0);
    totalSaved += saved - destSize;
    console.log(
      `✅ ${file} (${(saved / 1024).toFixed(0)}KB) → ${name}.webp (${(destSize / 1024).toFixed(0)}KB, -${reduction}%)`
    );
  } catch (err) {
    console.error(`❌ Erro ao converter ${file}:`, err.message);
  }
}

if (!isDryRun && totalSaved > 0) {
  console.log(`\n💾 Total economizado: ${(totalSaved / 1024 / 1024).toFixed(2)}MB`);
}

console.log('\n📋 Próximos passos:');
console.log('   1. Atualize as referências nos componentes React para usar os .webp');
console.log('   2. Use <picture> com fallback .png para browsers sem suporte WebP');
console.log('   3. Mova para Supabase Storage + CDN em vez de /public');
