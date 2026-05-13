/**
 * Gera ícones do launcher Android com fundo roxo gradiente + logored.webp
 * Uso: node scripts/generate_launcher_icons.mjs
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RES_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Logo: logored.png ou logored.webp (definido em main)
let LOGO_PATH;

// ── Gradiente roxo radial via SVG ────────────────────────────────────────────
function gradientSVG(w, h) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="bg" cx="40%" cy="40%" r="75%">
      <stop offset="0%"   stop-color="#9B3FE8"/>
      <stop offset="55%"  stop-color="#5B1FA8"/>
      <stop offset="100%" stop-color="#1E0050"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)" rx="0" ry="0"/>
</svg>`);
}

// Mesmo gradiente mas com cantos arredondados para ícone round
function gradientRoundSVG(size) {
  const r = size / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <radialGradient id="bg" cx="40%" cy="40%" r="75%">
      <stop offset="0%"   stop-color="#9B3FE8"/>
      <stop offset="55%"  stop-color="#5B1FA8"/>
      <stop offset="100%" stop-color="#1E0050"/>
    </radialGradient>
    <clipPath id="circle">
      <circle cx="${r}" cy="${r}" r="${r}"/>
    </clipPath>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)" clip-path="url(#circle)" rx="0" ry="0"/>
</svg>`);
}

// ── Utiltário: compor logo sobre fundo ───────────────────────────────────────
async function compose(bgBuf, logoFit, outPath) {
  const { width: bgW, height: bgH } = await sharp(bgBuf).metadata();

  // Define tamanho do logo com padding
  const pad = Math.round(Math.min(bgW, bgH) * 0.12);
  const maxW = bgW - pad * 2;
  const maxH = bgH - pad * 2;

  const logoResized = await sharp(LOGO_PATH)
    .resize({ width: maxW, height: maxH, fit: logoFit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const { width: lw, height: lh } = await sharp(logoResized).metadata();

  const top = Math.round((bgH - lh) / 2);
  const left = Math.round((bgW - lw) / 2);

  await sharp(bgBuf)
    .composite([{ input: logoResized, top, left }])
    .png()
    .toFile(outPath);

  console.log(`  ✅ ${path.relative(ROOT, outPath)}  [${bgW}×${bgH}]`);
}

// ── 1. tv_banner.png  —  Banner retangular TVBox (1280×720) ──────────────────
async function genTvBanner() {
  const tvBannerXml = path.join(RES_DIR, 'drawable', 'tv_banner.xml');
  if (fs.existsSync(tvBannerXml)) {
    fs.unlinkSync(tvBannerXml);
    console.log('  (removido tv_banner.xml para evitar conflito)');
  }
  console.log('\n📺 Gerando tv_banner.png (retangular 1280×720) …');
  const W = 1280,
    H = 720;

  // Gradiente com leve brilho no centro-esquerda
  const svgBg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#7C3AED"/>
      <stop offset="60%"  stop-color="#4C1D95"/>
      <stop offset="100%" stop-color="#1E0050"/>
    </linearGradient>
    <!-- brilho suave -->
    <radialGradient id="glow" cx="35%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#A855F7" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#A855F7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#grad)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
</svg>`);

  await compose(svgBg, 'contain', path.join(RES_DIR, 'drawable', 'tv_banner.png'));
}

// ── 2. Ícones mipmap ─────────────────────────────────────────────────────────
async function genIcons() {
  const densities = [
    { dir: 'mipmap-mdpi', size: 48, fgSize: 108 },
    { dir: 'mipmap-hdpi', size: 72, fgSize: 162 },
    { dir: 'mipmap-xhdpi', size: 96, fgSize: 216 },
    { dir: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
    { dir: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
  ];

  for (const { dir, size, fgSize } of densities) {
    console.log(`\n🖼  ${dir} …`);
    const dirPath = path.join(RES_DIR, dir);

    // ic_launcher.png  (quadrado)
    await compose(gradientSVG(size, size), 'contain', path.join(dirPath, 'ic_launcher.png'));

    // ic_launcher_round.png  (círculo)
    await compose(gradientRoundSVG(size), 'inside', path.join(dirPath, 'ic_launcher_round.png'));

    // ic_launcher_foreground.png  (camada foreground do adaptive icon)
    await compose(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${fgSize}" height="${fgSize}">
      <rect width="${fgSize}" height="${fgSize}" fill="none"/>
    </svg>`),
      'contain',
      path.join(dirPath, 'ic_launcher_foreground.png')
    );
  }
}

// ── 3. Atualiza ic_launcher_background.xml com gradiente SVG vector ──────────
function updateBackgroundXml() {
  const xmlPath = path.join(RES_DIR, 'drawable', 'ic_launcher_background.xml');
  const content = `<?xml version="1.0" encoding="utf-8"?>
<!-- Fundo roxo gradiente para launcher icons -->
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <gradient
        android:angle="135"
        android:startColor="#7C3AED"
        android:centerColor="#4C1D95"
        android:endColor="#1E0050"
        android:type="linear" />
</shape>
`;
  fs.writeFileSync(xmlPath, content, 'utf8');
  console.log(`\n  ✅ drawable/ic_launcher_background.xml atualizado`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  🚀 Gerando Launcher Icons — Fundo Roxo + logored.png');
  console.log('='.repeat(60));

  const LOGO_PNG = path.join(ROOT, 'public', 'logored.png');
  const LOGO_WEBP = path.join(ROOT, 'public', 'logored.webp');
  let logoToUse = fs.existsSync(LOGO_PNG) ? LOGO_PNG : fs.existsSync(LOGO_WEBP) ? LOGO_WEBP : null;

  if (!logoToUse) {
    console.warn(`⚠️ Logo não encontrado. Criando placeholder em ${LOGO_PNG}`);
    const placeholderSvg =
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <text x="100" y="120" font-family="Arial Black" font-size="48" font-weight="900" fill="#E50914" text-anchor="middle">RED</text>
  <text x="100" y="170" font-family="Arial Black" font-size="48" font-weight="900" fill="#FFFFFF" text-anchor="middle">X</text>
</svg>`);
    fs.mkdirSync(path.dirname(LOGO_PNG), { recursive: true });
    await sharp(placeholderSvg).png().toFile(LOGO_PNG);
    logoToUse = LOGO_PNG;
  }

  LOGO_PATH = logoToUse;

  try {
    // Copiar logored para drawable (splash.xml e ic_launcher_foreground_logo.xml referenciam @drawable/logored)
    const drawableDir = path.join(RES_DIR, 'drawable');
    const drawableLogo = path.join(drawableDir, 'logored.png');
    fs.mkdirSync(drawableDir, { recursive: true });
    fs.copyFileSync(logoToUse, drawableLogo);
    console.log(`  ✅ drawable/logored.png copiado de public/`);

    await genTvBanner();
    await genIcons();
    updateBackgroundXml();

    console.log('\n' + '='.repeat(60));
    console.log('  ✅ Todos os arquivos gerados com sucesso!');
    console.log('  📋 Próximo passo: npx cap sync android');
    console.log('='.repeat(60) + '\n');
  } catch (err) {
    console.error('\n❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
