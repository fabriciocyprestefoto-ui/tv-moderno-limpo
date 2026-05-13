/**
 * import-channels.mjs
 * Limpa canais antigos e importa ~500 canais ao vivo do M3U
 * convertendo .ts → .m3u8 e deduplicando por nome.
 *
 * Uso: node scripts/import-channels.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rqtzmgbduomwrhgrfsvp.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdHptZ2JkdW9td3JoZ3Jmc3ZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY1NDQyMCwiZXhwIjoyMDkwMjMwNDIwfQ.85fwYAK6O4lDv0TX1i0C5w0eR6ASQlWCy_-sZQG8Z8g';
const M3U_URL = 'http://api.cdnapp.fun:80/playlist/new_app/Q24Wb98eYc/m3u_plus';
const BATCH_SIZE = 500;

// ── Grupos de TV ao vivo (apenas canais reais, sem VOD) ──────────
const LIVE_GROUPS = new Set([
  'GLOBO',
  'RECORD',
  'SBT',
  'BAND',
  'ABERTOS',
  'HBO',
  'HBO MAX',
  'SPORTV',
  'ESPN',
  'PREMIERE',
  'ESPORTES',
  'ESPORTES PPV',
  'LUTAS',
  'COMBATE',
  'NBA',
  'FUTEBOL',
  'FUTEBOL PPV',
  'COPINHA',
  'TELECINE',
  'MEGAPIX',
  'DISCOVERY+',
  'NOTICIAS',
  'MULTISHOW',
  'GNT',
  'BBB 2026',
  'JOGOS DO DIA',
  'SBT+',
  'CINE ESPECIAL HD 24HRS',
  'CINE DESENHOS HD 24HRS',
  'RELIGIOSOS',
  'PROGRAMAS DE TV',
]);

const ADULT_KW = ['ADULT', 'XXX', 'PORNO', '18+'];

// Converte URL .ts → .m3u8
function toM3u8(url) {
  return url.replace(/\.ts(\?.*)?$/, '.m3u8$1');
}

// Normaliza nome para deduplicação (remove qualidade, espaços extras)
function normalizeKey(name) {
  return name
    .toUpperCase()
    .replace(/\b(FHD|HD|SD|4K|UHD|FULL HD)\b/g, '')
    .replace(/[\*\+\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Categoria a partir do grupo
function toCategory(group) {
  const g = group.toUpperCase();
  if (['GLOBO', 'RECORD', 'SBT', 'BAND', 'ABERTOS'].some((x) => g.includes(x))) return 'Abertos';
  if (
    ['SPORTV', 'ESPN', 'PREMIERE', 'ESPORTE', 'FUTEBOL', 'NBA', 'COMBATE', 'LUTA', 'COPINHA'].some(
      (x) => g.includes(x)
    )
  )
    return 'Esportes';
  if (['HBO', 'TELECINE', 'MEGAPIX', 'CINE'].some((x) => g.includes(x))) return 'Filmes e Séries';
  if (['DISCOVERY', 'NAT GEO'].some((x) => g.includes(x))) return 'Documentários';
  if (['NOTICIA', 'NEWS'].some((x) => g.includes(x))) return 'Notícias';
  if (['BBB', 'JOGOS', 'PROGRAMA', 'ENTRET'].some((x) => g.includes(x))) return 'Entretenimento';
  if (['RELIGI'].some((x) => g.includes(x))) return 'Religioso';
  if (['DESENHO', 'KIDS', 'INFANTIL'].some((x) => g.includes(x))) return 'Infantil';
  return 'Outros';
}

// ── Parse M3U ────────────────────────────────────────────────────
async function parseChannels(url) {
  console.log('📖 Lendo M3U da URL...');
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.split('\n');

  const channels = [];
  let meta = null;
  let num = 1;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('#EXTINF:')) {
      const tvgName = (line.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const tvgLogo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const group = (line.match(/group-title="([^"]*)"/) || [])[1] || '';
      const disp = line.includes(',') ? line.split(',').slice(1).join(',').trim() : tvgName;
      meta = { name: disp || tvgName, logo: tvgLogo, group: group.trim() };
      continue;
    }

    if (meta && line && !line.startsWith('#')) {
      const g = meta.group.toUpperCase().trim();
      const isLive = line.endsWith('.ts');

      if (isLive) {
        channels.push({
          name: meta.name,
          logo: meta.logo || null,
          category: meta.group.trim() || 'Outros',
          stream_url: toM3u8(line), // ← converte .ts → .m3u8
          number: num++,
          is_premium: false,
        });
      }
      meta = null;
    }
  }

  console.log(`  ✅ ${channels.length} canais extraídos`);

  // Mostra distribuição por categoria
  const byCat = {};
  channels.forEach((c) => {
    byCat[c.category] = (byCat[c.category] || 0) + 1;
  });
  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`     ${c}: ${n}`));

  return channels;
}

// ── Supabase helpers ─────────────────────────────────────────────
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function deleteAll(table) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`,
    { method: 'DELETE', headers }
  );
  return res.ok;
}

async function bulkInsert(table, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify(batch),
    });
    if (res.ok || res.status === 201) {
      inserted += batch.length;
      process.stdout.write(`\r  📤 ${inserted}/${rows.length} inseridos...`);
    } else {
      console.error(`\n  ❌ HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    if (i + BATCH_SIZE < rows.length) await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`\r  ✅ ${inserted} canais importados`);
  return inserted;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('📺 Reimportação de canais (dedup + .ts → .m3u8)\n');

  const channels = await parseChannels(M3U_URL);

  // Salva backup
  const dataDir = path.join(__dirname, '../public/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels.json'), JSON.stringify(channels, null, 2));
  console.log(`\n💾 Backup salvo: public/data/channels.json\n`);

  console.log('🗑️  Limpando canais antigos...');
  await deleteAll('channels');
  console.log('  ✅ Limpo\n');

  console.log('📤 Importando...');
  await bulkInsert('channels', channels);

  console.log(`\n🎉 Pronto! ${channels.length} canais com URLs .m3u8`);
}

main().catch((err) => {
  console.error('\n💥', err.message);
  process.exit(1);
});
