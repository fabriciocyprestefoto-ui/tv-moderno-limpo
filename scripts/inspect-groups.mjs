import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(__dirname, '../playlist_2450460821_plus.m3u'), 'utf8');
const lines = raw.split('\n');

const targets = [
  'ANIMAÇÃO',
  'FILMES | FAMÍLIA',
  '⏩ FILMES E SERIES',
  '⏩ INFANTIL',
  'FILMES | VARIADOS',
];
const stats = {};
targets.forEach((t) => (stats[t] = { mp4: 0, other: 0, samples: [] }));

let i = 0;
while (i < lines.length) {
  const line = lines[i].trim();
  if (!line.startsWith('#EXTINF')) {
    i++;
    continue;
  }
  const url = (lines[i + 1] || '').trim();
  const nameMatch = line.match(/,(.+)$/);
  const groupMatch = line.match(/group-title="([^"]+)"/);
  const group = groupMatch?.[1] || '';

  for (const t of targets) {
    if (group.includes(t) || group === t) {
      const title = nameMatch?.[1] || '?';
      if (url.endsWith('.mp4')) {
        stats[t].mp4++;
        if (stats[t].samples.length < 5) stats[t].samples.push(title);
      } else {
        stats[t].other++;
      }
      break;
    }
  }
  i++;
}

for (const [t, s] of Object.entries(stats)) {
  console.log(`\n"${t}":`);
  console.log(`  .mp4 VOD: ${s.mp4}  |  live/outros: ${s.other}`);
  if (s.samples.length) {
    console.log('  Amostras VOD:');
    s.samples.forEach((x) => console.log('   -', x));
  }
}
