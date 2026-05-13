import fs from 'node:fs';
import path from 'node:path';

const validatorPath = path.resolve(
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'redx',
  'tvbox',
  'AppValidator.java'
);

const source = fs.readFileSync(validatorPath, 'utf8');
const match = source.match(/EXPECTED_SIGNATURE\s*=\s*"([A-Za-z0-9_:-]+)"/);

if (!match) {
  console.error('[release-signature] EXPECTED_SIGNATURE não encontrado em AppValidator.java');
  process.exit(1);
}

const value = match[1].trim();
const isPlaceholder = value === 'REPLACE_WITH_YOUR_RELEASE_APK_SHA256';
const isValidHash = /^[A-F0-9]{64}$/.test(value);

if (isPlaceholder || !isValidHash) {
  console.warn('\n[release-signature] EXPECTED_SIGNATURE ausente/inválido.');
  console.warn('Release seguirá sem validação rígida de assinatura (cenário sideload).');
  console.warn('Arquivo:', validatorPath);
  process.exit(0);
}

console.log('[release-signature] EXPECTED_SIGNATURE válido.');
