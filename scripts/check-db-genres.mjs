import { requireSupabaseUrl, requireServiceRoleKey, loadRootEnv } from './supabase-env.mjs';
loadRootEnv();
const url = requireSupabaseUrl();
const key = requireServiceRoleKey();
const h = { apikey: key, Authorization: 'Bearer ' + key };

// Conta filmes por gênero
const r = await fetch(url + '/rest/v1/movies?select=genre,tmdb_id,year&limit=10000', {
  headers: h,
});
const data = await r.json();

const genres = {};
const genresEnriched = {};
for (const m of data) {
  const g = (m.genre || []).join(',') || 'sem-gênero';
  const key2 = g.includes('Animação') ? 'Animação' : g.includes('Família') ? 'Família' : 'Outros';
  genres[key2] = (genres[key2] || 0) + 1;
  if (m.tmdb_id) genresEnriched[key2] = (genresEnriched[key2] || 0) + 1;
}

console.log('Movies no DB por gênero principal:');
for (const [k, v] of Object.entries(genres).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v} total, ${genresEnriched[k] || 0} enriquecidos`);
}

// Total
const rt = await fetch(url + '/rest/v1/movies?select=id', {
  headers: { ...h, Prefer: 'count=exact', Range: '0-0' },
});
console.log('\nTotal movies no DB:', rt.headers.get('content-range'));
