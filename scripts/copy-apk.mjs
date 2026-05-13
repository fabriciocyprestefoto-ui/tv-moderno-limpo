#!/usr/bin/env node
/**
 * copy-apk.mjs — Copia o APK gerado para a raiz do projeto.
 * Cross-platform: funciona em Windows, Linux e macOS.
 *
 * Uso: node scripts/copy-apk.mjs [debug|release]
 *
 * Substituí o comando `copy` (Windows CMD) que quebrava em ambientes Unix/CI.
 */

import { copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const variant = process.argv[2] ?? 'release';
const isRelease = variant !== 'debug';

const src = resolve(
  projectRoot,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  isRelease ? 'release' : 'debug',
  isRelease ? 'app-release.apk' : 'app-debug.apk'
);

const dest = resolve(projectRoot, 'redflix-tvmoderno.apk');

if (!existsSync(src)) {
  console.error(`\n❌ APK não encontrado: ${src}`);
  console.error('   Certifique-se de ter rodado o Gradle antes deste script.\n');
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`✅ APK copiado: ${src}\n   → ${dest}`);
