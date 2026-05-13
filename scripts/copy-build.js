#!/usr/bin/env node
/**
 * copy-build.js
 *
 * Copia o conteúdo de dist/ para android-native/app/src/main/assets/public/
 * para ser empacotado no APK como assets acessíveis via file:///android_asset/public/
 *
 * Uso:
 *   node scripts/copy-build.js
 *
 * Pipeline completo:
 *   npm run build && node scripts/copy-build.js
 *   (depois abrir android-native/ no Android Studio e gerar o APK)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'dist');
const DEST = path.join(ROOT, 'android-native', 'app', 'src', 'main', 'assets', 'public');

// ── Verifica se o build existe ──
if (!fs.existsSync(SRC)) {
  console.error('❌  Pasta dist/ não encontrada. Execute "npm run build" primeiro.');
  process.exit(1);
}

// ── Limpa o destino anterior (sem apagar a pasta; recria vazia) ──
function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) {
      rmrf(full);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
}

console.log('🧹  Limpando destino:', DEST);
rmrf(DEST);
fs.mkdirSync(DEST, { recursive: true });

// ── Cópia recursiva ──
let fileCount = 0;

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = fs.lstatSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      fileCount++;
    }
  }
}

console.log('📦  Copiando dist/ → android-native/app/src/main/assets/public/');
copyDir(SRC, DEST);

console.log(`✅  ${fileCount} arquivo(s) copiado(s) com sucesso.`);
console.log('');
console.log('Próximos passos:');
console.log('  1. Abra a pasta  android-native/  no Android Studio');
console.log('  2. Aguarde a sincronização do Gradle');
console.log('  3. Build → Generate Signed Bundle / APK → APK');
