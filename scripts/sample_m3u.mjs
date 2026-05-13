import fs from 'fs';
import readline from 'readline';

async function parseM3U() {
  const fileStream = fs.createReadStream(
    'C:/Users/Fabricio/Desktop/site/backup/site/site/lista/playlist_2450460821_plus.m3u',
    { encoding: 'utf-8' }
  );
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const groups = new Set();
  let currentGroup = '';

  for await (const line of rl) {
    if (line.trim().startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) {
        currentGroup = groupMatch[1];
        if (!groups.has(currentGroup)) {
          groups.add(currentGroup);
          console.log(currentGroup);
          if (groups.size > 200) {
            break;
          }
        }
      }
    }
  }
}

parseM3U();
