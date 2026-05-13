import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(__dirname, '../playlist_2450460821_plus.m3u'), 'utf8');
const lines = raw.split('\n');
const results = { mp4: 0, other: 0, samples: [] };
let i = 0;
while (i < lines.length) {
  const line = lines[i].trim();
  if (line.startsWith('#EXTINF') && line.includes('⏩ INFANTIL')) {
    const url = (lines[i + 1] || '').trim();
    const nameMatch = line.match(/,(.+)$/);
    if (url.endsWith('.mp4')) {
      results.mp4++;
      if (results.samples.length < 10)
        results.samples.push((nameMatch?.[1] || '?') + ' → ' + url.slice(-40));
    } else {
      results.other++;
    }
  }
  i++;
}
console.log('⏩ INFANTIL:');
console.log('  .mp4 (VOD):', results.mp4);
console.log('  outros (live):', results.other);
console.log('  Amostras:');
results.samples.forEach((s) => console.log('   -', s));
